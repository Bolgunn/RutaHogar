-- HU23 T8: private recovery ports. Storage bytes are deleted through its API, never SQL.
begin;
create table public.document_cleanup_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true,
 lease_token uuid,
 lease_until timestamptz,
 last_finished_at timestamptz
);
insert into public.document_cleanup_control(singleton) values(true);
alter table public.document_cleanup_control enable row level security;
revoke all on public.document_cleanup_control from public,anon,authenticated,service_role;

alter table public.document_processes
 add column storage_delete_after timestamptz not null default clock_timestamp(),
 add column storage_delete_token uuid,
 add column storage_delete_lease_until timestamptz;
alter table public.document_ocr_jobs add column cleanup_probe boolean not null default false;
create index hu23_storage_retry_idx on public.document_processes(storage_delete_after)
 where deletion_state in ('delete_pending','retry_required','deleting');

-- Twenty hours leaves three hourly recovery opportunities and operational margin.
-- Enforce on DB writers too; a cold instance using the old 22h config cannot extend it.
create function public.hu23_cleanup_deadline() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.expires_at>new.created_at+interval '24 hours' then
   raise check_violation using message='HU23 retention check constraint';
 end if;
 if new.closed_at is null then new.expires_at:=least(new.expires_at,new.created_at+interval '20 hours'); end if;
 return new;
end $$;
create trigger hu23_cleanup_deadline before insert or update of expires_at,created_at on public.document_processes
 for each row execute function public.hu23_cleanup_deadline();
update public.document_processes set expires_at=least(expires_at,created_at+interval '20 hours') where closed_at is null;

-- Also lease immediate owner cleanup calls from T2. A killed request is recoverable.
create function public.hu23_storage_delete_lease() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.deletion_state='deleting' then
   new.storage_delete_token:=gen_random_uuid();
   new.storage_delete_lease_until:=clock_timestamp()+interval '45 seconds';
 elsif new.deletion_state in ('retry_required','delete_pending','deleted') then
   new.storage_delete_token:=null; new.storage_delete_lease_until:=null;
   new.storage_delete_after:=clock_timestamp()+make_interval(secs=>case when new.deletion_state='retry_required'
     then least(1800,60*power(2,least(new.deletion_attempts,5))::integer) else 0 end);
 end if;
 return new;
end $$;
create trigger hu23_storage_delete_lease before update of deletion_state on public.document_processes
 for each row execute function public.hu23_storage_delete_lease();

-- All actions below are backend-only, separate from user lifecycle/role checks.
-- Lock ordering is the same as HU13: profile -> process -> OCR job.
create function public.hu23_cleanup(p_action text,p_run uuid default null,p_process uuid default null,
 p_kind text default null,p_token uuid default null,p_payload jsonb default '{}',p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare stamp timestamptz:=clock_timestamp(); ctl document_cleanup_control;
 p document_processes; j document_ocr_jobs; uid uuid; items jsonb;
 outcome text:=p_payload->>'outcome'; delay integer; path text;
begin
 if p_action='begin' then
   select * into ctl from document_cleanup_control where singleton for update;
   if not ctl.enabled or ctl.lease_until>stamp then return jsonb_build_object('busy',true); end if;
   update document_cleanup_control set lease_token=gen_random_uuid(),lease_until=stamp+interval '90 seconds'
     where singleton returning * into ctl;
   return jsonb_build_object('token',ctl.lease_token);
 end if;
 select * into ctl from document_cleanup_control where singleton;
 if p_run is null or ctl.lease_token is distinct from p_run or ctl.lease_until<=stamp then return 'null'::jsonb; end if;
 if p_action='finish' then
   update document_cleanup_control set lease_until=null,lease_token=null,last_finished_at=stamp
     where singleton and lease_token=p_run;
   return '{}'::jsonb;
 elsif p_action='list' then
   -- Independent resources avoid a failing original starving Azure deletion.
   select coalesce(jsonb_agg(v.item order by v.rank,v.priority),'[]') into items from (
     select jsonb_build_object('process_id',q.id,'kind',q.kind) item,q.kind,q.priority,q.due,
       row_number() over(partition by q.kind order by q.due,q.id) rank from (
       select d.id,'storage'::text kind,0 priority,
         case when d.closed_at is null then least(d.expires_at,
           (select o.created_at+interval '15 minutes' from document_ocr_jobs o where o.process_id=d.id))
           else d.storage_delete_after end due from document_processes d
       where (d.closed_at is null and (d.expires_at<=stamp or exists(select 1 from document_ocr_jobs o
         where o.process_id=d.id and ((o.lease_kind='submit' and o.lease_until<=stamp)
           or (o.job_state in ('running','retry_wait') and o.created_at+interval '15 minutes'<=stamp)))))
         or (d.deletion_state in ('delete_pending','retry_required','deleting') and d.storage_delete_after<=stamp
           and coalesce(d.storage_delete_lease_until,'-infinity')<=stamp)
         or (d.deletion_state='deleted' and exists(select 1 from document_uploads u join storage.objects s
           on s.bucket_id=u.bucket_id and s.name=u.storage_path where u.process_id=d.id))
       union all
       select o.process_id,'azure',1,o.next_attempt_at from document_ocr_jobs o
       where o.deletion_state in ('delete_pending','retry_required','deleting') and o.next_attempt_at<=stamp
         and coalesce(o.lease_until,'-infinity')<=stamp
       union all
       select d.id,'purge',2,d.created_at from document_processes d
       where d.closed_at is not null and d.deletion_state='deleted' and d.created_at+interval '24 hours'<=stamp
         and (exists(select 1 from document_uploads u where u.process_id=d.id and u.reconcile_until<=stamp)
           or exists(select 1 from document_ocr_jobs o where o.process_id=d.id and o.deletion_state='deleted'
             and o.deleted_at+interval '1 hour'<=stamp and coalesce(o.lease_until,'-infinity')<=stamp))
     ) q order by rank,q.priority limit greatest(1,least(p_limit,100))
   ) v;
   return items;
 elsif p_action='metrics' then
   return jsonb_build_object('overdue_originals',(select count(*) from storage.objects
     where bucket_id='hu23-document-temporary' and created_at+interval '24 hours'<=stamp),
     'pending_originals',(select count(*) from document_processes where deletion_state in ('delete_pending','retry_required','deleting')),
     'pending_azure',(select count(*) from document_ocr_jobs where deletion_state in ('delete_pending','retry_required','deleting')),
     'unresolved_submissions',(select count(*) from document_ocr_jobs where job_state='submission_unknown' and result_id is null));
 end if;

 select user_id into uid from document_processes where id=p_process;
 if uid is null then return 'null'::jsonb; end if;
 perform 1 from profiles where id=uid for update skip locked;
 if not found then return 'null'::jsonb; end if;
 select * into p from document_processes where id=p_process for update skip locked;
 if not found then return 'null'::jsonb; end if;
 select * into j from document_ocr_jobs where process_id=p_process for update skip locked;
 -- A competing job lock must not be mistaken for absence.
 if j.process_id is null and exists(select 1 from document_ocr_jobs where process_id=p_process) then return 'null'::jsonb; end if;

 if p_action='claim' then
   if not ctl.enabled then return 'null'::jsonb; end if;
   if p.closed_at is null and (p.expires_at<=stamp or
     (j.lease_kind='submit' and j.lease_until<=stamp) or
     (j.job_state in ('running','retry_wait') and j.created_at+interval '15 minutes'<=stamp)) then
     update document_processes set state=case when expires_at<=stamp then 'expired' else 'processing_failed' end,
       closed_at=stamp,revision=revision+1,deletion_state='delete_pending',
       failure_code=case when expires_at<=stamp then failure_code else 'provider_unavailable' end where id=p.id;
     delete from document_candidates where process_id=p.id;
     if j.lease_kind='submit' and j.lease_until<=stamp then
       -- Preserve submit token: a late accepted 202 must still attach its result ID.
       update document_ocr_jobs set job_state='submission_unknown',last_error='interrupted',completed_at=stamp where process_id=p.id;
     elsif j.job_state in ('running','retry_wait') and j.created_at+interval '15 minutes'<=stamp then
       update document_ocr_jobs set job_state='failed',last_error='deadline',completed_at=stamp where process_id=p.id;
     end if;
     select * into p from document_processes where id=p.id;
     select * into j from document_ocr_jobs where process_id=p.id;
   end if;
   if j.result_id is null and j.lease_kind='submit' and j.lease_until<=stamp and j.job_state<>'submission_unknown' then
     update document_ocr_jobs set job_state='submission_unknown',last_error='interrupted',completed_at=stamp where process_id=p.id;
     select * into j from document_ocr_jobs where process_id=p.id;
   end if;
   if p_kind='storage' then
     if p.closed_at is null or (p.deletion_state<>'delete_pending' and p.storage_delete_after>stamp) or p.storage_delete_lease_until>stamp then return 'null'::jsonb; end if;
     select coalesce(p.storage_path,u.storage_path) into path from (select 1) x left join document_uploads u on u.process_id=p.id;
     if p.deletion_state='deleted' then
       if not exists(select 1 from storage.objects where bucket_id='hu23-document-temporary' and name=path) then return 'null'::jsonb; end if;
       update document_processes set deletion_state='retry_required',deletion_at=null,storage_path=path where id=p.id;
     end if;
     update document_processes set deletion_state='deleting',deletion_attempts=deletion_attempts+1,revision=revision+1
       where id=p.id returning * into p;
     return jsonb_build_object('token',p.storage_delete_token,'path',path);
   elsif p_kind='azure' then
     if j.process_id is null or j.deletion_state not in ('delete_pending','retry_required','deleting')
       or j.next_attempt_at>stamp or j.lease_until>stamp then return 'null'::jsonb; end if;
     if j.result_id is null then
       if j.job_state='submission_unknown' or j.lease_kind='submit' then
         update document_ocr_jobs set next_attempt_at=stamp+interval '1 hour' where process_id=p.id;
         return jsonb_build_object('unresolved',true);
       end if;
       update document_ocr_jobs set deletion_state='deleted',deleted_at=stamp where process_id=p.id;
       return jsonb_build_object('absent',true);
     end if;
     update document_ocr_jobs set lease_token=gen_random_uuid(),lease_kind='delete',lease_until=stamp+interval '45 seconds',
       deletion_state='deleting',delete_attempts=delete_attempts+1 where process_id=p.id returning * into j;
     return jsonb_build_object('token',j.lease_token,'result_id',j.result_id,'probe',j.cleanup_probe,'job_state',j.job_state);
   elsif p_kind='purge' then
     if p.closed_at is null or p.deletion_state<>'deleted' or p.created_at+interval '24 hours'>stamp then return 'null'::jsonb; end if;
     delete from document_uploads u where u.process_id=p.id and u.reconcile_until<=stamp
       and not exists(select 1 from storage.objects s where s.bucket_id=u.bucket_id and s.name=u.storage_path);
     delete from document_ocr_jobs where process_id=p.id and deletion_state='deleted' and deleted_at+interval '1 hour'<=stamp
       and coalesce(lease_until,'-infinity')<=stamp;
     return jsonb_build_object('purged',true);
   end if;
 elsif p_action='settle' then
   if p_kind='storage' then
     if p_token is null or p.storage_delete_token is distinct from p_token then return 'null'::jsonb; end if;
     -- Existing T2 trigger refuses acknowledgement while Storage still reports the object.
     if outcome='deleted' and not exists(select 1 from storage.objects s join document_uploads u
       on u.bucket_id=s.bucket_id and u.storage_path=s.name where u.process_id=p.id) then
       update document_processes set deletion_state='deleted',deletion_at=stamp,storage_path=null,revision=revision+1 where id=p.id;
     else
       update document_processes set deletion_state='retry_required',revision=revision+1 where id=p.id;
     end if;
   elsif p_kind='azure' then
     if p_token is null or j.lease_token is distinct from p_token or j.lease_kind<>'delete' then return 'null'::jsonb; end if;
     delay:=greatest(60,least(86400,coalesce((p_payload->>'retry_after')::integer,60)),
       least(1800,60*power(2,least(j.delete_attempts,5))::integer));
     if outcome='deleted' then
       update document_ocr_jobs set deletion_state='deleted',deleted_at=stamp,last_error=null,cleanup_probe=false,
         lease_token=null,lease_kind=null,lease_until=null where process_id=p.id;
     else
       update document_ocr_jobs set deletion_state='retry_required',last_error='transient',
         next_attempt_at=stamp+make_interval(secs=>delay),
         cleanup_probe=case when outcome in ('missing','running') then true when outcome in ('succeeded','failed') then false else cleanup_probe end,
         job_state=case when outcome in ('succeeded','failed') then outcome else job_state end,
         lease_token=null,lease_kind=null,lease_until=null where process_id=p.id;
     end if;
   else raise exception 'invalid_transition'; end if;
   return jsonb_build_object('outcome',case when p_kind='storage' then
     (select deletion_state from document_processes where id=p.id) else
     (select deletion_state from document_ocr_jobs where process_id=p.id) end);
 end if;
 raise exception 'invalid_transition';
end $$;
revoke all on function public.hu23_cleanup_deadline(),public.hu23_storage_delete_lease(),
 public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) to service_role;
commit;
