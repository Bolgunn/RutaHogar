-- HU 28, revisión previa al PR: el registro sólo enlaza una asignación pendiente con personal de la
-- misma inmobiliaria, hu28_list_team informa el baneo para detectar un acceso a medio aplicar,
-- assign_executive toma el bloqueo del equipo y assign_admin rechaza cuentas de comprador.
-- Rollback: supabase/rollback/20261102130000_hu28_revision_rollback.sql
begin;

create or replace function public.hu28_list_team(p_inmobiliaria uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with miembros as (
    select p.id, u.email::text as email, p.full_name, p.phone, p.role, p.estado_acceso,
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
        'ultimo_ingreso', m.last_sign_in_at,
        'baneado', coalesce(m.banned_until > now(), false),
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
    coalesce(pe.ejecutivo_id, (
      select u.id
      from auth.users u
      join public.profiles p on p.id = u.id
      where lower(u.email) = lower(pe.ejecutivo_email)
        and p.inmobiliaria_id = old.inmobiliaria_id
        and p.role in ('ejecutivo', 'admin', 'admin_inmobiliario')
      limit 1
    )),
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
