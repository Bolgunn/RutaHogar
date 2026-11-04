-- Non-destructive rollback: retain candidates, leases and remote cleanup duties.
begin;
create or replace function public.hu23_parsing_enabled()
returns boolean language sql immutable set search_path=public,pg_temp as $$ select false; $$;
-- Existing read/cancel/cleanup/remote acknowledgements remain operational.
commit;
