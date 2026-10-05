-- =============================================================
-- RutaHogar — Etapa comercial por proyecto ("project tracks")
-- =============================================================
-- Diseño: docs/stories/commercial-stage-project-tracks/PLAN.md. Enmienda la
-- base (20260930120000_commercial_stage.sql, que no se edita) y es requisito
-- de HU 15 (ALG-17 "Requirements on other work").
--
-- · Un lead tiene varios registros por inmobiliaria: uno general
--   (lead_commercial_stage, sin cambios) y uno por proyecto
--   (lead_project_commercial_stage, nueva). Cada registro sigue por su cuenta
--   la tabla de transiciones de la base.
-- · El historial sigue siendo uno: commercial_stage_events gana proyecto_id,
--   null = movimiento general.
-- · Negociación, reserva y venta siempre nombran un proyecto. "Perdido"
--   general solo mientras el lead no tiene registros de proyecto; después se
--   pierde proyecto por proyecto, y el general puede "revivir" con motivo.
-- · Las únicas transiciones automáticas son dos trabajos sobre proyectos:
--   agotar cierra los registros abiertos del proyecto, reponer los reabre.
--
-- Se aplica después del merge con `supabase db push` (nunca en el editor SQL).
begin;

-- 0. Guardia. Antes de esta migración todo evento es general. Si alguno ya
-- dejó un lead en negociación, reserva o venta sin proyecto, no hay a qué
-- proyecto atribuirlo: se aborta y lo decide una persona, en vez de
-- heredarlo en silencio. En una re-ejecución la columna ya existe y solo
-- cuentan los eventos generales.
do $$
declare
  late_exists boolean;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commercial_stage_events' and column_name = 'proyecto_id'
  ) then
    execute $q$
      select exists (
        select 1 from public.commercial_stage_events
        where proyecto_id is null
          and stage_after in ('en_negociacion', 'reserva', 'venta_cerrada')
      )
    $q$ into late_exists;
  else
    select exists (
      select 1 from public.commercial_stage_events
      where stage_after in ('en_negociacion', 'reserva', 'venta_cerrada')
    ) into late_exists;
  end if;

  if late_exists or exists (
    select 1 from public.lead_commercial_stage
    where stage in ('en_negociacion', 'reserva', 'venta_cerrada')
  ) then
    raise exception 'lead_level_late_stage_exists';
  end if;
end;
$$;

-- 1. Historial. Sin FK a proyectos a propósito: el trigger de inmutabilidad
-- impide que un ON DELETE actúe sobre el historial, y un RESTRICT aquí
-- bloquearía borrar proyectos que solo tienen historial. Quien protege el
-- borrado es la FK de lead_project_commercial_stage.
alter table public.commercial_stage_events
  add column if not exists proyecto_id uuid;

-- Un evento sin cambio de etapa solo puede ser la "revivida" general: hecha
-- por una persona, sin proyecto y con motivo.
alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_change_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_change_check
    check (
      stage_before is distinct from stage_after
      or (proyecto_id is null and actor_role <> 'sistema' and length(trim(coalesce(reason, ''))) > 0)
    );

alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_lead_level_stage_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_lead_level_stage_check
    check (proyecto_id is not null or stage_after not in ('en_negociacion', 'reserva', 'venta_cerrada'));

-- Los trabajos solo actúan sobre registros de proyecto.
alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_job_project_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_job_project_check
    check (source <> 'job' or proyecto_id is not null);

create index if not exists commercial_stage_events_record_idx
  on public.commercial_stage_events (subject_user_id, inmobiliaria_id, proyecto_id, occurred_at, id);
create index if not exists commercial_stage_events_proyecto_idx
  on public.commercial_stage_events (proyecto_id, occurred_at)
  where proyecto_id is not null;

-- 2. Etapa vigente de cada registro de proyecto. Igual que en la base, sin FK
-- en subject_user_id para que la supresión del §5.8 pueda reemplazar el id.
-- ON DELETE RESTRICT hacia proyectos: una reserva o una venta no deben
-- desaparecer de HU 15 porque alguien borró el proyecto; se marca agotado.
create table if not exists public.lead_project_commercial_stage (
  subject_user_id uuid not null,
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete restrict,
  proyecto_id uuid not null references public.proyectos(id) on delete restrict,
  stage text not null,
  last_event_id uuid not null references public.commercial_stage_events(id),
  updated_at timestamptz not null,
  primary key (subject_user_id, inmobiliaria_id, proyecto_id),
  constraint lead_project_commercial_stage_stage_check
    check (stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido'))
);

create index if not exists lead_project_commercial_stage_proyecto_idx
  on public.lead_project_commercial_stage (proyecto_id, stage);
create index if not exists lead_project_commercial_stage_tenant_idx
  on public.lead_project_commercial_stage (inmobiliaria_id, stage);

alter table public.lead_project_commercial_stage enable row level security;

revoke all on public.lead_project_commercial_stage from anon, authenticated;
grant select on public.lead_project_commercial_stage to authenticated;
grant select, insert, update on public.lead_project_commercial_stage to service_role;

drop policy if exists "Lead project commercial stage select tenant" on public.lead_project_commercial_stage;
create policy "Lead project commercial stage select tenant"
  on public.lead_project_commercial_stage
  for select
  to authenticated
  using (
    (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and public.get_my_inmobiliaria() = inmobiliaria_id
    )
    or (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  );

-- 3. Ayudantes. Ninguno se concede a los roles del navegador.

-- Única definición de "el lead pertenece a este proyecto": lo marcó como
-- favorito o declaró su comuna. HU 15 la reutiliza.
create or replace function public.lead_belongs_to_proyecto(p_lead uuid, p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.proyectos pr on pr.id = p_proyecto
    where p.id = p_lead
      and p.role = 'usuario'
      and (
        exists (
          select 1
          from public.proyecto_favoritos f
          where f.usuario_id = p.id
            and f.proyecto_id = pr.id
        )
        or lower(trim(pr.comuna)) in (
          select lower(trim(declared.comuna))
          from (
            select e.target_commune as comuna from public.evaluations e where e.user_id = p.id
            union all
            select e.alternative_commune from public.evaluations e where e.user_id = p.id
            union all
            select e.financial_data -> 'input' ->> 'comuna_objetivo' from public.evaluations e where e.user_id = p.id
            union all
            select p.onboarding_data ->> 'comuna_interes'
            union all
            select p.onboarding_data ->> 'comuna_alternativa'
          ) declared
          where nullif(trim(declared.comuna), '') is not null
        )
      )
  );
$$;

-- Misma regla que la base, ahora expresada sobre la de proyecto para que
-- exista una sola vez: favorito en un proyecto de la inmobiliaria o comuna de
-- uno de ellos equivale a "existe un proyecto de la inmobiliaria al que el
-- lead pertenece".
create or replace function public.lead_belongs_to_inmobiliaria(p_lead uuid, p_inmobiliaria uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_inmobiliaria is not null
    and exists (
      select 1
      from public.proyectos pr
      where pr.inmobiliaria_id = p_inmobiliaria
        and public.lead_belongs_to_proyecto(p_lead, pr.id)
    );
$$;

-- is_ejecutivo_asignado no mira el estado y las policies de proyectos dependen
-- de eso; para escribir etapas el ejecutivo debe estar vinculado.
create or replace function public.is_ejecutivo_vinculado(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proyecto_ejecutivos pe
    where pe.proyecto_id = p_proyecto
      and pe.estado = 'vinculado'
      and (
        pe.ejecutivo_id = auth.uid()
        or pe.ejecutivo_email = public.get_my_email()
      )
  );
$$;

-- Única regla de alcance de escritura sobre un registro de proyecto. Devuelve
-- null si se permite, o el código de error. El RPC y commercial_stage_scope
-- la usan las dos, así la interfaz y la base no pueden discrepar.
-- Un registro ya creado sigue siendo escribible aunque el lead deje de
-- pertenecer al proyecto (quitó el favorito, cambió de comuna): crearlo
-- exigió pertenencia real, y así se puede cerrar una reserva igual.
create or replace function public.commercial_stage_project_access(
  p_lead uuid,
  p_proyecto uuid,
  p_role text,
  p_tenant uuid
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.proyectos pr
      where pr.id = p_proyecto and pr.inmobiliaria_id = p_tenant
    ) then 'proyecto_not_in_scope'
    when p_role = 'ejecutivo' and not public.is_ejecutivo_vinculado(p_proyecto) then 'proyecto_not_in_scope'
    when not exists (
      select 1 from public.lead_project_commercial_stage s
      where s.subject_user_id = p_lead
        and s.inmobiliaria_id = p_tenant
        and s.proyecto_id = p_proyecto
    ) and not public.lead_belongs_to_proyecto(p_lead, p_proyecto) then 'lead_not_in_scope'
  end;
$$;

-- 4. RPC de escritura. Se elimina la firma de 4 argumentos para que PostgREST
-- no vea dos sobrecargas ambiguas; las llamadas con argumentos nombrados de
-- antes siguen resolviendo y actúan sobre el registro general.
drop function if exists public.change_commercial_stage(uuid, text, text, text);

create or replace function public.change_commercial_stage(
  p_lead uuid,
  p_to_stage text,
  p_reason text default null,
  p_expected_stage text default null,
  p_proyecto uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := public.get_my_role();
  caller_tenant uuid := public.get_my_inmobiliaria();
  access_error text;
  current_stage text;
  has_projects boolean;
  all_lost boolean;
  is_revival boolean := false;
  saved public.commercial_stage_events;
begin
  if caller_id is null
     or coalesce(caller_role, '') not in ('ejecutivo', 'admin', 'admin_inmobiliario')
     or caller_tenant is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_proyecto is null then
    if not public.lead_belongs_to_inmobiliaria(p_lead, caller_tenant) then
      raise exception 'lead_not_in_scope' using errcode = '42501';
    end if;
  else
    access_error := public.commercial_stage_project_access(p_lead, p_proyecto, caller_role, caller_tenant);
    if access_error is not null then
      raise exception '%', access_error using errcode = '42501';
    end if;
  end if;

  -- Un candado por (lead, inmobiliaria), no por registro: las reglas que
  -- cruzan registros ("tiene registros de proyecto", "todos perdidos") y los
  -- trabajos de agotar/reponer quedan serializados con cada escritura.
  perform pg_advisory_xact_lock(hashtextextended(p_lead::text || ':' || caller_tenant::text, 0));

  if p_proyecto is null then
    select stage into current_stage
    from public.lead_commercial_stage
    where subject_user_id = p_lead and inmobiliaria_id = caller_tenant
    for update;
  else
    select stage into current_stage
    from public.lead_project_commercial_stage
    where subject_user_id = p_lead and inmobiliaria_id = caller_tenant and proyecto_id = p_proyecto
    for update;
  end if;
  current_stage := coalesce(current_stage, 'nuevo');

  if p_expected_stage is not null and p_expected_stage <> current_stage then
    raise exception 'stale_stage';
  end if;

  if p_proyecto is null then
    select count(*) > 0, count(*) > 0 and bool_and(stage = 'perdido')
      into has_projects, all_lost
    from public.lead_project_commercial_stage
    where subject_user_id = p_lead and inmobiliaria_id = caller_tenant;

    if p_to_stage in ('en_negociacion', 'reserva', 'venta_cerrada') then
      raise exception 'project_required';
    end if;
    if p_to_stage = 'perdido' and has_projects then
      raise exception 'project_required';
    end if;
    -- Revivir: todos sus proyectos se perdieron, pero el lead sigue vivo.
    if p_to_stage = current_stage and current_stage <> 'perdido' and all_lost then
      if length(trim(coalesce(p_reason, ''))) = 0 then
        raise exception 'reason_required';
      end if;
      is_revival := true;
    end if;
  end if;

  if not is_revival then
    perform public.commercial_stage_transition_check(current_stage, p_to_stage, caller_role, p_reason);
  end if;

  insert into public.commercial_stage_events (
    subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
    stage_before, stage_after, reason, source
  ) values (
    p_lead, caller_tenant, p_proyecto, caller_id, caller_role,
    current_stage, p_to_stage, nullif(trim(p_reason), ''), 'web'
  )
  returning * into saved;

  if p_proyecto is null then
    insert into public.lead_commercial_stage (subject_user_id, inmobiliaria_id, stage, last_event_id, updated_at)
    values (p_lead, caller_tenant, p_to_stage, saved.id, saved.occurred_at)
    on conflict (subject_user_id, inmobiliaria_id) do update
      set stage = excluded.stage,
          last_event_id = excluded.last_event_id,
          updated_at = excluded.updated_at;
  else
    insert into public.lead_project_commercial_stage (subject_user_id, inmobiliaria_id, proyecto_id, stage, last_event_id, updated_at)
    values (p_lead, caller_tenant, p_proyecto, p_to_stage, saved.id, saved.occurred_at)
    on conflict (subject_user_id, inmobiliaria_id, proyecto_id) do update
      set stage = excluded.stage,
          last_event_id = excluded.last_event_id,
          updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'stage', saved.stage_after,
    'event_id', saved.id,
    'occurred_at', saved.occurred_at,
    'proyecto_id', saved.proyecto_id
  );
end;
$$;

-- 5. RPC de lectura para el panel: qué registros ve quien llama y cuáles puede
-- escribir. A un ejecutivo solo le muestra los proyectos a los que está
-- vinculado, más los que ya tienen registro del lead (para leer su
-- historial). No devuelve actor, motivo ni datos del lead.
create or replace function public.commercial_stage_scope(p_lead uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text := public.get_my_role();
  caller_tenant uuid := public.get_my_inmobiliaria();
begin
  if auth.uid() is null
     or coalesce(caller_role, '') not in ('ejecutivo', 'admin', 'admin_inmobiliario')
     or caller_tenant is null then
    return jsonb_build_object('lead_level_writable', false, 'lead_level', null, 'proyectos', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'lead_level_writable', public.lead_belongs_to_inmobiliaria(p_lead, caller_tenant),
    'lead_level', (
      select jsonb_build_object('stage', s.stage, 'updated_at', s.updated_at)
      from public.lead_commercial_stage s
      where s.subject_user_id = p_lead and s.inmobiliaria_id = caller_tenant
    ),
    'proyectos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'nombre', pr.nombre,
          'estado', pr.estado,
          'stage', s.stage,
          'updated_at', s.updated_at,
          'writable', public.commercial_stage_project_access(p_lead, pr.id, caller_role, caller_tenant) is null
        )
        order by pr.nombre, pr.id
      )
      from public.proyectos pr
      left join public.lead_project_commercial_stage s
        on s.proyecto_id = pr.id
       and s.subject_user_id = p_lead
       and s.inmobiliaria_id = caller_tenant
      where pr.inmobiliaria_id = caller_tenant
        and (s.proyecto_id is not null or public.lead_belongs_to_proyecto(p_lead, pr.id))
        and (caller_role <> 'ejecutivo' or s.proyecto_id is not null or public.is_ejecutivo_vinculado(pr.id))
    ), '[]'::jsonb)
  );
end;
$$;

-- 6. Trabajos de agotar y reponer. Son un trigger y no un servicio porque el
-- frontend escribe proyectos.estado directamente y cualquier escritor debe
-- dispararlos. Cada corrida lee el estado actual, así que alternar el estado
-- varias veces es seguro, y agotado → agotado no dispara. Los motivos son
-- códigos fijos que no identifican al lead.
create or replace function public.commercial_stage_project_estado_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  current_stage text;
  closure public.commercial_stage_events;
  saved public.commercial_stage_events;
begin
  if new.estado = 'agotado' then
    for rec in
      select s.subject_user_id, s.inmobiliaria_id
      from public.lead_project_commercial_stage s
      where s.proyecto_id = new.id
        and s.stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion')
      order by s.subject_user_id, s.inmobiliaria_id
    loop
      perform pg_advisory_xact_lock(hashtextextended(rec.subject_user_id::text || ':' || rec.inmobiliaria_id::text, 0));

      select s.stage into current_stage
      from public.lead_project_commercial_stage s
      where s.subject_user_id = rec.subject_user_id
        and s.inmobiliaria_id = rec.inmobiliaria_id
        and s.proyecto_id = new.id
      for update;
      if current_stage is null
         or current_stage not in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion') then
        continue;
      end if;

      perform public.commercial_stage_transition_check(current_stage, 'perdido', 'sistema', 'proyecto_agotado');

      insert into public.commercial_stage_events (
        subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
        stage_before, stage_after, reason, source
      ) values (
        rec.subject_user_id, rec.inmobiliaria_id, new.id, null, 'sistema',
        current_stage, 'perdido', 'proyecto_agotado', 'job'
      )
      returning * into saved;

      update public.lead_project_commercial_stage
      set stage = saved.stage_after, last_event_id = saved.id, updated_at = saved.occurred_at
      where subject_user_id = rec.subject_user_id
        and inmobiliaria_id = rec.inmobiliaria_id
        and proyecto_id = new.id;
    end loop;

  elsif old.estado = 'agotado' then
    -- Solo se reabren los registros cuyo último evento sigue siendo el cierre
    -- automático: si una persona los movió después, su decisión se respeta.
    for rec in
      select s.subject_user_id, s.inmobiliaria_id
      from public.lead_project_commercial_stage s
      join public.commercial_stage_events e on e.id = s.last_event_id
      where s.proyecto_id = new.id
        and e.actor_role = 'sistema'
        and e.source = 'job'
        and e.stage_after = 'perdido'
        and e.reason = 'proyecto_agotado'
      order by s.subject_user_id, s.inmobiliaria_id
    loop
      perform pg_advisory_xact_lock(hashtextextended(rec.subject_user_id::text || ':' || rec.inmobiliaria_id::text, 0));

      closure := null;
      select e.* into closure
      from public.lead_project_commercial_stage s
      join public.commercial_stage_events e on e.id = s.last_event_id
      where s.subject_user_id = rec.subject_user_id
        and s.inmobiliaria_id = rec.inmobiliaria_id
        and s.proyecto_id = new.id
        and e.actor_role = 'sistema'
        and e.source = 'job'
        and e.stage_after = 'perdido'
        and e.reason = 'proyecto_agotado'
      for update of s;
      if closure.id is null then
        continue;
      end if;

      perform public.commercial_stage_transition_check('perdido', closure.stage_before, 'sistema', 'proyecto_repuesto');

      insert into public.commercial_stage_events (
        subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
        stage_before, stage_after, reason, source
      ) values (
        rec.subject_user_id, rec.inmobiliaria_id, new.id, null, 'sistema',
        'perdido', closure.stage_before, 'proyecto_repuesto', 'job'
      )
      returning * into saved;

      update public.lead_project_commercial_stage
      set stage = saved.stage_after, last_event_id = saved.id, updated_at = saved.occurred_at
      where subject_user_id = rec.subject_user_id
        and inmobiliaria_id = rec.inmobiliaria_id
        and proyecto_id = new.id;
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists proyectos_commercial_stage_jobs on public.proyectos;
create trigger proyectos_commercial_stage_jobs
  after update of estado on public.proyectos
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.commercial_stage_project_estado_changed();

-- 7. Privilegios. El navegador ejecuta change_commercial_stage (firma nueva),
-- commercial_stage_scope y lead_in_my_inmobiliaria; nada más de esta historia.
revoke all on function public.lead_belongs_to_proyecto(uuid, uuid),
  public.is_ejecutivo_vinculado(uuid),
  public.commercial_stage_project_access(uuid, uuid, text, uuid),
  public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_scope(uuid),
  public.commercial_stage_project_estado_changed() from public, anon, authenticated;
grant execute on function public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_scope(uuid) to authenticated;
grant execute on function public.lead_belongs_to_proyecto(uuid, uuid),
  public.is_ejecutivo_vinculado(uuid),
  public.commercial_stage_project_access(uuid, uuid, text, uuid),
  public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_scope(uuid) to service_role;

commit;
