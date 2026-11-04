-- Disable the Before User Created hook in Supabase Authentication > Hooks first.
begin;
drop function if exists public.hu27_before_user_created(jsonb);
-- Intentionally retain SELECT(rut) for supabase_auth_admin and shared policies:
-- other Auth hooks can depend on these grants; browser roles gain no access.
commit;
