-- Corrige el guard de privilegios de profiles que HU30 instaló en producción y
-- cierra el alta como staff vía metadata, el autoservicio sobre reliability_status
-- y el acceso anónimo a assign_executive/unassign_executive. Reemplaza los objetos por nombre para
-- que profiles conserve un solo guard. Rollback:
-- supabase/rollback/20261031120000_profiles_privilege_guard_fix_rollback.sql
begin;

create or replace function public.hu30_guard_profile_privileges()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor_role text; actor_tenant uuid;
begin
  -- PostgREST SET ROLE survives SECURITY DEFINER; current_user would not.
  if current_setting('role',true) in ('service_role','postgres','none')
      and (current_setting('role',true) <> 'none' or session_user = 'postgres') then return new; end if;
  if tg_op = 'INSERT' then
    -- BEFORE INSERT also fires on the proposed row of an upsert that will end in
    -- ON CONFLICT DO UPDATE. The BEFORE UPDATE branch judges it against the
    -- stored row, so a staff member re-saving their own profile is not a change.
    if exists (select 1 from public.profiles where id = new.id) then return new; end if;
    if new.role is distinct from 'usuario' or new.inmobiliaria_id is not null
        or new.reliability_status is distinct from 'normal' then
      raise exception 'profile_privilege_change_forbidden' using errcode='42501';
    end if;
    return new;
  end if;
  -- A user never clears their own fraud flag. check_ml_fraud_on_insert raises it from the lead's
  -- own evaluation insert, so that write arrives here one trigger level down.
  if new.reliability_status is distinct from old.reliability_status
      and auth.uid() is not distinct from old.id and pg_trigger_depth() = 1 then
    raise exception 'profile_privilege_change_forbidden' using errcode='42501';
  end if;
  if new.role is not distinct from old.role and new.inmobiliaria_id is not distinct from old.inmobiliaria_id then
    return new;
  end if;
  select role,inmobiliaria_id into actor_role,actor_tenant from public.profiles where id=auth.uid();
  if auth.uid() is distinct from old.id and actor_role = 'admin' and actor_tenant is null then return new; end if;
  -- Existing tenant admins may manage executive assignments inside their tenant,
  -- but cannot mint a role or move a profile out of its organization.
  if auth.uid() is distinct from old.id and actor_role in ('admin','admin_inmobiliario')
      and actor_tenant is not null and old.role='ejecutivo' and new.role='ejecutivo'
      and (old.inmobiliaria_id is null or old.inmobiliaria_id=actor_tenant)
      and new.inmobiliaria_id=actor_tenant then return new; end if;
  -- resolve_pending_executives may attach an existing executive (including
  -- the caller) to an administrator-created pending assignment. It cannot
  -- promote a lead or grant membership in an arbitrary tenant.
  if old.role='ejecutivo' and new.role='ejecutivo' and old.inmobiliaria_id is null
      and new.inmobiliaria_id is not null and actor_role in ('admin','ejecutivo')
      and exists (select 1 from public.proyecto_ejecutivos pe
        join public.proyectos pr on pr.id=pe.proyecto_id join auth.users u on u.id=old.id
        where pe.estado='pendiente' and lower(u.email)=lower(pe.ejecutivo_email)
          and pr.inmobiliaria_id=new.inmobiliaria_id
          and (actor_tenant is null or actor_tenant=new.inmobiliaria_id)) then return new; end if;
  raise exception 'profile_privilege_change_forbidden' using errcode='42501';
end;
$$;
drop trigger if exists hu30_profile_privileges on public.profiles;
create trigger hu30_profile_privileges before insert or update on public.profiles
  for each row execute function public.hu30_guard_profile_privileges();
revoke all on function public.hu30_guard_profile_privileges() from public,anon,authenticated;

-- raw_user_meta_data lo escribe el navegador en signUp y updateUser: nunca decide
-- el rol. Los roles de staff los otorgan create-executive y assign_*. El trigger
-- on_auth_user_created existe sólo en producción y se deja como está: en un entorno
-- nuevo el perfil lo crea ensureUserProfile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'usuario');
  return new;
end;
$$;

-- Sin sesión get_my_role() es NULL y `if not NULL` no lanza: la autorización tiene
-- que ser explícitamente verdadera. Cuerpos tomados de producción el 2026-11-01.
create or replace function public.can_admin_inmobiliaria(p_inmobiliaria_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.get_my_role() in ('admin', 'admin_inmobiliario')
      and (
        public.get_my_inmobiliaria() is null
        or public.get_my_inmobiliaria() = p_inmobiliaria_id
      ),
    false
  );
$$;

create or replace function public.assign_executive(p_project_id uuid, p_email text)
returns public.proyecto_ejecutivos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inmobiliaria uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_exec_id uuid;
  v_exec_inmobiliaria uuid;
  v_row public.proyecto_ejecutivos;
begin
  v_inmobiliaria := public.get_proyecto_inmobiliaria(p_project_id);
  if v_inmobiliaria is null then
    raise exception 'Proyecto no encontrado.';
  end if;

  if public.can_admin_inmobiliaria(v_inmobiliaria) is not true then
    raise exception 'No tienes permisos para administrar este proyecto.';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Correo del ejecutivo inválido.';
  end if;

  select p.id, p.inmobiliaria_id
    into v_exec_id, v_exec_inmobiliaria
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
    and p.role = 'ejecutivo'
  limit 1;

  -- Sin cuenta todavía: queda pendiente y se resuelve al registrarse.
  if v_exec_id is null then
    insert into public.proyecto_ejecutivos (proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
    values (p_project_id, null, v_email, 'manual', 'pendiente')
    on conflict (proyecto_id, ejecutivo_email) do update
      set source = 'manual'
    returning * into v_row;
    return v_row;
  end if;

  if v_exec_inmobiliaria is null then
    update public.profiles set inmobiliaria_id = v_inmobiliaria where id = v_exec_id;
  elsif v_exec_inmobiliaria <> v_inmobiliaria then
    raise exception 'Este ejecutivo ya pertenece a otra inmobiliaria.';
  end if;

  insert into public.proyecto_ejecutivos (proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
  values (p_project_id, v_exec_id, v_email, 'manual', 'vinculado')
  on conflict (proyecto_id, ejecutivo_email) do update
    set ejecutivo_id = excluded.ejecutivo_id,
        estado = 'vinculado',
        source = 'manual'
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.unassign_executive(p_project_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inmobiliaria uuid := public.get_proyecto_inmobiliaria(p_project_id);
begin
  if v_inmobiliaria is null then
    raise exception 'Proyecto no encontrado.';
  end if;

  if public.can_admin_inmobiliaria(v_inmobiliaria) is not true then
    raise exception 'No tienes permisos para administrar este proyecto.';
  end if;

  delete from public.proyecto_ejecutivos
  where proyecto_id = p_project_id
    and ejecutivo_email = lower(trim(coalesce(p_email, '')));

  return true;
end;
$$;

-- anon hereda EXECUTE de PUBLIC: revocarlo sólo a anon no cambia nada.
revoke all on function public.assign_executive(uuid, text) from public, anon;
revoke all on function public.unassign_executive(uuid, text) from public, anon;
grant execute on function public.assign_executive(uuid, text) to authenticated, service_role;
grant execute on function public.unassign_executive(uuid, text) to authenticated, service_role;

commit;
