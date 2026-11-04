-- =============================================================
-- HU 29 E2: esquema de pago del pie en cuotas informado por la inmobiliaria
-- =============================================================
-- Columna aditiva y opcional. NULL = la inmobiliaria no ha informado
-- facilidades de pago del pie, y el simulador NO muestra comparación (no se
-- inventan condiciones comerciales).
--
-- Formato:
-- {
--   "ofrece_cuotas": true,
--   "modalidades": ["tarjeta_credito", "pagares"],
--   "numero_cuotas": 18,            -- común (opcional si van en condiciones)
--   "recargo_porcentaje": 0,        -- común
--   "condiciones": {                -- opcional, por modalidad
--     "tarjeta_credito": { "numero_cuotas": 12, "recargo_porcentaje": 0 },
--     "pagares":         { "numero_cuotas": 24, "recargo_porcentaje": 3 }
--   }
-- }
-- Para declarar que el proyecto no ofrece cuotas: {"ofrece_cuotas": false}

alter table public.proyectos
  add column if not exists esquema_pie_inmobiliaria jsonb;

alter table public.proyectos
  drop constraint if exists proyectos_esquema_pie_inmobiliaria_check;

alter table public.proyectos
  add constraint proyectos_esquema_pie_inmobiliaria_check check (
    esquema_pie_inmobiliaria is null
    or (
      jsonb_typeof(esquema_pie_inmobiliaria) = 'object'
      and jsonb_typeof(esquema_pie_inmobiliaria -> 'ofrece_cuotas') = 'boolean'
    )
  );

comment on column public.proyectos.esquema_pie_inmobiliaria is
  'HU 29 E2: facilidades de pago del pie en cuotas (tarjeta de crédito / pagarés) informadas por la inmobiliaria. NULL = no informado.';

-- Datos DEMO (solo inmobiliaria de demo, proyecto referencial): permite ver
-- E2 con condiciones distintas por modalidad. No pisa un valor ya cargado.
update public.proyectos p
set esquema_pie_inmobiliaria = '{
  "ofrece_cuotas": true,
  "modalidades": ["tarjeta_credito", "pagares"],
  "condiciones": {
    "tarjeta_credito": { "numero_cuotas": 12, "recargo_porcentaje": 0 },
    "pagares": { "numero_cuotas": 24, "recargo_porcentaje": 3 }
  }
}'::jsonb
from public.inmobiliarias i
where p.inmobiliaria_id = i.id
  and i.nombre = 'Inmobiliaria Andes (demo)'
  and p.nombre = 'Edificio Plaza Ñuñoa Referencial'
  and p.esquema_pie_inmobiliaria is null;
