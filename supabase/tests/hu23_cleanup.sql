-- T8 ports and state are never accessible to authenticated clients/commercial roles.
begin;
do $$ begin
 if has_function_privilege('authenticated','hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer)','execute')
   or has_function_privilege('anon','hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer)','execute') then
   raise exception 'cleanup exposed to clients'; end if;
 if has_table_privilege('authenticated','document_cleanup_control','select')
   or has_table_privilege('authenticated','document_cleanup_control','update') then raise exception 'scheduler lease exposed'; end if;
 if not has_function_privilege('service_role','hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer)','execute') then
   raise exception 'backend cannot recover'; end if;
 if not (select relrowsecurity from pg_class where oid='public.document_cleanup_control'::regclass) then
   raise exception 'missing cleanup RLS'; end if;
end $$;
set local role authenticated;
do $$ begin
 begin
   perform hu23_cleanup('begin');
   raise exception 'client invoked cleanup';
 exception when insufficient_privilege then null; end;
 begin
   perform * from document_cleanup_control;
   raise exception 'client read cron lease';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
