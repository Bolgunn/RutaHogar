-- HU23 T3: durable OCR metadata only. Never persist provider payloads or signed URLs.
begin;
alter table public.document_processes drop constraint document_processes_state_check;
alter table public.document_processes add constraint document_processes_state_check
 check(state in ('awaiting_upload','ready','processing','ocr_ready','awaiting_review','confirmed','cancelled','processing_failed','expired'));

create table public.document_ocr_jobs(
 process_id uuid primary key,
 user_id uuid not null,
 job_state text not null check(job_state in ('submitting','retry_wait','running','succeeded','failed','submission_unknown')),
 result_id uuid unique,
 api_version text not null default '2024-11-30' check(api_version='2024-11-30'),
 model_id text not null default 'prebuilt-layout' check(model_id='prebuilt-layout'),
 consented_at timestamptz not null default clock_timestamp(),
 created_at timestamptz not null default clock_timestamp(),
 submitted_at timestamptz,
 completed_at timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(),
 submit_attempts integer not null default 0 check(submit_attempts between 0 and 3),
 poll_attempts integer not null default 0 check(poll_attempts between 0 and 60),
 delete_attempts integer not null default 0 check(delete_attempts>=0),
 transient_errors integer not null default 0 check(transient_errors>=0),
 last_error text check(last_error in ('transient','submission_unknown','provider_failed','invalid_response','deadline','interrupted')),
 lease_token uuid,
 lease_kind text check(lease_kind in ('submit','poll','delete')),
 lease_until timestamptz,
 deletion_state text not null default 'not_requested'
   check(deletion_state in ('not_requested','delete_pending','deleting','deleted','retry_required')),
 deleted_at timestamptz,
 foreign key(process_id,user_id) references public.document_processes(id,user_id),
 check(job_state not in ('running','succeeded') or result_id is not null),
 check((deletion_state='deleted')=(deleted_at is not null))
);
alter table public.document_ocr_jobs enable row level security;
revoke all on public.document_ocr_jobs from public,anon,authenticated,service_role;
grant select on public.document_ocr_jobs to service_role;
create index hu23_ocr_recovery_idx on public.document_ocr_jobs(deletion_state,next_attempt_at);

-- Closing a process must retain cleanup duty even while an Azure submit is in flight.
create function public.hu23_ocr_close()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.closed_at is not null and old.closed_at is null then
   update document_ocr_jobs set deletion_state=case when deletion_state='deleted' then 'deleted' else 'delete_pending' end,
     next_attempt_at=least(next_attempt_at,clock_timestamp()) where process_id=new.id;
 end if;
 return new;
end;
$$;
create trigger hu23_ocr_close after update of state on public.document_processes
 for each row execute function public.hu23_ocr_close();

-- One external HTTP operation per claim. Fencing tokens serialize callers without
-- holding a PostgreSQL transaction or Vercel request open while Azure processes.
create function public.hu23_ocr_step(p_user uuid,p_process uuid,p_action text,p_token uuid default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p document_processes; j document_ocr_jobs; stamp timestamptz:=clock_timestamp();
 op text; outcome text:=p_payload->>'outcome'; delay integer; count_attempts integer;
begin
 perform hu23_require_owner(p_user,p_process);
 perform 1 from profiles where id=p_user for update;
 select * into p from document_processes where id=p_process for update;
 select * into j from document_ocr_jobs where process_id=p.id for update;
 if p_action not in ('read','start','poll','cleanup','settle','discard') then raise exception 'invalid_transition'; end if;
 if p.closed_at is null and p.expires_at<=stamp then
   perform hu23_lifecycle(p_user,p.id,p.revision,'expire','{}');
   select * into p from document_processes where id=p.id;
   select * into j from document_ocr_jobs where process_id=p.id;
 end if;

 if p_action='settle' then
   if j.process_id is null or j.lease_token is distinct from p_token then raise exception 'stale_review'; end if;
   delay:=greatest(2,least(86400,coalesce((p_payload->>'retry_after')::integer,2)));
   if j.lease_kind='submit' and outcome='started' then
     update document_ocr_jobs set result_id=(p_payload->>'result_id')::uuid,job_state='running',submitted_at=stamp,
       last_error=null,next_attempt_at=case when p.closed_at is not null then stamp else stamp+make_interval(secs=>delay) end,
       deletion_state=case when p.closed_at is not null then 'delete_pending' else deletion_state end where process_id=p.id;
   elsif j.lease_kind='delete' and outcome='deleted' then
     update document_ocr_jobs set deletion_state='deleted',deleted_at=stamp,last_error=null where process_id=p.id;
   elsif j.lease_kind='delete' and outcome='retry' then
     update document_ocr_jobs set deletion_state='retry_required',last_error='transient',
       next_attempt_at=stamp+make_interval(secs=>greatest(delay,case when j.delete_attempts>=5 then 3600 else least(60,power(2,j.delete_attempts)::integer) end)) where process_id=p.id;
   elsif j.lease_kind='poll' and outcome in ('running','succeeded') then
     update document_ocr_jobs set job_state=case when outcome='succeeded' then 'succeeded' else 'running' end,
       completed_at=case when outcome='succeeded' then stamp else null end,transient_errors=0,last_error=null,
       next_attempt_at=case when p.closed_at is not null then stamp else stamp+make_interval(secs=>delay) end where process_id=p.id;
     if outcome='succeeded' and p.closed_at is null then
       update document_processes set state='ocr_ready',revision=revision+1 where id=p.id;
     end if;
   elsif j.lease_kind in ('submit','poll') and outcome='retry'
     and (j.lease_kind<>'submit' or j.submit_attempts<3) and j.transient_errors<4 then
     update document_ocr_jobs set job_state=case when j.lease_kind='submit' then 'retry_wait' else 'running' end,
       transient_errors=transient_errors+1,last_error='transient',
       next_attempt_at=stamp+make_interval(secs=>greatest(delay,least(60,power(2,j.transient_errors+1)::integer))) where process_id=p.id;
   elsif j.lease_kind in ('submit','poll') and outcome in ('failed','unknown','retry') then
     update document_ocr_jobs set job_state=case when outcome='unknown' then 'submission_unknown' else 'failed' end,
       completed_at=stamp,last_error=case when outcome='unknown' then 'submission_unknown'
         when p_payload->>'error'='invalid_response' then 'invalid_response' else 'provider_failed' end,
       deletion_state='delete_pending',next_attempt_at=stamp where process_id=p.id;
     if p.closed_at is null then
       perform hu23_lifecycle(p_user,p.id,p.revision,'fail','{"failure_code":"provider_unavailable"}');
     end if;
   else raise exception 'invalid_result'; end if;
   update document_ocr_jobs set lease_until=null,lease_kind=null,lease_token=null where process_id=p.id;

 elsif p_action='discard' then
   -- Internal T4 acknowledgement only AFTER validated minimal candidates are committed.
   if j.job_state<>'succeeded' or p.state<>'awaiting_review' then raise exception 'invalid_transition'; end if;
   update document_ocr_jobs set deletion_state=case when deletion_state='deleted' then 'deleted' else 'delete_pending' end,
     next_attempt_at=stamp where process_id=p.id;

 elsif p_action in ('start','poll','cleanup') then
   if j.process_id is null then
     if p_action<>'start' or p.state<>'ready' or p.closed_at is not null then raise exception 'invalid_transition'; end if;
     perform hu23_lifecycle(p_user,p.id,p.revision,'start','{}');
     insert into document_ocr_jobs(process_id,user_id,job_state) values(p.id,p_user,'submitting') returning * into j;
     op:='submit';
   elsif j.lease_until>stamp then
     op:=null;
   elsif j.lease_kind='submit' then
     -- Crash/timeout after submit may have created an operation. Never resubmit blindly.
     update document_ocr_jobs set job_state='submission_unknown',last_error='interrupted',completed_at=stamp,
       deletion_state='delete_pending' where process_id=p.id;
     if p.closed_at is null then perform hu23_lifecycle(p_user,p.id,p.revision,'fail','{"failure_code":"provider_unavailable"}'); end if;
   elsif j.result_id is not null and j.deletion_state in ('delete_pending','retry_required','deleting')
       and j.next_attempt_at<=stamp then
     op:='delete';
   elsif p.closed_at is null and j.next_attempt_at<=stamp and p_action in ('start','poll') then
     if j.job_state='retry_wait' and j.submit_attempts<3 then op:='submit';
     elsif j.job_state='running' then
       if j.poll_attempts>=60 or stamp>j.created_at+interval '15 minutes' then
         update document_ocr_jobs set job_state='failed',last_error='deadline',completed_at=stamp,deletion_state='delete_pending',
           next_attempt_at=stamp where process_id=p.id;
         perform hu23_lifecycle(p_user,p.id,p.revision,'fail','{"failure_code":"provider_unavailable"}');
       else op:='poll'; end if;
     end if;
   end if;
   if op is not null then
     update document_ocr_jobs set lease_token=gen_random_uuid(),lease_kind=op,lease_until=stamp+interval '45 seconds',
       submit_attempts=submit_attempts+case when op='submit' then 1 else 0 end,
       poll_attempts=poll_attempts+case when op='poll' then 1 else 0 end,
       delete_attempts=delete_attempts+case when op='delete' then 1 else 0 end,
       job_state=case when op='submit' then 'submitting' else job_state end,
       deletion_state=case when op='delete' then 'deleting' else deletion_state end where process_id=p.id;
   end if;
 end if;
 select * into p from document_processes where id=p_process;
 select * into j from document_ocr_jobs where process_id=p_process;
 return jsonb_build_object('process',to_jsonb(p),'job',case when j.process_id is null then null else to_jsonb(j) end,'action',op);
end;
$$;
revoke all on function public.hu23_ocr_close(),public.hu23_ocr_step(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hu23_ocr_step(uuid,uuid,text,uuid,jsonb) to service_role;
commit;
