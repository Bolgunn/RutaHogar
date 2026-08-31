-- Rollback de 20260831090000_proyectos_scope_ejecutivo.sql
-- Restaura las policies de lectura tal como las dejó HU 7: el ejecutivo vuelve
-- a leer todo el catálogo de su inmobiliaria y todas las asignaciones del tenant.

drop policy if exists "Proyectos select tenant" on public.proyectos;
create policy "Proyectos select tenant"
  on public.proyectos
  for select
  using (
    public.get_my_role() = any (array['admin'::text, 'ejecutivo'::text])
    and (
      public.get_my_inmobiliaria() is null
      or public.get_my_inmobiliaria() = inmobiliaria_id
    )
  );

drop policy if exists "Proyecto ejecutivos select tenant" on public.proyecto_ejecutivos;
create policy "Proyecto ejecutivos select tenant"
  on public.proyecto_ejecutivos
  for select
  using (
    public.get_my_role() = any (array['admin'::text, 'ejecutivo'::text])
    and (
      public.get_my_inmobiliaria() is null
      or public.get_my_inmobiliaria() = public.get_proyecto_inmobiliaria(proyecto_id)
    )
  );

drop function if exists public.is_ejecutivo_asignado(uuid);
