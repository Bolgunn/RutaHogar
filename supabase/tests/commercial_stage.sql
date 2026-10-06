-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows. Plan: docs/stories/commercial-stage/PLAN.md.
begin;

insert into public.inmobiliarias(id, nombre) values
  ('a0000000-0000-0000-0000-000000000001', 'CS Test Inmobiliaria A'),
  ('a0000000-0000-0000-0000-000000000002', 'CS Test Inmobiliaria B');
insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'CS Proyecto A', 'Ñuñoa', 'departamento', 3000, 5000),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'CS Proyecto B', 'Maipú', 'departamento', 2000, 3000);

insert into auth.users(id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'cs-lead-a@example.invalid'),
  ('c0000000-0000-0000-0000-000000000002', 'cs-lead-b@example.invalid'),
  ('c0000000-0000-0000-0000-000000000003', 'cs-exec-a@example.invalid'),
  ('c0000000-0000-0000-0000-000000000004', 'cs-admin-a@example.invalid'),
  ('c0000000-0000-0000-0000-000000000005', 'cs-exec-b@example.invalid'),
  ('c0000000-0000-0000-0000-000000000006', 'cs-global-admin@example.invalid'),
  ('c0000000-0000-0000-0000-000000000007', 'cs-lead-onboarding@example.invalid');
insert into public.profiles(id, role, inmobiliaria_id, onboarding_data) values
  ('c0000000-0000-0000-0000-000000000001', 'usuario', null, null),
  ('c0000000-0000-0000-0000-000000000002', 'usuario', null, null),
  ('c0000000-0000-0000-0000-000000000003', 'ejecutivo', 'a0000000-0000-0000-0000-000000000001', null),
  ('c0000000-0000-0000-0000-000000000004', 'admin', 'a0000000-0000-0000-0000-000000000001', null),
  ('c0000000-0000-0000-0000-000000000005', 'ejecutivo', 'a0000000-0000-0000-0000-000000000002', null),
  ('c0000000-0000-0000-0000-000000000006', 'admin', null, null),
  ('c0000000-0000-0000-0000-000000000007', 'usuario', null, '{"comuna_interes": "Ñuñoa"}');

-- Lead A declares A's comuna (with different spacing and case); lead B declares
-- a comuna no one sells in, but favorited B's project; the onboarding-only lead
-- has no evaluation.
insert into public.evaluations(id, user_id, score, classification, target_commune, created_at) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 72, 'Alto', ' ñuñoa ', '2026-01-10Z'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 75, 'Alto', 'Ñuñoa', '2026-02-10Z'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 55, 'Medio', 'Valparaíso', '2026-03-01Z');
insert into public.proyecto_favoritos(usuario_id, proyecto_id) values
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002');
-- Late stages always name a project (commercial-stage-project-tracks): lead A's deal runs on
-- project A's record, where executive A is vinculado.
insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, estado) values
  ('b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'cs-exec-a@example.invalid', 'vinculado');

create function public.cs_expect_error(p_sql text, p_expected text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_expected || '%' then return; end if;
    raise exception 'expected "%" but got "%" for: %', p_expected, sqlerrm, p_sql;
  end;
  raise exception 'expected "%" but the statement succeeded: %', p_expected, p_sql;
end;
$$;
grant execute on function public.cs_expect_error(text, text) to authenticated, anon;

-- 10. Backfill: only eligible (lead, inmobiliaria) pairs with an evaluation,
-- dated at the first evaluation; a second run inserts nothing.
do $$
begin
  perform public.commercial_stage_backfill();
  assert (select count(*) from public.lead_commercial_stage
          where subject_user_id::text like 'c0000000-%'
            and inmobiliaria_id::text like 'a0000000-%') = 2, 'backfill pairs';
  assert exists (select 1 from public.commercial_stage_events
                 where subject_user_id = 'c0000000-0000-0000-0000-000000000001'
                   and inmobiliaria_id = 'a0000000-0000-0000-0000-000000000001'
                   and stage_before is null and stage_after = 'nuevo'
                   and actor_role = 'sistema' and actor_id is null and source = 'backfill'
                   and occurred_at = '2026-01-10Z'), 'lead A backfilled in A';
  assert exists (select 1 from public.lead_commercial_stage
                 where subject_user_id = 'c0000000-0000-0000-0000-000000000002'
                   and inmobiliaria_id = 'a0000000-0000-0000-0000-000000000002'), 'lead B backfilled in B via favorite';
  assert not exists (select 1 from public.lead_commercial_stage
                     where subject_user_id = 'c0000000-0000-0000-0000-000000000007'), 'no evaluation, no backfill';
  assert public.commercial_stage_backfill() = 0, 'backfill is idempotent';
end;
$$;

-- 11. The system is an explicit actor, never a user id; a user is never null.
select public.cs_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role, stage_after, source)
  values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000001', 'sistema', 'contactado', 'job')
$q$, 'commercial_stage_events_system_actor_check');
select public.cs_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, actor_id, actor_role, stage_after, source)
  values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
          null, 'ejecutivo', 'contactado', 'web')
$q$, 'commercial_stage_events_system_actor_check');

-- 8b. Even the table owner cannot rewrite or delete history.
select public.cs_expect_error(
  $q$update public.commercial_stage_events set reason = 'x' where subject_user_id = 'c0000000-0000-0000-0000-000000000001'$q$,
  'immutable_history');
select public.cs_expect_error(
  $q$delete from public.commercial_stage_events where subject_user_id = 'c0000000-0000-0000-0000-000000000001'$q$,
  'immutable_history');

-- As executive A.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000003', true);

-- 1. Forward move that skips stages, no reason needed.
do $$
declare saved jsonb;
begin
  saved := public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'reserva', null, null, 'b0000000-0000-0000-0000-000000000001');
  assert saved ->> 'stage' = 'reserva', 'rpc returns new stage';
  assert (select stage from public.lead_project_commercial_stage
          where subject_user_id = 'c0000000-0000-0000-0000-000000000001') = 'reserva', 'current stage updated';
  assert exists (select 1 from public.commercial_stage_events
                 where id = (saved ->> 'event_id')::uuid
                   and stage_before = 'nuevo' and stage_after = 'reserva'
                   and actor_id = 'c0000000-0000-0000-0000-000000000003'
                   and actor_role = 'ejecutivo' and source = 'web'
                   and subject_user_id = 'c0000000-0000-0000-0000-000000000001'), 'event records actor and subject';
end;
$$;

-- A lead with no row yet (became eligible after the backfill) starts at 'nuevo'.
do $$
begin
  assert public.change_commercial_stage('c0000000-0000-0000-0000-000000000007', 'contactado') ->> 'stage' = 'contactado',
    'implicit nuevo';
  assert (select stage_before from public.commercial_stage_events
          where subject_user_id = 'c0000000-0000-0000-0000-000000000007') = 'nuevo', 'implicit nuevo as before';
end;
$$;

-- 2. A lead that only belongs to B.
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000002', 'contactado')$q$,
  'lead_not_in_scope');
-- Staff are not leads.
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000005', 'contactado')$q$,
  'lead_not_in_scope');

-- 5. Reasons.
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'reason_required');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', '   ', null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'reason_required');
select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', 'La reserva no se concretó', null, 'b0000000-0000-0000-0000-000000000001');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'perdido', null, null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'reason_required');
select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'perdido', 'No contesta hace 60 días', null, 'b0000000-0000-0000-0000-000000000001');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'reason_required');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'venta_cerrada', 'x', null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'invalid_transition');
select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', 'Volvió a escribir', null, 'b0000000-0000-0000-0000-000000000001');

-- 7. Same stage, stale expectation, unknown stage.
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'same_stage');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'reserva', null, 'nuevo', 'b0000000-0000-0000-0000-000000000001')$q$,
  'stale_stage');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'firmado', null, null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'invalid_stage');
select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'venta_cerrada', null, 'contactado', 'b0000000-0000-0000-0000-000000000001');

-- 6. Only an admin can undo a closed sale, only to 'perdido', always with a reason.
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'perdido', 'Desistió', null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'admin_required');

-- 8a. Browser roles cannot write either table directly.
select public.cs_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, actor_id, actor_role, stage_after, source)
  values ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
          'c0000000-0000-0000-0000-000000000003', 'ejecutivo', 'perdido', 'web')
$q$, 'permission denied');
select public.cs_expect_error(
  $q$update public.lead_commercial_stage set stage = 'nuevo'$q$, 'permission denied');
select public.cs_expect_error(
  $q$delete from public.lead_commercial_stage$q$, 'permission denied');
select public.cs_expect_error(
  $q$delete from public.commercial_stage_events$q$, 'permission denied');
select public.cs_expect_error(
  $q$select public.commercial_stage_backfill()$q$, 'permission denied');
select public.cs_expect_error(
  $q$select public.lead_belongs_to_inmobiliaria('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002')$q$,
  'permission denied');

do $$
begin
  assert public.lead_in_my_inmobiliaria('c0000000-0000-0000-0000-000000000001'), 'lead A is in A';
  assert not public.lead_in_my_inmobiliaria('c0000000-0000-0000-0000-000000000002'), 'lead B is not in A';
  -- 4. Executive A reads only A's rows.
  assert not exists (select 1 from public.lead_commercial_stage
                     where inmobiliaria_id = 'a0000000-0000-0000-0000-000000000002'), 'A cannot read B stages';
  assert not exists (select 1 from public.commercial_stage_events
                     where inmobiliaria_id = 'a0000000-0000-0000-0000-000000000002'), 'A cannot read B events';
end;
$$;

-- As admin A.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000004', true);
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'reserva', 'x', null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'invalid_transition');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'perdido', null, null, 'b0000000-0000-0000-0000-000000000001')$q$,
  'reason_required');
do $$
begin
  assert public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'perdido', 'Desistió de la promesa', null, 'b0000000-0000-0000-0000-000000000001')
    ->> 'stage' = 'perdido', 'admin can undo a closed sale';
end;
$$;

-- As executive B: sees only B's rows.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000005', true);
do $$
begin
  assert (select count(*) from public.commercial_stage_events where subject_user_id::text like 'c0000000-%') = 1,
    'B sees only its own backfill event';
  assert public.change_commercial_stage('c0000000-0000-0000-0000-000000000002', 'contactado') ->> 'stage' = 'contactado',
    'B manages its favorite-based lead';
end;
$$;

-- 3. A lead can neither write nor read stages, not even its own.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado')$q$,
  'forbidden');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000002', 'contactado')$q$,
  'forbidden');
do $$
begin
  assert not exists (select 1 from public.lead_commercial_stage), 'lead reads no stage rows';
  assert not exists (select 1 from public.commercial_stage_events), 'lead reads no stage events';
end;
$$;

-- 9. Global admin: reads every tenant, writes nothing.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000006', true);
do $$
begin
  assert (select count(distinct inmobiliaria_id) from public.lead_commercial_stage
          where inmobiliaria_id::text like 'a0000000-%') = 2, 'global admin reads both tenants';
end;
$$;
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado', 'x')$q$,
  'forbidden');

-- anon has no access at all.
set local role anon;
select public.cs_expect_error($q$select 1 from public.lead_commercial_stage$q$, 'permission denied');
select public.cs_expect_error(
  $q$select public.change_commercial_stage('c0000000-0000-0000-0000-000000000001', 'contactado')$q$,
  'permission denied');

reset role;
select 'commercial_stage tests passed' as result;
rollback;
