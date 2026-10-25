-- Evidence-preserving rollback: stop new revisions; retain readers, columns and audit.
-- A structural HU18 downgrade is unsafe once any HU30 evidence exists.
begin;
revoke execute on function public.hu30_append_confirmation(uuid,uuid,uuid,integer,uuid,jsonb,text) from service_role;
revoke execute on function public.hu30_declare_relation(uuid,uuid,text,integer) from service_role;
do $$ begin raise notice 'HU30 writes disabled. Evidence retained; use a forward correction. Do not deploy HU18 readers over multiple revisions.'; end; $$;
commit;
