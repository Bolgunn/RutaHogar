-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows.
-- Plan: docs/stories/HU25-carga-masiva-proyectos/PLAN.md, step 2 (cases 1–8).
-- Every call runs as `authenticated`, so the proyectos policies decide each row.
begin;

-- Hosted Supabase grants these to `authenticated` by default; a bare PostgreSQL does not.
grant select, insert, update on public.proyectos to authenticated;

insert into public.inmobiliarias(id, nombre) values
  ('a2500000-0000-0000-0000-000000000001', 'HU25 Inmobiliaria A'),
  ('a2500000-0000-0000-0000-000000000002', 'HU25 Inmobiliaria B');
insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado) values
  ('b2500000-0000-0000-0000-000000000001', 'a2500000-0000-0000-0000-000000000001', 'HU25 Existente', 'Macul', 'casa', 2500, 3500, 'disponible');

-- AI: admin_inmobiliario of A · AA: admin of A · GA: global admin · E1: ejecutivo of A · L1: lead.
insert into auth.users(id, email) values
  ('c2500000-0000-0000-0000-000000000001', 'hu25-ai@example.invalid'),
  ('c2500000-0000-0000-0000-000000000002', 'hu25-aa@example.invalid'),
  ('c2500000-0000-0000-0000-000000000003', 'hu25-ga@example.invalid'),
  ('c2500000-0000-0000-0000-000000000004', 'hu25-e1@example.invalid'),
  ('c2500000-0000-0000-0000-000000000005', 'hu25-l1@example.invalid');
insert into public.profiles(id, role, inmobiliaria_id) values
  ('c2500000-0000-0000-0000-000000000001', 'admin_inmobiliario', 'a2500000-0000-0000-0000-000000000001'),
  ('c2500000-0000-0000-0000-000000000002', 'admin', 'a2500000-0000-0000-0000-000000000001'),
  ('c2500000-0000-0000-0000-000000000003', 'admin', null),
  ('c2500000-0000-0000-0000-000000000004', 'ejecutivo', 'a2500000-0000-0000-0000-000000000001'),
  ('c2500000-0000-0000-0000-000000000005', 'usuario', null);

-- Raises unless the call fails with the given SQLSTATE (and message, when given).
create function public.hu25_expect_error(p_inmobiliaria uuid, p_rows jsonb, p_sqlstate text, p_message text default null)
returns void
language plpgsql
as $$
begin
  perform public.importar_proyectos(p_inmobiliaria, p_rows);
  raise exception 'expected % but the call succeeded', p_sqlstate;
exception
  when others then
    if sqlstate <> p_sqlstate or (p_message is not null and sqlerrm <> p_message) then
      raise exception 'expected % %, got % %', p_sqlstate, coalesce(p_message, ''), sqlstate, sqlerrm;
    end if;
end;
$$;

-- Case 1: a tenant admin creates two projects in their inmobiliaria.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000001', true);
do $$
declare
  v_result jsonb := public.importar_proyectos(null, '[
    {"nombre": "HU25 Nuevo Uno", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 4500,
     "estado": "disponible", "descripcion": "Vista a la cordillera", "entrega_estimada": "2027-06"},
    {"nombre": "HU25 Nuevo Dos", "comuna": "Macul", "tipo": "casa", "precio_min_uf": 2800, "precio_max_uf": 2800,
     "estado": "en_construccion", "descripcion": "", "entrega_estimada": null}
  ]');
begin
  assert v_result = '{"creados": 2, "actualizados": 0}'::jsonb, format('case 1 result %s', v_result);
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.proyectos
          where inmobiliaria_id = 'a2500000-0000-0000-0000-000000000001' and nombre like 'HU25 Nuevo %') = 2,
    'case 1: both rows in A';
  assert (select descripcion is null and entrega_estimada is null from public.proyectos where nombre = 'HU25 Nuevo Dos'),
    'case 1: blank optional fields stored as null';
  assert (select entrega_estimada = '2027-06' from public.proyectos where nombre = 'HU25 Nuevo Uno'),
    'case 1: entrega_estimada stored';
end;
$$;

-- Case 2: a name already in the tenant (any case) updates that project and keeps its id.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000001', true);
do $$
declare
  v_result jsonb := public.importar_proyectos(null, '[
    {"nombre": "hu25 existente", "comuna": "Macul", "tipo": "casa", "precio_min_uf": 2600, "precio_max_uf": 3600, "estado": "agotado"},
    {"nombre": "HU25 Nuevo Tres", "comuna": "Santiago", "tipo": "departamento", "precio_min_uf": 2000, "precio_max_uf": 2500, "estado": "disponible"}
  ]');
begin
  assert v_result = '{"creados": 1, "actualizados": 1}'::jsonb, format('case 2 result %s', v_result);
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.proyectos
          where inmobiliaria_id = 'a2500000-0000-0000-0000-000000000001' and lower(nombre) = 'hu25 existente') = 1,
    'case 2: no duplicate created';
  assert (select estado = 'agotado' and precio_min_uf = 2600 and nombre = 'hu25 existente'
          from public.proyectos where id = 'b2500000-0000-0000-0000-000000000001'),
    'case 2: existing row updated in place';
end;
$$;

-- Case 3: a tenant admin naming another inmobiliaria still writes to their own.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000002', true);
select public.importar_proyectos('a2500000-0000-0000-0000-000000000002', '[
  {"nombre": "HU25 Intento B", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"}
]');
reset role;
do $$
begin
  assert (select inmobiliaria_id = 'a2500000-0000-0000-0000-000000000001' from public.proyectos where nombre = 'HU25 Intento B'),
    'case 3: row forced into the caller''s tenant';
  assert not exists (select 1 from public.proyectos where inmobiliaria_id = 'a2500000-0000-0000-0000-000000000002'),
    'case 3: nothing written to B';
end;
$$;

-- Case 4: one row breaking a check aborts the call; its valid neighbour is not written.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000001', true);
select public.hu25_expect_error(null, '[
  {"nombre": "HU25 Valido", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"},
  {"nombre": "HU25 Rango", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 5000, "precio_max_uf": 3100, "estado": "disponible"}
]', '23514');
select public.hu25_expect_error(null, '[
  {"nombre": "HU25 Valido", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"},
  {"nombre": "HU25 Entrega", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible", "entrega_estimada": "jun-27"}
]', '23514');
select public.hu25_expect_error(null, '[
  {"nombre": "HU25 Valido", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"},
  {"nombre": "HU25 Tipo", "comuna": "Ñuñoa", "tipo": "oficina", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"}
]', '23514');
reset role;
do $$
begin
  assert not exists (select 1 from public.proyectos where nombre in ('HU25 Valido', 'HU25 Rango', 'HU25 Entrega', 'HU25 Tipo')),
    'case 4: nothing written';
end;
$$;

-- Case 5: a name repeated inside one call aborts it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000001', true);
select public.hu25_expect_error(null, '[
  {"nombre": "HU25 Repetido", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"},
  {"nombre": " hu25 repetido ", "comuna": "Macul", "tipo": "casa", "precio_min_uf": 2000, "precio_max_uf": 2100, "estado": "disponible"}
]', '22023', 'nombre_repetido');
reset role;
do $$
begin
  assert not exists (select 1 from public.proyectos where lower(nombre) = 'hu25 repetido'), 'case 5: nothing written';
end;
$$;

-- Case 6: the global admin writes where they say; without a target it is forbidden.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000003', true);
select public.importar_proyectos('a2500000-0000-0000-0000-000000000002', '[
  {"nombre": "HU25 Global B", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"}
]');
select public.hu25_expect_error(null, '[
  {"nombre": "HU25 Global sin destino", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"}
]', '42501', 'forbidden');
reset role;
do $$
begin
  assert (select inmobiliaria_id = 'a2500000-0000-0000-0000-000000000002' from public.proyectos where nombre = 'HU25 Global B'),
    'case 6: global admin wrote to B';
  assert not exists (select 1 from public.proyectos where nombre = 'HU25 Global sin destino'), 'case 6: nothing without target';
end;
$$;

-- Case 7: ejecutivo and lead are forbidden; anon cannot execute.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000004', true);
select public.hu25_expect_error('a2500000-0000-0000-0000-000000000001', '[
  {"nombre": "HU25 Ejecutivo", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"}
]', '42501', 'forbidden');
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000005', true);
select public.hu25_expect_error('a2500000-0000-0000-0000-000000000001', '[
  {"nombre": "HU25 Lead", "comuna": "Ñuñoa", "tipo": "departamento", "precio_min_uf": 3000, "precio_max_uf": 3100, "estado": "disponible"}
]', '42501', 'forbidden');
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.importar_proyectos(uuid, jsonb)', 'execute'), 'case 7: anon cannot execute';
  assert has_function_privilege('authenticated', 'public.importar_proyectos(uuid, jsonb)', 'execute'), 'case 7: authenticated can';
  assert not exists (select 1 from public.proyectos where nombre in ('HU25 Ejecutivo', 'HU25 Lead')), 'case 7: nothing written';
end;
$$;

-- Case 8: empty, non-array, a non-object element, a blank name and 501 rows are rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2500000-0000-0000-0000-000000000001', true);
select public.hu25_expect_error(null, '[]', '22023', 'invalid_import');
select public.hu25_expect_error(null, '{"nombre": "HU25 Objeto"}', '22023', 'invalid_import');
select public.hu25_expect_error(null, '[1]', '22023', 'invalid_import');
select public.hu25_expect_error(null, '[{"nombre": "  ", "comuna": "Ñuñoa"}]', '22023', 'invalid_import');
select public.hu25_expect_error(null, (
  select jsonb_agg(jsonb_build_object(
    'nombre', 'HU25 Masivo ' || n, 'comuna', 'Ñuñoa', 'tipo', 'departamento',
    'precio_min_uf', 3000, 'precio_max_uf', 3100, 'estado', 'disponible'))
  from generate_series(1, 501) as n
), '22023', 'invalid_import');
reset role;
do $$
begin
  assert not exists (select 1 from public.proyectos where nombre like 'HU25 Masivo %'), 'case 8: nothing written';
end;
$$;

rollback;
