-- Run with ON_ERROR_STOP against a disposable database; leaves no fixture rows.
begin;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000000001', 'hu13-owner@example.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'hu13-other@example.invalid'),
  ('00000000-0000-0000-0000-000000000003', 'hu13-staff@example.invalid');
insert into public.profiles(id, role) values
  ('00000000-0000-0000-0000-000000000001', 'usuario'),
  ('00000000-0000-0000-0000-000000000002', 'usuario'),
  ('00000000-0000-0000-0000-000000000003', 'ejecutivo');
insert into public.evaluations(id, user_id, score, classification) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 50, 'Medio');
insert into public.tracking_plans(
  id, user_id, baseline_evaluation_id, root_event_id, baseline_at, original_plan_snapshot, provenance
) values (
  '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
  '2026-01-01Z', '{}', '{}'
);
insert into public.tracking_events(
  event_id, plan_id, user_id, event_kind, effective_at, reason, patch,
  recorded_complete_snapshot, evaluation_id, algorithm_version, provenance
) values (
  '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', 'baseline', '2026-01-01Z', 'test',
  '{"ingreso_mensual":1000000}', '{"ingreso_mensual":1000000}',
  '10000000-0000-0000-0000-000000000001', 'hu13-lineage-v1', '{}'
);
insert into public.evaluation_events(
  event_id, evaluation_id, user_id, kind, payload, effective_at, provenance
) values (
  '50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001', 'milestone',
  '{"type":"register_savings"}', '2026-01-02Z', '{}'
);
set constraints all immediate;

do $$
declare
  owner_id uuid := '00000000-0000-0000-0000-000000000001';
  baseline_id uuid := '30000000-0000-0000-0000-000000000001';
  event_id_value uuid := '30000000-0000-0000-0000-000000000003';
  evaluation_id_value uuid := '10000000-0000-0000-0000-000000000003';
  command jsonb;
  records jsonb;
  response jsonb;
  original_count integer;
begin
  command := jsonb_build_object('event_id', event_id_value, 'patch', '{"ahorro_disponible":0}'::jsonb);
  records := jsonb_build_object(
    'plan', null, 'target_project_snapshot', '{"id":"project-1"}'::jsonb,
    'goals', '[]'::jsonb, 'result', jsonb_build_object('event_id', event_id_value),
    'evaluations', jsonb_build_array(jsonb_build_object(
      'id', evaluation_id_value, 'snapshot', '{}'::jsonb, 'provenance', '{}'::jsonb,
      'result', '{"score":50.5,"classification":"Medio","component_scores":{},"algorithm_version":"1.1.0"}'::jsonb)),
    'events', jsonb_build_array(jsonb_build_object(
      'event_id', event_id_value, 'event_kind', 'data_update', 'effective_at', '2026-02-01Z',
      'reason', 'Empeoramiento declarado', 'patch', '{"ahorro_disponible":0}'::jsonb,
      'recorded_complete_snapshot', '{"ingreso_mensual":1000000,"ahorro_disponible":0}'::jsonb,
      'previous', baseline_id, 'evaluation_id', evaluation_id_value,
      'algorithm_version', 'hu13-lineage-v1', 'provenance', '{}'::jsonb)));
  original_count := (select count(*) from evaluations);
  -- Invalid late goal insert must undo the evaluation, scoring history and event.
  begin
    perform hu13_commit(owner_id, command, baseline_id,
      jsonb_set(records, '{goals}', '[{"id":"40000000-0000-0000-0000-000000000001"}]'::jsonb));
    raise exception 'invalid transaction unexpectedly succeeded';
  exception when not_null_violation then null;
  end;
  if (select count(*) from evaluations) <> original_count or exists(select from scoring_history) then
    raise exception 'partial transaction persisted';
  end if;
  response := hu13_commit(owner_id, command, baseline_id, records);
  if response <> hu13_commit(owner_id, command, baseline_id, records) then
    raise exception 'retry changed response';
  end if;
  if (select count(*) from evaluations) <> original_count + 1
     or (select count(*) from scoring_history) <> 1 then raise exception 'retry duplicated rows'; end if;
  if (select financial_data->'result'->>'score' from evaluations where id = evaluation_id_value) <> '50.5' then
    raise exception 'original score precision lost';
  end if;
  if (select target_project_snapshot->>'id' from tracking_plans where user_id = owner_id) <> 'project-1' then
    raise exception 'first later project was not frozen';
  end if;
  if (select recorded_complete_snapshot ? 'project_goal' from tracking_events where event_id = baseline_id) then
    raise exception 'baseline history was rewritten';
  end if;
  begin
    perform hu13_commit(owner_id, command || '{"reason":"different"}', event_id_value, records);
    raise exception 'conflict unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'idempotency_conflict' then raise; end if;
  end;
  begin
    perform hu13_commit(owner_id, '{"event_id":"30000000-0000-0000-0000-000000000004"}',
      baseline_id, records);
    raise exception 'stale append unexpectedly succeeded';
  exception when raise_exception then if sqlerrm <> 'lineage_conflict' then raise; end if;
  end;
  if has_function_privilege('authenticated', 'public.hu13_commit(uuid,jsonb,uuid,jsonb)', 'EXECUTE') then
    raise exception 'client can forge evaluations through RPC';
  end if;
end;
$$;

do $$
begin
  begin
    update public.evaluations set score = 60;
    raise exception 'UPDATE unexpectedly succeeded';
  exception when check_violation then
    if sqlerrm <> 'immutable_history' then raise; end if;
  end;
  begin
    delete from public.tracking_events;
    raise exception 'DELETE unexpectedly succeeded';
  exception when check_violation then
    if sqlerrm <> 'immutable_history' then raise; end if;
  end;
  begin
    update public.tracking_plans set target_project_snapshot = '{"id":"project-2"}'::jsonb;
    raise exception 'frozen target unexpectedly changed';
  exception when check_violation then
    if sqlerrm <> 'immutable_history' then raise; end if;
  end;
  begin
    insert into public.tracking_events(
      event_id, plan_id, user_id, event_kind, effective_at, reason, patch,
      recorded_complete_snapshot, previous_event_id, algorithm_version, provenance
    ) values (
      '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002', 'data_update', '2026-02-01Z', 'test',
      '{}', '{}', '30000000-0000-0000-0000-000000000001', 'hu13-lineage-v1', '{}'
    );
    raise exception 'cross-owner INSERT unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
begin
  if (select count(*) from public.tracking_events) <> 2 then
    raise exception 'owner cannot read own event';
  end if;
  if has_table_privilege('authenticated', 'public.evaluations', 'UPDATE') then
    raise exception 'authenticated can UPDATE evaluations';
  end if;
  begin
    update public.tracking_events set reason = 'changed';
    raise exception 'authenticated UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
begin
  if exists(select from public.tracking_events) or exists(select from public.tracking_plans) then
    raise exception 'cross-owner read succeeded';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$
begin
  if (select count(*) from public.evaluation_events) <> 1 then
    raise exception 'staff cannot read lead evaluation events';
  end if;
end;
$$;
rollback;
