-- =============================================================
-- RutaHogar — Etapa comercial del lead por inmobiliaria
-- =============================================================
-- Diseño: docs/stories/commercial-stage/PLAN.md. Base: Spike 2 · E2
-- (docs/research/spike2-e2-auditoria-historial-versionado.md §5.5, §5.6, §5.8).
--
-- · commercial_stage_events es el historial: solo inserción, una fila por
--   transición. HU 15 calcula tiempos como diferencias entre sus occurred_at.
-- · lead_commercial_stage es la proyección barata de consultar: la etapa
--   vigente de cada (lead, inmobiliaria). Solo la escribe el RPC, en la misma
--   transacción que el evento.
-- · Las columnas del historial son el subconjunto de audit_events (§5.5):
--   cuando exista, se migra con INSERT … SELECT y
--   event_type = 'commercial_stage_changed'.
-- · Actor ≠ sujeto (H8): subject_user_id es el lead; actor_id es quien actuó,
--   y es null solo cuando actúa el sistema.
-- · Sin FK a profiles ni a auth.users en subject_user_id / actor_id, a
--   propósito: borrar una cuenta no debe arrastrar el historial, y la
--   supresión del §5.8 debe poder reemplazar el id del lead por uno aleatorio.
--
-- Aplicar manualmente tras revisión, como la migración de HU 13.
begin;

create table if not exists public.commercial_stage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  subject_user_id uuid not null,
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete restrict,
  actor_id uuid,
  actor_role text not null,
  stage_before text,
  stage_after text not null,
  reason text,
  source text not null,
  constraint commercial_stage_events_actor_role_check
    check (actor_role in ('ejecutivo', 'admin', 'admin_inmobiliario', 'sistema')),
  constraint commercial_stage_events_system_actor_check
    check ((actor_role = 'sistema') = (actor_id is null)),
  constraint commercial_stage_events_stage_before_check
    check (stage_before in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido')),
  constraint commercial_stage_events_stage_after_check
    check (stage_after in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido')),
  constraint commercial_stage_events_change_check
    check (stage_before is distinct from stage_after),
  constraint commercial_stage_events_source_check
    check (source in ('web', 'backend', 'job', 'backfill'))
);

create index if not exists commercial_stage_events_pair_idx
  on public.commercial_stage_events (subject_user_id, inmobiliaria_id, occurred_at, id);
create index if not exists commercial_stage_events_tenant_idx
  on public.commercial_stage_events (inmobiliaria_id, occurred_at);

create table if not exists public.lead_commercial_stage (
  subject_user_id uuid not null,
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete restrict,
  stage text not null,
  last_event_id uuid not null references public.commercial_stage_events(id),
  updated_at timestamptz not null,
  primary key (subject_user_id, inmobiliaria_id),
  constraint lead_commercial_stage_stage_check
    check (stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido'))
);

create index if not exists lead_commercial_stage_tenant_idx
  on public.lead_commercial_stage (inmobiliaria_id, stage);

-- Única definición de "lead de una inmobiliaria". Es la regla de comunas del
-- PR #97 con dos correcciones: lee las columnas reales (evaluations no tiene
-- `input`) y no incluye la rama "alguien de mi inmobiliaria ya escribió
-- historial sobre este lead", que permitía a un ejecutivo ampliarse el alcance
-- a sí mismo. Suma los proyectos favoritos del lead. HU 16 y H14 deberían
-- reutilizarla en vez de definir otra.
create or replace function public.lead_belongs_to_inmobiliaria(p_lead uuid, p_inmobiliaria uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_lead
      and p.role = 'usuario'
      and p_inmobiliaria is not null
      and (
        exists (
          select 1
          from public.proyecto_favoritos f
          join public.proyectos pr on pr.id = f.proyecto_id
          where f.usuario_id = p.id
            and pr.inmobiliaria_id = p_inmobiliaria
        )
        or exists (
          select 1
          from public.proyectos pr
          where pr.inmobiliaria_id = p_inmobiliaria
            and lower(trim(pr.comuna)) in (
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
      )
  );
$$;

create or replace function public.lead_in_my_inmobiliaria(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lead_belongs_to_inmobiliaria(p_lead, public.get_my_inmobiliaria());
$$;

-- Reglas de transición (docs/stories/commercial-stage/PLAN.md). El mensaje de
-- cada excepción es un código estable que el frontend traduce.
create or replace function public.commercial_stage_transition_check(
  p_from text,
  p_to text,
  p_role text,
  p_reason text
) returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  stage_order constant text[] := array['nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada'];
  from_rank integer := array_position(stage_order, p_from);
  to_rank integer := array_position(stage_order, p_to);
  has_reason boolean := length(trim(coalesce(p_reason, ''))) > 0;
begin
  if p_to is null or (to_rank is null and p_to <> 'perdido') then
    raise exception 'invalid_stage';
  end if;
  if p_from = p_to then
    raise exception 'same_stage';
  end if;

  if p_from = 'venta_cerrada' then
    if p_to <> 'perdido' then raise exception 'invalid_transition'; end if;
    if coalesce(p_role, '') not in ('admin', 'admin_inmobiliario') then
      raise exception 'admin_required' using errcode = '42501';
    end if;
    if not has_reason then raise exception 'reason_required'; end if;
    return;
  end if;

  if p_from = 'perdido' then
    if p_to = 'venta_cerrada' then raise exception 'invalid_transition'; end if;
    if not has_reason then raise exception 'reason_required'; end if;
    return;
  end if;

  if (p_to = 'perdido' or to_rank < from_rank) and not has_reason then
    raise exception 'reason_required';
  end if;
end;
$$;

create or replace function public.change_commercial_stage(
  p_lead uuid,
  p_to_stage text,
  p_reason text default null,
  p_expected_stage text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := public.get_my_role();
  caller_tenant uuid := public.get_my_inmobiliaria();
  current_stage text;
  saved public.commercial_stage_events;
begin
  -- El tenant sale siempre de la sesión, nunca de un parámetro. El admin
  -- global (sin inmobiliaria) lee todo pero no escribe.
  if caller_id is null
     or coalesce(caller_role, '') not in ('ejecutivo', 'admin', 'admin_inmobiliario')
     or caller_tenant is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.lead_belongs_to_inmobiliaria(p_lead, caller_tenant) then
    raise exception 'lead_not_in_scope' using errcode = '42501';
  end if;

  -- Serializa también la primera escritura de un par, cuando aún no hay fila
  -- que bloquear con FOR UPDATE.
  perform pg_advisory_xact_lock(hashtextextended(p_lead::text || ':' || caller_tenant::text, 0));

  select stage into current_stage
  from public.lead_commercial_stage
  where subject_user_id = p_lead and inmobiliaria_id = caller_tenant
  for update;
  current_stage := coalesce(current_stage, 'nuevo');

  if p_expected_stage is not null and p_expected_stage <> current_stage then
    raise exception 'stale_stage';
  end if;

  perform public.commercial_stage_transition_check(current_stage, p_to_stage, caller_role, p_reason);

  insert into public.commercial_stage_events (
    subject_user_id, inmobiliaria_id, actor_id, actor_role,
    stage_before, stage_after, reason, source
  ) values (
    p_lead, caller_tenant, caller_id, caller_role,
    current_stage, p_to_stage, nullif(trim(p_reason), ''), 'web'
  )
  returning * into saved;

  insert into public.lead_commercial_stage (subject_user_id, inmobiliaria_id, stage, last_event_id, updated_at)
  values (p_lead, caller_tenant, p_to_stage, saved.id, saved.occurred_at)
  on conflict (subject_user_id, inmobiliaria_id) do update
    set stage = excluded.stage,
        last_event_id = excluded.last_event_id,
        updated_at = excluded.updated_at;

  return jsonb_build_object('stage', saved.stage_after, 'event_id', saved.id, 'occurred_at', saved.occurred_at);
end;
$$;

-- El historial no se edita ni se borra (ISO 27001 A.8.15, Spike §5.2). La
-- única excepción prevista es el procedimiento de supresión del §5.8, que
-- corre como dueño de la tabla y deshabilita este trigger en su transacción.
create or replace function public.commercial_stage_reject_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'immutable_history' using errcode = '23514';
end;
$$;

drop trigger if exists commercial_stage_events_immutable on public.commercial_stage_events;
create trigger commercial_stage_events_immutable
  before update or delete on public.commercial_stage_events
  for each row execute function public.commercial_stage_reject_mutation();

-- Privilegios (H12): los roles del navegador solo leen, y RLS acota qué.
alter table public.commercial_stage_events enable row level security;
alter table public.lead_commercial_stage enable row level security;

revoke all on public.commercial_stage_events, public.lead_commercial_stage from anon, authenticated;
grant select on public.commercial_stage_events, public.lead_commercial_stage to authenticated;
grant select, insert on public.commercial_stage_events to service_role;
grant select, insert, update on public.lead_commercial_stage to service_role;

-- El personal ve las etapas de su inmobiliaria; el admin global, todas. El
-- lead no tiene política: los motivos son notas internas del personal.
drop policy if exists "Commercial stage events select tenant" on public.commercial_stage_events;
create policy "Commercial stage events select tenant"
  on public.commercial_stage_events
  for select
  to authenticated
  using (
    (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and public.get_my_inmobiliaria() = inmobiliaria_id
    )
    or (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  );

drop policy if exists "Lead commercial stage select tenant" on public.lead_commercial_stage;
create policy "Lead commercial stage select tenant"
  on public.lead_commercial_stage
  for select
  to authenticated
  using (
    (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and public.get_my_inmobiliaria() = inmobiliaria_id
    )
    or (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  );

revoke all on function public.lead_belongs_to_inmobiliaria(uuid, uuid),
  public.lead_in_my_inmobiliaria(uuid),
  public.commercial_stage_transition_check(text, text, text, text),
  public.change_commercial_stage(uuid, text, text, text),
  public.commercial_stage_reject_mutation() from public, anon, authenticated;
grant execute on function public.lead_in_my_inmobiliaria(uuid),
  public.change_commercial_stage(uuid, text, text, text) to authenticated;
grant execute on function public.lead_belongs_to_inmobiliaria(uuid, uuid),
  public.change_commercial_stage(uuid, text, text, text) to service_role;

-- Backfill (decisión Q5): cada lead con evaluación parte en 'nuevo' en cada
-- inmobiliaria a la que pertenece, fechado en su primera evaluación. Volver a
-- ejecutarlo no inserta nada. Los leads que se vuelvan elegibles después no
-- tienen fila y el RPC los lee como 'nuevo'.
create or replace function public.commercial_stage_backfill()
returns integer
language plpgsql
set search_path = public
as $$
declare
  inserted_count integer;
begin
  with eligible as (
    select p.id as subject_user_id,
           i.id as inmobiliaria_id,
           (select min(e.created_at) from public.evaluations e where e.user_id = p.id) as first_evaluation_at
    from public.profiles p
    cross join public.inmobiliarias i
    where p.role = 'usuario'
      and exists (select 1 from public.evaluations e where e.user_id = p.id)
      and not exists (
        select 1 from public.lead_commercial_stage s
        where s.subject_user_id = p.id and s.inmobiliaria_id = i.id
      )
      and public.lead_belongs_to_inmobiliaria(p.id, i.id)
  ),
  inserted as (
    insert into public.commercial_stage_events (
      occurred_at, subject_user_id, inmobiliaria_id, actor_id, actor_role,
      stage_before, stage_after, reason, source
    )
    select first_evaluation_at, subject_user_id, inmobiliaria_id, null, 'sistema',
           null, 'nuevo', null, 'backfill'
    from eligible
    returning id, occurred_at, subject_user_id, inmobiliaria_id
  )
  insert into public.lead_commercial_stage (subject_user_id, inmobiliaria_id, stage, last_event_id, updated_at)
  select subject_user_id, inmobiliaria_id, 'nuevo', id, occurred_at
  from inserted;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.commercial_stage_backfill() from public, anon, authenticated;

select public.commercial_stage_backfill();

commit;
