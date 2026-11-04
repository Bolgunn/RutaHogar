-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows.
-- Plan: docs/stories/HU26-metricas-interes-proyecto/PLAN.md, step 3 (cases 1–10).
-- The source is read by the project-interest-metrics Edge Function as service_role.
begin;

-- Fixtures. Inmobiliaria A sells P1, P2 and P3 (P3 draws no interest); B sells PB.
insert into public.inmobiliarias(id, nombre) values
  ('a2600000-0000-0000-0000-000000000001', 'HU26 Inmobiliaria A'),
  ('a2600000-0000-0000-0000-000000000002', 'HU26 Inmobiliaria B');
insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf) values
  ('b2600000-0000-0000-0000-000000000001', 'a2600000-0000-0000-0000-000000000001', 'HU26 P1', 'Ñuñoa', 'departamento', 3000, 5000),
  ('b2600000-0000-0000-0000-000000000002', 'a2600000-0000-0000-0000-000000000001', 'HU26 P2', 'Providencia', 'departamento', 4000, 6000),
  ('b2600000-0000-0000-0000-000000000003', 'a2600000-0000-0000-0000-000000000001', 'HU26 P3', 'Macul', 'casa', 2500, 3500),
  ('b2600000-0000-0000-0000-000000000004', 'a2600000-0000-0000-0000-000000000002', 'HU26 PB', 'Ñuñoa', 'departamento', 2500, 3500);

-- L1 has an evaluation and declared Ñuñoa, viewed P1 on two past days (and today, through the
-- function, in case 1), favorited P1 and saved two scenarios on P2 (Providencia: outside its
-- scope). L2 has no evaluation and favorited P2. L3 has an evaluation for Macul and only viewed
-- P2. L4 favorited P1 with an evaluation that uses an unconfirmed co-debtor. LB only favorited
-- B's project. E1 is an ejecutivo of A, AI its admin_inmobiliario, AA an admin of A, GA the
-- global admin.
insert into auth.users(id, email) values
  ('c2600000-0000-0000-0000-000000000001', 'hu26-l1@example.invalid'),
  ('c2600000-0000-0000-0000-000000000002', 'hu26-l2@example.invalid'),
  ('c2600000-0000-0000-0000-000000000003', 'hu26-lb@example.invalid'),
  ('c2600000-0000-0000-0000-000000000004', 'hu26-l3@example.invalid'),
  ('c2600000-0000-0000-0000-000000000005', 'hu26-l4@example.invalid'),
  ('c2600000-0000-0000-0000-000000000011', 'hu26-e1@example.invalid'),
  ('c2600000-0000-0000-0000-000000000012', 'hu26-ai@example.invalid'),
  ('c2600000-0000-0000-0000-000000000013', 'hu26-aa@example.invalid'),
  ('c2600000-0000-0000-0000-000000000014', 'hu26-ga@example.invalid');
insert into public.profiles(id, role, inmobiliaria_id, onboarding_data) values
  ('c2600000-0000-0000-0000-000000000001', 'usuario', null, '{"comuna_interes": "Ñuñoa"}'),
  ('c2600000-0000-0000-0000-000000000002', 'usuario', null, null),
  ('c2600000-0000-0000-0000-000000000003', 'usuario', null, null),
  ('c2600000-0000-0000-0000-000000000004', 'usuario', null, '{"comuna_interes": "Macul"}'),
  ('c2600000-0000-0000-0000-000000000005', 'usuario', null, null),
  ('c2600000-0000-0000-0000-000000000011', 'ejecutivo', 'a2600000-0000-0000-0000-000000000001', null),
  ('c2600000-0000-0000-0000-000000000012', 'admin_inmobiliario', 'a2600000-0000-0000-0000-000000000001', null),
  ('c2600000-0000-0000-0000-000000000013', 'admin', 'a2600000-0000-0000-0000-000000000001', null),
  ('c2600000-0000-0000-0000-000000000014', 'admin', null, null);
insert into public.evaluations(id, user_id, score, classification, target_commune, financial_data, created_at) values
  ('d2600000-0000-0000-0000-000000000001', 'c2600000-0000-0000-0000-000000000001', 60, 'Medio', 'Ñuñoa',
   '{"input": {"ahorro_disponible": 1}, "result": {"score": 60}}', '2026-01-10Z'),
  ('d2600000-0000-0000-0000-000000000002', 'c2600000-0000-0000-0000-000000000001', 72, 'Alto', 'Ñuñoa',
   '{"input": {"ahorro_disponible": 2}, "result": {"score": 72}}', '2026-02-10Z'),
  ('d2600000-0000-0000-0000-000000000003', 'c2600000-0000-0000-0000-000000000004', 65, 'Medio', 'Macul',
   '{"input": {"ahorro_disponible": 3, "ingreso_mensual": 3333333}, "result": {"score": 65}}', '2026-02-11Z'),
  ('d2600000-0000-0000-0000-000000000004', 'c2600000-0000-0000-0000-000000000005', 80, 'Alto', 'Ñuñoa',
   '{"input": {"ahorro_disponible": 4, "complemento_renta": true, "ingreso_mensual_complementario": 4444444}, "result": {"score": 80}}', '2026-02-12Z');
insert into public.proyecto_visualizaciones(usuario_id, proyecto_id, dia) values
  ('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000001', '2026-01-11'),
  ('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000001', '2026-01-12'),
  ('c2600000-0000-0000-0000-000000000004', 'b2600000-0000-0000-0000-000000000002', '2026-01-13');
insert into public.proyecto_favoritos(usuario_id, proyecto_id) values
  ('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000001'),
  ('c2600000-0000-0000-0000-000000000002', 'b2600000-0000-0000-0000-000000000002'),
  ('c2600000-0000-0000-0000-000000000005', 'b2600000-0000-0000-0000-000000000001'),
  ('c2600000-0000-0000-0000-000000000003', 'b2600000-0000-0000-0000-000000000004');
insert into public.mortgage_scenarios(user_id, evaluation_id, project_id, name, project_snapshot, input_snapshot,
                                      result_snapshot, market_reference_snapshot, benefit_catalogue_snapshot) values
  ('c2600000-0000-0000-0000-000000000001', 'd2600000-0000-0000-0000-000000000002', 'b2600000-0000-0000-0000-000000000002',
   'HU26 uno', '{}', '{}', '{}', '{}', '{}'),
  ('c2600000-0000-0000-0000-000000000001', 'd2600000-0000-0000-0000-000000000002', 'b2600000-0000-0000-0000-000000000002',
   'HU26 dos', '{}', '{}', '{}', '{}', '{}'),
  ('c2600000-0000-0000-0000-000000000001', 'd2600000-0000-0000-0000-000000000002', null,
   'HU26 sin proyecto', '{}', '{}', '{}', '{}', '{}');

create function public.hu26_view(p_caller uuid, p_proyecto uuid)
returns boolean
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_caller::text, true);
  return public.registrar_visualizacion_proyecto(p_proyecto);
end;
$$;

create function public.hu26_call(p_caller uuid)
returns jsonb
language sql
as $$
  select public.hu26_project_interest_source(p_caller);
$$;

-- The lead whose interactions are exactly the given ones (leads are anonymous).
create function public.hu26_lead(p_result jsonb, p_interacciones jsonb)
returns jsonb
language sql
immutable
as $$
  select l from jsonb_array_elements(p_result -> 'leads') l where l -> 'interacciones' = p_interacciones;
$$;

create function public.hu26_expect_forbidden(p_caller uuid)
returns void
language plpgsql
as $$
begin
  begin
    perform public.hu26_call(p_caller);
  exception when others then
    if sqlstate = '42501' and sqlerrm = 'forbidden' then return; end if;
    raise exception 'expected forbidden for % but got % %', p_caller, sqlstate, sqlerrm;
  end;
  raise exception 'expected forbidden for % but the call succeeded', p_caller;
end;
$$;

grant execute on function public.hu26_view(uuid, uuid), public.hu26_call(uuid),
  public.hu26_lead(jsonb, jsonb), public.hu26_expect_forbidden(uuid) to authenticated, anon, service_role;

-- 3. Browser roles: neither anon nor authenticated can read the source; anon cannot record a
-- view; authenticated cannot touch the table.
set local role anon;
do $$
begin
  begin
    perform public.hu26_project_interest_source('c2600000-0000-0000-0000-000000000012');
    raise exception 'anon could call hu26_project_interest_source';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.registrar_visualizacion_proyecto('b2600000-0000-0000-0000-000000000001');
    raise exception 'anon could call registrar_visualizacion_proyecto';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;

do $$
begin
  perform set_config('request.jwt.claim.sub', 'c2600000-0000-0000-0000-000000000012', true);
  begin
    perform public.hu26_project_interest_source('c2600000-0000-0000-0000-000000000012');
    raise exception '3: an admin''s browser session could call hu26_project_interest_source';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', 'c2600000-0000-0000-0000-000000000001', true);
  begin
    perform 1 from public.proyecto_visualizaciones;
    raise exception '3: authenticated could read proyecto_visualizaciones';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.proyecto_visualizaciones(usuario_id, proyecto_id, dia)
    values ('c2600000-0000-0000-0000-000000000002', 'b2600000-0000-0000-0000-000000000001', '2026-01-01');
    raise exception '3: authenticated could insert into proyecto_visualizaciones';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- 1. A lead's first view of the day counts, the second one that day does not.
do $$
begin
  assert public.hu26_view('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000001'), '1: first view counts';
  assert not public.hu26_view('c2600000-0000-0000-0000-000000000001', 'b2600000-0000-0000-0000-000000000001'), '1: same day not twice';
end;
$$;

-- 2. Staff views and unknown project ids write nothing.
do $$
begin
  assert not public.hu26_view('c2600000-0000-0000-0000-000000000011', 'b2600000-0000-0000-0000-000000000003'), '2: ejecutivo view ignored';
  assert not public.hu26_view('c2600000-0000-0000-0000-000000000012', 'b2600000-0000-0000-0000-000000000003'), '2: admin view ignored';
  assert not public.hu26_view('c2600000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000ff'), '2: unknown project ignored';
end;
$$;

reset role;
set local role service_role;

-- 6. Only the tenant's admins may read.
do $$
begin
  perform public.hu26_expect_forbidden('c2600000-0000-0000-0000-000000000011');
  perform public.hu26_expect_forbidden('c2600000-0000-0000-0000-000000000014');
  perform public.hu26_expect_forbidden('c2600000-0000-0000-0000-000000000001');
end;
$$;

-- 4, 5, 7, 9, 10. admin_inmobiliario of A.
do $$
declare
  r jsonb := public.hu26_call('c2600000-0000-0000-0000-000000000012');
  l1 jsonb;
  l2 jsonb;
  l3 jsonb;
  l4 jsonb;
  ids text;
begin
  select string_agg(p ->> 'id', ',' order by ord) into ids
  from jsonb_array_elements(r -> 'proyectos') with ordinality as t(p, ord);
  assert ids = 'b2600000-0000-0000-0000-000000000001,b2600000-0000-0000-0000-000000000002,b2600000-0000-0000-0000-000000000003',
    format('4: proyectos = A''s three, by nombre (got %s)', ids);
  assert r ? 'now', '4: now present';
  assert jsonb_array_length(r -> 'leads') = 4, format('4/5: L1–L4 only (got %s)', r -> 'leads');

  l1 := public.hu26_lead(r, '[
    {"proyecto_id": "b2600000-0000-0000-0000-000000000001", "en_alcance": true, "visualizaciones": 3, "favorito": true, "simulaciones": 0},
    {"proyecto_id": "b2600000-0000-0000-0000-000000000002", "en_alcance": false, "visualizaciones": 0, "favorito": false, "simulaciones": 2}
  ]');
  assert l1 is not null, format('4: L1 counts (got %s)', r -> 'leads');
  assert l1 -> 'evaluacion_actual' -> 'input' ->> 'ahorro_disponible' = '2', '4: latest evaluation';
  assert l1 -> 'evaluacion_actual' -> 'onboarding' ->> 'comuna_interes' = 'Ñuñoa', '4: onboarding travels';

  l2 := public.hu26_lead(r, '[
    {"proyecto_id": "b2600000-0000-0000-0000-000000000002", "en_alcance": true, "visualizaciones": 0, "favorito": true, "simulaciones": 0}
  ]');
  assert l2 is not null, '4: L2 favorite';
  assert jsonb_typeof(l2 -> 'evaluacion_actual') = 'null', '7: no evaluation → null';

  -- 9. A view outside lead_belongs_to_proyecto counts, but the evaluation stays in the database.
  l3 := public.hu26_lead(r, '[
    {"proyecto_id": "b2600000-0000-0000-0000-000000000002", "en_alcance": false, "visualizaciones": 1, "favorito": false, "simulaciones": 0}
  ]');
  assert l3 is not null, format('9: L3 view counts (got %s)', r -> 'leads');
  assert jsonb_typeof(l3 -> 'evaluacion_actual') = 'null', '9: out-of-scope lead → no evaluation';
  assert r::text not like '%3333333%', '9: L3 income never leaves the database';

  -- 10. An evaluation with a co-debtor HU 30 hides is not sent, even for an in-scope project.
  l4 := public.hu26_lead(r, '[
    {"proyecto_id": "b2600000-0000-0000-0000-000000000001", "en_alcance": true, "visualizaciones": 0, "favorito": true, "simulaciones": 0}
  ]');
  assert l4 is not null, '10: L4 favorite counts';
  assert jsonb_typeof(l4 -> 'evaluacion_actual') = 'null', '10: hidden co-debtor evaluation → null';
  assert r::text not like '%4444444%', '10: co-debtor income never leaves the database';

  assert r::text not like '%b2600000-0000-0000-0000-000000000004%', '5: B''s project never appears';
  assert r::text not like '%c2600000-%', '7: no profile id leaves the database';
  assert r::text not like '%@example.invalid%', '7: no email';
  assert (select string_agg(l ->> 'lead_id', ',' order by l ->> 'lead_id') from jsonb_array_elements(r -> 'leads') l) = '1,2,3,4',
    '7: lead ids are 1..n';

  assert public.hu26_call('c2600000-0000-0000-0000-000000000013') - 'now' = r - 'now', '4: tenant admin sees the same';
end;
$$;

reset role;

-- 8. Erasing a lead (ARCO cancelación) erases its views. L2 is used because it has no
-- evaluation: an evaluated profile cannot be deleted at all (HU 13 immutable history).
insert into public.proyecto_visualizaciones(usuario_id, proyecto_id, dia)
values ('c2600000-0000-0000-0000-000000000002', 'b2600000-0000-0000-0000-000000000002', '2026-01-20');
delete from public.profiles where id = 'c2600000-0000-0000-0000-000000000002';
do $$
begin
  assert not exists (
    select 1 from public.proyecto_visualizaciones where usuario_id = 'c2600000-0000-0000-0000-000000000002'
  ), '8: views cascade with the profile';
end;
$$;

select 'hu26_project_interest_source tests passed' as result;
rollback;
