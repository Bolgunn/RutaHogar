-- Removes everything a demo seed created, and nothing else:
--   * the demo inmobiliaria, its projects, assignments and stage history;
--   * the accounts <prefix>*@example.com and every row that belongs to them, including rows the app
--     or the HU 20 cron wrote after seeding (lead change events, notifications, simulations, ...).
-- Rendered and applied by backend/scripts/seed_demo_teardown.py, which fills in the email prefix, the
-- tenant name and the ending (commit, or a check that reports and rolls back). See DEMO.md.
--
-- Works on any partial state: accounts without profiles, a tenant without leads, a seed stopped
-- halfway. Before deleting it counts, in every public table with a user, tenant or project column,
-- the rows that point at the demo set; afterwards it requires every one of those counts to be zero.
--
-- The history tables are immutable (hu13_immutable, commercial_stage_events_immutable); their
-- triggers are disabled for this transaction only, by the table owner, and enabled again before
-- commit. One transaction: any error leaves the database exactly as it was.
begin;

create temp table demo_users on commit drop as
  select id from auth.users where email like '__EMAIL_PREFIX__%@example.com';
create temp table demo_tenant on commit drop as
  select id from public.inmobiliarias where nombre = '__TENANT__';
create temp table demo_projects on commit drop as
  select id from public.proyectos where inmobiliaria_id in (select id from demo_tenant);

do $$
begin
  if exists (
    select 1 from public.profiles p
    where p.inmobiliaria_id in (select id from demo_tenant)
      and p.id not in (select id from demo_users)
  ) then
    raise exception 'the demo inmobiliaria has accounts that are not demo accounts; nothing removed';
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

-- Every public column that can point at a demo account, the demo tenant or a demo project.
create temp table demo_refs on commit drop as
  select c.table_name, c.column_name,
         case when c.column_name = 'inmobiliaria_id' then 'demo_tenant'
              when c.column_name in ('proyecto_id', 'project_id') then 'demo_projects'
              else 'demo_users' end as id_set,
         null::bigint as before, null::bigint as after
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and c.data_type in ('uuid', 'text')
    and (c.column_name in ('user_id', 'subject_user_id', 'usuario_id', 'lead_id', 'profile_id', 'actor_id',
                           'changed_by', 'ejecutivo_id', 'inmobiliaria_id', 'proyecto_id', 'project_id')
         or (c.table_name in ('profiles', 'inmobiliarias', 'proyectos') and c.column_name = 'id'));
update demo_refs set id_set = case table_name when 'inmobiliarias' then 'demo_tenant'
                                              when 'proyectos' then 'demo_projects' else 'demo_users' end
  where column_name = 'id';

do $$
declare r record; n bigint;
begin
  for r in select * from demo_refs loop
    execute format('select count(*) from public.%I where %I::text in (select id::text from %I)',
                   r.table_name, r.column_name, r.id_set) into n;
    update demo_refs set before = n where table_name = r.table_name and column_name = r.column_name;
  end loop;
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

-- Written by the app or the HU 20 cron once demo accounts exist.
delete from public.lead_change_notifications where user_id in (select id from demo_users);
delete from public.lead_change_events where user_id in (select id from demo_users);
delete from public.lead_notification_preferences where user_id in (select id from demo_users);
delete from public.lead_status_history where profile_id in (select id from demo_users);
delete from public.mortgage_scenarios where user_id in (select id from demo_users);
delete from public.arco_requests where user_id in (select id from demo_users);

-- The HU 20 cron matches every lead, real ones included, against every available project, so real
-- users can hold events about a demo project. Their notifications go with them (on delete cascade).
-- Deleting them, not just nulling project_id, keeps the demo name out of those users' history.
delete from public.lead_change_events where project_id in (select id from demo_projects);

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

-- The temp tables still hold the demo ids: anything still pointing at one that the deletes above
-- did not cover (a table added later) shows up here.
do $$
declare r record; n bigint; leftover text;
begin
  for r in select * from demo_refs loop
    execute format('select count(*) from public.%I where %I::text in (select id::text from %I)',
                   r.table_name, r.column_name, r.id_set) into n;
    update demo_refs set after = n where table_name = r.table_name and column_name = r.column_name;
  end loop;
  select string_agg(format('%s.%s: %s', table_name, column_name, after), ', ' order by table_name)
    into leftover from demo_refs where after > 0;
  if leftover is not null then
    raise exception 'teardown would leave demo rows behind (%); nothing removed', leftover;
  end if;
  if exists (select 1 from auth.users where id in (select id from demo_users))
     or exists (select 1 from public.inmobiliarias where id in (select id from demo_tenant)) then
    raise exception 'demo accounts or the demo inmobiliaria survived the teardown; nothing removed';
  end if;
end;
$$;

__FINISH__
