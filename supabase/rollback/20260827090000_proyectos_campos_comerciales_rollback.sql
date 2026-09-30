-- =============================================================
-- ScoreLeads — ROLLBACK de CATALOGO-UNICO (campos comerciales)
-- Revierte supabase/migrations/20260827090000_proyectos_campos_comerciales.sql
-- =============================================================
--
-- ⚠️  DESTRUCTIVO en un solo sentido: se pierden los textos de `descripcion` y
--     los meses de `entrega_estimada` de todos los proyectos. Nada más del
--     catálogo se toca. Para conservarlos antes de ejecutar:
--
--       create table respaldo_proyectos_campos_comerciales as
--         select id, descripcion, entrega_estimada from public.proyectos;
--
-- Este rollback NO revierte el seed 20260827090100_demo_projects_seed.sql: los
-- proyectos de demo sobreviven, solo quedan sin descripción ni mes de entrega.
--
-- Todo usa `if exists`, así que es idempotente. `drop column` se lleva el
-- check constraint con él, pero se elimina antes de forma explícita para que
-- el rollback siga siendo correcto si alguien ejecuta solo esa parte.

begin;

do $$
begin
  if to_regclass('public.proyectos') is not null then
    execute 'alter table public.proyectos drop constraint if exists proyectos_entrega_estimada_check';
    execute 'alter table public.proyectos drop column if exists entrega_estimada';
    execute 'alter table public.proyectos drop column if exists descripcion';
  end if;
end;
$$;

commit;

-- -------------------------------------------------------------
-- Verificación (ejecutar aparte, después del commit)
-- -------------------------------------------------------------
-- Debe devolver 0 filas:
--
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'proyectos'
--    and column_name in ('descripcion', 'entrega_estimada');
