-- HU 28: gestión de equipo de la inmobiliaria. Agrega el estado de acceso, el registro de
-- auditoría, acota la lectura de profiles y deja cada cambio de equipo en una RPC de servicio.
-- Requiere 20261031120000_profiles_privilege_guard_fix.sql aplicada antes.
-- Rollback: supabase/rollback/20261102120000_hu28_gestion_equipo_rollback.sql
begin;

alter table public.profiles
  add column if not exists estado_acceso text not null default 'activo';
alter table public.profiles drop constraint if exists profiles_estado_acceso_check;
alter table public.profiles
  add constraint profiles_estado_acceso_check check (estado_acceso in ('activo', 'desactivado'));

-- actor_id e inmobiliaria_id sin FK: una entrada debe sobrevivir a lo que describe.
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  inmobiliaria_id uuid,
  actor_id uuid,
  actor_role text not null,
  subject_user_id uuid,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  source text not null default 'backend',
  details jsonb not null default '{}'::jsonb,
  constraint audit_events_event_type_check check (event_type in (
    'equipo.invitacion_enviada', 'equipo.invitacion_reenviada', 'equipo.invitacion_fallida',
    'equipo.miembro_vinculado', 'equipo.rol_cambiado', 'equipo.datos_actualizados',
    'equipo.acceso_desactivado', 'equipo.acceso_reactivado',
    'equipo.proyecto_asignado', 'equipo.proyecto_retirado'
  )),
  constraint audit_events_source_check check (source in ('web', 'backend', 'job'))
);

create index if not exists audit_events_inmobiliaria_occurred_idx
  on public.audit_events (inmobiliaria_id, occurred_at desc);
create index if not exists audit_events_subject_idx
  on public.audit_events (subject_user_id, occurred_at desc);

-- Deny-all para el navegador: sin policies, y el servicio sólo lee e inserta.
alter table public.audit_events enable row level security;
revoke all on table public.audit_events from public, anon, authenticated, service_role;
grant select, insert on table public.audit_events to service_role;

create or replace function public.hu28_audit_events_insert_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'audit_events_insert_only' using errcode = '42501';
end;
$$;
drop trigger if exists audit_events_no_change on public.audit_events;
create trigger audit_events_no_change before update or delete on public.audit_events
  for each row execute function public.hu28_audit_events_insert_only();
drop trigger if exists audit_events_no_truncate on public.audit_events;
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function public.hu28_audit_events_insert_only();
revoke all on function public.hu28_audit_events_insert_only() from public, anon, authenticated;

-- Una cuenta desactivada pierde el rol: policies y RPC fallan cerradas desde su siguiente request.
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and estado_acceso = 'activo';
$$;

-- Con get_my_role() NULL, `not is_global_admin()` también sería NULL y no lanzaría:
-- update_support_ticket_status y submit_ticket_user_feedback dependen de este resultado.
create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null, false);
$$;

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
        or new.estado_acceso is distinct from 'activo' then
      raise exception 'profile_privilege_change_forbidden' using errcode='42501';
    end if;
    return new;
  end if;
  -- El acceso sólo cambia por hu28_set_member_access, que deja auditoría.
  if new.estado_acceso is distinct from old.estado_acceso then
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

-- Cada persona lee su fila, el personal al personal de su inmobiliaria y el admin global todo.
-- El personal deja de leer perfiles de leads por tabla: los recibe por el backend o por
-- list_lead_contacts, que comprueban el tenant.
drop policy if exists "Profiles select" on public.profiles;
create policy "Profiles select"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and role in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and inmobiliaria_id = public.get_my_inmobiliaria()
    )
  );

drop policy if exists "Profiles select admin" on public.profiles;
create policy "Profiles select admin"
  on public.profiles
  for select
  using (public.is_global_admin());

-- Ninguna escritura de navegador la usa: el rol, el tenant y el estado sólo cambian por RPC.
drop policy if exists "Profiles update admin" on public.profiles;

create or replace function public.hu28_log_event(
  p_inmobiliaria uuid,
  p_actor uuid,
  p_actor_role text,
  p_subject uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb,
  p_before jsonb default null,
  p_after jsonb default null,
  p_source text default 'backend'
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.audit_events (
    inmobiliaria_id, actor_id, actor_role, subject_user_id, event_type,
    entity_type, entity_id, before, after, source, details
  )
  values (
    p_inmobiliaria, p_actor, coalesce(p_actor_role, 'sistema'), p_subject, p_event_type,
    'profile', p_subject, p_before, p_after, p_source, coalesce(p_details, '{}'::jsonb)
  )
  returning id;
$$;

-- Serializa los cambios de equipo por inmobiliaria: dos cambios simultáneos no pueden contar al
-- mismo último administrador. Un miembro de otra inmobiliaria es, para quien llama, not_found.
create or replace function public.hu28_lock_member(p_inmobiliaria uuid, p_member uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles;
begin
  perform 1 from public.inmobiliarias where id = p_inmobiliaria for no key update;
  if not found then
    raise exception 'not_found';
  end if;

  select * into v_member
  from public.profiles
  where id = p_member
    and inmobiliaria_id = p_inmobiliaria
    and role in ('ejecutivo', 'admin', 'admin_inmobiliario')
  for update;
  if not found then
    raise exception 'not_found';
  end if;

  return v_member;
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
        and role in ('admin', 'admin_inmobiliario') and estado_acceso = 'activo'
    )
    and not exists (
      select 1 from public.profiles
      where id <> p_member and inmobiliaria_id = p_inmobiliaria
        and role in ('admin', 'admin_inmobiliario') and estado_acceso = 'activo'
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
    select p.id, u.email::text as email, p.full_name, p.phone, p.role, p.estado_acceso,
           u.last_sign_in_at, u.created_at
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
        'ultimo_ingreso', m.last_sign_in_at,
        'invitado_en', coalesce(invitacion.occurred_at, m.created_at),
        'correo_fallido', coalesce(invitacion.event_type = 'equipo.invitacion_fallida', false),
        'proyectos', coalesce((
          select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre) order by pr.nombre)
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
          and ev.event_type in ('equipo.invitacion_enviada', 'equipo.invitacion_reenviada', 'equipo.invitacion_fallida')
        order by ev.occurred_at desc, ev.id desc
        limit 1
      ) invitacion on true
    ), '[]'::jsonb),
    'proyectos', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre) order by pr.nombre)
      from public.proyectos pr
      where pr.inmobiliaria_id = p_inmobiliaria
    ), '[]'::jsonb)
  );
$$;

create or replace function public.hu28_set_member_role(
  p_inmobiliaria uuid, p_member uuid, p_rol text, p_actor uuid, p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles;
begin
  if p_rol is null or p_rol not in ('ejecutivo', 'admin_inmobiliario') then
    raise exception 'invalid_role';
  end if;

  v_member := public.hu28_lock_member(p_inmobiliaria, p_member);

  if p_member = p_actor then
    raise exception 'self_change_forbidden';
  end if;
  if v_member.estado_acceso = 'desactivado' then
    raise exception 'member_deactivated';
  end if;
  -- Un admin con inmobiliaria ya es administrador de ella: nunca se reescribe a otro rol de admin.
  if v_member.role = p_rol or (v_member.role = 'admin' and p_rol = 'admin_inmobiliario') then
    return jsonb_build_object('cambio', false);
  end if;
  if public.hu28_is_last_active_admin(p_inmobiliaria, p_member) then
    raise exception 'last_active_admin';
  end if;

  update public.profiles set role = p_rol, updated_at = now() where id = p_member;
  perform public.hu28_log_event(
    p_inmobiliaria, p_actor, p_actor_role, p_member, 'equipo.rol_cambiado', '{}'::jsonb,
    jsonb_build_object('rol', v_member.role), jsonb_build_object('rol', p_rol)
  );
  return jsonb_build_object('cambio', true);
end;
$$;

-- Idempotente: el backend reintenta aquí cuando falla el baneo en Auth.
create or replace function public.hu28_set_member_access(
  p_inmobiliaria uuid, p_member uuid, p_estado text, p_actor uuid, p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.profiles;
  v_email text;
  v_proyectos jsonb := '[]'::jsonb;
begin
  if p_estado is null or p_estado not in ('activo', 'desactivado') then
    raise exception 'invalid_estado';
  end if;

  v_member := public.hu28_lock_member(p_inmobiliaria, p_member);

  if p_member = p_actor then
    raise exception 'self_change_forbidden';
  end if;
  if v_member.estado_acceso = p_estado then
    return jsonb_build_object('cambio', false);
  end if;

  if p_estado = 'desactivado' then
    if public.hu28_is_last_active_admin(p_inmobiliaria, p_member) then
      raise exception 'last_active_admin';
    end if;

    select lower(email) into v_email from auth.users where id = p_member;

    select coalesce(jsonb_agg(jsonb_build_object('id', pr.id, 'nombre', pr.nombre) order by pr.nombre), '[]'::jsonb)
      into v_proyectos
    from public.proyecto_ejecutivos pe
    join public.proyectos pr on pr.id = pe.proyecto_id
    where pr.inmobiliaria_id = p_inmobiliaria
      and (pe.ejecutivo_id = p_member or pe.ejecutivo_email = v_email);

    -- El trigger de asignaciones no ve auth.uid() aquí: el actor viaja por sesión.
    perform set_config('hu28.actor_id', p_actor::text, true),
            set_config('hu28.origen', 'equipo', true),
            set_config('hu28.por_desactivacion', 'on', true);
    delete from public.proyecto_ejecutivos pe
    using public.proyectos pr
    where pr.id = pe.proyecto_id
      and pr.inmobiliaria_id = p_inmobiliaria
      and (pe.ejecutivo_id = p_member or pe.ejecutivo_email = v_email);
  end if;

  update public.profiles set estado_acceso = p_estado, updated_at = now() where id = p_member;

  perform public.hu28_log_event(
    p_inmobiliaria, p_actor, p_actor_role, p_member,
    case p_estado when 'desactivado' then 'equipo.acceso_desactivado' else 'equipo.acceso_reactivado' end,
    jsonb_build_object('proyectos', v_proyectos),
    jsonb_build_object('estado_acceso', v_member.estado_acceso),
    jsonb_build_object('estado_acceso', p_estado)
  );
  return jsonb_build_object('cambio', true, 'proyectos', v_proyectos);
end;
$$;

-- Los valores no van al registro: basta saber qué campos cambiaron y quién los cambió.
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

  update public.profiles set full_name = p_nombre, phone = p_telefono, updated_at = now() where id = p_member;
  perform public.hu28_log_event(
    p_inmobiliaria, p_actor, p_actor_role, p_member, 'equipo.datos_actualizados',
    jsonb_build_object('campos', to_jsonb(v_campos))
  );
  return jsonb_build_object('cambio', true);
end;
$$;

revoke all on function public.hu28_log_event(uuid, uuid, text, uuid, text, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.hu28_lock_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hu28_is_last_active_admin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hu28_list_team(uuid) from public, anon, authenticated;
revoke all on function public.hu28_set_member_role(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.hu28_set_member_access(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.hu28_update_member(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.hu28_log_event(uuid, uuid, text, uuid, text, jsonb, jsonb, jsonb, text) to service_role;
grant execute on function public.hu28_list_team(uuid) to service_role;
grant execute on function public.hu28_set_member_role(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.hu28_set_member_access(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.hu28_update_member(uuid, uuid, text, text, uuid, text) to service_role;

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

  -- En un borrado en cascada el proyecto ya no está: hu28_audit_project_delete lo registró.
  select * into v_project from public.proyectos where id = v_row.proyecto_id;
  if not found then
    return null;
  end if;

  v_subject := coalesce(
    v_row.ejecutivo_id,
    (select id from auth.users where lower(email) = lower(v_row.ejecutivo_email) limit 1)
  );
  v_details := jsonb_build_object(
    'proyecto_id', v_project.id,
    'proyecto', v_project.nombre,
    'origen', coalesce(nullif(current_setting('hu28.origen', true), ''), 'proyectos')
  );
  if v_subject is null then
    v_details := v_details || jsonb_build_object('email', v_row.ejecutivo_email);
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

create or replace function public.hu28_audit_project_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('hu28.actor_id', true), '')::uuid);
begin
  insert into public.audit_events (
    inmobiliaria_id, actor_id, actor_role, subject_user_id, event_type, entity_type, entity_id, source, details
  )
  select
    old.inmobiliaria_id,
    v_actor,
    coalesce((select role from public.profiles where id = v_actor), 'sistema'),
    coalesce(pe.ejecutivo_id, (select id from auth.users where lower(email) = lower(pe.ejecutivo_email) limit 1)),
    'equipo.proyecto_retirado',
    'proyecto',
    old.id,
    case when auth.uid() is null then 'backend' else 'web' end,
    jsonb_build_object('proyecto_id', old.id, 'proyecto', old.nombre, 'origen', 'proyectos', 'por_eliminacion', true)
      || case when pe.ejecutivo_id is null then jsonb_build_object('email', pe.ejecutivo_email) else '{}'::jsonb end
  from public.proyecto_ejecutivos pe
  where pe.proyecto_id = old.id;
  return old;
end;
$$;

revoke all on function public.hu28_audit_assignment() from public, anon, authenticated;
revoke all on function public.hu28_audit_project_delete() from public, anon, authenticated;

drop trigger if exists hu28_proyecto_ejecutivos_audit on public.proyecto_ejecutivos;
create trigger hu28_proyecto_ejecutivos_audit after insert or delete on public.proyecto_ejecutivos
  for each row execute function public.hu28_audit_assignment();
drop trigger if exists hu28_proyectos_delete_audit on public.proyectos;
create trigger hu28_proyectos_delete_audit before delete on public.proyectos
  for each row execute function public.hu28_audit_project_delete();

create or replace function public.list_inmobiliaria_executives(p_inmobiliaria_id uuid default null)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  inmobiliaria_id uuid,
  inmobiliaria_nombre text,
  proyectos_asignados bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    u.email::text,
    p.full_name,
    p.phone,
    p.inmobiliaria_id,
    i.nombre,
    (select count(*) from public.proyecto_ejecutivos pe where pe.ejecutivo_id = p.id),
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.inmobiliarias i on i.id = p.inmobiliaria_id
  where p.role = 'ejecutivo'
    and p.estado_acceso = 'activo'
    -- Solo un admin lee el roster; el scoped admin queda acotado a su tenant.
    and coalesce(public.get_my_role(), '') in ('admin', 'admin_inmobiliario')
    and (
      public.get_my_inmobiliaria() is null
      or p.inmobiliaria_id = public.get_my_inmobiliaria()
    )
    and (p_inmobiliaria_id is null or p.inmobiliaria_id = p_inmobiliaria_id)
  order by p.full_name nulls last, u.email;
$$;

-- p_origen sólo distingue en el historial si la asignación se hizo desde Equipo o desde Proyectos.
drop function if exists public.assign_executive(uuid, text);
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

drop function if exists public.unassign_executive(uuid, text);
create or replace function public.unassign_executive(
  p_project_id uuid, p_email text, p_origen text default 'proyectos'
)
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

  perform set_config('hu28.origen', case when p_origen = 'equipo' then 'equipo' else 'proyectos' end, true);

  delete from public.proyecto_ejecutivos
  where proyecto_id = p_project_id
    and ejecutivo_email = lower(trim(coalesce(p_email, '')));

  return true;
end;
$$;

revoke all on function public.assign_executive(uuid, text, text) from public, anon;
revoke all on function public.unassign_executive(uuid, text, text) from public, anon;
grant execute on function public.assign_executive(uuid, text, text) to authenticated, service_role;
grant execute on function public.unassign_executive(uuid, text, text) to authenticated, service_role;

-- La otra vía que cambia un rol: el catálogo del admin global. También queda en el registro y
-- respeta los mismos límites que la página de equipo.
create or replace function public.assign_admin(p_inmobiliaria_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target public.profiles;
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

notify pgrst, 'reload schema';

commit;
