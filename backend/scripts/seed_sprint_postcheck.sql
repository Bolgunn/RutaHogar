-- Read-only checks after the sprint review seed (docs/stories/sprint-review-seed/PLAN.md, step 6).
-- Every row must say ok = true. Writes nothing.
--   supabase db query --linked -f backend/scripts/seed_sprint_postcheck.sql
with sprint as (
  select u.id, u.email, p.role, p.rut, p.phone, p.inmobiliaria_id
  from auth.users u join public.profiles p on p.id = u.id
  where u.email like 'sprint-%@example.com'
)
select 'staff: 2 admin_inmobiliario + 6 ejecutivo bound to the tenant' as check_name,
       count(*) filter (where role = 'admin_inmobiliario') = 2 and count(*) filter (where role = 'ejecutivo') = 6
         and bool_and(inmobiliaria_id = (select id from public.inmobiliarias where nombre = 'Inmobiliaria Sprint Review (demo)'))
           filter (where role <> 'usuario') as ok,
       count(*) filter (where role <> 'usuario')::text as detail
  from sprint
union all
select 'every account has a valid-looking, distinct RUT and a phone',
       count(*) = count(distinct rut) and bool_and(rut ~ '^4000[0-9]{4}-[0-9K]$') and bool_and(phone ~ '^\+5690000[0-9]{4}$'),
       count(*)::text || ' accounts, ' || count(distinct rut)::text || ' RUTs'
  from sprint
union all
select 'no email notification preferences (no email can reach a sprint account)', count(*) = 0, count(*)::text
  from public.lead_notification_preferences n join sprint s on s.id = n.user_id
union all
select 'Diego has his HU 20 events', count(*) >= 2, coalesce(string_agg(e.event_type, ', '), 'none')
  from public.lead_change_events e join sprint s on s.id = e.user_id
  where s.email = 'sprint-hero-diego@example.com'
union all
select 'heroes exist', count(*) = 3, count(*)::text
  from sprint where email like 'sprint-hero-%'
union all
select 'every demo project is labeled (demo)', bool_and(p.nombre like '% (demo)'), count(*)::text
  from public.proyectos p join public.inmobiliarias i on i.id = p.inmobiliaria_id
  where i.nombre = 'Inmobiliaria Sprint Review (demo)'
union all
select 'evaluations under the 1000-row REST cap', count(*) <= 1000, count(*)::text
  from public.evaluations;
