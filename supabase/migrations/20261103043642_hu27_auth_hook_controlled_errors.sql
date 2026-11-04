begin;
create or replace function public.hu27_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  v_user uuid := (event->>'user_id')::uuid;
  v_role text;
  v_email text;
  v_oauth boolean;
begin
  select role into v_role from public.profiles where id = v_user;
  v_oauth := event->>'authentication_method' = 'oauth'
    or exists (select 1 from jsonb_array_elements(coalesce(event->'claims'->'amr', '[]'::jsonb)) a where a->>'method' = 'oauth');
  if v_oauth and coalesce(v_role, 'usuario') <> 'usuario' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Esta cuenta debe ingresar con correo y contraseña.'));
  end if;
  select lower(email) into v_email from auth.users where id = v_user;
  if exists (select 1 from auth.identities i where i.user_id = v_user and i.provider = 'google'
    and (i.identity_data->>'email' is null or lower(i.identity_data->>'email') is distinct from v_email)) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Google debe utilizar el mismo correo de la cuenta.'));
  end if;
  return jsonb_build_object('claims', event->'claims');
end;
$$;
commit;
