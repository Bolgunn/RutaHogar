-- Revierte 20261005120000_commercial_stage_project_tracks.sql.
--
-- SOLO PARA UN DESPLIEGUE FALLIDO, NO DESPUÉS DE SALIR A PRODUCCIÓN.
-- Una vez que existen registros de proyecto, eventos de los trabajos o
-- eventos de "revivir", esta reversión DESTRUYE la atribución por proyecto
-- (drop column proyecto_id y drop table lead_project_commercial_stage), y
-- restaurar el check original de cambio de etapa falla con los eventos de
-- "revivir" (stage_before = stage_after). Exportar antes si hay datos reales.
begin;

drop trigger if exists proyectos_commercial_stage_jobs on public.proyectos;
drop function if exists public.commercial_stage_project_estado_changed();

drop function if exists public.commercial_stage_scope(uuid);
drop function if exists public.change_commercial_stage(uuid, text, text, text, uuid);

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

revoke all on function public.change_commercial_stage(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.change_commercial_stage(uuid, text, text, text) to authenticated, service_role;

drop function if exists public.commercial_stage_project_access(uuid, uuid, text, uuid);
drop function if exists public.is_ejecutivo_vinculado(uuid);

-- Cuerpo de 20260930120000: debe volver antes de borrar lead_belongs_to_proyecto.
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

drop function if exists public.lead_belongs_to_proyecto(uuid, uuid);

drop policy if exists "Lead project commercial stage select tenant" on public.lead_project_commercial_stage;
drop table if exists public.lead_project_commercial_stage;

alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_job_project_check;
alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_lead_level_stage_check;
drop index if exists public.commercial_stage_events_proyecto_idx;
drop index if exists public.commercial_stage_events_record_idx;

alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_change_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_change_check
    check (stage_before is distinct from stage_after);

alter table public.commercial_stage_events
  drop column if exists proyecto_id;

commit;
