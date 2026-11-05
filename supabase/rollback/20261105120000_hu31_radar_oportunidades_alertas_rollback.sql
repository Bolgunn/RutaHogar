-- Rollback for 20261105120000_hu31_radar_oportunidades_alertas.sql
--
-- Además de quitar los objetos nuevos, devuelve a su versión anterior las
-- funciones que la migración reescribió: importar_proyectos (HU 25) y
-- lead_changes_due_leads (HU 20) leen columnas que este rollback elimina, así
-- que dejarlas como están rompería la carga masiva y el job diario.
-- Los eventos y preferencias del tipo nuevo se borran: los checks originales
-- no los aceptan.
begin;

drop trigger if exists proyectos_evaluar_alertas_favoritos on public.proyectos;
drop function if exists public.evaluar_alertas_oportunidad_proyecto();
drop function if exists public.calcular_compatibilidad_oportunidad_uf(jsonb, numeric, numeric);
drop function if exists public.oportunidad_fmt_uf(numeric);
drop function if exists public.oportunidad_num(jsonb);
drop function if exists public.configurar_alerta_favorito(uuid, boolean);

-- importar_proyectos tal como la dejó 20261103210000_hu25_importar_proyectos.sql
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
    -- Misma normalización que createProject/updateProject en
    -- frontend/src/services/projectService.js (trim, vacío → null): si una cambia,
    -- cambiar la otra.
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
      -- Las columnas opcionales pueden faltar en el archivo o venir vacías: en
      -- ese caso se conserva lo guardado en vez de borrarlo.
      descripcion = coalesce(excluded.descripcion, p.descripcion),
      entrega_estimada = coalesce(excluded.entrega_estimada, p.entrega_estimada)
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

-- lead_changes_due_leads tal como la dejaron 20261006120000_lead_change_events.sql
-- y los grants de 20261024120500_security_lead_change_events.sql
create or replace function public.lead_changes_due_leads(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_data order by row_data->>'user_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'user_id', e.user_id,
      'email', u.email,
      'latest_evaluation_id', e.id,
      'latest_evaluation_at', e.created_at,
      'classification', e.classification,
      'score', e.score,
      'financial_data', e.financial_data,
      'previous_evaluation', prev.previous_evaluation,
      'last_lead_change_email_at', (
        select max(n.sent_at)
        from public.lead_change_notifications n
        where n.user_id = e.user_id and n.channel = 'email' and n.status = 'sent'
      )
    ) as row_data
    from (
      select distinct on (ev.user_id) ev.*
      from public.evaluations ev
      where ev.user_id is not null
      order by ev.user_id, ev.created_at desc nulls last, ev.id desc
    ) e
    left join auth.users u on u.id = e.user_id
    left join lateral (
      select jsonb_build_object(
        'id', p.id,
        'created_at', p.created_at,
        'classification', p.classification,
        'score', p.score,
        'financial_data', p.financial_data
      ) as previous_evaluation
      from public.evaluations p
      where p.user_id = e.user_id and p.id <> e.id
      order by p.created_at desc nulls last, p.id desc
      limit 1
    ) prev on true
    order by e.created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) rows;
$$;

revoke all on function public.lead_changes_due_leads(integer) from public, anon, authenticated;
grant execute on function public.lead_changes_due_leads(integer) to service_role;

delete from public.lead_change_events
where event_type = 'favorite_project_opportunity' or source = 'catalog_update';

delete from public.lead_notification_preferences
where event_type = 'favorite_project_opportunity';

alter table public.lead_change_events
  drop constraint if exists lead_change_events_type_check,
  add constraint lead_change_events_type_check check (event_type in (
    'project_compatible_unlocked',
    'score_band_improved',
    'monthly_plan_summary',
    'uf_reachability_crossed',
    'quick_update_submitted'
  ));

alter table public.lead_change_events
  drop constraint if exists lead_change_events_source_check,
  add constraint lead_change_events_source_check check (source in ('job', 'landing', 'quick_update', 'backfill'));

alter table public.lead_notification_preferences
  drop constraint if exists lead_notification_preferences_type_check,
  add constraint lead_notification_preferences_type_check check (event_type in (
    'project_compatible_unlocked',
    'score_band_improved',
    'monthly_plan_summary',
    'uf_reachability_crossed',
    'quick_update_submitted'
  ));

-- Sin policy de UPDATE, como en 20260901090000_proyecto_favoritos.sql.
drop policy if exists "Proyecto favoritos update propio" on public.proyecto_favoritos;

alter table public.proyecto_favoritos
  drop column if exists alerta_activada_at,
  drop column if exists umbral_bono_pie_pct,
  drop column if exists umbral_precio_max_uf,
  drop column if exists umbral_precio_min_uf,
  drop column if exists notificar_cambios;

alter table public.proyectos
  drop constraint if exists proyectos_bono_pie_pct_check,
  drop column if exists bono_pie_pct;

commit;
