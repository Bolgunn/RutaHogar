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

-- 5. Función pura en SQL para recalcular compatibilidad referencial con precio UF y bono pie
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
  v_fin jsonb := coalesce(p_financial_data, '{}'::jsonb);
  v_input jsonb := coalesce(v_fin -> 'input', v_fin -> 'input_snapshot', v_fin);
  v_result jsonb := coalesce(v_fin -> 'result', v_fin -> 'result_snapshot', '{}'::jsonb);
  v_indicators jsonb := coalesce(v_result -> 'financial_indicators', '{}'::jsonb);
  v_supuestos jsonb := coalesce(v_indicators -> 'capacidad_supuestos', '{}'::jsonb);
  v_uf_clp numeric := coalesce(
    nullif((v_supuestos ->> 'uf_value_clp')::numeric, 0),
    nullif((v_input ->> 'uf_value_clp')::numeric, 0),
    38000
  );
  v_ahorro_clp numeric := greatest(0, coalesce((v_input ->> 'ahorro_disponible')::numeric, 0));
  v_ahorro_uf numeric := case when v_uf_clp > 0 then v_ahorro_clp / v_uf_clp else 0 end;
  v_base_cap_uf numeric := (v_indicators ->> 'capacidad_compra_estimada_uf')::numeric;
  v_bono numeric := greatest(0, least(coalesce(p_bono_pie_pct, 0), 30));
  v_precio numeric := greatest(0, coalesce(p_precio_min_uf, 0));
  v_pie_min_rate numeric := greatest(0, 0.10 - (v_bono / 100.0));
  v_pie_rec_rate numeric := greatest(0, 0.20 - (v_bono / 100.0));
  v_pie_min_req_uf numeric := v_precio * v_pie_min_rate;
  v_pie_rec_req_uf numeric := v_precio * v_pie_rec_rate;
  v_brecha_min_uf numeric := greatest(0, v_pie_min_req_uf - v_ahorro_uf);
  v_brecha_rec_uf numeric := greatest(0, v_pie_rec_req_uf - v_ahorro_uf);
  v_bono_aporte_uf numeric := v_precio * (v_bono / 100.0);
  v_cap_efectiva_uf numeric;
  v_status text;
begin
  if v_base_cap_uf is not null then
    v_cap_efectiva_uf := v_base_cap_uf + v_bono_aporte_uf;
  elsif v_pie_min_rate > 0 then
    v_cap_efectiva_uf := v_ahorro_uf / v_pie_min_rate;
  else
    v_cap_efectiva_uf := v_precio;
  end if;

  if v_precio <= 0 then
    v_status := 'Requiere ajuste';
  elsif v_cap_efectiva_uf >= v_precio and v_brecha_rec_uf <= 0 then
    v_status := 'Compatible';
  elsif v_cap_efectiva_uf >= (v_precio * 0.80)
        and (v_brecha_min_uf <= 0 or (v_pie_min_req_uf > 0 and (v_brecha_min_uf / v_pie_min_req_uf) <= 0.25)) then
    v_status := 'Cercano';
  else
    v_status := 'Requiere ajuste';
  end if;

  return jsonb_build_object(
    'status', v_status,
    'capacidad_base_uf', round(coalesce(v_base_cap_uf, v_cap_efectiva_uf), 1),
    'capacidad_efectiva_uf', round(v_cap_efectiva_uf, 1),
    'ahorro_disponible_uf', round(v_ahorro_uf, 1),
    'bono_pie_pct', v_bono,
    'bono_aporte_uf', round(v_bono_aporte_uf, 1),
    'pie_minimo_requerido_uf', round(v_pie_min_req_uf, 1),
    'pie_recomendado_requerido_uf', round(v_pie_rec_req_uf, 1),
    'brecha_pie_minimo_uf', round(v_brecha_min_uf, 1),
    'alcanza_proyecto', (v_cap_efectiva_uf >= v_precio and v_brecha_min_uf <= 0)
  );
end;
$$;

-- 6. Trigger E2: detectar rebaja de precio o bono pie al actualizar public.proyectos
-- Cubre tanto la edición manual (updateProject) como la carga masiva (importar_proyectos, HU 25).
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
  v_curr_max numeric := new.precio_max_uf;
  v_curr_bono numeric := coalesce(new.bono_pie_pct, 0);
  v_price_drop numeric;
  v_bono_gain numeric;
  v_prev_comp jsonb;
  v_curr_comp jsonb;
  v_prev_status text;
  v_curr_status text;
  v_title text;
  v_summary text;
  v_prev_label text;
  v_curr_label text;
begin
  if new.estado = 'agotado' then
    return new;
  end if;

  for v_fav in
    select f.*
    from public.proyecto_favoritos f
    where f.proyecto_id = new.id
      and f.notificar_cambios = true
  loop
    v_prev_min := coalesce(v_fav.umbral_precio_min_uf, old.precio_min_uf);
    v_prev_max := coalesce(v_fav.umbral_precio_max_uf, old.precio_max_uf);
    v_prev_bono := coalesce(v_fav.umbral_bono_pie_pct, old.bono_pie_pct, 0);

    v_price_drop := greatest(0, v_prev_min - v_curr_min);
    v_bono_gain := greatest(0, v_curr_bono - v_prev_bono);

    if v_price_drop <= 0 and v_bono_gain <= 0 then
      continue;
    end if;

    select ev.id, ev.financial_data, ev.score, ev.classification
      into v_eval
    from public.evaluations ev
    where ev.user_id = v_fav.usuario_id
    order by ev.created_at desc nulls last, ev.id desc
    limit 1;

    v_prev_comp := public.calcular_compatibilidad_oportunidad_uf(
      v_eval.financial_data, v_prev_min, v_prev_bono
    );
    v_curr_comp := public.calcular_compatibilidad_oportunidad_uf(
      v_eval.financial_data, v_curr_min, v_curr_bono
    );
    v_prev_status := v_prev_comp ->> 'status';
    v_curr_status := v_curr_comp ->> 'status';

    if v_price_drop > 0 and v_bono_gain > 0 then
      v_title := format('%s bajó %s UF y activó Bono Pie de %s %%', new.nombre, trim(to_char(v_price_drop, 'FM999G999D9')), trim(to_char(v_curr_bono, 'FM990D9')));
      v_summary := format(
        'El valor desde bajó de %s UF a %s UF y se aplicó un Bono Pie del %s %%. Recalculamos tu compatibilidad referencial: %s.',
        trim(to_char(v_prev_min, 'FM999G999D9')),
        trim(to_char(v_curr_min, 'FM999G999D9')),
        trim(to_char(v_curr_bono, 'FM990D9')),
        v_curr_status
      );
    elsif v_price_drop > 0 then
      v_title := format('%s redujo su precio en %s UF', new.nombre, trim(to_char(v_price_drop, 'FM999G999D9')));
      v_summary := format(
        'El valor desde bajó de %s UF a %s UF. Recalculamos tu compatibilidad referencial: %s.',
        trim(to_char(v_prev_min, 'FM999G999D9')),
        trim(to_char(v_curr_min, 'FM999G999D9')),
        v_curr_status
      );
    else
      v_title := format('%s lanzó Bono Pie del %s %%', new.nombre, trim(to_char(v_curr_bono, 'FM990D9')));
      v_summary := format(
        'La inmobiliaria aplicó un Bono Pie del %s %% sobre %s (desde %s UF). Recalculamos tu compatibilidad referencial: %s.',
        trim(to_char(v_curr_bono, 'FM990D9')),
        new.nombre,
        trim(to_char(v_curr_min, 'FM999G999D9')),
        v_curr_status
      );
    end if;

    v_prev_label := format(
      'Desde %s UF%s · %s',
      trim(to_char(v_prev_min, 'FM999G999D9')),
      case when v_prev_bono > 0 then format(' · Bono pie %s %%', trim(to_char(v_prev_bono, 'FM990D9'))) else '' end,
      v_prev_status
    );
    v_curr_label := format(
      'Desde %s UF%s · %s',
      trim(to_char(v_curr_min, 'FM999G999D9')),
      case when v_curr_bono > 0 then format(' · Bono pie %s %%', trim(to_char(v_curr_bono, 'FM990D9'))) else '' end,
      v_curr_status
    );

    perform public.lead_changes_record_event(jsonb_build_object(
      'user_id', v_fav.usuario_id,
      'event_type', 'favorite_project_opportunity',
      'materiality_key', format('fav-opp:%s:%s:%s', new.id, v_curr_min, v_curr_bono),
      'occurred_at', clock_timestamp(),
      'project_id', new.id,
      'project_name', new.nombre,
      'tone', 'positive',
      'title', v_title,
      'summary', v_summary,
      'previous_value', jsonb_build_object(
        'label', v_prev_label,
        'precio_min_uf', v_prev_min,
        'precio_max_uf', v_prev_max,
        'bono_pie_pct', v_prev_bono,
        'compatibility_status', v_prev_status
      ),
      'current_value', jsonb_build_object(
        'label', v_curr_label,
        'precio_min_uf', v_curr_min,
        'precio_max_uf', v_curr_max,
        'bono_pie_pct', v_curr_bono,
        'compatibility_status', v_curr_status
      ),
      'payload', jsonb_build_object(
        'project_id', new.id,
        'project_name', new.nombre,
        'comuna', new.comuna,
        'price_drop_uf', v_price_drop,
        'bono_pie_pct', v_curr_bono,
        'previous_bono_pie_pct', v_prev_bono,
        'previous_compatibility', v_prev_comp,
        'current_compatibility', v_curr_comp,
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
