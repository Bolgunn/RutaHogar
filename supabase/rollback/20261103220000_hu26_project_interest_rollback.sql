-- Revierte 20261103220000_hu26_project_interest.sql.
-- Elimina solo lo que creó. Las visualizaciones registradas se pierden: no
-- existían antes de HU 26 y nada más las lee.
begin;

drop function if exists public.hu26_project_interest_source(uuid);
drop function if exists public.registrar_visualizacion_proyecto(uuid);
drop table if exists public.proyecto_visualizaciones;

commit;
