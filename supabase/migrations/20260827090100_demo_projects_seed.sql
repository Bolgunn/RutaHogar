-- =============================================================
-- ScoreLeads — CATALOGO-UNICO: los 8 proyectos referenciales de la simulación
-- =============================================================
-- Hasta ahora la página de simulación leía estos proyectos de un arreglo
-- hardcodeado en el bundle (`frontend/src/data/mockProjects.js`), en paralelo al
-- catálogo real de HU 7. Ese archivo se elimina y los proyectos pasan a vivir
-- donde vive todo lo demás: el catálogo.
--
-- Mapeo desde el mock:
--   tipo_vivienda      -> tipo
--   valor_uf           -> precio_min_uf y precio_max_uf (proyecto de precio
--                         único; el contrato lo declara válido)
--   estado 'referencial' -> 'disponible'  (no existe tal estado en el catálogo)
--   descripcion_corta  -> descripcion
--   entrega_estimada   -> entrega_estimada
--   dormitorios        -> NO se migra. No se renderiza en ninguna parte y un
--                         proyecto no tiene *un* número de dormitorios: eso es
--                         de la unidad. Lo toma UNIDADES-PROYECTO.
--
-- Se cuelgan de la inmobiliaria de demo que crea 20260802_fix_demo_seed.sql,
-- por nombre y no por UUID. Si ese seed se elimina, este no inserta nada (el
-- join no calza) en vez de fallar.
--
-- `on conflict … do nothing` contra el índice único
-- `proyectos_nombre_por_inmobiliaria_idx`: re-ejecutar es seguro y no pisa
-- ediciones que el administrador haya hecho después desde /admin/proyectos.

insert into public.proyectos (
  inmobiliaria_id, nombre, comuna, tipo,
  precio_min_uf, precio_max_uf, estado, descripcion, entrega_estimada
)
select
  i.id, v.nombre, v.comuna, v.tipo,
  v.valor_uf, v.valor_uf, 'disponible', v.descripcion, v.entrega_estimada
from (
  values
    ('Edificio Plaza Ñuñoa Referencial', 'Ñuñoa', 'departamento', 2800::numeric,
     'Departamento referencial cercano a servicios y conectividad.', '2027-01'),
    ('Centro Santiago Referencial', 'Santiago', 'departamento', 2300::numeric,
     'Alternativa compacta para comparar menor valor objetivo.', '2026-12'),
    ('Macul Oriente Referencial', 'Macul', 'departamento', 2600::numeric,
     'Proyecto referencial de valor medio para simulación temprana.', '2027-03'),
    ('Condominio La Florida Referencial', 'La Florida', 'casa', 3200::numeric,
     'Vivienda referencial para comparar alternativa familiar.', '2027-06'),
    ('Barrio Maipú Referencial', 'Maipú', 'casa', 2700::numeric,
     'Casa referencial de menor valor para explorar accesibilidad.', '2026-11'),
    ('San Miguel Metro Referencial', 'San Miguel', 'departamento', 2450::numeric,
     'Departamento referencial en comuna alternativa.', '2027-04'),
    ('Puente Alto Familiar Referencial', 'Puente Alto', 'casa', 2100::numeric,
     'Vivienda referencial de entrada para comparar brechas.', '2026-10'),
    ('Providencia Parque Referencial', 'Providencia', 'departamento', 4200::numeric,
     'Alternativa exigente para contrastar valor objetivo alto.', '2027-08')
) as v(nombre, comuna, tipo, valor_uf, descripcion, entrega_estimada)
join public.inmobiliarias i on i.nombre = 'Inmobiliaria Andes (demo)'
on conflict (inmobiliaria_id, lower(nombre)) do nothing;
