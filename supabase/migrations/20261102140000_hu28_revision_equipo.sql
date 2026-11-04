-- HU 28, segunda revisión del PR: una señal fiable de contraseña definida, cobertura y último
-- administrador basados en ella, auditoría de cada entrada a un equipo y lectura mínima entre
-- compañeros. Requiere 20261102130000_hu28_revision.sql aplicada antes.
-- Rollback: supabase/rollback/20261102140000_hu28_revision_equipo_rollback.sql
begin;

alter table public.profiles
  add column if not exists password_pendiente boolean not null default false;

-- Quien nunca entró sigue invitado. Quien ya entró no vuelve atrás, aunque no se pueda saber si
-- definió su contraseña o sólo abrió el enlace.
update public.profiles p
set password_pendiente = true
from auth.users u
where u.id = p.id
  and u.last_sign_in_at is null
  and p.role in ('ejecutivo', 'admin', 'admin_inmobiliario');

alter table public.audit_events drop constraint if exists audit_events_event_type_check;
alter table public.audit_events add constraint audit_events_event_type_check check (event_type in (
  'equipo.invitacion_creada', 'equipo.invitacion_enviada', 'equipo.invitacion_reenviada', 'equipo.invitacion_fallida',
  'equipo.miembro_vinculado', 'equipo.rol_cambiado', 'equipo.datos_actualizados',
  'equipo.acceso_desactivado', 'equipo.acceso_reactivado',
  'equipo.proyecto_asignado', 'equipo.proyecto_retirado'
));

create or replace function public.hu28_mark_password_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles set password_pendiente = false where id = new.id and password_pendiente;
  end if;
  return null;
end;
$$;
revoke all on function public.hu28_mark_password_set() from public, anon, authenticated;

-- last_sign_in_at no sirve: GoTrue lo escribe al abrir el enlace de recuperación, aunque lo abra un
-- filtro de correo. encrypted_password sólo cambia cuando la persona guarda una contraseña.
drop trigger if exists hu28_password_definida on auth.users;
create trigger hu28_password_definida after update of encrypted_password on auth.users
  for each row execute function public.hu28_mark_password_set();

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
        or new.reliability_status is distinct from 'normal'
        or new.estado_acceso is distinct from 'activo' or new.password_pendiente then
      raise exception 'profile_privilege_change_forbidden' using errcode='42501';
    end if;
    return new;
  end if;
  -- El acceso sólo cambia por hu28_set_member_access, que deja auditoría.
  if new.estado_acceso is distinct from old.estado_acceso then
    raise exception 'profile_privilege_change_forbidden' using errcode='42501';
  end if;
  -- Sólo el trigger sobre auth.users lo limpia, cuando GoTrue guarda la contraseña.
  if new.password_pendiente is distinct from old.password_pendiente
      and current_setting('role', true) in ('authenticated', 'anon') then
    raise exception 'profile_privilege_change_forbidden' using errcode='42501';
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

create or replace function public.hu28_is_last_active_admin(p_inmobiliaria uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
      select 1 from public.profiles
      where id = p_member and inmobiliaria_id = p_inmobiliaria
        and role in ('admin', 'admin_inmobiliario') and estado_acceso = 'activo' and not password_pendiente
    )
    and not exists (
      select 1 from public.profiles
      where id <> p_member and inmobiliaria_id = p_inmobiliaria
        and role in ('admin', 'admin_inmobiliario') and estado_acceso = 'activo' and not password_pendiente
    );
$$;

create or replace function public.hu28_list_team(p_inmobiliaria uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with miembros as (
    select p.id, u.email::text as email, p.full_name, p.phone, p.role, p.estado_acceso, p.password_pendiente,
           u.last_sign_in_at, u.created_at, u.banned_until
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.inmobiliaria_id = p_inmobiliaria
      and p.role in ('ejecutivo', 'admin', 'admin_inmobiliario')
  )
  select jsonb_build_object(
    'miembros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'nombre', m.full_name,
        'email', m.email,
        'telefono', m.phone,
        'rol', m.role,
        'estado_acceso', m.estado_acceso,
        -- Abrir el enlace de recuperación ya escribe last_sign_in_at: no cuenta como ingreso.
        'ultimo_ingreso', case when m.password_pendiente then null else m.last_sign_in_at end,
        'password_pendiente', m.password_pendiente,
        'baneado', coalesce(m.banned_until > now(), false),
        'invitado_en', coalesce(invitacion.occurred_at, m.created_at),
        'correo_fallido', coalesce(invitacion.event_type in ('equipo.invitacion_fallida', 'equipo.invitacion_creada'), false),
        'proyectos', coalesce((
          select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'estado', pr.estado) order by pr.nombre)
          from public.proyecto_ejecutivos pe
          join public.proyectos pr on pr.id = pe.proyecto_id
          where pr.inmobiliaria_id = p_inmobiliaria
            and (pe.ejecutivo_id = m.id or pe.ejecutivo_email = lower(m.email))
        ), '[]'::jsonb)
      ) order by m.full_name nulls last, m.email)
      from miembros m
      left join lateral (
        select ev.event_type, ev.occurred_at
        from public.audit_events ev
        where ev.subject_user_id = m.id
          and ev.inmobiliaria_id = p_inmobiliaria
          and ev.event_type in ('equipo.invitacion_creada', 'equipo.invitacion_enviada', 'equipo.invitacion_reenviada', 'equipo.invitacion_fallida')
        order by ev.occurred_at desc, ev.id desc
        limit 1
      ) invitacion on true
    ), '[]'::jsonb),
    'proyectos', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre, 'estado', pr.estado) order by pr.nombre)
      from public.proyectos pr
      where pr.inmobiliaria_id = p_inmobiliaria
    ), '[]'::jsonb)
  );
$$;

create or replace function public.hu28_update_member(
  p_inmobiliaria uuid, p_member uuid, p_nombre text, p_telefono text, p_actor uuid, p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles;
  v_campos text[] := '{}';
begin
  v_member := public.hu28_lock_member(p_inmobiliaria, p_member);

  if p_nombre is distinct from v_member.full_name then v_campos := array_append(v_campos, 'nombre'); end if;
  if p_telefono is distinct from v_member.phone then v_campos := array_append(v_campos, 'telefono'); end if;
  if cardinality(v_campos) = 0 then
    return jsonb_build_object('cambio', false);
  end if;

  -- El nombre del equipo es uno solo: repartirlo en nombre y apellidos sería adivinar. Si cambia, se
  -- borra el desglose, y quien lo lee cae a full_name.
  update public.profiles
  set full_name = p_nombre,
      phone = p_telefono,
      nombre = case when 'nombre' = any(v_campos) then null else nombre end,
      apellido_paterno = case when 'nombre' = any(v_campos) then null else apellido_paterno end,
      apellido_materno = case when 'nombre' = any(v_campos) then null else apellido_materno end,
      updated_at = now()
  where id = p_member;
  perform public.hu28_log_event(
    p_inmobiliaria, p_actor, p_actor_role, p_member, 'equipo.datos_actualizados',
    jsonb_build_object('campos', to_jsonb(v_campos))
  );
  return jsonb_build_object('cambio', true);
end;
$$;

-- Vincula y registra en una transacción: create-executive no puede dejar un cambio sin su entrada.
create or replace function public.hu28_link_executive(
  p_inmobiliaria uuid, p_member uuid, p_actor uuid, p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.inmobiliarias where id = p_inmobiliaria for no key update;
  if not found then
    raise exception 'not_found';
  end if;

  update public.profiles
  set inmobiliaria_id = p_inmobiliaria, updated_at = now()
  where id = p_member and role = 'ejecutivo' and inmobiliaria_id is null;
  if not found then
    raise exception 'not_found';
  end if;

  perform public.hu28_log_event(p_inmobiliaria, p_actor, p_actor_role, p_member, 'equipo.miembro_vinculado');
  return jsonb_build_object('cambio', true);
end;
$$;
revoke all on function public.hu28_link_executive(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.hu28_link_executive(uuid, uuid, uuid, text) to service_role;

create or replace function public.hu28_audit_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.proyecto_ejecutivos;
  v_project public.proyectos;
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('hu28.actor_id', true), '')::uuid);
  v_subject uuid;
  v_details jsonb;
begin
  if tg_op = 'DELETE' then v_row := old; else v_row := new; end if;
  if tg_op = 'UPDATE' and not (old.estado = 'pendiente' and new.estado = 'vinculado') then
    return null;
  end if;

  -- En un borrado en cascada el proyecto ya no está: hu28_audit_project_delete lo registró.
  select * into v_project from public.proyectos where id = v_row.proyecto_id;
  if not found then
    return null;
  end if;

  v_subject := coalesce(
    v_row.ejecutivo_id,
    (
      select u.id
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(u.email) = lower(v_row.ejecutivo_email)
        and p.inmobiliaria_id = v_project.inmobiliaria_id
        and p.role in ('ejecutivo', 'admin', 'admin_inmobiliario')
      limit 1
    )
  );
  v_details := jsonb_build_object(
    'proyecto_id', v_project.id,
    'proyecto', v_project.nombre,
    'origen', coalesce(nullif(current_setting('hu28.origen', true), ''), 'proyectos')
  );
  if v_subject is null then
    v_details := v_details || jsonb_build_object('email', v_row.ejecutivo_email);
  end if;
  -- La asignación ya se registró al crearse pendiente: esta fila sólo la une a la persona.
  if tg_op = 'UPDATE' then
    v_details := v_details || jsonb_build_object('por_vinculacion', true);
  end if;
  if current_setting('hu28.por_desactivacion', true) = 'on' then
    v_details := v_details || jsonb_build_object('por_desactivacion', true);
  end if;

  insert into public.audit_events (
    inmobiliaria_id, actor_id, actor_role, subject_user_id, event_type, entity_type, entity_id, source, details
  )
  values (
    v_project.inmobiliaria_id,
    v_actor,
    coalesce((select role from public.profiles where id = v_actor), 'sistema'),
    v_subject,
    case tg_op when 'DELETE' then 'equipo.proyecto_retirado' else 'equipo.proyecto_asignado' end,
    'proyecto',
    v_project.id,
    case when auth.uid() is null then 'backend' else 'web' end,
    v_details
  );
  return null;
end;
$$;

drop trigger if exists hu28_proyecto_ejecutivos_audit on public.proyecto_ejecutivos;
create trigger hu28_proyecto_ejecutivos_audit after insert or delete or update of estado on public.proyecto_ejecutivos
  for each row execute function public.hu28_audit_assignment();

create or replace function public.assign_executive(
  p_project_id uuid, p_email text, p_origen text default 'proyectos'
)
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
  v_exec_estado text;
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

  -- El mismo bloqueo que hu28_set_member_access: una desactivación en curso no se cruza con esta
  -- asignación, que dejaría un proyecto en manos de alguien sin acceso.
  perform 1 from public.inmobiliarias where id = v_inmobiliaria for no key update;

  -- Un administrador del equipo también puede llevar proyectos. Nunca se vincula a un admin
  -- de fuera: la rama de abajo le escribiría su inmobiliaria.
  select p.id, p.inmobiliaria_id, p.estado_acceso
    into v_exec_id, v_exec_inmobiliaria, v_exec_estado
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
    and (
      p.role = 'ejecutivo'
      or (p.role in ('admin', 'admin_inmobiliario') and p.inmobiliaria_id = v_inmobiliaria)
    )
  limit 1;

  perform set_config('hu28.origen', case when p_origen = 'equipo' then 'equipo' else 'proyectos' end, true);

  -- Sin cuenta todavía: queda pendiente y se resuelve al registrarse.
  if v_exec_id is null then
    insert into public.proyecto_ejecutivos (proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
    values (p_project_id, null, v_email, 'manual', 'pendiente')
    on conflict (proyecto_id, ejecutivo_email) do update
      set source = 'manual'
    returning * into v_row;
    return v_row;
  end if;

  if v_exec_estado = 'desactivado' then
    raise exception 'Esta persona está desactivada. Reactívala para asignarle proyectos.';
  end if;

  if v_exec_inmobiliaria is null then
    update public.profiles set inmobiliaria_id = v_inmobiliaria where id = v_exec_id;
    perform public.hu28_log_event(
      v_inmobiliaria, auth.uid(), public.get_my_role(), v_exec_id, 'equipo.miembro_vinculado',
      jsonb_build_object('origen', case when p_origen = 'equipo' then 'equipo' else 'proyectos' end),
      null, null, 'web'
    );
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

create or replace function public.assign_admin(p_inmobiliaria_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target public.profiles;
  v_email_cuenta text;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' or public.get_my_inmobiliaria() is not null then
    raise exception 'Solo un administrador global puede asignar administradores de inmobiliaria.';
  end if;

  if not exists (select 1 from public.inmobiliarias where id = p_inmobiliaria_id) then
    raise exception 'Inmobiliaria no encontrada.';
  end if;

  select p.* into v_target
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
  limit 1;

  if v_target.id is null then
    raise exception 'No existe una cuenta registrada con ese correo.';
  end if;

  -- Una cuenta recién registrada también es 'usuario' y se puede promover; una con evaluaciones
  -- guarda finanzas personales y no pasa a ser staff por un correo mal escrito.
  if v_target.id = auth.uid() then
    raise exception 'No puedes cambiar tu propia función.';
  end if;

  if v_target.role = 'admin' and v_target.inmobiliaria_id is null then
    raise exception 'Esta cuenta es de un administrador global.';
  end if;

  if v_target.role in ('admin', 'admin_inmobiliario') and v_target.inmobiliaria_id = p_inmobiliaria_id then
    return v_target.id;
  end if;

  if v_target.role = 'usuario' and exists (select 1 from public.evaluations where user_id = v_target.id) then
    raise exception 'Este correo pertenece a una cuenta de comprador en RutaHogar.';
  end if;

  if v_target.estado_acceso = 'desactivado' then
    raise exception 'Esta cuenta está desactivada. Reactívala antes de asignarla.';
  end if;

  perform 1 from public.inmobiliarias
  where id in (p_inmobiliaria_id, v_target.inmobiliaria_id)
  order by id
  for no key update;

  if v_target.inmobiliaria_id is distinct from p_inmobiliaria_id
      and public.hu28_is_last_active_admin(v_target.inmobiliaria_id, v_target.id) then
    raise exception 'Es el único administrador activo de su inmobiliaria.';
  end if;

  -- Se retira antes de mover: los proyectos son de la inmobiliaria que deja, y el trigger de
  -- asignaciones aún la reconoce como parte de ese equipo.
  if v_target.inmobiliaria_id is not null and v_target.inmobiliaria_id <> p_inmobiliaria_id then
    delete from public.proyecto_ejecutivos pe
    using public.proyectos pr
    where pr.id = pe.proyecto_id
      and pr.inmobiliaria_id = v_target.inmobiliaria_id
      and (pe.ejecutivo_id = v_target.id or pe.ejecutivo_email = v_email);

    select u.email::text into v_email_cuenta from auth.users u where u.id = v_target.id;
    perform public.hu28_log_event(
      v_target.inmobiliaria_id, auth.uid(), 'admin', v_target.id, 'equipo.rol_cambiado',
      jsonb_build_object('traslado', true, 'email', v_email_cuenta),
      jsonb_build_object('rol', v_target.role, 'inmobiliaria_id', v_target.inmobiliaria_id),
      jsonb_build_object('rol', 'admin_inmobiliario', 'inmobiliaria_id', p_inmobiliaria_id),
      'web'
    );
  end if;

  update public.profiles
  set role = 'admin_inmobiliario',
      inmobiliaria_id = p_inmobiliaria_id
  where id = v_target.id;

  perform public.hu28_log_event(
    p_inmobiliaria_id, auth.uid(), 'admin', v_target.id, 'equipo.rol_cambiado', '{}'::jsonb,
    jsonb_build_object('rol', v_target.role, 'inmobiliaria_id', v_target.inmobiliaria_id),
    jsonb_build_object('rol', 'admin_inmobiliario', 'inmobiliaria_id', p_inmobiliaria_id),
    'web'
  );

  return v_target.id;
end;
$$;

create or replace function public.resolve_pending_executives()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope uuid := public.get_my_inmobiliaria();
  v_count integer := 0;
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'ejecutivo') then
    return 0;
  end if;

  with vinculados as (
    update public.profiles p
    set inmobiliaria_id = c.inmobiliaria_id
    from (
    select distinct on (prof.id) prof.id as exec_id, pr.inmobiliaria_id
    from public.proyecto_ejecutivos pe
    join public.proyectos pr on pr.id = pe.proyecto_id
    join auth.users u on lower(u.email) = pe.ejecutivo_email
    join public.profiles prof on prof.id = u.id
    where pe.estado = 'pendiente'
      and prof.role = 'ejecutivo'
      and prof.inmobiliaria_id is null
      and (v_scope is null or pr.inmobiliaria_id = v_scope)
    order by prof.id, pe.created_at
    ) c
    where p.id = c.exec_id
    returning p.id, p.inmobiliaria_id
  )
  insert into public.audit_events (
    inmobiliaria_id, actor_id, actor_role, subject_user_id, event_type, entity_type, entity_id, source, details
  )
  select
    v.inmobiliaria_id, auth.uid(), coalesce(public.get_my_role(), 'sistema'), v.id,
    'equipo.miembro_vinculado', 'profile', v.id, 'web', jsonb_build_object('origen', 'pendiente')
  from vinculados v;

  update public.proyecto_ejecutivos pe
  set ejecutivo_id = m.exec_id,
      estado = 'vinculado'
  from (
    select pe2.proyecto_id, pe2.ejecutivo_email, prof.id as exec_id
    from public.proyecto_ejecutivos pe2
    join public.proyectos pr on pr.id = pe2.proyecto_id
    join auth.users u on lower(u.email) = pe2.ejecutivo_email
    join public.profiles prof on prof.id = u.id
    where pe2.estado = 'pendiente'
      and prof.role = 'ejecutivo'
      and prof.inmobiliaria_id = pr.inmobiliaria_id
      and (v_scope is null or pr.inmobiliaria_id = v_scope)
  ) m
  where pe.proyecto_id = m.proyecto_id
    and pe.ejecutivo_email = m.ejecutivo_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- El equipo se ve el nombre, nada más: rut, nacimiento, onboarding y consentimiento son de cada uno.
drop policy if exists "Profiles select" on public.profiles;

create or replace function public.list_staff_names(p_ids uuid[])
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id = any(coalesce(p_ids, '{}'::uuid[]))
    and p.role in ('ejecutivo', 'admin', 'admin_inmobiliario')
    and (
      public.is_global_admin()
      or (
        coalesce(public.get_my_role(), '') in ('ejecutivo', 'admin', 'admin_inmobiliario')
        and p.inmobiliaria_id = public.get_my_inmobiliaria()
      )
    );
$$;
revoke all on function public.list_staff_names(uuid[]) from public, anon;
grant execute on function public.list_staff_names(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
