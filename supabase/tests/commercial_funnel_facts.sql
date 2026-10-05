-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows.
-- Plan: docs/stories/HU15-dashboard-conversion-tiempos/PLAN.md, step 7 (cases 1–11).
begin;

-- Fixtures. Inmobiliaria A sells P1 (Ñuñoa) and P2 (Providencia); inmobiliaria B sells PB (Ñuñoa).
insert into public.inmobiliarias(id, nombre) values
  ('a5000000-0000-0000-0000-000000000001', 'HU15 Inmobiliaria A'),
  ('a5000000-0000-0000-0000-000000000002', 'HU15 Inmobiliaria B');
insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf) values
  ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'HU15 P1', 'Ñuñoa', 'departamento', 3000, 5000),
  ('b5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'HU15 P2', 'Providencia', 'departamento', 4000, 6000),
  ('b5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000002', 'HU15 PB', 'Ñuñoa', 'departamento', 2500, 3500);

-- L1 declares Ñuñoa (P1 in A, PB in B); its goals were P1, then PB, then a legacy goal without
-- id; its plan targets PB. L2 favorited P2 only. L3 belongs to nothing today but holds a sale on
-- P1 (its favorite was removed). L4 has no evaluation. L5's account was erased: no profile and no
-- evaluation left, only its stage history (which survives erasure by design). LB favorited PB only.
-- L7 is inserted in this transaction with the default created_at.
-- E1 is vinculado on P1 and pendiente on P2; E2 is vinculado on P1. AA is admin of A, AI is
-- admin_inmobiliario of A, GA the global admin, EN an ejecutivo without inmobiliaria.
insert into auth.users(id, email) values
  ('c5000000-0000-0000-0000-000000000001', 'hu15-l1@example.invalid'),
  ('c5000000-0000-0000-0000-000000000002', 'hu15-l2@example.invalid'),
  ('c5000000-0000-0000-0000-000000000003', 'hu15-l3@example.invalid'),
  ('c5000000-0000-0000-0000-000000000004', 'hu15-l4@example.invalid'),
  ('c5000000-0000-0000-0000-000000000005', 'hu15-l5@example.invalid'),
  ('c5000000-0000-0000-0000-000000000006', 'hu15-lb@example.invalid'),
  ('c5000000-0000-0000-0000-000000000007', 'hu15-l7@example.invalid'),
  ('c5000000-0000-0000-0000-000000000011', 'hu15-e1@example.invalid'),
  ('c5000000-0000-0000-0000-000000000012', 'hu15-e2@example.invalid'),
  ('c5000000-0000-0000-0000-000000000013', 'hu15-aa@example.invalid'),
  ('c5000000-0000-0000-0000-000000000014', 'hu15-ai@example.invalid'),
  ('c5000000-0000-0000-0000-000000000015', 'hu15-ga@example.invalid'),
  ('c5000000-0000-0000-0000-000000000016', 'hu15-en@example.invalid');
insert into public.profiles(id, role, inmobiliaria_id, onboarding_data) values
  ('c5000000-0000-0000-0000-000000000001', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c5000000-0000-0000-0000-000000000002', 'usuario', null, null),
  ('c5000000-0000-0000-0000-000000000003', 'usuario', null, null),
  ('c5000000-0000-0000-0000-000000000004', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c5000000-0000-0000-0000-000000000006', 'usuario', null, null),
  ('c5000000-0000-0000-0000-000000000007', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c5000000-0000-0000-0000-000000000011', 'ejecutivo', 'a5000000-0000-0000-0000-000000000001', null),
  ('c5000000-0000-0000-0000-000000000012', 'ejecutivo', 'a5000000-0000-0000-0000-000000000001', null),
  ('c5000000-0000-0000-0000-000000000013', 'admin', 'a5000000-0000-0000-0000-000000000001', null),
  ('c5000000-0000-0000-0000-000000000014', 'admin_inmobiliario', 'a5000000-0000-0000-0000-000000000001', null),
  ('c5000000-0000-0000-0000-000000000015', 'admin', null, null),
  ('c5000000-0000-0000-0000-000000000016', 'ejecutivo', null, null);
insert into public.evaluations(id, user_id, score, classification, target_commune, financial_data, created_at) values
  ('d5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 72, 'Alto', 'Ñuñoa',
   '{"input": {"project_goal": {"id": "b5000000-0000-0000-0000-000000000001", "nombre": "HU15 P1"}}, "result": {"score": 72}}', '2026-01-10Z'),
  ('d5000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 70, 'Alto', 'Ñuñoa',
   '{"input": {"project_goal": {"id": "b5000000-0000-0000-0000-000000000003", "nombre": "HU15 PB"}}}', '2026-02-10Z'),
  ('d5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 74, 'Alto', 'Ñuñoa',
   '{"input": {"project_goal": {"nombre": "Meta antigua"}, "ingreso_mensual": 1}, "result": {"score": 74}}', '2026-03-10Z'),
  ('d5000000-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000002', 55, 'Medio', 'HU15 Ninguna', null, '2026-01-11Z'),
  ('d5000000-0000-0000-0000-000000000005', 'c5000000-0000-0000-0000-000000000003', 80, 'Alto', 'HU15 Ninguna', null, '2026-01-12Z'),
  ('d5000000-0000-0000-0000-000000000007', 'c5000000-0000-0000-0000-000000000006', 60, 'Medio', 'HU15 Ninguna', null, '2026-01-14Z');
insert into public.evaluations(id, user_id, score, classification, target_commune) values
  ('d5000000-0000-0000-0000-000000000008', 'c5000000-0000-0000-0000-000000000007', 60, 'Medio', 'Ñuñoa');
insert into public.proyecto_favoritos(usuario_id, proyecto_id, created_at) values
  ('c5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', '2026-01-11Z'),
  ('c5000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000002', '2026-01-12Z'),
  ('c5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000001', '2026-01-13Z'),
  ('c5000000-0000-0000-0000-000000000006', 'b5000000-0000-0000-0000-000000000003', '2026-01-15Z');
insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, estado) values
  ('b5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000011', 'hu15-e1@example.invalid', 'vinculado'),
  ('b5000000-0000-0000-0000-000000000002', null, 'hu15-e1@example.invalid', 'pendiente'),
  ('b5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000012', 'hu15-e2@example.invalid', 'vinculado');

-- Plans: L1 targets PB (another inmobiliaria), L3 targets P1 and has one progress update.
insert into public.tracking_plans(
  id, user_id, baseline_evaluation_id, root_event_id, baseline_at, original_plan_snapshot,
  target_project_snapshot, provenance
) values
  ('e5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001',
   'd5000000-0000-0000-0000-000000000001', 'f5000000-0000-0000-0000-000000000001',
   '2026-01-20Z', '{}', '{"id": "b5000000-0000-0000-0000-000000000003"}', '{}'),
  ('e5000000-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000003',
   'd5000000-0000-0000-0000-000000000005', 'f5000000-0000-0000-0000-000000000003',
   '2026-01-14Z', '{}', '{"id": "b5000000-0000-0000-0000-000000000001"}', '{}');
insert into public.tracking_events(
  event_id, plan_id, user_id, event_kind, effective_at, recorded_at, reason, patch,
  recorded_complete_snapshot, evaluation_id, previous_event_id, algorithm_version, provenance
) values
  ('f5000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000001', 'baseline', '2026-01-20Z', '2026-01-20Z', 'test', '{}', '{}',
   'd5000000-0000-0000-0000-000000000001', null, 'hu13-lineage-v1', '{}'),
  ('f5000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000003',
   'c5000000-0000-0000-0000-000000000003', 'baseline', '2026-01-14Z', '2026-01-14Z', 'test', '{}', '{}',
   'd5000000-0000-0000-0000-000000000005', null, 'hu13-lineage-v1', '{}'),
  ('f5000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000003',
   'c5000000-0000-0000-0000-000000000003', 'data_update', '2026-01-16Z', '2026-01-16Z', 'test',
   '{"ingreso_mensual": 1}', '{"ingreso_mensual": 1}', null, 'f5000000-0000-0000-0000-000000000003',
   'hu13-lineage-v1', '{}');

-- Stage history, inserted as the owner (the RPC's own rules are project tracks' tests).
insert into public.commercial_stage_events(
  occurred_at, subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
  stage_before, stage_after, reason, source
) values
  ('2026-01-12Z', 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', null,
   'c5000000-0000-0000-0000-000000000011', 'ejecutivo', 'nuevo', 'contactado', 'Llamado de prueba con datos', 'web'),
  ('2026-01-20Z', 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000011', 'ejecutivo', 'nuevo', 'en_negociacion', null, 'web'),
  ('2026-01-25Z', 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002',
   'c5000000-0000-0000-0000-000000000013', 'admin', 'nuevo', 'en_negociacion', null, 'web'),
  ('2026-02-01Z', 'c5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   null, 'sistema', 'en_negociacion', 'perdido', 'proyecto_agotado', 'job'),
  ('2026-01-15Z', 'c5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000011', 'ejecutivo', 'nuevo', 'reserva', null, 'web'),
  ('2026-01-30Z', 'c5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001',
   'c5000000-0000-0000-0000-000000000012', 'ejecutivo', 'reserva', 'venta_cerrada', null, 'web'),
  ('2026-01-14Z', 'c5000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000001', null,
   'c5000000-0000-0000-0000-000000000011', 'ejecutivo', 'nuevo', 'contactado', null, 'web'),
  ('2026-01-16Z', 'c5000000-0000-0000-0000-000000000006', 'a5000000-0000-0000-0000-000000000002', null,
   null, 'sistema', null, 'nuevo', null, 'backfill');

-- L3 stops belonging to P1.
delete from public.proyecto_favoritos
  where usuario_id = 'c5000000-0000-0000-0000-000000000003' and proyecto_id = 'b5000000-0000-0000-0000-000000000001';

set constraints all immediate;

create function public.hu15_call(p_caller uuid)
returns jsonb
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_caller::text, true);
  return public.commercial_funnel_facts();
end;
$$;

create function public.hu15_fact(p_result jsonb, p_first timestamptz)
returns jsonb
language sql
immutable
as $$
  select f from jsonb_array_elements(p_result -> 'facts') f
  where (f ->> 'first_evaluation_at')::timestamptz = p_first;
$$;

create function public.hu15_expect_forbidden(p_caller uuid)
returns void
language plpgsql
as $$
begin
  begin
    perform public.hu15_call(p_caller);
  exception when others then
    if sqlstate = '42501' and sqlerrm = 'forbidden' then return; end if;
    raise exception 'expected forbidden for % but got % %', p_caller, sqlstate, sqlerrm;
  end;
  raise exception 'expected forbidden for % but the call succeeded', p_caller;
end;
$$;

grant execute on function public.hu15_call(uuid), public.hu15_fact(jsonb, timestamptz),
  public.hu15_expect_forbidden(uuid) to authenticated, anon;

-- Browser roles: anon cannot call it at all.
set local role anon;
do $$
begin
  begin
    perform public.commercial_funnel_facts();
    raise exception 'anon could call commercial_funnel_facts';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;

-- 1. admin_inmobiliario of A: proyectos = {P1, P2}; facts = A's eligible leads only
-- (L1, L2, L3 by its record, L7). Tenant admin with role admin sees the same.
do $$
declare
  r jsonb := public.hu15_call('c5000000-0000-0000-0000-000000000014');
  aa jsonb;
  ids text;
begin
  select string_agg(p ->> 'id', ',' order by ord) into ids
  from jsonb_array_elements(r -> 'proyectos') with ordinality as t(p, ord);
  assert ids = 'b5000000-0000-0000-0000-000000000001,b5000000-0000-0000-0000-000000000002', format('1: proyectos %s', ids);
  assert jsonb_array_length(r -> 'facts') = 4, format('1: four facts, got %s', jsonb_array_length(r -> 'facts'));
  assert public.hu15_fact(r, '2026-01-10Z') is not null, '1: L1';
  assert public.hu15_fact(r, '2026-01-11Z') -> 'proyectos' = '["b5000000-0000-0000-0000-000000000002"]', '1: L2 on P2';
  assert public.hu15_fact(r, '2026-01-14Z') is null, '1: LB (inmobiliaria B) absent';
  assert (r -> 'proyectos' -> 0) ?& array['id', 'nombre', 'comuna', 'tipo', 'precio_min_uf', 'precio_max_uf', 'estado'], '1: project shape';
  -- Same scope and leads for an admin with inmobiliaria; por_mi differs (AA wrote L1's P2 event).
  aa := public.hu15_call('c5000000-0000-0000-0000-000000000013');
  assert aa -> 'proyectos' = r -> 'proyectos', '1: admin with inmobiliaria has the same projects';
  assert (select array_agg(f ->> 'first_evaluation_at' order by f ->> 'first_evaluation_at') from jsonb_array_elements(aa -> 'facts') f)
       = (select array_agg(f ->> 'first_evaluation_at' order by f ->> 'first_evaluation_at') from jsonb_array_elements(r -> 'facts') f),
       '1: admin with inmobiliaria has the same leads';
  assert (public.hu15_fact(aa, '2026-01-10Z') -> 'stage_events' -> 2 ->> 'por_mi')::boolean, '1: AA authored L1''s P2 event';
end;
$$;

-- 2 / 3. E1, vinculado on P1 and pendiente on P2: proyectos = {P1}; L2 (P2 only) is absent, and
-- L1's P2 event is absent while its lead-level and P1 events stay.
do $$
declare
  r jsonb := public.hu15_call('c5000000-0000-0000-0000-000000000011');
  l1 jsonb;
begin
  assert jsonb_array_length(r -> 'proyectos') = 1
     and r -> 'proyectos' -> 0 ->> 'id' = 'b5000000-0000-0000-0000-000000000001', '2/3: only P1 in scope';
  assert jsonb_array_length(r -> 'facts') = 3, format('2: three facts, got %s', jsonb_array_length(r -> 'facts'));
  assert public.hu15_fact(r, '2026-01-11Z') is null, '2: L2 absent';
  l1 := public.hu15_fact(r, '2026-01-10Z');
  assert l1 -> 'proyectos' = '["b5000000-0000-0000-0000-000000000001"]', '2: L1 proyectos';
  assert jsonb_array_length(l1 -> 'stage_events') = 3, '2: L1 has three events in scope';
  assert not exists (
    select 1 from jsonb_array_elements(l1 -> 'stage_events') ev
    where ev ->> 'proyecto_id' = 'b5000000-0000-0000-0000-000000000002'), '2: P2 event absent';
  assert not (r::text like '%b5000000-0000-0000-0000-000000000002%'), '3: P2 never appears';
end;
$$;

-- 4. A lead, the global admin and an ejecutivo without inmobiliaria are forbidden.
select public.hu15_expect_forbidden('c5000000-0000-0000-0000-000000000001');
select public.hu15_expect_forbidden('c5000000-0000-0000-0000-000000000015');
select public.hu15_expect_forbidden('c5000000-0000-0000-0000-000000000016');

-- 5. No fact row or stage event carries reason, actor_id, subject_user_id, an email or a profile
-- id; lead_id values are "1" … "n".
do $$
declare
  r jsonb := public.hu15_call('c5000000-0000-0000-0000-000000000014');
  f jsonb;
  ev jsonb;
  lead_ids text;
begin
  for f in select * from jsonb_array_elements(r -> 'facts') loop
    assert (select array_agg(k order by k) from jsonb_object_keys(f) k) = array[
      'confirmed_goal_ats', 'evaluacion_actual', 'evaluaciones', 'favoritos', 'first_evaluation_at',
      'lead_id', 'plan', 'postulaciones', 'progress_update_ats', 'proyectos', 'stage_events'], format('5: fact keys %s', f);
    for ev in select * from jsonb_array_elements(f -> 'stage_events') loop
      assert (select array_agg(k order by k) from jsonb_object_keys(ev) k)
           = array['occurred_at', 'por_mi', 'por_sistema', 'proyecto_id', 'stage_after'], format('5: event keys %s', ev);
    end loop;
  end loop;
  assert (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['facts', 'now', 'proyectos'], '5: top-level keys';
  assert not (r::text like '%c5000000-%'), '5: no profile id';
  assert not (r::text like '%example.invalid%'), '5: no email';
  assert not (r::text like '%Llamado de prueba%') and not (r::text like '%proyecto_agotado%'), '5: no reason';
  select string_agg(x ->> 'lead_id', ',' order by (x ->> 'lead_id')::int) into lead_ids
  from jsonb_array_elements(r -> 'facts') x;
  assert lead_ids = '1,2,3,4', format('5: lead ids %s', lead_ids);
end;
$$;

-- 6. por_sistema exactly for actor_role = 'sistema'; por_mi exactly for the caller's events —
-- L3's sale by E2 reads por_mi = true for E2 and false for E1.
do $$
declare
  as_e1 jsonb := public.hu15_fact(public.hu15_call('c5000000-0000-0000-0000-000000000011'), '2026-01-12Z');
  as_e2 jsonb := public.hu15_fact(public.hu15_call('c5000000-0000-0000-0000-000000000012'), '2026-01-12Z');
  l1 jsonb := public.hu15_fact(public.hu15_call('c5000000-0000-0000-0000-000000000011'), '2026-01-10Z');
  sale_e1 jsonb;
  sale_e2 jsonb;
begin
  select ev into sale_e1 from jsonb_array_elements(as_e1 -> 'stage_events') ev where ev ->> 'stage_after' = 'venta_cerrada';
  select ev into sale_e2 from jsonb_array_elements(as_e2 -> 'stage_events') ev where ev ->> 'stage_after' = 'venta_cerrada';
  assert (sale_e1 ->> 'por_mi')::boolean = false, '6: colleague reads por_mi false';
  assert (sale_e2 ->> 'por_mi')::boolean = true, '6: author reads por_mi true';
  assert (select string_agg(ev ->> 'stage_after' || ':' || (ev ->> 'por_sistema') || ':' || (ev ->> 'por_mi'), ',' order by ord)
          from jsonb_array_elements(l1 -> 'stage_events') with ordinality as t(ev, ord))
       = 'contactado:false:true,en_negociacion:false:true,perdido:true:false', '6: L1 flags for E1, in (occurred_at, id) order';
end;
$$;

-- 7. A legacy project goal without project_goal.id is no application; 9. a goal or plan target of
-- another inmobiliaria reads null and B's project id never leaves the database.
do $$
declare
  r jsonb := public.hu15_call('c5000000-0000-0000-0000-000000000014');
  l1 jsonb := public.hu15_fact(r, '2026-01-10Z');
begin
  assert l1 -> 'postulaciones' = '[{"proyecto_id": "b5000000-0000-0000-0000-000000000001", "first_at": "2026-01-10T00:00:00+00:00"}]'::jsonb
      or (jsonb_array_length(l1 -> 'postulaciones') = 1
          and l1 -> 'postulaciones' -> 0 ->> 'proyecto_id' = 'b5000000-0000-0000-0000-000000000001'
          and (l1 -> 'postulaciones' -> 0 ->> 'first_at')::timestamptz = '2026-01-10Z'), '7: only the P1 application';
  assert jsonb_array_length(l1 -> 'evaluaciones') = 3, '7: three evaluations';
  assert l1 -> 'evaluaciones' -> 0 ->> 'project_goal_id' = 'b5000000-0000-0000-0000-000000000001', '7: in-scope goal kept';
  assert l1 -> 'evaluaciones' -> 1 -> 'project_goal_id' = 'null'::jsonb, '9: PB goal reads null';
  assert l1 -> 'evaluaciones' -> 2 -> 'project_goal_id' = 'null'::jsonb, '7: legacy goal reads null';
  assert l1 -> 'plan' -> 'target_proyecto_id' = 'null'::jsonb, '9: PB plan target reads null';
  assert (l1 -> 'plan' ->> 'baseline_at')::timestamptz = '2026-01-20Z', '9: plan still present';
  assert l1 -> 'evaluacion_actual' -> 'input' ->> 'ingreso_mensual' = '1', 'current evaluation is the latest';
  assert l1 -> 'evaluacion_actual' -> 'onboarding' ->> 'comuna_interes' = 'Ñuñoa', 'onboarding carried';
  assert l1 -> 'favoritos' -> 0 ->> 'proyecto_id' = 'b5000000-0000-0000-0000-000000000001', 'favorite carried';
  assert not (r::text like '%b5000000-0000-0000-0000-000000000003%'), '9: no project id of B';
end;
$$;

-- 8. A lead with no evaluation (L4) and an erased account (L5, stage history only) are absent.
do $$
declare
  r jsonb := public.hu15_call('c5000000-0000-0000-0000-000000000014');
begin
  assert jsonb_array_length(r -> 'facts') = 4, '8: L4 and L5 absent';
  assert not exists (
    select 1 from jsonb_array_elements(r -> 'facts') f
    where f -> 'evaluaciones' = '[]'::jsonb or f -> 'first_evaluation_at' = 'null'::jsonb), '8: every fact has an evaluation';
end;
$$;

-- 10. now is present and not earlier than any timestamp in the result, including L7's evaluation
-- created in this transaction.
do $$
declare
  r jsonb := public.hu15_call('c5000000-0000-0000-0000-000000000014');
  latest timestamptz;
begin
  assert r ? 'now' and (r ->> 'now')::timestamptz is not null, '10: now present';
  select max(v::timestamptz) into latest
  from jsonb_path_query(r -> 'facts', 'strict $.**') j(v0),
       lateral (select v0 #>> '{}' as v) s
  where jsonb_typeof(v0) = 'string' and (v0 #>> '{}') ~ '^\d{4}-\d{2}-\d{2}T';
  assert latest is not null and (r ->> 'now')::timestamptz >= latest, format('10: now %s < %s', r ->> 'now', latest);
  assert (public.hu15_fact(r, now()) -> 'proyectos') = '["b5000000-0000-0000-0000-000000000001"]', '10: L7 present';
end;
$$;

-- 11. L3 stopped belonging to P1 (favorite removed, no comuna) but holds a sale there: still a
-- fact, with P1 in proyectos, its P1 events and its plan target (G28).
do $$
declare
  l3 jsonb := public.hu15_fact(public.hu15_call('c5000000-0000-0000-0000-000000000011'), '2026-01-12Z');
begin
  assert l3 is not null, '11: L3 present';
  assert l3 -> 'proyectos' = '["b5000000-0000-0000-0000-000000000001"]', '11: P1 in proyectos';
  assert (select string_agg(ev ->> 'stage_after', ',' order by ord)
          from jsonb_array_elements(l3 -> 'stage_events') with ordinality as t(ev, ord)) = 'reserva,venta_cerrada', '11: P1 events';
  assert l3 -> 'plan' ->> 'target_proyecto_id' = 'b5000000-0000-0000-0000-000000000001', '11: in-scope plan target kept';
  assert jsonb_array_length(l3 -> 'progress_update_ats') = 1, '11: data_update counted, baseline not';
  assert l3 -> 'favoritos' = '[]'::jsonb, '11: removed favorite gone';
end;
$$;

reset role;
select 'commercial_funnel_facts tests passed' as result;
rollback;
