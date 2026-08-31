-- =============================================================
-- RutaHogar — El ejecutivo comercial solo ve sus proyectos asignados
-- =============================================================
-- HU 7 dejó al ejecutivo con lectura de TODO el catálogo de su inmobiliaria
-- ("Proyectos select tenant"). El vínculo real de trabajo ya existía en
-- proyecto_ejecutivos pero no acotaba nada: era decorativo para la lectura.
--
-- Esta migración lo vuelve vinculante. Después de aplicarla:
--   · admin (del tenant o global): sin cambios, ve el catálogo completo.
--   · ejecutivo: solo los proyectos donde está asignado en proyecto_ejecutivos.
--   · usuario (lead): sin cambios, "Proyectos select lead" sigue vigente.
--
-- El vínculo se reconoce por ejecutivo_id O por correo. El correo importa
-- porque una asignación recién creada queda 'pendiente' con ejecutivo_id NULL
-- hasta que corre resolve_pending_executives(); sin esa rama, un ejecutivo
-- recién asignado no vería su propio proyecto hasta la siguiente resolución.
--
-- Idempotente: drop + create, como el resto de las policies del repo.

-- SECURITY DEFINER para no recursar sobre las policies de proyecto_ejecutivos.
create or replace function public.is_ejecutivo_asignado(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proyecto_ejecutivos pe
    where pe.proyecto_id = p_project_id
      and (
        pe.ejecutivo_id = auth.uid()
        or pe.ejecutivo_email = lower((select u.email from auth.users u where u.id = auth.uid()))
      )
  );
$$;

grant execute on function public.is_ejecutivo_asignado(uuid) to authenticated;

drop policy if exists "Proyectos select tenant" on public.proyectos;
create policy "Proyectos select tenant"
  on public.proyectos
  for select
  using (
    (
      public.get_my_role() = 'admin'
      and (
        public.get_my_inmobiliaria() is null
        or public.get_my_inmobiliaria() = inmobiliaria_id
      )
    )
    or (
      public.get_my_role() = 'ejecutivo'
      and public.get_my_inmobiliaria() = inmobiliaria_id
      and public.is_ejecutivo_asignado(id)
    )
  );

-- El ejecutivo tampoco debe enumerar las asignaciones de sus colegas: ve las
-- suyas y nada más. El admin conserva la vista de tenant (la usa el panel para
-- mostrar quién atiende cada proyecto).
drop policy if exists "Proyecto ejecutivos select tenant" on public.proyecto_ejecutivos;
create policy "Proyecto ejecutivos select tenant"
  on public.proyecto_ejecutivos
  for select
  using (
    (
      public.get_my_role() = 'admin'
      and (
        public.get_my_inmobiliaria() is null
        or public.get_my_inmobiliaria() = public.get_proyecto_inmobiliaria(proyecto_id)
      )
    )
    or (
      public.get_my_role() = 'ejecutivo'
      and (
        ejecutivo_id = auth.uid()
        or ejecutivo_email = lower((select u.email from auth.users u where u.id = auth.uid()))
      )
    )
  );
