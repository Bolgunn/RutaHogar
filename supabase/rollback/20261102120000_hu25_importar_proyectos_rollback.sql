-- Rollback HU 25: carga masiva de proyectos.
-- Quita solo la función. Los proyectos ya importados son filas normales del
-- catálogo y se quedan donde están.
begin;

revoke all on function public.importar_proyectos(jsonb) from public, anon, authenticated;
drop function if exists public.importar_proyectos(jsonb);

commit;
