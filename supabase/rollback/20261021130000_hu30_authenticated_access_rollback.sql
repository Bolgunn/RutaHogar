-- Preserve links already established; never restore anonymous confirmation.
begin;
revoke execute on function public.hu30_authorize_invitation(text,uuid) from service_role;
commit;
