-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows.
-- Plan: docs/stories/commercial-stage-project-tracks/PLAN.md (cases T1–T16).
begin;

-- Fixtures. Inmobiliaria A sells P1 (Ñuñoa), P2 (Providencia) and P3 (no lead declares it);
-- inmobiliaria B sells PB (Ñuñoa).
insert into public.inmobiliarias(id, nombre) values
  ('a1000000-0000-0000-0000-000000000001', 'PT Inmobiliaria A'),
  ('a1000000-0000-0000-0000-000000000002', 'PT Inmobiliaria B');
insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'PT P1', 'Ñuñoa', 'departamento', 3000, 5000),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'PT P2', 'Providencia', 'departamento', 4000, 6000),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'PT P3', 'PT Sin Leads', 'casa', 2000, 3000),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'PT PB', 'Ñuñoa', 'departamento', 2500, 3500);

-- L1 declares Ñuñoa (P1 in A, PB in B). L2 favorited P2. L3 declares Ñuñoa and favorited P2.
-- L4–L9 declare Ñuñoa (P1, PB); L9 never gets a record. E1 (A) is vinculado on P1 and
-- pendiente on P2; EB (B) is vinculado on PB; AA is admin of A; GA is the global admin.
insert into auth.users(id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'pt-l1@example.invalid'),
  ('c1000000-0000-0000-0000-000000000002', 'pt-l2@example.invalid'),
  ('c1000000-0000-0000-0000-000000000003', 'pt-l3@example.invalid'),
  ('c1000000-0000-0000-0000-000000000004', 'pt-l4@example.invalid'),
  ('c1000000-0000-0000-0000-000000000005', 'pt-l5@example.invalid'),
  ('c1000000-0000-0000-0000-000000000006', 'pt-l6@example.invalid'),
  ('c1000000-0000-0000-0000-000000000007', 'pt-l7@example.invalid'),
  ('c1000000-0000-0000-0000-000000000008', 'pt-l8@example.invalid'),
  ('c1000000-0000-0000-0000-000000000009', 'pt-l9@example.invalid'),
  ('c1000000-0000-0000-0000-000000000011', 'pt-e1@example.invalid'),
  ('c1000000-0000-0000-0000-000000000012', 'pt-aa@example.invalid'),
  ('c1000000-0000-0000-0000-000000000013', 'pt-eb@example.invalid'),
  ('c1000000-0000-0000-0000-000000000014', 'pt-ga@example.invalid'),
  ('c1000000-0000-0000-0000-000000000015', 'pt-ai@example.invalid');
insert into public.profiles(id, role, inmobiliaria_id, onboarding_data) values
  ('c1000000-0000-0000-0000-000000000001', 'usuario', null, null),
  ('c1000000-0000-0000-0000-000000000002', 'usuario', null, null),
  ('c1000000-0000-0000-0000-000000000003', 'usuario', null, null),
  ('c1000000-0000-0000-0000-000000000004', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c1000000-0000-0000-0000-000000000005', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c1000000-0000-0000-0000-000000000006', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c1000000-0000-0000-0000-000000000007', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c1000000-0000-0000-0000-000000000008', 'usuario', null, '{"comuna_alternativa": " Ñuñoa "}'),
  ('c1000000-0000-0000-0000-000000000009', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c1000000-0000-0000-0000-000000000011', 'ejecutivo', 'a1000000-0000-0000-0000-000000000001', null),
  ('c1000000-0000-0000-0000-000000000012', 'admin', 'a1000000-0000-0000-0000-000000000001', null),
  ('c1000000-0000-0000-0000-000000000013', 'ejecutivo', 'a1000000-0000-0000-0000-000000000002', null),
  ('c1000000-0000-0000-0000-000000000014', 'admin', null, null);
insert into public.evaluations(id, user_id, score, classification, target_commune, created_at) values
  ('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 72, 'Alto', 'Ñuñoa', '2026-01-10Z'),
  ('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 55, 'Medio', 'PT Ninguna', '2026-02-10Z'),
  ('d1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 80, 'Alto', ' Ñuñoa', '2026-03-10Z');
insert into public.proyecto_favoritos(usuario_id, proyecto_id) values
  ('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002'),
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002');
insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, estado) values
  ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000011', 'pt-e1@example.invalid', 'vinculado'),
  ('b1000000-0000-0000-0000-000000000002', null, 'pt-e1@example.invalid', 'pendiente'),
  ('b1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000013', 'pt-eb@example.invalid', 'vinculado');

-- admin_inmobiliario only where profiles_role_check admits it (fix/admin-inmobiliario-role).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and pg_get_constraintdef(oid) like '%admin_inmobiliario%'
  ) then
    insert into public.profiles(id, role, inmobiliaria_id)
    values ('c1000000-0000-0000-0000-000000000015', 'admin_inmobiliario', 'a1000000-0000-0000-0000-000000000001');
    perform set_config('pt.admin_inmobiliario', 'on', true);
  else
    perform set_config('pt.admin_inmobiliario', 'off', true);
    raise notice 'profiles_role_check does not admit admin_inmobiliario: its cases are skipped, admin covers R4';
  end if;
end;
$$;

-- Hosted Supabase grants table privileges to authenticated and lets RLS decide; the disposable
-- database does not. The jobs must fire from an admin's RLS-checked update, as in production.
grant select, update on public.proyectos to authenticated;

create function public.pt_expect_error(p_sql text, p_expected text)
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
grant execute on function public.pt_expect_error(text, text) to authenticated, anon;

-- PR #101's body of lead_belongs_to_inmobiliaria, to prove the redefinition preserves it (Q8).
create function public.pt_old_lead_belongs_to_inmobiliaria(p_lead uuid, p_inmobiliaria uuid)
returns boolean
language sql
stable
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

-- T12. lead_belongs_to_proyecto truth table; lead_belongs_to_inmobiliaria = "exists a tenant
-- project the lead belongs to" = PR #101's body, on every fixture pair.
do $$
declare
  pair record;
begin
  assert public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'), 'L1 P1';
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002'), 'L1 not P2';
  assert public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003'), 'L1 PB';
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001'), 'L2 not P1';
  assert public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002'), 'L2 P2';
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003'), 'L2 not PB';
  assert public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001'), 'L3 P1';
  assert public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002'), 'L3 P2';
  assert public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003'), 'L3 PB';
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000001'), 'staff never belongs';
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000001', null), 'null project';
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-0000000000ff'), 'unknown project';

  for pair in
    select p.id as lead, i.id as inmobiliaria
    from public.profiles p
    cross join public.inmobiliarias i
    where p.id::text like 'c1000000-%'
      and i.id::text like 'a1000000-%'
  loop
    assert public.lead_belongs_to_inmobiliaria(pair.lead, pair.inmobiliaria) = exists (
      select 1 from public.proyectos pr
      where pr.inmobiliaria_id = pair.inmobiliaria
        and public.lead_belongs_to_proyecto(pair.lead, pr.id)
    ), format('lead_belongs_to_inmobiliaria = exists over projects for %s / %s', pair.lead, pair.inmobiliaria);
    assert public.lead_belongs_to_inmobiliaria(pair.lead, pair.inmobiliaria)
      = public.pt_old_lead_belongs_to_inmobiliaria(pair.lead, pair.inmobiliaria),
      format('redefinition preserves PR #101 for %s / %s', pair.lead, pair.inmobiliaria);
  end loop;
  assert not public.lead_belongs_to_inmobiliaria('c1000000-0000-0000-0000-000000000001', null), 'null tenant';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);

-- T12. None of the helpers is executable from the browser.
select public.pt_expect_error(
  $q$select public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001')$q$,
  'permission denied');
select public.pt_expect_error(
  $q$select public.lead_belongs_to_inmobiliaria('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001')$q$,
  'permission denied');
select public.pt_expect_error(
  $q$select public.is_ejecutivo_vinculado('b1000000-0000-0000-0000-000000000001')$q$,
  'permission denied');
select public.pt_expect_error(
  $q$select public.commercial_stage_project_access('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'ejecutivo', 'a1000000-0000-0000-0000-000000000001')$q$,
  'permission denied');

-- T15 (scope, before L3 has any record). E1 sees P1 writable, and not P2 (pendiente, no record).
do $$
declare
  scope jsonb := public.commercial_stage_scope('c1000000-0000-0000-0000-000000000003');
begin
  assert (scope ->> 'lead_level_writable')::boolean, 'L3 lead-level writable by E1';
  assert scope -> 'lead_level' = 'null'::jsonb, 'no lead-level row yet';
  assert jsonb_array_length(scope -> 'proyectos') = 1, 'E1 sees only P1 for L3';
  assert scope -> 'proyectos' -> 0 ->> 'id' = 'b1000000-0000-0000-0000-000000000001', 'P1 listed';
  assert (scope -> 'proyectos' -> 0 ->> 'writable')::boolean, 'P1 writable';
  assert scope -> 'proyectos' -> 0 -> 'stage' = 'null'::jsonb, 'no P1 record yet';
end;
$$;

-- T1. Late stages are never lead-level.
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'en_negociacion')$q$,
  'project_required');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'reserva')$q$,
  'project_required');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'venta_cerrada')$q$,
  'project_required');

-- T2. Lead-level perdido only while the lead has no project record. (T5: E1 writes lead-level
-- on L2, a lead of A that is on none of E1's projects.)
do $$
declare saved jsonb;
begin
  saved := public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'perdido', 'No contesta');
  assert saved ->> 'stage' = 'perdido', 'L2 lead-level perdido';
  assert saved -> 'proyecto_id' = 'null'::jsonb, 'returned proyecto_id null';
  assert (select proyecto_id from public.commercial_stage_events where id = (saved ->> 'event_id')::uuid) is null,
    'stored lead-level';
  assert public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'contactado', 'Volvió a escribir')
    ->> 'stage' = 'contactado', 'L2 reopened';
end;
$$;

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'contactado', null, 'nuevo',
  'b1000000-0000-0000-0000-000000000002');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'perdido', 'Desistió')$q$,
  'project_required');

-- T3. A project record is independent of the lead-level one; a missing record is 'nuevo'.
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
do $$
declare saved jsonb;
begin
  saved := public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'en_negociacion', null, 'nuevo',
    'b1000000-0000-0000-0000-000000000001');
  assert saved ->> 'stage' = 'en_negociacion', 'P1 record moved';
  assert saved ->> 'proyecto_id' = 'b1000000-0000-0000-0000-000000000001', 'returned proyecto_id';
  assert not exists (select 1 from public.lead_commercial_stage
                     where subject_user_id = 'c1000000-0000-0000-0000-000000000001'), 'lead-level row untouched';
  assert exists (select 1 from public.lead_project_commercial_stage
                 where subject_user_id = 'c1000000-0000-0000-0000-000000000001'
                   and inmobiliaria_id = 'a1000000-0000-0000-0000-000000000001'
                   and proyecto_id = 'b1000000-0000-0000-0000-000000000001'
                   and stage = 'en_negociacion'
                   and last_event_id = (saved ->> 'event_id')::uuid), 'P1 row with its own stage and last event';
  assert exists (select 1 from public.commercial_stage_events
                 where id = (saved ->> 'event_id')::uuid
                   and proyecto_id = 'b1000000-0000-0000-0000-000000000001'
                   and stage_before = 'nuevo' and stage_after = 'en_negociacion'), 'event names P1, from nuevo';
end;
$$;

-- T4 setup: L3 gets a P2 record (by AA) and a lead-level row (by E1) before its P1 record moves.
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', null, null,
  'b1000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado');

-- T15 (scope, once L3 has a P2 record). E1 now sees P2, read-only.
do $$
declare
  scope jsonb := public.commercial_stage_scope('c1000000-0000-0000-0000-000000000003');
  p2 jsonb;
begin
  assert jsonb_array_length(scope -> 'proyectos') = 2, 'E1 sees P1 and P2 for L3';
  select value into p2 from jsonb_array_elements(scope -> 'proyectos')
  where value ->> 'id' = 'b1000000-0000-0000-0000-000000000002';
  assert p2 ->> 'stage' = 'contactado', 'P2 record stage';
  assert not (p2 ->> 'writable')::boolean, 'P2 read-only for E1 (pendiente)';
  assert scope -> 'lead_level' ->> 'stage' = 'contactado', 'lead-level stage in scope';
end;
$$;

-- T4 / T5. On L3/P1 the transition table applies as on any record; write scope per project.
create temp table pt_l3_others on commit drop as
  select 'lead' as record, stage, last_event_id from public.lead_commercial_stage
  where subject_user_id = 'c1000000-0000-0000-0000-000000000003'
  union all
  select 'p2', stage, last_event_id from public.lead_project_commercial_stage
  where subject_user_id = 'c1000000-0000-0000-0000-000000000003'
    and proyecto_id = 'b1000000-0000-0000-0000-000000000002';

do $$
declare saved jsonb;
begin
  saved := public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'reserva', null, null,
    'b1000000-0000-0000-0000-000000000001');
  assert exists (select 1 from public.commercial_stage_events
                 where id = (saved ->> 'event_id')::uuid
                   and actor_id = 'c1000000-0000-0000-0000-000000000011'
                   and actor_role = 'ejecutivo'
                   and inmobiliaria_id = 'a1000000-0000-0000-0000-000000000001'), 'T5: actor and tenant from session';
end;
$$;
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'reason_required');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'venta_cerrada', null, 'reserva',
  'b1000000-0000-0000-0000-000000000001');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'perdido', 'Desistió', null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'admin_required');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000002')$q$,
  'proyecto_not_in_scope');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000003')$q$,
  'proyecto_not_in_scope');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-0000000000ff')$q$,
  'proyecto_not_in_scope');

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'perdido', 'Desistió de la promesa', 'venta_cerrada',
  'b1000000-0000-0000-0000-000000000001');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'venta_cerrada', 'x', null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'invalid_transition');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'en_negociacion', null, 'contactado',
  'b1000000-0000-0000-0000-000000000002');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'lead_not_in_scope');

do $$
begin
  assert (select stage from public.lead_project_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000003'
            and proyecto_id = 'b1000000-0000-0000-0000-000000000001') = 'perdido', 'L3/P1 undone by admin';
end;
$$;

-- T4: L3's lead-level row never moved while P1 did (P2 moved only by AA's explicit call above).
reset role;
do $$
begin
  assert (select stage from public.lead_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000003')
       = (select stage from pt_l3_others where record = 'lead'), 'L3 lead-level unaffected by P1 moves';
  assert (select last_event_id from public.lead_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000003')
       = (select last_event_id from pt_l3_others where record = 'lead'), 'L3 lead-level last event unaffected';
  assert (select count(*) from public.commercial_stage_events
          where subject_user_id = 'c1000000-0000-0000-0000-000000000003'
            and proyecto_id = 'b1000000-0000-0000-0000-000000000002') = 2, 'L3/P2 has only its own two events';
end;
$$;
set local role authenticated;

-- T5. Executive B cannot touch A's projects.
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000013', true);
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'proyecto_not_in_scope');
-- ... and manages its own vinculado project (also gives the global admin a B row in T13).
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null,
  'b1000000-0000-0000-0000-000000000003');

-- T5 for admin_inmobiliario, when the role exists.
do $$
begin
  if current_setting('pt.admin_inmobiliario') <> 'on' then
    raise notice 'admin_inmobiliario cases skipped';
    return;
  end if;
  perform set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000015', true);
  assert public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'reserva', null, 'en_negociacion',
    'b1000000-0000-0000-0000-000000000002') ->> 'stage' = 'reserva', 'admin_inmobiliario moves any tenant project';
  perform public.pt_expect_error(
    $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001')$q$,
    'lead_not_in_scope');
  perform public.pt_expect_error(
    $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000003')$q$,
    'proyecto_not_in_scope');
  assert public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'en_negociacion', 'Volvió atrás', 'reserva',
    'b1000000-0000-0000-0000-000000000002') ->> 'stage' = 'en_negociacion', 'admin_inmobiliario moves back with reason';
end;
$$;

-- T6. Sticky records: L2 stops belonging to P2, its record stays writable; a new record does not.
reset role;
delete from public.proyecto_favoritos
where usuario_id = 'c1000000-0000-0000-0000-000000000002' and proyecto_id = 'b1000000-0000-0000-0000-000000000002';
do $$
begin
  assert not public.lead_belongs_to_proyecto('c1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002'),
    'L2 no longer belongs to P2';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
do $$
begin
  assert public.change_commercial_stage('c1000000-0000-0000-0000-000000000002', 'en_negociacion', null, 'contactado',
    'b1000000-0000-0000-0000-000000000002') ->> 'stage' = 'en_negociacion', 'sticky record still writable';
end;
$$;
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000002')$q$,
  'lead_not_in_scope');

-- T7. Revival: L3's P1 is perdido; make P2 perdido too.
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'perdido', 'Compró en otra parte', 'en_negociacion',
  'b1000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado')$q$,
  'reason_required');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', '  ')$q$,
  'reason_required');
do $$
declare saved jsonb;
begin
  saved := public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', 'Busca otro proyecto', 'contactado');
  assert saved ->> 'stage' = 'contactado', 'revived';
  assert exists (select 1 from public.commercial_stage_events
                 where id = (saved ->> 'event_id')::uuid
                   and proyecto_id is null
                   and stage_before = 'contactado' and stage_after = 'contactado'
                   and reason = 'Busca otro proyecto'), 'revival event: same stage, lead-level, with reason';
  assert (select last_event_id from public.lead_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000003') = (saved ->> 'event_id')::uuid,
    'revival is the lead-level latest event';
end;
$$;
-- Lead-level perdido stays project_required even when every project is lost.
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'perdido', 'x')$q$,
  'project_required');

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', 'Reabre P2', 'perdido',
  'b1000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'contactado', 'x')$q$,
  'same_stage');
-- A lead with no project record in A: same stage is never revival.
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000009', 'contactado');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000009', 'contactado', 'x')$q$,
  'same_stage');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000009', 'perdido', 'No califica');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000009', 'perdido', 'x')$q$,
  'same_stage');

-- T1 / T7. Below the RPC, the table itself refuses the shapes R1 and R5 forbid.
reset role;
select public.pt_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, actor_id, actor_role, stage_before, stage_after, source)
  values ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
          'c1000000-0000-0000-0000-000000000011', 'ejecutivo', 'nuevo', 'reserva', 'web')
$q$, 'commercial_stage_events_lead_level_stage_check');
select public.pt_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role, stage_before, stage_after, reason, source)
  values ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001',
          'c1000000-0000-0000-0000-000000000011', 'ejecutivo', 'perdido', 'perdido', 'x', 'web')
$q$, 'commercial_stage_events_change_check');
select public.pt_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, actor_id, actor_role, stage_before, stage_after, reason, source)
  values ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
          null, 'sistema', 'contactado', 'contactado', 'x', 'backend')
$q$, 'commercial_stage_events_change_check');
select public.pt_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, actor_id, actor_role, stage_before, stage_after, reason, source)
  values ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
          'c1000000-0000-0000-0000-000000000011', 'ejecutivo', 'contactado', 'contactado', null, 'web')
$q$, 'commercial_stage_events_change_check');
select public.pt_expect_error($q$
  insert into public.commercial_stage_events(subject_user_id, inmobiliaria_id, actor_id, actor_role, stage_before, stage_after, reason, source)
  values ('c1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001',
          null, 'sistema', 'contactado', 'perdido', 'proyecto_agotado', 'job')
$q$, 'commercial_stage_events_job_project_check');

-- T8. Sell-out. P1 records at every stage: L4 nuevo, L5 contactado, L1 and L6 en_negociacion,
-- L7 reserva, L8 venta_cerrada, L3 perdido. L9 belongs to P1 and has no record.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000004', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000004', 'nuevo', 'Se registró por error', 'contactado', 'b1000000-0000-0000-0000-000000000001');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000005', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000006', 'en_negociacion', null, null, 'b1000000-0000-0000-0000-000000000001');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000007', 'reserva', null, null, 'b1000000-0000-0000-0000-000000000001');
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000008', 'venta_cerrada', null, null, 'b1000000-0000-0000-0000-000000000001');

reset role;
create temp table pt_p1_before on commit drop as
  select s.subject_user_id, s.inmobiliaria_id, s.stage, s.last_event_id
  from public.lead_project_commercial_stage s
  where s.proyecto_id = 'b1000000-0000-0000-0000-000000000001';
create temp table pt_counts_before on commit drop as
  select (select count(*) from public.commercial_stage_events where proyecto_id is null) as lead_level_events,
         (select count(*) from public.lead_project_commercial_stage) as project_rows;

do $$
begin
  assert (select array_agg(stage order by stage) from pt_p1_before)
    = array['contactado', 'en_negociacion', 'en_negociacion', 'nuevo', 'perdido', 'reserva', 'venta_cerrada'],
    'P1 fixture covers every stage';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
update public.proyectos set estado = 'agotado' where id = 'b1000000-0000-0000-0000-000000000001';

reset role;
do $$
declare
  rec record;
  closure public.commercial_stage_events;
begin
  for rec in select b.*, s.stage as stage_now, s.last_event_id as last_now
             from pt_p1_before b
             join public.lead_project_commercial_stage s
               on s.subject_user_id = b.subject_user_id
              and s.inmobiliaria_id = b.inmobiliaria_id
              and s.proyecto_id = 'b1000000-0000-0000-0000-000000000001'
  loop
    if rec.stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion') then
      assert rec.stage_now = 'perdido', format('%s closed by the sell-out', rec.subject_user_id);
      select * into closure from public.commercial_stage_events where id = rec.last_now;
      assert closure.actor_role = 'sistema' and closure.actor_id is null and closure.source = 'job'
         and closure.reason = 'proyecto_agotado'
         and closure.proyecto_id = 'b1000000-0000-0000-0000-000000000001'
         and closure.stage_before = rec.stage and closure.stage_after = 'perdido',
        format('%s closure event', rec.subject_user_id);
      assert (select count(*) from public.commercial_stage_events
              where subject_user_id = rec.subject_user_id
                and proyecto_id = 'b1000000-0000-0000-0000-000000000001'
                and source = 'job') = 1, format('%s exactly one job event', rec.subject_user_id);
    else
      assert rec.stage_now = rec.stage and rec.last_now = rec.last_event_id,
        format('%s at %s untouched', rec.subject_user_id, rec.stage);
    end if;
  end loop;
  assert (select count(*) from public.commercial_stage_events where proyecto_id is null)
       = (select lead_level_events from pt_counts_before), 'no lead-level event';
  assert (select count(*) from public.lead_project_commercial_stage)
       = (select project_rows from pt_counts_before), 'no record created';
  assert not exists (select 1 from public.lead_project_commercial_stage
                     where subject_user_id = 'c1000000-0000-0000-0000-000000000009'), 'L9 still has no record';
end;
$$;

-- Re-setting agotado, or updating anything else, adds nothing.
create temp table pt_events_after_selloff on commit drop as
  select count(*) as n from public.commercial_stage_events;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
update public.proyectos set estado = 'agotado' where id = 'b1000000-0000-0000-0000-000000000001';
update public.proyectos set nombre = 'PT P1 bis' where id = 'b1000000-0000-0000-0000-000000000001';
reset role;
do $$
begin
  assert (select count(*) from public.commercial_stage_events) = (select n from pt_events_after_selloff),
    'agotado → agotado and other updates fire nothing';
end;
$$;

-- T9. Restock. AA reopens L4 by hand first: its record must be left alone.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
select public.change_commercial_stage('c1000000-0000-0000-0000-000000000004', 'contactado', 'Sigue interesado en otra torre',
  'perdido', 'b1000000-0000-0000-0000-000000000001');
reset role;
create temp table pt_l4_reopened on commit drop as
  select last_event_id from public.lead_project_commercial_stage
  where subject_user_id = 'c1000000-0000-0000-0000-000000000004'
    and proyecto_id = 'b1000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
update public.proyectos set estado = 'disponible' where id = 'b1000000-0000-0000-0000-000000000001';

reset role;
create function pg_temp.pt_assert_restocked(p_cycle text)
returns void
language plpgsql
as $$
declare
  rec record;
  reopen public.commercial_stage_events;
begin
  for rec in select b.*, s.stage as stage_now, s.last_event_id as last_now
             from pt_p1_before b
             join public.lead_project_commercial_stage s
               on s.subject_user_id = b.subject_user_id
              and s.inmobiliaria_id = b.inmobiliaria_id
              and s.proyecto_id = 'b1000000-0000-0000-0000-000000000001'
             where b.subject_user_id <> 'c1000000-0000-0000-0000-000000000004'
  loop
    assert rec.stage_now = rec.stage, format('%s: %s back at %s', p_cycle, rec.subject_user_id, rec.stage);
    if rec.stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion') then
      select * into reopen from public.commercial_stage_events where id = rec.last_now;
      assert reopen.actor_role = 'sistema' and reopen.actor_id is null and reopen.source = 'job'
         and reopen.reason = 'proyecto_repuesto' and reopen.stage_before = 'perdido'
         and reopen.stage_after = rec.stage,
        format('%s: %s reopening event', p_cycle, rec.subject_user_id);
    else
      assert rec.last_now = rec.last_event_id, format('%s: %s untouched', p_cycle, rec.subject_user_id);
    end if;
  end loop;
end;
$$;

do $$
begin
  perform pg_temp.pt_assert_restocked('first cycle');
  assert (select last_event_id from public.lead_project_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000004'
            and proyecto_id = 'b1000000-0000-0000-0000-000000000001') = (select last_event_id from pt_l4_reopened),
    'hand-reopened record left alone';
  assert (select stage from public.lead_project_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000004'
            and proyecto_id = 'b1000000-0000-0000-0000-000000000001') = 'contactado', 'L4 keeps the person''s stage';
end;
$$;

-- A second cycle closes and reopens again, L4 (now contactado) included.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
update public.proyectos set estado = 'agotado' where id = 'b1000000-0000-0000-0000-000000000001';
reset role;
do $$
begin
  assert (select stage from public.lead_project_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000004'
            and proyecto_id = 'b1000000-0000-0000-0000-000000000001') = 'perdido', 'second sell-out closes L4';
  assert (select count(*) from public.lead_project_commercial_stage
          where proyecto_id = 'b1000000-0000-0000-0000-000000000001' and stage = 'perdido') = 5,
    'second sell-out: L1, L4, L5, L6 closed, L3 stays perdido';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000012', true);
update public.proyectos set estado = 'en_construccion' where id = 'b1000000-0000-0000-0000-000000000001';
reset role;
do $$
begin
  perform pg_temp.pt_assert_restocked('second cycle');
  assert (select stage from public.lead_project_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000004'
            and proyecto_id = 'b1000000-0000-0000-0000-000000000001') = 'contactado', 'second restock reopens L4';
end;
$$;

-- T10 / T11. System events: fixed codes, no lead id, system actor.
do $$
begin
  assert (select count(*) from public.commercial_stage_events where source = 'job') = 15,
    'job events: sell-out 4, restock 3 (L4 reopened by hand), sell-out 4, restock 4';
  assert not exists (select 1 from public.commercial_stage_events
                     where source = 'job'
                       and (reason is null or reason not in ('proyecto_agotado', 'proyecto_repuesto'))), 'T10: fixed codes';
  assert not exists (select 1 from public.commercial_stage_events e
                     join public.profiles p on e.reason like '%' || p.id::text || '%'
                     where e.source = 'job'), 'T10: no lead id in a system reason';
  assert not exists (select 1 from public.commercial_stage_events
                     where source = 'job' and (actor_role <> 'sistema' or actor_id is not null)), 'T11: job actor';
  assert not exists (select 1 from public.commercial_stage_events
                     where source = 'web' and (actor_id is null or actor_role = 'sistema')), 'T11: staff actor kept';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
do $$
declare
  scope jsonb := public.commercial_stage_scope('c1000000-0000-0000-0000-000000000003');
  saved jsonb := public.change_commercial_stage('c1000000-0000-0000-0000-000000000003', 'en_plan_mejora', 'Retoma el proyecto', null,
    'b1000000-0000-0000-0000-000000000001');
  forbidden_keys text[] := array['actor_id', 'reason', 'subject_user_id'];
  key text;
  element jsonb;
begin
  assert (select actor_id from public.commercial_stage_events where id = (saved ->> 'event_id')::uuid)
    = 'c1000000-0000-0000-0000-000000000011', 'T11: staff event actor = auth.uid()';
  foreach key in array forbidden_keys loop
    assert not (scope ? key) and not (saved ? key), format('T11: no %s at top level', key);
    assert not (coalesce(scope -> 'lead_level', '{}'::jsonb) ? key), format('T11: no %s in lead_level', key);
    for element in select value from jsonb_array_elements(scope -> 'proyectos') loop
      assert not (element ? key), format('T11: no %s in a project element', key);
    end loop;
  end loop;
end;
$$;

-- T13. PR #101's guarantees hold on the new table.
select public.pt_expect_error($q$
  insert into public.lead_project_commercial_stage(subject_user_id, inmobiliaria_id, proyecto_id, stage, last_event_id, updated_at)
  select subject_user_id, inmobiliaria_id, 'b1000000-0000-0000-0000-000000000004', stage, last_event_id, updated_at
  from public.lead_project_commercial_stage limit 1
$q$, 'permission denied');
select public.pt_expect_error(
  $q$update public.lead_project_commercial_stage set stage = 'nuevo'$q$, 'permission denied');
select public.pt_expect_error(
  $q$delete from public.lead_project_commercial_stage$q$, 'permission denied');
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000005', 'reserva', null, 'nuevo', 'b1000000-0000-0000-0000-000000000001')$q$,
  'stale_stage');
do $$
begin
  assert not exists (select 1 from public.lead_project_commercial_stage
                     where inmobiliaria_id = 'a1000000-0000-0000-0000-000000000002'), 'E1 cannot read B records';
end;
$$;

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000013', true);
do $$
begin
  assert not exists (select 1 from public.lead_project_commercial_stage
                     where inmobiliaria_id = 'a1000000-0000-0000-0000-000000000001'), 'EB selects 0 of A''s records';
  assert exists (select 1 from public.lead_project_commercial_stage), 'EB reads its own';
end;
$$;

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
do $$
begin
  assert not exists (select 1 from public.lead_project_commercial_stage), 'a lead reads no records';
end;
$$;
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'forbidden');

select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000014', true);
do $$
declare scope jsonb := public.commercial_stage_scope('c1000000-0000-0000-0000-000000000003');
begin
  assert (select count(distinct inmobiliaria_id) from public.lead_project_commercial_stage
          where inmobiliaria_id::text like 'a1000000-%') = 2, 'global admin reads both tenants';
  -- T15: the global admin gets the empty shape.
  assert scope = jsonb_build_object('lead_level_writable', false, 'lead_level', null, 'proyectos', '[]'::jsonb),
    'global admin scope is empty';
end;
$$;
select public.pt_expect_error(
  $q$select public.change_commercial_stage('c1000000-0000-0000-0000-000000000001', 'contactado', null, null, 'b1000000-0000-0000-0000-000000000001')$q$,
  'forbidden');

set local role anon;
select public.pt_expect_error($q$select 1 from public.lead_project_commercial_stage$q$, 'permission denied');
select public.pt_expect_error(
  $q$select public.commercial_stage_scope('c1000000-0000-0000-0000-000000000001')$q$, 'permission denied');

reset role;
select public.pt_expect_error(
  $q$update public.commercial_stage_events set reason = 'x' where source = 'job'$q$, 'immutable_history');
select public.pt_expect_error(
  $q$delete from public.commercial_stage_events where source = 'job'$q$, 'immutable_history');
do $$
begin
  assert not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.lead_project_commercial_stage'::regclass
      and c.contype = 'f'
      and a.attname = 'subject_user_id'
  ), 'no FK on lead_project_commercial_stage.subject_user_id';
  assert exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'commercial_stage_events'
      and indexdef like '%(subject_user_id, inmobiliaria_id, proyecto_id, occurred_at, id)%'
  ), 'record index for HU 15 ordering';
end;
$$;

-- T14. A project with commercial records cannot be deleted; one without can.
do $$
begin
  begin
    delete from public.proyectos where id = 'b1000000-0000-0000-0000-000000000002';
    raise exception 'deleting P2 should have failed';
  exception when foreign_key_violation then
    null;
  end;
  assert exists (select 1 from public.proyectos where id = 'b1000000-0000-0000-0000-000000000002'), 'P2 still there';
  delete from public.proyectos where id = 'b1000000-0000-0000-0000-000000000004';
  assert not exists (select 1 from public.proyectos where id = 'b1000000-0000-0000-0000-000000000004'), 'P3 deleted';
end;
$$;

-- T15. A 4-argument named call, as callers made before this story, still acts lead-level.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000011', true);
do $$
declare saved jsonb;
begin
  saved := public.change_commercial_stage(p_lead => 'c1000000-0000-0000-0000-000000000005', p_to_stage => 'contactado',
    p_reason => null, p_expected_stage => 'nuevo');
  assert saved -> 'proyecto_id' = 'null'::jsonb, 'named 4-argument call is lead-level';
  assert (select stage from public.lead_commercial_stage
          where subject_user_id = 'c1000000-0000-0000-0000-000000000005') = 'contactado', 'lead-level row written';
end;
$$;

-- T16. The migration's guard would pass on these fixtures.
reset role;
do $$
begin
  assert not exists (select 1 from public.commercial_stage_events
                     where proyecto_id is null
                       and stage_after in ('en_negociacion', 'reserva', 'venta_cerrada')), 'no lead-level late event';
  assert not exists (select 1 from public.lead_commercial_stage
                     where stage in ('en_negociacion', 'reserva', 'venta_cerrada')), 'no lead-level late row';
end;
$$;

select 'commercial_stage_project_tracks tests passed' as result;
rollback;
