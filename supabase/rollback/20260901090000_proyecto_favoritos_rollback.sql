-- =============================================================
-- ScoreLeads — ROLLBACK de los favoritos de proyectos del lead
-- Revierte supabase/migrations/20260901090000_proyecto_favoritos.sql
-- =============================================================
--
-- DESTRUCTIVO: la tabla guarda datos, no solo estructura. Al ejecutarlo se
-- pierden los favoritos de todos los leads y el catálogo vuelve a mostrar cero
-- estrellas marcadas. No hay copia en localStorage a la que volver — el
-- proveedor local escribe bajo su propia clave y solo aplica sin Supabase.
--
-- Si el objetivo es solo desactivar la funcionalidad, basta con revertir el
-- frontend: sin lecturas la tabla queda inerte y los datos se conservan.
--
-- `drop table if exists` se lleva consigo policies e índice, así que no hace
-- falta borrarlos por separado.

begin;

drop table if exists public.proyecto_favoritos;

commit;

-- Verificación (aparte, tras el commit) — debe devolver NULL:
--
-- select to_regclass('public.proyecto_favoritos');
