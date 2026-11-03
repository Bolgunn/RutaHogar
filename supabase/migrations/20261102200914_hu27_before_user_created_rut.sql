begin;

-- Called only by Supabase Auth before inserting a new user. Existing login,
-- identity linking and the profile-level duplicate guard remain unchanged.
create function public.hu27_before_user_created(event jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public
as $$
declare
  v_provider text := event->'user'->'app_metadata'->>'provider';
  v_rut text := nullif(regexp_replace(upper(event->'user'->'user_metadata'->>'rut'), '[^0-9K]', '', 'g'), '');
begin
  -- Google supplies no RUT; collect it in the existing profile completion flow.
  -- Missing RUT is also valid for existing staff invitation/provisioning flows.
  if v_provider is distinct from 'email' or v_rut is null then return '{}'::jsonb; end if;
  if exists (
    select 1 from public.profiles p
    where nullif(regexp_replace(upper(p.rut), '[^0-9K]', '', 'g'), '') = v_rut
  ) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'No se pudo crear la cuenta con estos datos. Revisa el RUT o recupera el acceso a tu cuenta.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.hu27_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hu27_before_user_created(jsonb) to supabase_auth_admin;
-- The HU27 access-guard migration already grants schema usage and adds the
-- Auth-only SELECT policy. Add just the column required by this lookup.
grant select (rut) on public.profiles to supabase_auth_admin;
comment on function public.hu27_before_user_created(jsonb) is 'HU27: enable as Before User Created / Postgres hook. Rejects email registration with a RUT already in profiles; Google remains supported. Not a reservation or a solution for concurrent pending signups.';

commit;
