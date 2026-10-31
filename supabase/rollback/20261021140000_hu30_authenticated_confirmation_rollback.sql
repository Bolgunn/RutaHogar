-- Stop T4B writes, preserve revisions, relations, links, reads and revocation.
begin;
revoke execute on function public.hu30_confirm_participation(uuid,uuid,uuid,integer,uuid,boolean,jsonb,boolean) from service_role;
revoke execute on function public.hu30_create_invitation(uuid,text,text,text,timestamptz,jsonb,text) from service_role;
commit;
