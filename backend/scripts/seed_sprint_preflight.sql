-- Read-only preflight for the sprint review seed (docs/stories/sprint-review-seed/PLAN.md, step 2).
-- Every row must say ok = true before seeding. Writes nothing.
--   supabase db query --linked -f backend/scripts/seed_sprint_preflight.sql
--
-- 1900 UF is the cheapest minimum price among the demo projects that are not agotado (Mirador Maipú,
-- PROJECTS in seed_hu15_demo.py). The HU 20 cron tells each lead about the cheapest project it reaches
-- (ties by name), so an opted-in lead gets a new event, and an email, about a demo project only if it
-- reaches 1900 UF and reaches no existing project priced below 1900.
with opted_in as (
  select distinct user_id from public.lead_notification_preferences
  where channel = 'email' and enabled and event_type = 'project_compatible_unlocked'
), latest as (
  select distinct on (e.user_id) e.user_id,
         (e.financial_data -> 'result' -> 'financial_indicators' ->> 'capacidad_compra_estimada_uf')::numeric as capacity
  from public.evaluations e join opted_in o on o.user_id = e.user_id
  order by e.user_id, e.created_at desc
)
select 'no sprint accounts yet' as check_name, count(*) = 0 as ok, count(*)::text as detail
  from auth.users where email like 'sprint-%@example.com'
union all
select 'no sprint tenant yet', count(*) = 0, count(*)::text
  from public.inmobiliarias where nombre = 'Inmobiliaria Sprint Review (demo)'
union all
select 'no real projects in Ñuñoa, Providencia or Maipú', count(*) = 0, count(*)::text
  from public.proyectos where comuna in ('Ñuñoa', 'Providencia', 'Maipú')
union all
select 'RUT block 40000001+ unused', count(*) = 0, count(*)::text
  from public.profiles where rut ~ '^4000[0-9]{4}-[0-9K]$'
union all
select 'no email opt-in for project_compatible_unlocked would be told about a demo project', count(*) = 0,
       count(*)::text || ' of ' || (select count(*) from opted_in)::text || ' opted-in users'
  from latest l
  where l.capacity >= 1900
    and not exists (select 1 from public.proyectos p
                    where p.estado <> 'agotado' and p.precio_min_uf < 1900 and p.precio_min_uf <= l.capacity)
union all
select 'required tables exist', bool_and(to_regclass('public.' || t) is not null),
       coalesce(string_agg(t, ', ') filter (where to_regclass('public.' || t) is null), 'all present')
  from unnest(array['profiles', 'inmobiliarias', 'proyectos', 'proyecto_ejecutivos', 'proyecto_favoritos',
                    'evaluations', 'scoring_history', 'tracking_plans', 'tracking_events', 'improvement_goals',
                    'evaluation_events', 'improvement_goal_events', 'commercial_stage_events',
                    'lead_commercial_stage', 'lead_project_commercial_stage', 'lead_change_events',
                    'lead_change_notifications', 'lead_notification_preferences', 'lead_status_history',
                    'mortgage_scenarios', 'arco_requests', 'market_snapshots']) as t
union all
select 'required functions exist', bool_and(exists (select 1 from pg_proc p where p.proname = f and p.pronamespace = 'public'::regnamespace)),
       coalesce(string_agg(f, ', ') filter (where not exists (select 1 from pg_proc p where p.proname = f and p.pronamespace = 'public'::regnamespace)), 'all present')
  from unnest(array['find_user_id_by_email', 'lead_changes_record_event', 'commercial_funnel_facts', 'handle_new_user']) as f
union all
select 'evaluations now (budget: this + the seed must stay ≤ 900)', true, count(*)::text
  from public.evaluations;
