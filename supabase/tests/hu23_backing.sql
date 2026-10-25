begin;
do $$ begin
 if has_function_privilege('authenticated','hu23_backing_evidence(uuid,boolean)','EXECUTE')
   or has_function_privilege('anon','hu23_backing_evidence(uuid,boolean)','EXECUTE') then raise exception 'E4 private port exposed'; end if;
 if not has_function_privilege('service_role','hu23_backing_evidence(uuid,boolean)','EXECUTE') then raise exception 'E4 backend cannot read'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
   and policyname='HU23 no original reads' and permissive='RESTRICTIVE') then raise exception 'original read isolation lost'; end if;
end $$;
rollback;
