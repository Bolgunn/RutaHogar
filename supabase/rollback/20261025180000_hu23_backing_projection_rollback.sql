-- Non-destructive: disable E4 read port, preserve all evidence, lifecycle and scoring.
begin;
revoke execute on function public.hu23_backing_evidence(uuid,boolean) from service_role;
commit;
