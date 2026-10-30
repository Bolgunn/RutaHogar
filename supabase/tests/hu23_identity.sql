-- The rejection port is service-only and accepts the generic terminal code.
begin;
do $$
begin
  if has_function_privilege('anon','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute')
     or has_function_privilege('authenticated','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute')
     or not has_function_privilege('service_role','public.hu23_reject_identity(uuid,uuid,integer,uuid)','execute') then
    raise exception 'identity rejection permissions';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.document_processes'::regclass
                and conname='document_processes_failure_code_check'
                and pg_get_constraintdef(oid) like '%identity_inconsistent%') then
    raise exception 'identity rejection code missing';
  end if;
end;
$$;
rollback;
