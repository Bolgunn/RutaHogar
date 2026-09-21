-- HU13: immutable source facts. Apply manually after review; no legacy backfill.
begin;

create unique index if not exists evaluations_id_user_unique on public.evaluations(id, user_id);
create table if not exists public.tracking_plans (
  id uuid primary key,
  user_id uuid not null unique references public.profiles(id),
  baseline_evaluation_id uuid not null,
  root_event_id uuid not null,
  baseline_at timestamptz not null,
  original_plan_snapshot jsonb not null,
  target_project_snapshot jsonb,
  provenance jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id, user_id),
  foreign key(baseline_evaluation_id, user_id) references public.evaluations(id, user_id)
);

create table if not exists public.tracking_events (
  event_id uuid primary key,
  plan_id uuid not null,
  user_id uuid not null,
  event_kind text not null check (event_kind in ('baseline', 'data_update', 'evaluation', 'correction')),
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(trim(reason)) > 0),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  recorded_complete_snapshot jsonb not null check (jsonb_typeof(recorded_complete_snapshot) = 'object'),
  previous_event_id uuid,
  correction_of_event_id uuid,
  correction_effect text check (correction_effect in ('replace', 'annul')),
  evaluation_id uuid,
  canonical_request jsonb,
  command_result jsonb,
  algorithm_version text not null,
  provenance jsonb not null,
  unique(event_id, plan_id, user_id),
  foreign key(plan_id, user_id) references public.tracking_plans(id, user_id),
  foreign key(evaluation_id, user_id) references public.evaluations(id, user_id),
  foreign key(previous_event_id, plan_id, user_id)
    references public.tracking_events(event_id, plan_id, user_id),
  foreign key(correction_of_event_id, plan_id, user_id)
    references public.tracking_events(event_id, plan_id, user_id),
  check (previous_event_id is distinct from event_id),
  check (correction_of_event_id is distinct from event_id),
  check ((event_kind = 'correction' and correction_of_event_id is not null and correction_effect is not null)
      or (event_kind <> 'correction' and correction_of_event_id is null and correction_effect is null)),
  check (correction_effect is distinct from 'annul' or patch = '{}'::jsonb)
);

alter table public.tracking_plans drop constraint if exists tracking_plans_root_fk;
alter table public.tracking_plans add constraint tracking_plans_root_fk
  foreign key(root_event_id, id, user_id)
  references public.tracking_events(event_id, plan_id, user_id) deferrable initially deferred;

create index if not exists tracking_events_effective_idx
  on public.tracking_events(user_id, plan_id, effective_at, recorded_at, event_id);
create index if not exists tracking_events_audit_idx
  on public.tracking_events(user_id, plan_id, recorded_at, event_id);
create index if not exists tracking_events_correction_idx
  on public.tracking_events(correction_of_event_id);
create unique index if not exists tracking_events_evaluation_unique
  on public.tracking_events(evaluation_id) where evaluation_id is not null;
create unique index if not exists tracking_events_baseline_unique
  on public.tracking_events(plan_id) where event_kind = 'baseline';

alter table public.improvement_goals
  add column if not exists tracking_plan_id uuid,
  add column if not exists baseline_event_id uuid,
  add column if not exists source_action_type text,
  add column if not exists source_ordinal integer,
  add column if not exists metric text,
  add column if not exists goal_type text,
  add column if not exists direction text,
  add column if not exists initial_value jsonb,
  add column if not exists target_value jsonb,
  add column if not exists unit text,
  add column if not exists target_at timestamptz,
  add column if not exists verification_kind text,
  add column if not exists verification_source jsonb,
  add column if not exists definition_version text;
create unique index if not exists improvement_goals_id_plan_user_unique
  on public.improvement_goals(id, tracking_plan_id, user_id);
alter table public.improvement_goals drop constraint if exists improvement_goals_tracking_fk;
alter table public.improvement_goals add constraint improvement_goals_tracking_fk
  foreign key(tracking_plan_id, user_id) references public.tracking_plans(id, user_id);
alter table public.improvement_goals drop constraint if exists improvement_goals_baseline_fk;
alter table public.improvement_goals add constraint improvement_goals_baseline_fk
  foreign key(baseline_event_id, tracking_plan_id, user_id)
  references public.tracking_events(event_id, plan_id, user_id);
alter table public.improvement_goals drop constraint if exists improvement_goals_tracking_contract;
alter table public.improvement_goals add constraint improvement_goals_tracking_contract check (
  tracking_plan_id is null or (
    baseline_event_id is not null and source_action_type is not null and source_ordinal is not null
    and goal_type in ('numeric', 'boolean', 'categorical') and goal_type is not null
    and verification_kind in ('automatic', 'manual') and verification_kind is not null
    and target_value is not null and definition_version is not null
    and (goal_type <> 'numeric' or
      (direction in ('increase', 'reduce') and direction is not null and initial_value is not null))
    and (verification_kind <> 'automatic' or verification_source is not null)
  )
);

create table if not exists public.improvement_goal_events (
  event_id uuid primary key,
  goal_id uuid not null,
  plan_id uuid not null,
  user_id uuid not null,
  confirmed boolean not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  reason text not null check(length(trim(reason)) > 0),
  source_event_id uuid not null,
  canonical_request jsonb not null,
  foreign key(goal_id, plan_id, user_id) references public.improvement_goals(id, tracking_plan_id, user_id),
  foreign key(source_event_id, plan_id, user_id) references public.tracking_events(event_id, plan_id, user_id)
);

create table if not exists public.evaluation_events (
  event_id uuid primary key,
  evaluation_id uuid not null,
  user_id uuid not null,
  kind text not null,
  payload jsonb not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  provenance jsonb not null,
  foreign key(evaluation_id, user_id) references public.evaluations(id, user_id)
);

alter table public.evaluations drop constraint if exists evaluations_classification_check;
alter table public.evaluations add constraint evaluations_classification_check
  check (classification in ('Alto', 'Medio', 'Bajo', 'Requiere antecedentes'));
alter table public.scoring_history drop constraint if exists scoring_history_classification_check;
alter table public.scoring_history add constraint scoring_history_classification_check
  check (classification in ('Alto', 'Medio', 'Bajo', 'Requiere antecedentes'));
alter table public.scoring_history add column if not exists events jsonb not null default '[]'::jsonb;

alter table public.tracking_plans enable row level security;
alter table public.tracking_events enable row level security;
alter table public.improvement_goal_events enable row level security;
alter table public.evaluation_events enable row level security;

drop policy if exists "Tracking plans select own" on public.tracking_plans;
create policy "Tracking plans select own" on public.tracking_plans
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Tracking events select own" on public.tracking_events;
create policy "Tracking events select own" on public.tracking_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Goal events select own" on public.improvement_goal_events;
create policy "Goal events select own" on public.improvement_goal_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Evaluation events select own" on public.evaluation_events;
create policy "Evaluation events select own" on public.evaluation_events
  for select to authenticated using (auth.uid() = user_id);

-- Disable legacy mutation policies rather than leave permissive alternatives.
drop policy if exists "Evaluations update own" on public.evaluations;
create policy "Evaluations update own" on public.evaluations
  for update using (false) with check (false);
drop policy if exists "Evaluations delete own" on public.evaluations;
create policy "Evaluations delete own" on public.evaluations
  for delete using (false);
drop policy if exists "Scoring history update own" on public.scoring_history;
create policy "Scoring history update own" on public.scoring_history
  for update using (false) with check (false);
drop policy if exists "Improvement goals insert own" on public.improvement_goals;
create policy "Improvement goals insert own" on public.improvement_goals
  for insert with check (auth.uid() = user_id and tracking_plan_id is null);
drop policy if exists "Improvement goals update own" on public.improvement_goals;
create policy "Improvement goals update own" on public.improvement_goals
  for update using (auth.uid() = user_id and tracking_plan_id is null)
  with check (auth.uid() = user_id and tracking_plan_id is null);
drop policy if exists "Improvement goals delete own" on public.improvement_goals;
create policy "Improvement goals delete own" on public.improvement_goals
  for delete using (auth.uid() = user_id and tracking_plan_id is null);

revoke insert, update, delete on public.tracking_plans, public.tracking_events,
  public.improvement_goal_events, public.evaluation_events from anon, authenticated;
grant select on public.tracking_plans, public.tracking_events,
  public.improvement_goal_events, public.evaluation_events to authenticated;
grant select, insert on public.tracking_plans, public.tracking_events,
  public.improvement_goal_events, public.evaluation_events to service_role;
revoke insert, update, delete on public.evaluations, public.scoring_history from anon, authenticated;

create or replace function public.hu13_reject_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'improvement_goals' then
    if old.tracking_plan_id is null then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  end if;
  raise exception 'immutable_history' using errcode = '23514';
end;
$$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'tracking_plans', 'tracking_events', 'improvement_goal_events',
    'evaluation_events', 'evaluations', 'scoring_history', 'improvement_goals'
  ] loop
    execute format('drop trigger if exists hu13_immutable on public.%I', relation_name);
    execute format(
      'create trigger hu13_immutable before update or delete on public.%I
       for each row execute function public.hu13_reject_mutation()', relation_name
    );
  end loop;
end;
$$;

-- The backend validates the bearer subject; only service_role can call these RPCs.
-- One read statement observes a consistent database snapshot.
create or replace function public.hu13_read(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(p) from tracking_plans p where user_id = p_user_id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by recorded_at, event_id)
      from tracking_events e where user_id = p_user_id), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by source_ordinal)
      from improvement_goals g where user_id = p_user_id and tracking_plan_id is not null), '[]'::jsonb),
    'goal_events', coalesce((select jsonb_agg(to_jsonb(g) order by effective_at, recorded_at, event_id)
      from improvement_goal_events g where user_id = p_user_id), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(to_jsonb(e))
      from evaluations e where user_id = p_user_id), '[]'::jsonb),
    'revision', (select event_id from tracking_events where user_id = p_user_id
      order by recorded_at desc, event_id desc limit 1)
  );
$$;

create or replace function public.hu13_commit(
  p_user_id uuid, p_command jsonb, p_expected_revision uuid, p_records jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  existing tracking_events%rowtype;
  current_revision uuid;
  plan_id_value uuid;
  item jsonb;
  result jsonb;
  plan_data jsonb := p_records->'plan';
  stamp timestamptz;
begin
  -- The profile lock also serializes two competing first-baseline commands.
  perform 1 from profiles where id = p_user_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into existing from tracking_events where event_id = (p_command->>'event_id')::uuid;
  if found then
    if existing.user_id <> p_user_id then raise exception 'owner_mismatch'; end if;
    if existing.canonical_request is distinct from p_command then raise exception 'idempotency_conflict'; end if;
    return existing.command_result;
  end if;
  select event_id into current_revision from tracking_events where user_id = p_user_id
    order by recorded_at desc, event_id desc limit 1;
  if current_revision is distinct from p_expected_revision then raise exception 'lineage_conflict'; end if;
  select id into plan_id_value from tracking_plans where user_id = p_user_id for update;
  if plan_id_value is null then
    plan_id_value := (plan_data->>'id')::uuid;
    if plan_id_value is null then raise exception 'invalid_baseline'; end if;
  elsif plan_data is not null and plan_data <> 'null'::jsonb then
    raise exception 'immutable_baseline';
  end if;
  result := p_records->'result';
  if result is null or jsonb_array_length(p_records->'events') < 1
    or (p_records->'events'->0->>'event_id')::uuid <> (p_command->>'event_id')::uuid then
    raise exception 'invalid_command';
  end if;
  for item in select value from jsonb_array_elements(p_records->'evaluations') loop
    insert into evaluations(id, user_id, score, classification, financial_data, recommendations, explanation)
    values ((item->>'id')::uuid, p_user_id, round((item->'result'->>'score')::numeric),
      item->'result'->>'classification',
      jsonb_build_object('input', item->'snapshot', 'result', item->'result', 'provenance', item->'provenance'),
      coalesce(item->'result'->'recommendations', '[]'::jsonb), item->'result'->>'explanation');
    insert into scoring_history(evaluation_id, user_id, score, classification, snapshot,
      component_scores, algorithm_version, channel)
    values ((item->>'id')::uuid, p_user_id, round((item->'result'->>'score')::numeric),
      item->'result'->>'classification',
      jsonb_build_object('input', item->'snapshot', 'result', item->'result', 'provenance', item->'provenance'),
      item->'result'->'component_scores', item->'result'->>'algorithm_version', 'web');
  end loop;
  if plan_data is not null and plan_data <> 'null'::jsonb then
    insert into tracking_plans(id, user_id, baseline_evaluation_id, root_event_id, baseline_at,
      original_plan_snapshot, target_project_snapshot, provenance)
    values (plan_id_value, p_user_id, (plan_data->>'baseline_evaluation_id')::uuid,
      (plan_data->>'root_event_id')::uuid, (plan_data->>'baseline_at')::timestamptz,
      plan_data->'original_plan_snapshot', plan_data->'target_project_snapshot', plan_data->'provenance');
  end if;
  for item in select value from jsonb_array_elements(p_records->'events') loop
    stamp := clock_timestamp();
    -- Relations must name already inserted rows, preventing cycles among new events.
    if item->>'previous' is not null and not exists (
      select 1 from tracking_events where event_id = (item->>'previous')::uuid
        and plan_id = plan_id_value and user_id = p_user_id
    ) then raise exception 'invalid_lineage'; end if;
    if item->>'correction_of' is not null and not exists (
      select 1 from tracking_events where event_id = (item->>'correction_of')::uuid
        and plan_id = plan_id_value and user_id = p_user_id
    ) then raise exception 'invalid_lineage'; end if;
    insert into tracking_events(event_id, plan_id, user_id, event_kind, effective_at,
      recorded_at, reason, patch, recorded_complete_snapshot, previous_event_id,
      correction_of_event_id, correction_effect, evaluation_id, canonical_request,
      command_result, algorithm_version, provenance)
    values ((item->>'event_id')::uuid, plan_id_value, p_user_id, item->>'event_kind',
      (item->>'effective_at')::timestamptz, stamp, item->>'reason', item->'patch',
      item->'recorded_complete_snapshot', (item->>'previous')::uuid,
      (item->>'correction_of')::uuid, item->>'correction_effect', (item->>'evaluation_id')::uuid,
      p_command, result, item->>'algorithm_version', item->'provenance');
  end loop;
  for item in select value from jsonb_array_elements(p_records->'goals') loop
    insert into improvement_goals(id, user_id, evaluation_id, title, description, progress_data,
      tracking_plan_id, baseline_event_id, source_action_type, source_ordinal, metric,
      goal_type, direction, initial_value, target_value, unit, target_at, verification_kind,
      verification_source, definition_version)
    values ((item->>'id')::uuid, p_user_id, (plan_data->>'baseline_evaluation_id')::uuid,
      item->>'title', item->>'description', item, plan_id_value, (plan_data->>'root_event_id')::uuid,
      item->>'source_action_type', (item->>'source_ordinal')::integer, item->>'source',
      item->>'type', item->>'direction', item->'initial_value', item->'target_value', item->>'unit',
      (item->>'target_at')::timestamptz,
      case when (item->>'verifiable')::boolean then 'automatic' else 'manual' end,
      item->'source', item->>'definition_version');
  end loop;
  return result;
end;
$$;

create or replace function public.hu13_confirm_goal(p_user_id uuid, p_goal_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare goal improvement_goals%rowtype; existing improvement_goal_events%rowtype; source_id uuid;
begin
  perform 1 from profiles where id = p_user_id for update;
  select * into goal from improvement_goals
    where id = p_goal_id and user_id = p_user_id and tracking_plan_id is not null;
  if not found then raise exception 'not_found'; end if;
  if goal.verification_kind <> 'manual' then raise exception 'verifiable_data_contradiction'; end if;
  select * into existing from improvement_goal_events where event_id = (p_command->>'event_id')::uuid;
  if found then
    if existing.user_id <> p_user_id then raise exception 'owner_mismatch'; end if;
    if existing.goal_id <> p_goal_id or existing.canonical_request <> p_command then
      raise exception 'idempotency_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  select event_id into source_id from tracking_events where user_id = p_user_id
    order by recorded_at desc, event_id desc limit 1;
  insert into improvement_goal_events(event_id, goal_id, plan_id, user_id, confirmed,
    effective_at, reason, source_event_id, canonical_request)
  values ((p_command->>'event_id')::uuid, p_goal_id, goal.tracking_plan_id, p_user_id,
    (p_command->>'confirmed')::boolean, (p_command->>'effective_at')::timestamptz,
    p_command->>'reason', source_id, p_command) returning * into existing;
  return to_jsonb(existing);
end;
$$;

create or replace function public.hu13_annotate_evaluation(p_user_id uuid, p_evaluation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing evaluation_events%rowtype;
begin
  perform 1 from profiles where id = p_user_id for update;
  perform 1 from evaluations where id = p_evaluation_id and user_id = p_user_id;
  if not found then raise exception 'not_found'; end if;
  if p_command->>'kind' not in ('plan_accepted', 'narrative', 'housing_plan', 'milestone') then
    raise exception 'invalid_annotation';
  end if;
  select * into existing from evaluation_events where event_id = (p_command->>'event_id')::uuid;
  if found then
    if existing.user_id <> p_user_id then raise exception 'owner_mismatch'; end if;
    if existing.evaluation_id <> p_evaluation_id or existing.provenance->'command' <> p_command then
      raise exception 'idempotency_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  insert into evaluation_events(event_id, evaluation_id, user_id, kind, payload, effective_at, provenance)
  values ((p_command->>'event_id')::uuid, p_evaluation_id, p_user_id, p_command->>'kind',
    p_command->'payload', (p_command->>'effective_at')::timestamptz, jsonb_build_object('command', p_command))
  returning * into existing;
  return to_jsonb(existing);
end;
$$;

revoke all on function public.hu13_read(uuid),
  public.hu13_commit(uuid, jsonb, uuid, jsonb),
  public.hu13_confirm_goal(uuid, uuid, jsonb),
  public.hu13_annotate_evaluation(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.hu13_read(uuid),
  public.hu13_commit(uuid, jsonb, uuid, jsonb),
  public.hu13_confirm_goal(uuid, uuid, jsonb),
  public.hu13_annotate_evaluation(uuid, uuid, jsonb) to service_role;

commit;
