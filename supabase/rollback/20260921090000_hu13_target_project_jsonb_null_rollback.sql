-- Rollback of 20260921090000_hu13_target_project_jsonb_null.sql.
-- Restores hu13_commit exactly as defined by the original HU13 migration.
begin;

create or replace function public.hu13_commit(
  p_user_id uuid, p_command jsonb, p_expected_revision uuid, p_records jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  existing tracking_events%rowtype;
  current_revision uuid;
  plan_id_value uuid;
  frozen_target_project jsonb;
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
  select id, target_project_snapshot into plan_id_value, frozen_target_project
    from tracking_plans where user_id = p_user_id for update;
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
  elsif frozen_target_project is null
      and jsonb_typeof(p_records->'target_project_snapshot') = 'object'
      and p_records->'target_project_snapshot' <> '{}'::jsonb then
    update tracking_plans
      set target_project_snapshot = p_records->'target_project_snapshot'
      where id = plan_id_value and target_project_snapshot is null;
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

commit;
