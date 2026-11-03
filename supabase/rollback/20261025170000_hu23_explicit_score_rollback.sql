-- Keep evaluation history and completed replay. Disable new score evaluations only.
begin;
create or replace function public.hu23_score_enabled()
returns boolean language sql immutable set search_path=public,pg_temp as $$ select false; $$;
commit;
