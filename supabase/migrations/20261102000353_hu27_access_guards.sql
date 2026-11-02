begin;

-- Existing administrator functions and service-role provisioning remain authoritative.
-- Direct browser writes cannot promote the caller or reassign its company.
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

-- Preserve legacy duplicates; serialize/check only new or changed RUT assignments.
create index profiles_hu27_normalized_rut_lookup
on public.profiles ((nullif(regexp_replace(upper(rut), '[^0-9K]', '', 'g'), '')))
where nullif(regexp_replace(upper(rut), '[^0-9K]', '', 'g'), '') is not null;

create or replace function public.hu27_guard_profile_rut()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare v_rut text := nullif(regexp_replace(upper(new.rut), '[^0-9K]', '', 'g'), '');
begin
  if v_rut is null then return new; end if;
  if tg_op = 'UPDATE' and v_rut is not distinct from nullif(regexp_replace(upper(old.rut), '[^0-9K]', '', 'g'), '') then return new; end if;
  if tg_op = 'INSERT' and exists (select 1 from public.profiles p where p.id=new.id
    and nullif(regexp_replace(upper(p.rut), '[^0-9K]', '', 'g'), '') = v_rut) then return new; end if;
  -- Trigger-only definer lookup is necessary to detect conflicts hidden by profile RLS.
  perform pg_advisory_xact_lock(hashtextextended('hu27-rut:' || v_rut, 0));
  if exists (select 1 from public.profiles p where p.id <> new.id
    and nullif(regexp_replace(upper(p.rut), '[^0-9K]', '', 'g'), '') = v_rut) then
    raise exception using errcode='23505', message='No se pudo guardar el perfil. Revisa tus datos o recupera tu cuenta existente.';
  end if;
  return new;
end;
$$;
revoke all on function public.hu27_guard_profile_rut() from public, anon, authenticated;
create trigger hu27_profile_rut_guard before insert or update of rut on public.profiles
for each row execute function public.hu27_guard_profile_rut();

-- Opt in through Authentication > Hooks after deploying and testing this function.
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
    raise exception 'Esta cuenta debe ingresar con correo y contraseña.';
  end if;
  select lower(email) into v_email from auth.users where id = v_user;
  if exists (select 1 from auth.identities i where i.user_id = v_user and i.provider = 'google'
    and (i.identity_data->>'email' is null or lower(i.identity_data->>'email') is distinct from v_email)) then
    raise exception 'Google debe utilizar el mismo correo de la cuenta.';
  end if;
  return jsonb_build_object('claims', event->'claims');
end;
$$;
revoke all on function public.hu27_access_token_hook(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select (id, role) on public.profiles to supabase_auth_admin;
create policy "hu27_auth_hook_profile_read" on public.profiles for select to supabase_auth_admin using (true);
grant execute on function public.hu27_access_token_hook(jsonb) to supabase_auth_admin;
comment on function public.hu27_access_token_hook(jsonb) is 'HU27: trusted role and same-email Google scope. Enable as Custom Access Token hook; never expose as a browser RPC.';

commit;
