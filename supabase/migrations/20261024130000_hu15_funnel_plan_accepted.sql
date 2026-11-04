-- =============================================================
-- RutaHogar — HU 15: el plan de los hechos del embudo es el plan aceptado
-- =============================================================
-- Diseño: docs/algorithms/ALG-18-commercial-funnel-metrics.md (G32) y
-- docs/stories/HU15-dashboard-conversion-tiempos/PLAN.md (Entities).
--
-- 20261005150000 leía el plan de tracking_plans, pero HU 13 crea esa fila en la
-- primera evaluación de cada lead: contaba a todos los leads nuevos como si
-- hubieran aceptado un plan de mejora. El plan aceptado es el evento
-- evaluation_events de tipo 'plan_accepted' (o la columna heredada
-- evaluations.plan_accepted_at), y su proyecto objetivo es la meta de la
-- evaluación sobre la que se aceptó. Solo cambia el campo `plan`; la forma de
-- la fila de hechos, el alcance y los permisos son los mismos.
--
-- Se aplica con `supabase db push` (nunca en el editor SQL).
begin;

create or replace function public.commercial_funnel_facts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.get_my_role();
  v_tenant uuid := public.get_my_inmobiliaria();
  v_scope uuid[];
  v_scope_text text[];
  v_proyectos jsonb;
  v_facts jsonb;
begin
  if v_uid is null
     or v_tenant is null
     or coalesce(v_role, '') not in ('admin_inmobiliario', 'admin', 'ejecutivo') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(pr.id order by pr.nombre, pr.id), '{}')
    into v_scope
  from public.proyectos pr
  where pr.inmobiliaria_id = v_tenant
    and (v_role <> 'ejecutivo' or public.is_ejecutivo_vinculado(pr.id));
  v_scope_text := v_scope::text[];

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id,
           'nombre', pr.nombre,
           'comuna', pr.comuna,
           'tipo', pr.tipo,
           'precio_min_uf', pr.precio_min_uf,
           'precio_max_uf', pr.precio_max_uf,
           'estado', pr.estado
         ) order by array_position(v_scope, pr.id)), '[]'::jsonb)
    into v_proyectos
  from public.proyectos pr
  where pr.id = any(v_scope);

  with lead_projects as (
    select p.id as lead, s.proyecto_id
    from public.profiles p
    cross join unnest(v_scope) as s(proyecto_id)
    where p.role = 'usuario'
      and exists (select 1 from public.evaluations e where e.user_id = p.id)
      and (
        public.lead_belongs_to_proyecto(p.id, s.proyecto_id)
        or exists (
          select 1
          from public.commercial_stage_events ev
          where ev.subject_user_id = p.id
            and ev.inmobiliaria_id = v_tenant
            and ev.proyecto_id = s.proyecto_id
        )
      )
  ),
  leads as (
    select lp.lead,
           row_number() over (order by lp.lead) as n,
           jsonb_agg(lp.proyecto_id order by array_position(v_scope, lp.proyecto_id)) as proyectos
    from lead_projects lp
    group by lp.lead
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', l.n::text,
           'first_evaluation_at', (select min(e.created_at) from public.evaluations e where e.user_id = l.lead),
           'evaluaciones', (
             select jsonb_agg(jsonb_build_object(
                      'at', e.created_at,
                      'project_goal_id', case
                        when e.financial_data -> 'input' -> 'project_goal' ->> 'id' = any(v_scope_text)
                          then e.financial_data -> 'input' -> 'project_goal' ->> 'id'
                      end
                    ) order by e.created_at, e.id)
             from public.evaluations e
             where e.user_id = l.lead
           ),
           'evaluacion_actual', (
             select jsonb_build_object(
                      'input', coalesce(e.financial_data -> 'input', '{}'::jsonb),
                      'onboarding', coalesce(pf.onboarding_data, '{}'::jsonb),
                      'result', coalesce(e.financial_data -> 'result', '{}'::jsonb)
                    )
             from public.evaluations e
             join public.profiles pf on pf.id = e.user_id
             where e.user_id = l.lead
             order by e.created_at desc, e.id desc
             limit 1
           ),
           'proyectos', l.proyectos,
           'postulaciones', coalesce((
             select jsonb_agg(jsonb_build_object('proyecto_id', g.proyecto_id, 'first_at', g.first_at)
                              order by g.first_at, g.proyecto_id)
             from (
               select e.financial_data -> 'input' -> 'project_goal' ->> 'id' as proyecto_id,
                      min(e.created_at) as first_at
               from public.evaluations e
               where e.user_id = l.lead
                 and e.financial_data -> 'input' -> 'project_goal' ->> 'id' = any(v_scope_text)
               group by 1
             ) g
           ), '[]'::jsonb),
           'stage_events', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'proyecto_id', ev.proyecto_id,
                      'stage_after', ev.stage_after,
                      'occurred_at', ev.occurred_at,
                      'por_sistema', ev.actor_role = 'sistema',
                      'por_mi', coalesce(ev.actor_id = v_uid, false)
                    ) order by ev.occurred_at, ev.id)
             from public.commercial_stage_events ev
             where ev.subject_user_id = l.lead
               and ev.inmobiliaria_id = v_tenant
               and (ev.proyecto_id is null or ev.proyecto_id = any(v_scope))
           ), '[]'::jsonb),
           'plan', (
             select jsonb_build_object(
                      'baseline_at', acc.at,
                      'target_proyecto_id', case when acc.goal = any(v_scope_text) then acc.goal end
                    )
             from (
               select ee.effective_at as at,
                      e.financial_data -> 'input' -> 'project_goal' ->> 'id' as goal
               from public.evaluation_events ee
               join public.evaluations e on e.id = ee.evaluation_id and e.user_id = ee.user_id
               where ee.user_id = l.lead
                 and ee.kind = 'plan_accepted'
               union all
               select e.plan_accepted_at,
                      e.financial_data -> 'input' -> 'project_goal' ->> 'id'
               from public.evaluations e
               where e.user_id = l.lead
                 and e.plan_accepted_at is not null
               order by 1, 2
               limit 1
             ) acc
           ),
           'favoritos', coalesce((
             select jsonb_agg(jsonb_build_object('proyecto_id', f.proyecto_id, 'created_at', f.created_at)
                              order by f.created_at, f.proyecto_id)
             from public.proyecto_favoritos f
             where f.usuario_id = l.lead
               and f.proyecto_id = any(v_scope)
           ), '[]'::jsonb),
           'progress_update_ats', coalesce((
             select jsonb_agg(te.recorded_at order by te.recorded_at, te.event_id)
             from public.tracking_events te
             where te.user_id = l.lead
               and te.event_kind in ('data_update', 'evaluation')
           ), '[]'::jsonb),
           'confirmed_goal_ats', coalesce((
             select jsonb_agg(ge.recorded_at order by ge.recorded_at, ge.event_id)
             from public.improvement_goal_events ge
             where ge.user_id = l.lead
               and ge.confirmed
           ), '[]'::jsonb)
         ) order by l.n), '[]'::jsonb)
    into v_facts
  from leads l;

  return jsonb_build_object('now', clock_timestamp(), 'proyectos', v_proyectos, 'facts', v_facts);
end;
$$;

revoke all on function public.commercial_funnel_facts() from public, anon, authenticated;
grant execute on function public.commercial_funnel_facts() to authenticated;

revoke all on function public.commercial_funnel_facts() from public, anon, authenticated;
grant execute on function public.commercial_funnel_facts() to authenticated;

commit;
