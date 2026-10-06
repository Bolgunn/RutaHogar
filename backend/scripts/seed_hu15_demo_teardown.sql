-- Removes everything backend/scripts/seed_hu15_demo.py created, and nothing else:
--   * the inmobiliaria 'Inmobiliaria Demo Métricas', its projects, assignments and stage history;
--   * the accounts demo-hu15-*@example.com and every row that belongs to them.
-- See docs/stories/HU15-dashboard-conversion-tiempos/DEMO.md. Run it with
--   supabase db query --linked -f backend/scripts/seed_hu15_demo_teardown.sql
--
-- The history tables are immutable (hu13_immutable, commercial_stage_events_immutable); their
-- triggers are disabled for this transaction only, by the table owner, and enabled again before
-- commit. One transaction: any error leaves the database exactly as it was.
begin;

create temp table demo_users on commit drop as
  select id from auth.users where email like 'demo-hu15-%@example.com';
create temp table demo_tenant on commit drop as
  select id from public.inmobiliarias where nombre = 'Inmobiliaria Demo Métricas';
create temp table demo_projects on commit drop as
  select id from public.proyectos where inmobiliaria_id in (select id from demo_tenant);

do $$
begin
  if exists (
    select 1 from public.profiles p
    where p.inmobiliaria_id in (select id from demo_tenant)
      and p.id not in (select id from demo_users)
  ) then
    raise exception 'the demo inmobiliaria has accounts that are not demo-hu15 accounts; nothing removed';
  end if;
  if exists (
    select 1 from public.commercial_stage_events e
    where e.subject_user_id in (select id from demo_users)
      and e.inmobiliaria_id not in (select id from demo_tenant)
  ) then
    raise exception 'demo leads have stage history in another inmobiliaria; nothing removed';
  end if;
end;
$$;

alter table public.tracking_plans disable trigger hu13_immutable;
alter table public.tracking_events disable trigger hu13_immutable;
alter table public.improvement_goal_events disable trigger hu13_immutable;
alter table public.evaluation_events disable trigger hu13_immutable;
alter table public.evaluations disable trigger hu13_immutable;
alter table public.scoring_history disable trigger hu13_immutable;
alter table public.improvement_goals disable trigger hu13_immutable;
alter table public.commercial_stage_events disable trigger commercial_stage_events_immutable;

set constraints all deferred;

delete from public.lead_project_commercial_stage where inmobiliaria_id in (select id from demo_tenant);
delete from public.lead_commercial_stage where inmobiliaria_id in (select id from demo_tenant);
delete from public.commercial_stage_events where inmobiliaria_id in (select id from demo_tenant);

delete from public.improvement_goal_events where user_id in (select id from demo_users);
delete from public.evaluation_events where user_id in (select id from demo_users);
delete from public.improvement_goals where user_id in (select id from demo_users);
delete from public.tracking_events where user_id in (select id from demo_users);
delete from public.tracking_plans where user_id in (select id from demo_users);
delete from public.scoring_history where user_id in (select id from demo_users);
delete from public.evaluations where user_id in (select id from demo_users);

delete from public.proyecto_favoritos
  where usuario_id in (select id from demo_users) or proyecto_id in (select id from demo_projects);
delete from public.proyecto_ejecutivos where proyecto_id in (select id from demo_projects);
delete from public.proyectos where id in (select id from demo_projects);
delete from public.profiles where id in (select id from demo_users);
delete from auth.users where id in (select id from demo_users);
delete from public.inmobiliarias where id in (select id from demo_tenant);

-- Run the deferred foreign-key checks now: ALTER TABLE refuses to run while they are pending.
set constraints all immediate;

alter table public.tracking_plans enable trigger hu13_immutable;
alter table public.tracking_events enable trigger hu13_immutable;
alter table public.improvement_goal_events enable trigger hu13_immutable;
alter table public.evaluation_events enable trigger hu13_immutable;
alter table public.evaluations enable trigger hu13_immutable;
alter table public.scoring_history enable trigger hu13_immutable;
alter table public.improvement_goals enable trigger hu13_immutable;
alter table public.commercial_stage_events enable trigger commercial_stage_events_immutable;

select
  (select count(*) from auth.users where email like 'demo-hu15-%@example.com') as demo_accounts_left,
  (select count(*) from public.inmobiliarias where nombre = 'Inmobiliaria Demo Métricas') as demo_tenant_left;

commit;
