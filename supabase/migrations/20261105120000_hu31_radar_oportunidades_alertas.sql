-- =============================================================
-- RutaHogar — HU 31: Radar de oportunidades y alertas por variación de condiciones de mercado
-- =============================================================
-- Diseño: docs/stories/HU31-radar-oportunidades-alertas/PLAN.md
--
-- · E1: Extiende public.proyecto_favoritos con `notificar_cambios` y los
--   umbrales vigentes del proyecto (`umbral_precio_min_uf`,
--   `umbral_precio_max_uf`, `umbral_bono_pie_pct`, `alerta_activada_at`).
--   La función `configurar_alerta_favorito(p_proyecto_id, p_activar)` es
--   SECURITY INVOKER y toma los umbrales directamente de public.proyectos.
-- · E2: Agrega columna aditiva `bono_pie_pct` (0..30 %) a public.proyectos,
--   extiende `importar_proyectos()` (HU 25) para aceptarla opcionalmente sin
--   alterar el contrato de las 8 columnas base, y dispara el recálculo de
--   compatibilidad y registro de evento en `public.lead_change_events` tanto
--   por edición individual como por carga masiva.
-- =============================================================

begin;

-- 1. Columna aditiva de promoción comercial (bono pie %) en public.proyectos
alter table public.proyectos
  add column if not exists bono_pie_pct numeric not null default 0;

alter table public.proyectos
  drop constraint if exists proyectos_bono_pie_pct_check;

alter table public.proyectos
  add constraint proyectos_bono_pie_pct_check check (
    bono_pie_pct >= 0 and bono_pie_pct <= 30
  );

comment on column public.proyectos.bono_pie_pct is
  'HU 31 E2: porcentaje de bono pie promocional aplicado por la inmobiliaria (0 a 30). 0 = sin bono pie.';

-- 2. Umbrales de seguimiento y campana de alertas en public.proyecto_favoritos (E1)
alter table public.proyecto_favoritos
  add column if not exists notificar_cambios boolean not null default false;

alter table public.proyecto_favoritos
  add column if not exists umbral_precio_min_uf numeric;

alter table public.proyecto_favoritos
  add column if not exists umbral_precio_max_uf numeric;

alter table public.proyecto_favoritos
  add column if not exists umbral_bono_pie_pct numeric not null default 0;

alter table public.proyecto_favoritos
  add column if not exists alerta_activada_at timestamptz;

drop policy if exists "Proyecto favoritos update propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos update propio"
  on public.proyecto_favoritos
  for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

grant select, insert, update, delete on public.proyecto_favoritos to authenticated;

-- 3. Ampliación de tipos de evento en HU 20 (lead_change_events / preferencias)
alter table public.lead_change_events
  drop constraint if exists lead_change_events_type_check;

alter table public.lead_change_events
  add constraint lead_change_events_type_check check (event_type in (
    'project_compatible_unlocked',
    'score_band_improved',
    'monthly_plan_summary',
    'uf_reachability_crossed',
    'quick_update_submitted',
    'favorite_project_opportunity'
  ));

alter table public.lead_change_events
  drop constraint if exists lead_change_events_source_check;

alter table public.lead_change_events
  add constraint lead_change_events_source_check check (source in (
    'job',
    'landing',
    'quick_update',
    'backfill',
    'catalog_update'
  ));

alter table public.lead_notification_preferences
  drop constraint if exists lead_notification_preferences_type_check;

alter table public.lead_notification_preferences
  add constraint lead_notification_preferences_type_check check (event_type in (
    'project_compatible_unlocked',
    'score_band_improved',
    'monthly_plan_summary',
    'uf_reachability_crossed',
    'quick_update_submitted',
    'favorite_project_opportunity'
  ));

-- 4. RPC E1: activar o desactivar la campana "Notificar cambios" sobre un favorito
create or replace function public.configurar_alerta_favorito(
  p_proyecto_id uuid,
  p_activar boolean default true
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_min numeric;
  v_max numeric;
  v_bono numeric;
  v_saved public.proyecto_favoritos%rowtype;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select p.precio_min_uf, p.precio_max_uf, coalesce(p.bono_pie_pct, 0)
    into v_min, v_max, v_bono
  from public.proyectos p
  where p.id = p_proyecto_id;

  if not found then
    raise exception 'project_not_found' using errcode = '23503';
  end if;

  if coalesce(p_activar, false) then
    insert into public.proyecto_favoritos (
      usuario_id,
      proyecto_id,
      notificar_cambios,
      umbral_precio_min_uf,
      umbral_precio_max_uf,
      umbral_bono_pie_pct,
      alerta_activada_at
    ) values (
      v_uid,
      p_proyecto_id,
      true,
      v_min,
      v_max,
      v_bono,
      clock_timestamp()
    )
    on conflict (usuario_id, proyecto_id) do update set
      notificar_cambios = true,
      umbral_precio_min_uf = excluded.umbral_precio_min_uf,
      umbral_precio_max_uf = excluded.umbral_precio_max_uf,
      umbral_bono_pie_pct = excluded.umbral_bono_pie_pct,
      alerta_activada_at = excluded.alerta_activada_at
    returning * into v_saved;
  else
    update public.proyecto_favoritos
    set notificar_cambios = false
    where usuario_id = v_uid
      and proyecto_id = p_proyecto_id
    returning * into v_saved;

    if not found then
      return jsonb_build_object(
        'usuario_id', v_uid,
        'proyecto_id', p_proyecto_id,
        'notificar_cambios', false,
        'umbral_precio_min_uf', null,
        'umbral_precio_max_uf', null,
        'umbral_bono_pie_pct', 0,
        'alerta_activada_at', null
      );
    end if;
  end if;

  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.configurar_alerta_favorito(uuid, boolean) from public, anon, authenticated;
grant execute on function public.configurar_alerta_favorito(uuid, boolean) to authenticated;

-- 5. Compatibilidad referencial con precio UF y bono pie.
-- Espejo de recalculateOpportunityCompatibility (frontend/src/lib/simulation/opportunityRadar.js)
-- y de recalculate_favorite_compatibility (backend/app/lead_changes/service.py):
-- mismos umbrales, mismos estados y mismas etiquetas. Si una cambia, cambiar las tres.

-- financial_data viene de cada evaluación: un valor no numérico se trata como
-- ausente en vez de abortar la edición del catálogo con un error de cast.
create or replace function public.oportunidad_num(p_value jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case jsonb_typeof(p_value)
    when 'number' then (p_value #>> '{}')::numeric
    when 'string' then case
      when btrim(p_value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p_value #>> '{}')::numeric
    end
  end;
$$;

-- UF redondeadas con punto de miles, igual que toLocaleString("es-CL") en el
-- frontend. Un patrón con D y FM deja el separador decimal colgando ("3200.").
create or replace function public.oportunidad_fmt_uf(p_value numeric)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(to_char(round(coalesce(p_value, 0)), 'FM999,999,999,990'), ',', '.');
$$;

create or replace function public.calcular_compatibilidad_oportunidad_uf(
  p_financial_data jsonb,
  p_precio_min_uf numeric,
  p_bono_pie_pct numeric default 0
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_ctx jsonb := case when jsonb_typeof(p_financial_data) = 'object' then p_financial_data else '{}'::jsonb end;
  v_result jsonb;
  v_input jsonb;
  v_indicators jsonb;
  v_market jsonb;
  v_uf numeric;
  v_ahorro numeric;
  v_cap numeric;
  v_precio numeric := p_precio_min_uf;
  v_bono numeric := greatest(0, least(30, coalesce(p_bono_pie_pct, 0)));
  v_pie_min_rate numeric;
  v_pie_rec_rate numeric;
  v_ahorro_uf numeric;
  v_aporte numeric;
  v_cap_ef numeric;
  v_pie_min_req numeric;
  v_status text := 'no_compatible';
  v_label text := 'Aún fuera de alcance';
begin
  v_result := case
    when jsonb_typeof(v_ctx -> 'result') = 'object' then v_ctx -> 'result'
    when jsonb_typeof(v_ctx -> 'result_snapshot') = 'object' then v_ctx -> 'result_snapshot'
    else v_ctx
  end;
  v_input := case
    when jsonb_typeof(v_ctx -> 'input') = 'object' then v_ctx -> 'input'
    when jsonb_typeof(v_ctx -> 'input_snapshot') = 'object' then v_ctx -> 'input_snapshot'
    else v_ctx
  end;
  v_indicators := case
    when jsonb_typeof(v_result -> 'financial_indicators') = 'object' then v_result -> 'financial_indicators'
    when jsonb_typeof(v_ctx -> 'financial_indicators') = 'object' then v_ctx -> 'financial_indicators'
    else '{}'::jsonb
  end;
  v_market := case
    when jsonb_typeof(v_result -> 'market_context') = 'object' then v_result -> 'market_context'
    when jsonb_typeof(v_indicators #> '{capacidad_supuestos,market_snapshot}') = 'object'
      then v_indicators #> '{capacidad_supuestos,market_snapshot}'
    when jsonb_typeof(v_ctx -> 'market_context') = 'object' then v_ctx -> 'market_context'
    else '{}'::jsonb
  end;

  v_uf := coalesce(
    nullif(public.oportunidad_num(v_market -> 'uf_value'), 0),
    nullif(public.oportunidad_num(v_market -> 'uf_value_clp'), 0),
    nullif(public.oportunidad_num(v_ctx -> 'uf_value_clp'), 0),
    nullif(public.oportunidad_num(v_input -> 'uf_value_clp'), 0),
    39000
  );
  if v_uf <= 0 then
    v_uf := 39000;
  end if;

  v_ahorro := coalesce(
    public.oportunidad_num(v_input -> 'ahorro_disponible'),
    public.oportunidad_num(v_input -> 'ahorro'),
    public.oportunidad_num(v_ctx -> 'ahorro_disponible')
  );
  v_cap := coalesce(
    public.oportunidad_num(v_indicators -> 'capacidad_compra_estimada_uf'),
    public.oportunidad_num(v_ctx -> 'capacidad_compra_estimada_uf')
  );
  if v_cap is null and v_ahorro > 0 then
    v_cap := round(v_ahorro / v_uf / 0.1, 1);
  end if;

  v_pie_min_rate := greatest(0.05, 0.10 - v_bono / 100);
  v_pie_rec_rate := greatest(0.05, 0.20 - v_bono / 100);
  v_ahorro_uf := case when v_ahorro is not null then round(v_ahorro / v_uf, 1) end;
  v_aporte := case when v_precio > 0 then round(v_precio * v_bono / 100, 1) else 0 end;
  v_cap_ef := case when v_cap is not null then round(v_cap + v_aporte, 1) end;
  v_pie_min_req := case when v_precio > 0 then round(v_precio * v_pie_min_rate, 1) else 0 end;

  if v_cap_ef is null or v_precio is null or v_precio <= 0 then
    return jsonb_build_object(
      'status', 'unknown',
      'label', 'Compatibilidad por confirmar',
      'capacidad_base_uf', round(v_cap, 1),
      'capacidad_efectiva_uf', v_cap_ef,
      'aporte_bono_pie_uf', v_aporte,
      'bono_pie_pct', v_bono,
      'pie_minimo_requerido_uf', v_pie_min_req,
      'ahorro_estimado_uf', v_ahorro_uf,
      'brecha_uf', null,
      'brecha_pie_uf', null
    );
  end if;

  if v_cap_ef >= v_precio
     and (v_ahorro_uf is null or v_ahorro_uf >= round(v_precio * v_pie_rec_rate, 1)) then
    v_status := 'compatible';
    v_label := 'Compatible hoy';
  elsif v_cap_ef >= round(v_precio * 0.9, 1)
     and (v_ahorro_uf is null or v_ahorro_uf >= v_pie_min_req) then
    v_status := 'compatible_con_ajustes';
    v_label := 'Compatible con ajustes';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'label', v_label,
    'capacidad_base_uf', round(v_cap, 1),
    'capacidad_efectiva_uf', v_cap_ef,
    'aporte_bono_pie_uf', v_aporte,
    'bono_pie_pct', v_bono,
    'pie_minimo_requerido_uf', v_pie_min_req,
    'ahorro_estimado_uf', v_ahorro_uf,
    'brecha_uf', greatest(0, round(v_precio - v_cap_ef, 1)),
    'brecha_pie_uf', case when v_ahorro_uf is not null then greatest(0, round(v_pie_min_req - v_ahorro_uf, 1)) else 0 end
  );
end;
$$;

-- 6. Trigger E2: detectar rebaja de precio (desde o hasta) o alza de bono pie al actualizar public.proyectos.
-- Cubre tanto la edición manual (updateProject) como la carga masiva (importar_proyectos, HU 25).
-- El evento tiene la misma forma que evaluateFavoriteOpportunityChange (opportunityRadar.js)
-- y que _favorite_opportunity_events (service.py), que es la que lee Inicio.
create or replace function public.evaluar_alertas_oportunidad_proyecto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fav record;
  v_eval record;
  v_prev_min numeric;
  v_prev_max numeric;
  v_prev_bono numeric;
  v_curr_min numeric := new.precio_min_uf;
  v_curr_max numeric := coalesce(new.precio_max_uf, new.precio_min_uf);
  v_curr_bono numeric := greatest(0, coalesce(new.bono_pie_pct, 0));
  v_price_dropped boolean;
  v_bono_increased boolean;
  v_comp_before jsonb;
  v_comp_after jsonb;
  v_label_after text;
  v_title text;
  v_summary text;
begin
  if new.estado = 'agotado' then
    return new;
  end if;

  for v_fav in
    select f.usuario_id, f.umbral_precio_min_uf, f.umbral_precio_max_uf, f.umbral_bono_pie_pct
    from public.proyecto_favoritos f
    where f.proyecto_id = new.id
      and f.notificar_cambios = true
  loop
    -- Un lead que no se puede evaluar no puede deshacer la edición del admin
    -- ni la carga masiva completa: se registra y se sigue con el resto.
    begin
      v_prev_min := coalesce(v_fav.umbral_precio_min_uf, old.precio_min_uf, v_curr_min);
      v_prev_max := coalesce(v_fav.umbral_precio_max_uf, old.precio_max_uf, v_prev_min);
      v_prev_bono := greatest(0, coalesce(v_fav.umbral_bono_pie_pct, old.bono_pie_pct, 0));

      v_price_dropped := coalesce(v_curr_min < v_prev_min, false)
                      or coalesce(v_curr_max < v_prev_max, false);
      v_bono_increased := v_curr_bono > v_prev_bono;

      if not v_price_dropped and not v_bono_increased then
        continue;
      end if;

      select ev.id, ev.financial_data
        into v_eval
      from public.evaluations ev
      where ev.user_id = v_fav.usuario_id
      order by ev.created_at desc nulls last, ev.id desc
      limit 1;

      v_comp_before := public.calcular_compatibilidad_oportunidad_uf(v_eval.financial_data, v_prev_min, v_prev_bono);
      v_comp_after := public.calcular_compatibilidad_oportunidad_uf(v_eval.financial_data, v_curr_min, v_curr_bono);
      v_label_after := v_comp_after ->> 'label';

      if v_price_dropped and v_bono_increased then
        v_title := format('Bajó el precio y se activó bono pie de %s%% en %s', trim_scale(v_curr_bono), new.nombre);
        v_summary := format(
          '%s bajó desde %s UF a %s UF y sumó un bono pie de %s%%. Tu compatibilidad referencial ahora es: %s.',
          new.nombre,
          public.oportunidad_fmt_uf(v_prev_min),
          public.oportunidad_fmt_uf(v_curr_min),
          trim_scale(v_curr_bono),
          v_label_after
        );
      elsif v_price_dropped then
        v_title := format('Bajó el precio en tu favorito %s', new.nombre);
        v_summary := format(
          '%s redujo su precio desde %s UF a %s UF. Tu compatibilidad referencial ahora es: %s.',
          new.nombre,
          public.oportunidad_fmt_uf(v_prev_min),
          public.oportunidad_fmt_uf(v_curr_min),
          v_label_after
        );
      else
        v_title := format('%s activó un bono pie de %s%%', new.nombre, trim_scale(v_curr_bono));
        v_summary := format(
          'Tu favorito %s aplicó un bono pie de %s%% (desde %s UF). Tu compatibilidad referencial ahora es: %s.',
          new.nombre,
          trim_scale(v_curr_bono),
          public.oportunidad_fmt_uf(v_curr_min),
          v_label_after
        );
      end if;

      perform public.lead_changes_record_event(jsonb_build_object(
        'user_id', v_fav.usuario_id,
        'event_type', 'favorite_project_opportunity',
        'materiality_key', format(
          'fav-opp:%s:%s:%s:%s', new.id, trim_scale(v_curr_min), trim_scale(v_curr_max), trim_scale(v_curr_bono)
        ),
        'occurred_at', clock_timestamp(),
        'project_id', new.id,
        'project_name', new.nombre,
        'tone', 'positive',
        'title', v_title,
        'summary', v_summary,
        'previous_value', jsonb_build_object(
          'label', format(
            'Desde %s UF%s',
            public.oportunidad_fmt_uf(v_prev_min),
            case when v_prev_bono > 0 then format(' · Bono pie %s%%', trim_scale(v_prev_bono)) else ' · Sin bono pie' end
          ),
          'precio_min_uf', v_prev_min,
          'precio_max_uf', v_prev_max,
          'bono_pie_pct', v_prev_bono,
          'compatibility_status', v_comp_before ->> 'status',
          'compatibility_label', v_comp_before ->> 'label'
        ),
        'current_value', jsonb_build_object(
          'label', format(
            'Desde %s UF%s (%s)',
            public.oportunidad_fmt_uf(v_curr_min),
            case when v_curr_bono > 0 then format(' · Bono pie %s%%', trim_scale(v_curr_bono)) else ' · Sin bono pie' end,
            v_label_after
          ),
          'precio_min_uf', v_curr_min,
          'precio_max_uf', v_curr_max,
          'bono_pie_pct', v_curr_bono,
          'compatibility_status', v_comp_after ->> 'status',
          'compatibility_label', v_label_after
        ),
        'payload', jsonb_build_object(
          'project_id', new.id,
          'project_name', new.nombre,
          'comuna', new.comuna,
          'tipo', new.tipo,
          'price_dropped', v_price_dropped,
          'bono_pie_increased', v_bono_increased,
          'precio_min_anterior_uf', v_prev_min,
          'precio_min_actual_uf', v_curr_min,
          'precio_max_anterior_uf', v_prev_max,
          'precio_max_actual_uf', v_curr_max,
          'descuento_uf', greatest(0, coalesce(v_prev_min, 0) - coalesce(v_curr_min, 0)),
          'bono_pie_anterior_pct', v_prev_bono,
          'bono_pie_actual_pct', v_curr_bono,
          'compatibility_before', v_comp_before,
          'compatibility_after', v_comp_after,
          'latest_evaluation_id', v_eval.id
        ),
        'source', 'catalog_update'
      ));

      update public.proyecto_favoritos
      set umbral_precio_min_uf = v_curr_min,
          umbral_precio_max_uf = v_curr_max,
          umbral_bono_pie_pct = v_curr_bono
      where usuario_id = v_fav.usuario_id
        and proyecto_id = new.id;
    exception when others then
      raise warning 'HU 31: no se pudo evaluar la alerta del proyecto % para el usuario %: %',
        new.id, v_fav.usuario_id, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function public.evaluar_alertas_oportunidad_proyecto() from public, anon, authenticated;

drop trigger if exists proyectos_evaluar_alertas_favoritos on public.proyectos;
create trigger proyectos_evaluar_alertas_favoritos
  after update of precio_min_uf, precio_max_uf, bono_pie_pct, estado on public.proyectos
  for each row execute function public.evaluar_alertas_oportunidad_proyecto();

-- 7. Actualización retrocompatible de importar_proyectos (HU 25) para aceptar bono_pie_pct opcional
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
      descripcion, entrega_estimada, bono_pie_pct
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
      nullif(btrim(r.entrega_estimada), ''),
      coalesce(r.bono_pie_pct, existing.bono_pie_pct, 0)
    from jsonb_to_recordset(p_proyectos) as r(
      nombre text, comuna text, tipo text, precio_min_uf numeric, precio_max_uf numeric,
      estado text, descripcion text, entrega_estimada text, bono_pie_pct numeric
    )
    left join public.proyectos existing
      on existing.inmobiliaria_id = v_tenant
     and lower(existing.nombre) = lower(btrim(r.nombre))
    on conflict (inmobiliaria_id, lower(nombre)) do update set
      nombre = excluded.nombre,
      comuna = excluded.comuna,
      tipo = excluded.tipo,
      precio_min_uf = excluded.precio_min_uf,
      precio_max_uf = excluded.precio_max_uf,
      estado = excluded.estado,
      descripcion = coalesce(excluded.descripcion, p.descripcion),
      entrega_estimada = coalesce(excluded.entrega_estimada, p.entrega_estimada),
      bono_pie_pct = excluded.bono_pie_pct
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

-- 8. Enriquecer lead_changes_due_leads con los favoritos en seguimiento (watched_favorites)
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
      'watched_favorites', coalesce((
        select jsonb_agg(jsonb_build_object(
          'proyecto_id', pf.proyecto_id,
          'notificar_cambios', pf.notificar_cambios,
          'umbral_precio_min_uf', pf.umbral_precio_min_uf,
          'umbral_precio_max_uf', pf.umbral_precio_max_uf,
          'umbral_bono_pie_pct', pf.umbral_bono_pie_pct,
          'alerta_activada_at', pf.alerta_activada_at
        ) order by pf.proyecto_id)
        from public.proyecto_favoritos pf
        where pf.usuario_id = e.user_id and pf.notificar_cambios = true
      ), '[]'::jsonb),
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

commit;
