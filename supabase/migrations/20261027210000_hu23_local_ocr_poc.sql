-- Optional HU23 PoC. Pin transport per job; no OCR, URLs or new financial fields persist.
begin;
alter table public.document_ocr_jobs add column provider text not null default 'azure'
 check(provider in ('azure','local'));
alter table public.document_ocr_jobs drop constraint document_ocr_jobs_api_version_check;
alter table public.document_ocr_jobs drop constraint document_ocr_jobs_model_id_check;
alter table public.document_ocr_jobs add constraint document_ocr_jobs_provider_metadata_check check(
 (provider='azure' and api_version='2024-11-30' and model_id='prebuilt-layout') or
 (provider='local' and api_version='1' and model_id='hu23-local'));

-- Preserve the original Azure cleanup body/privileges behind a service-only facade.
-- Older databases return Azure-only claims; new claims carry the pinned provider.
alter function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) rename to hu23_cleanup_before_local_ocr;
revoke all on function public.hu23_cleanup_before_local_ocr(text,uuid,uuid,text,uuid,jsonb,integer) from public,anon,authenticated,service_role;
create function public.hu23_cleanup(p_action text,p_run uuid default null,p_process uuid default null,
 p_kind text default null,p_token uuid default null,p_payload jsonb default '{}',p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare response jsonb;
begin
 response:=hu23_cleanup_before_local_ocr(p_action,p_run,p_process,p_kind,p_token,p_payload,p_limit);
 if p_action='claim' and p_kind='azure' and response->>'result_id' is not null then
   response:=response||jsonb_build_object('provider',(select provider from document_ocr_jobs where process_id=p_process));
 end if;
 return response;
end $$;
revoke all on function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) to service_role;

create function public.hu23_local_ocr(p_user uuid,p_process uuid,p_action text,p_token uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p document_processes; j document_ocr_jobs; stamp timestamptz:=clock_timestamp(); claimed boolean:=false;
begin
 perform hu23_require_owner(p_user,p_process);
 perform 1 from profiles where id=p_user for update;
 select * into p from document_processes where id=p_process for update;
 select * into j from document_ocr_jobs where process_id=p.id for update;
 if p_action not in ('claim','prepare','retry','cleanup') then raise exception 'invalid_transition'; end if;
 if j.process_id is not null and j.provider<>'local' then raise exception 'invalid_transition'; end if;
 if p.closed_at is null and p.expires_at<=stamp then
   perform hu23_lifecycle(p_user,p.id,p.revision,'expire','{}');
   select * into p from document_processes where id=p.id;
 end if;
 if p_action='claim' then
   if not hu23_parsing_enabled() then raise exception 'parsing_disabled'; end if;
   if p.closed_at is not null or p.state='awaiting_review' then null;
   elsif j.lease_until>stamp or j.next_attempt_at>stamp then null;
   else
     if j.process_id is null then
       if p.state<>'ready' then raise exception 'invalid_transition'; end if;
       perform hu23_ocr_step(p_user,p.id,'start');
     elsif p.state not in ('processing','ocr_ready') then raise exception 'invalid_transition';
     end if;
     -- A fresh UUID is a local correlation reference, never an Azure result ID.
     update document_ocr_jobs set provider='local',api_version='1',model_id='hu23-local',
       result_id=coalesce(result_id,gen_random_uuid()),job_state='running',
       submitted_at=coalesce(submitted_at,stamp),completed_at=null,
       -- Stateless extraction is a parse lease, not an uncertain Azure submission.
       lease_kind='parse',lease_token=gen_random_uuid(),lease_until=stamp+interval '90 seconds',
       last_error=null where process_id=p.id;
     claimed:=true;
   end if;
 elsif p_action in ('prepare','retry') then
   if p.closed_at is not null or p.state='awaiting_review' then null;
   elsif j.process_id is null or p_token is null or j.lease_token is distinct from p_token or coalesce(j.lease_until<=stamp,true)
       or j.lease_kind not in ('submit','parse') then raise exception 'stale_review';
   elsif p_action='prepare' then
     update document_processes set state='ocr_ready',revision=revision+1 where id=p.id;
     update document_ocr_jobs set job_state='succeeded',completed_at=stamp,lease_kind='parse',
       lease_until=stamp+interval '45 seconds' where process_id=p.id;
   else
     update document_ocr_jobs set job_state='retry_wait',last_error='transient',
       lease_kind=null,lease_token=null,lease_until=null,next_attempt_at=stamp+interval '10 seconds'
       where process_id=p.id;
   end if;
 elsif p_action='cleanup' and (p.closed_at is not null or p.state='awaiting_review') then
   -- Worker has no retained result. Original Storage duty remains unchanged.
   update document_ocr_jobs set deletion_state='deleted',deleted_at=coalesce(deleted_at,stamp),
     lease_kind=null,lease_token=null,lease_until=null where process_id=p.id;
 end if;
 select * into p from document_processes where id=p_process;
 select * into j from document_ocr_jobs where process_id=p_process;
 return jsonb_build_object('process',to_jsonb(p),'job',case when j.process_id is null then null else to_jsonb(j) end,
                           'claimed',claimed);
end;
$$;
revoke all on function public.hu23_local_ocr(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.hu23_local_ocr(uuid,uuid,text,uuid) to service_role;
commit;
