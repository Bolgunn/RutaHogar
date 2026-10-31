-- Non-destructive disablement; compatible replay/read/cleanup remain available.
begin;
create or replace function public.hu23_confirmation_enabled()
returns boolean language sql immutable set search_path=public,pg_temp as $$ select false; $$;
commit;
