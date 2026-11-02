-- Disable the Before User Created hook in Supabase Authentication > Hooks first.
begin;
drop function if exists public.hu27_before_user_created(jsonb);
-- Keep shared Auth grants/policies: other hooks may depend on them.
commit;
