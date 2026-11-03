-- Identity contradictions close the attempt without persisting document identity values.
begin;
alter table public.document_processes drop constraint if exists document_processes_failure_code_check;
alter table public.document_processes add constraint document_processes_failure_code_check
  check (failure_code in ('unreadable_document','provider_unavailable','invalid_result','identity_inconsistent'));

create function public.hu23_reject_identity(p_user uuid, p_process uuid, p_revision integer, p_parse_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.document_processes; j public.document_ocr_jobs;
begin
  perform public.hu23_require_owner(p_user,p_process);
  perform 1 from public.profiles where id=p_user for update;
  select * into p from public.document_processes where id=p_process for update;
  select * into j from public.document_ocr_jobs where process_id=p_process for update;
  if p.state <> 'ocr_ready' or p.revision <> p_revision or j.process_id is null
     or j.lease_kind is distinct from 'parse' or j.lease_token is distinct from p_parse_token
     or p_parse_token is null or coalesce(j.lease_until <= clock_timestamp(),true) then
    raise exception 'stale_review';
  end if;
  perform public.hu23_lifecycle(p_user,p_process,p_revision,'fail',jsonb_build_object('failure_code','invalid_result'));
  update public.document_processes set failure_code='identity_inconsistent' where id=p_process;
  return public.hu23_read(p_user,p_process);
end;
$$;
revoke all on function public.hu23_reject_identity(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.hu23_reject_identity(uuid,uuid,integer,uuid) to service_role;
commit;
