-- =============================================================
-- RutaHogar — HU 25: carga masiva de proyectos desde archivo
-- =============================================================
-- Diseño: docs/stories/HU25-carga-masiva-proyectos/PLAN.md (Entities).
--
-- · Una función, una transacción: o entran todas las filas del archivo o no
--   entra ninguna. Escribir fila por fila desde el navegador no puede
--   garantizar eso.
-- · SECURITY INVOKER a propósito: cada fila pasa por las policies existentes
--   "Proyectos insert/update admin tenant". La función no otorga nada que un
--   insert directo no permita, y la regla de tenant sigue viviendo en un solo
--   lugar.
-- · El tenant sale siempre de la sesión: no hay argumento para elegirlo, y una
--   clave inmobiliaria_id dentro de una fila se ignora. El admin global, que no
--   tiene inmobiliaria propia, recibe forbidden; cargar proyectos para un
--   cliente desde RutaHogar es otra historia.
-- · Un nombre ya existente en la inmobiliaria (sin distinguir mayúsculas)
--   actualiza ese proyecto; si no, se crea. Es la misma identidad del índice
--   proyectos_nombre_por_inmobiliaria_idx.
-- · 500 filas: tope del plan (Local logic), el mismo que valida el navegador.
--
-- Se aplica después del merge con `supabase db push` (nunca en el editor SQL).
begin;

create or replace function public.importar_proyectos(p_proyectos jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.get_my_inmobiliaria();
  v_creados integer;
  v_actualizados integer;
begin
  if v_tenant is null or not public.can_admin_inmobiliaria(v_tenant) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_proyectos is null or jsonb_typeof(p_proyectos) <> 'array' then
    raise exception 'invalid_import' using errcode = '22023';
  end if;

  if jsonb_array_length(p_proyectos) not between 1 and 500
     or exists (
       select 1 from jsonb_array_elements(p_proyectos) as item
       where jsonb_typeof(item) <> 'object'
          or coalesce(btrim(item ->> 'nombre'), '') = ''
     ) then
    raise exception 'invalid_import' using errcode = '22023';
  end if;

  -- Dos filas con el mismo nombre apuntarían al mismo proyecto y cuál gana
  -- sería arbitrario.
  if exists (
    select 1 from jsonb_array_elements(p_proyectos) as item
    group by lower(btrim(item ->> 'nombre'))
    having count(*) > 1
  ) then
    raise exception 'nombre_repetido' using errcode = '22023';
  end if;

  with upserted as (
    insert into public.proyectos as p (
      inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado,
      descripcion, entrega_estimada
    )
    select
      v_tenant,
      btrim(r.nombre),
      btrim(r.comuna),
      btrim(r.tipo),
      r.precio_min_uf,
      r.precio_max_uf,
      btrim(r.estado),
      nullif(btrim(r.descripcion), ''),
      nullif(btrim(r.entrega_estimada), '')
    from jsonb_to_recordset(p_proyectos) as r(
      nombre text, comuna text, tipo text, precio_min_uf numeric, precio_max_uf numeric,
      estado text, descripcion text, entrega_estimada text
    )
    on conflict (inmobiliaria_id, lower(nombre)) do update set
      nombre = excluded.nombre,
      comuna = excluded.comuna,
      tipo = excluded.tipo,
      precio_min_uf = excluded.precio_min_uf,
      precio_max_uf = excluded.precio_max_uf,
      estado = excluded.estado,
      descripcion = excluded.descripcion,
      entrega_estimada = excluded.entrega_estimada
    returning (p.xmax = 0) as creado
  )
  select count(*) filter (where creado), count(*) filter (where not creado)
    into v_creados, v_actualizados
  from upserted;

  return jsonb_build_object('creados', v_creados, 'actualizados', v_actualizados);
end;
$$;

revoke all on function public.importar_proyectos(jsonb) from public, anon, authenticated;
grant execute on function public.importar_proyectos(jsonb) to authenticated;

commit;
