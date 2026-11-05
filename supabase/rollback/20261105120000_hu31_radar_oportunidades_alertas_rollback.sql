-- Rollback for 20261105120000_hu31_radar_oportunidades_alertas.sql
begin;

drop trigger if exists proyectos_evaluar_alertas_favoritos on public.proyectos;
drop function if exists public.evaluar_alertas_oportunidad_proyecto();
drop function if exists public.calcular_compatibilidad_oportunidad_uf(jsonb, numeric, numeric);
drop function if exists public.configurar_alerta_favorito(uuid, boolean);

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
