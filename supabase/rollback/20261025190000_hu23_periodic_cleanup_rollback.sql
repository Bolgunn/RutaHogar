-- Non-destructive: stop new scheduled claims, retain obligations, leases, evidence
-- and in-flight acknowledgements. Immediate T1-T7 cleanup continues to work.
begin;
update public.document_cleanup_control set enabled=false where singleton;
commit;
