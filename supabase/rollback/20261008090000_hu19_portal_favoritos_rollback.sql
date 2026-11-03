-- =============================================================
-- RutaHogar — ROLLBACK de los favoritos del portal (HU19)
-- Revierte supabase/migrations/20261008090000_hu19_portal_favoritos.sql
-- =============================================================
--
-- Antes de restaurar la clave foránea hay que borrar los favoritos que apuntan a
-- avisos del portal (ids de proyectos_rag): no existen en public.proyectos y la
-- restauración fallaría. Se pierden esas estrellas; las de proyectos se conservan.

begin;

drop trigger if exists proyectos_rag_borrar_favoritos on public.proyectos_rag;
drop trigger if exists proyectos_borrar_favoritos on public.proyectos;
drop trigger if exists proyecto_favoritos_validar on public.proyecto_favoritos;
drop function if exists public.proyecto_favoritos_borrar_huerfanos();
drop function if exists public.proyecto_favoritos_validar_proyecto();

delete from public.proyecto_favoritos f
where not exists (select 1 from public.proyectos p where p.id = f.proyecto_id);

drop index if exists public.proyecto_favoritos_proyecto_idx;

alter table public.proyecto_favoritos
  add constraint proyecto_favoritos_proyecto_id_fkey
  foreign key (proyecto_id) references public.proyectos(id) on delete cascade;

commit;
