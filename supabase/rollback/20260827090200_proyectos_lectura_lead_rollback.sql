-- =============================================================
-- ScoreLeads — ROLLBACK de la lectura del catálogo para el lead
-- Revierte supabase/migrations/20260827090200_proyectos_lectura_lead.sql
-- =============================================================
--
-- No destruye datos: solo quita la policy de SELECT. Efecto: la página de
-- simulación vuelve a mostrar el estado vacío para el rol 'usuario' contra
-- Supabase (el modo local no se ve afectado).
--
-- `drop policy if exists` falla si la TABLA no existe — el `if exists` solo
-- cubre la policy — así que se consulta antes con to_regclass, igual que en
-- 20260729_project_catalog_rollback.sql.

begin;

do $$
begin
  if to_regclass('public.proyectos') is not null then
    execute 'drop policy if exists "Proyectos select lead" on public.proyectos';
  end if;
end;
$$;

commit;

-- Verificación (aparte, tras el commit) — debe devolver 0 filas:
--
-- select policyname from pg_policies
--  where schemaname = 'public' and tablename = 'proyectos'
--    and policyname = 'Proyectos select lead';
