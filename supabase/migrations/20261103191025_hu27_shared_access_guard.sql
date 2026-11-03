begin;
-- Do not remove the fallback guard unless the shared production guard is active.
do $$ begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.profiles'::regclass and not tgisinternal
      and tgname='hu30_profile_privileges'
      and tgfoid=to_regprocedure('public.hu30_guard_profile_privileges()')
      and tgenabled in ('O','A') and (tgtype::integer & 23)=23
  ) then raise exception 'Apply the shared profile privilege guard before this migration.'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='profiles' and column_name='estado_acceso') then
    raise exception 'Apply the team access-state migration before this migration.';
  end if;
end $$;

drop trigger if exists hu27_own_access_guard on public.profiles;
drop function if exists public.hu27_guard_own_access();
grant select (estado_acceso) on public.profiles to supabase_auth_admin;

create or replace function public.hu27_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := (event->>'user_id')::uuid;
  v_role text;
  v_state text;
  v_email text;
  v_oauth boolean;
begin
  select role, estado_acceso into v_role, v_state from public.profiles where id=v_user;
  if v_state = 'desactivado' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403,
      'message', 'Esta cuenta no tiene acceso habilitado. Contacta al administrador.'));
  end if;
  v_oauth := event->>'authentication_method' = 'oauth'
    or exists (select 1 from jsonb_array_elements(coalesce(event->'claims'->'amr', '[]'::jsonb)) a where a->>'method' = 'oauth');
  if v_oauth and coalesce(v_role, 'usuario') <> 'usuario' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Esta cuenta debe ingresar con correo y contraseña.'));
  end if;
  select lower(email) into v_email from auth.users where id=v_user;
  if exists (select 1 from auth.identities i where i.user_id=v_user and i.provider='google'
    and (i.identity_data->>'email' is null or lower(i.identity_data->>'email') is distinct from v_email)) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Google debe utilizar el mismo correo de la cuenta.'));
  end if;
  return jsonb_build_object('claims', event->'claims');
end;
$$;
commit;
