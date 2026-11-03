-- Restore only the previous additional guard/hook. Never remove the shared guard or team columns.
begin;
create or replace function public.hu27_guard_own_access()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare v_role text; v_company uuid;
begin
  if current_user = 'authenticated' and auth.uid() = new.id then
    if tg_op = 'INSERT' then
      select role, inmobiliaria_id into v_role, v_company from public.profiles where id=new.id;
      if found then
        -- Supabase upserts execute BEFORE INSERT before their conflict UPDATE.
        if new.role is distinct from v_role or (new.inmobiliaria_id is not null and new.inmobiliaria_id is distinct from v_company) then
          raise exception using errcode='42501', message='No puedes modificar los permisos de tu cuenta.';
        end if;
      elsif new.role is distinct from 'usuario' or new.inmobiliaria_id is not null then
        raise exception using errcode='42501', message='No puedes modificar los permisos de tu cuenta.';
      end if;
    elsif new.role is distinct from old.role or new.inmobiliaria_id is distinct from old.inmobiliaria_id then
      raise exception using errcode='42501', message='No puedes modificar los permisos de tu cuenta.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.hu27_guard_own_access() from public, anon, authenticated;
create trigger hu27_own_access_guard before insert or update of role, inmobiliaria_id on public.profiles
for each row execute function public.hu27_guard_own_access();

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
-- Retain the Auth-only column grant; other hooks may require it.
commit;
