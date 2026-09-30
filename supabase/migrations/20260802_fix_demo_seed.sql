-- =============================================================
-- ScoreLeads — Converge el seed de demo a los ejemplos de Spike 1 E4 §9.2
-- =============================================================
-- 20260729_project_catalog.sql ya estaba aplicado cuando su bloque de seed se
-- corrigió, y ese bloque usa `on conflict do nothing`: en un entorno ya migrado
-- los proyectos de demo quedaron con los valores viejos. Esta migración los
-- lleva al estado canónico de forma idempotente, para que el matching de HU 13
-- sea verificable contra los números publicados en el spike:
--
--   Perfil 2 (capacidad 3.060 UF, comuna_objetivo Ñuñoa, clasificación Medio)
--     Altos de Macul   -> afinidad 62,1  "Cercano"    (brecha 140,4 UF)
--     Parque Lo Espejo -> afinidad 70,0  "Compatible" (sin brecha)
--
-- Solo toca las dos inmobiliarias imaginarias de demo. No toca datos de ningún
-- cliente real.

-- 'Parque Ñuñoa' fue reemplazado por 'Parque Lo Espejo' en el set canónico.
delete from public.proyectos p
using public.inmobiliarias i
where p.inmobiliaria_id = i.id
  and i.nombre in ('Inmobiliaria Andes (demo)', 'Inmobiliaria Pacífico (demo)')
  and lower(p.nombre) = lower('Parque Ñuñoa');

insert into public.proyectos (inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado)
select i.id, v.nombre, v.comuna, v.tipo, v.precio_min_uf, v.precio_max_uf, v.estado
from (
  values
    ('Inmobiliaria Andes (demo)', 'Altos de Macul', 'Macul', 'departamento', 2400::numeric, 3200::numeric, 'disponible'),
    ('Inmobiliaria Andes (demo)', 'Parque Lo Espejo', 'Lo Espejo', 'departamento', 1800::numeric, 2600::numeric, 'disponible'),
    ('Inmobiliaria Andes (demo)', 'Mirador Las Condes', 'Las Condes', 'departamento', 8000::numeric, 11000::numeric, 'agotado'),
    ('Inmobiliaria Pacífico (demo)', 'Terrazas de Maipú', 'Maipú', 'casa', 2900::numeric, 3900::numeric, 'en_construccion'),
    ('Inmobiliaria Pacífico (demo)', 'Bosques de Colina', 'Colina', 'casa', 3400::numeric, 5200::numeric, 'disponible'),
    ('Inmobiliaria Pacífico (demo)', 'Puerta Sur', 'San Bernardo', 'departamento', 4500::numeric, 4500::numeric, 'disponible')
) as v(inmobiliaria, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado)
join public.inmobiliarias i on i.nombre = v.inmobiliaria
on conflict (inmobiliaria_id, lower(nombre)) do update
  set comuna        = excluded.comuna,
      tipo          = excluded.tipo,
      precio_min_uf = excluded.precio_min_uf,
      precio_max_uf = excluded.precio_max_uf,
      estado        = excluded.estado;
