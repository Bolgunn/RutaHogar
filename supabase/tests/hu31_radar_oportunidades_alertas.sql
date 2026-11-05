-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows.
-- Plan: docs/stories/HU31-radar-oportunidades-alertas/PLAN.md (E1 & E2).
begin;

grant select, insert, update, delete on public.proyectos to authenticated;
grant select, insert, update, delete on public.proyecto_favoritos to authenticated;
grant select, update on public.lead_change_events to authenticated;

insert into public.inmobiliarias(id, nombre) values
  ('a3100000-0000-0000-0000-000000000001', 'HU31 Inmobiliaria Radar');

insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado, bono_pie_pct) values
  ('b3100000-0000-0000-0000-000000000001', 'a3100000-0000-0000-0000-000000000001', 'HU31 Edificio Radar', 'Ñuñoa', 'departamento', 3200, 4200, 'disponible', 0),
  ('b3100000-0000-0000-0000-000000000002', 'a3100000-0000-0000-0000-000000000001', 'HU31 Parque Masivo', 'Macul', 'departamento', 3100, 3900, 'en_construccion', 0);

insert into auth.users(id, email) values
  ('c3100000-0000-0000-0000-000000000001', 'hu31-admin@example.invalid'),
  ('c3100000-0000-0000-0000-000000000002', 'hu31-lead@example.invalid');

insert into public.profiles(id, role, inmobiliaria_id) values
  ('c3100000-0000-0000-0000-000000000001', 'admin_inmobiliario', 'a3100000-0000-0000-0000-000000000001'),
  ('c3100000-0000-0000-0000-000000000002', 'usuario', null);

-- Evaluación previa del lead: capacidad base 2.950 UF, ahorro 590 UF (a 38.000 CLP/UF = $22.420.000).
insert into public.evaluations(id, user_id, score, classification, financial_data) values (
  'd3100000-0000-0000-0000-000000000001',
  'c3100000-0000-0000-0000-000000000002',
  74,
  'Medio',
  jsonb_build_object(
    'input', jsonb_build_object(
      'ingreso_mensual', 2200000,
      'deuda_mensual', 100000,
      'ahorro_disponible', 22420000,
      'uf_value_clp', 38000
    ),
    'result', jsonb_build_object(
      'score', 74,
      'classification', 'Medio',
      'financial_indicators', jsonb_build_object(
        'capacidad_compra_estimada_uf', 2950,
        'capacidad_supuestos', jsonb_build_object(
          'uf_value_clp', 38000,
          'pie_ratio', 0.20
        )
      )
    )
  )
);

-- Caso E1: el lead activa la campana "Notificar cambios" sobre ambos proyectos favoritos.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3100000-0000-0000-0000-000000000002', true);

do $$
declare
  v_res1 jsonb := public.configurar_alerta_favorito('b3100000-0000-0000-0000-000000000001', true);
  v_res2 jsonb := public.configurar_alerta_favorito('b3100000-0000-0000-0000-000000000002', true);
begin
  assert (v_res1 ->> 'notificar_cambios')::boolean = true, 'E1: campana activada en proyecto 1';
  assert (v_res1 ->> 'umbral_precio_min_uf')::numeric = 3200, 'E1: umbral precio min 3200 UF registrado';
  assert (v_res1 ->> 'umbral_precio_max_uf')::numeric = 4200, 'E1: umbral precio max 4200 UF registrado';
  assert (v_res1 ->> 'umbral_bono_pie_pct')::numeric = 0, 'E1: umbral bono pie 0 % registrado';
  assert (v_res2 ->> 'umbral_precio_min_uf')::numeric = 3100, 'E1: umbral precio min 3100 UF registrado';
end;
$$;
reset role;

-- Caso E2 (Vía 1 - Edición manual): la inmobiliaria reduce el precio de HU31 Edificio Radar de 3200 a 2900 UF.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3100000-0000-0000-0000-000000000001', true);

update public.proyectos
set precio_min_uf = 2900,
    precio_max_uf = 3900
where id = 'b3100000-0000-0000-0000-000000000001';

reset role;

-- Verificar evento generado y compatibilidad recalculada (pasa de Cercano a Compatible).
do $$
declare
  v_event public.lead_change_events%rowtype;
begin
  select * into v_event
  from public.lead_change_events
  where user_id = 'c3100000-0000-0000-0000-000000000002'
    and project_id = 'b3100000-0000-0000-0000-000000000001'
    and event_type = 'favorite_project_opportunity';

  assert v_event.id is not null, 'E2 manual: evento registrado';
  assert v_event.seen_at is null, 'E2 manual: evento pendiente para próximo ingreso';
  assert (v_event.payload ->> 'price_drop_uf')::numeric = 300, 'E2 manual: rebaja de 300 UF registrada';
  assert (v_event.current_value ->> 'compatibility_status') = 'Compatible', 'E2 manual: compatibilidad recalculada a Compatible';
end;
$$;

-- Caso E2 (Vía 2 - Carga masiva HU 25): la inmobiliaria actualiza HU31 Parque Masivo aplicando Bono Pie del 5 %.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3100000-0000-0000-0000-000000000001', true);

select public.importar_proyectos('[
  {
    "nombre": "HU31 Parque Masivo",
    "comuna": "Macul",
    "tipo": "departamento",
    "precio_min_uf": 3100,
    "precio_max_uf": 3900,
    "estado": "en_construccion",
    "bono_pie_pct": 5
  }
]');

reset role;

do $$
declare
  v_event public.lead_change_events%rowtype;
begin
  select * into v_event
  from public.lead_change_events
  where user_id = 'c3100000-0000-0000-0000-000000000002'
    and project_id = 'b3100000-0000-0000-0000-000000000002'
    and event_type = 'favorite_project_opportunity';

  assert v_event.id is not null, 'E2 carga masiva HU25: evento registrado por bono pie 5 %';
  assert (v_event.payload ->> 'bono_pie_pct')::numeric = 5, 'E2 carga masiva HU25: bono pie 5 % en payload';
  assert (v_event.current_value ->> 'compatibility_status') = 'Compatible', 'E2 carga masiva HU25: bono pie 5 % eleva compatibilidad a Compatible';
end;
$$;

rollback;
