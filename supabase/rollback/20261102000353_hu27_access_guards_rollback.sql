-- Disable the HU27 Custom Access Token hook in the dashboard BEFORE running this rollback.
begin;
drop trigger if exists hu27_own_access_guard on public.profiles;
drop function if exists public.hu27_guard_own_access();
drop function if exists public.hu27_access_token_hook(jsonb);
drop policy if exists "hu27_auth_hook_profile_read" on public.profiles;
drop trigger if exists hu27_profile_rut_guard on public.profiles;
drop function if exists public.hu27_guard_profile_rut();
drop index if exists public.profiles_hu27_normalized_rut_lookup;
-- Leave pre-existing Auth administrator table privileges unchanged.
commit;
