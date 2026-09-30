-- =============================================================
-- ScoreLeads — Solicitudes ARCO: solo para el admin global
-- =============================================================
-- Las políticas originales (20260608_arco_requests.sql) abrían select/update
-- a cualquier `admin`. Desde HU 7 existen dos clases de admin:
--
--   admin con inmobiliaria_id = NULL  -> admin global (equipo ScoreLeads)
--   admin con inmobiliaria_id = X     -> admin de la inmobiliaria X
--
-- Una solicitud ARCO es un derecho de datos personales de un lead y no está
-- asociada a ninguna inmobiliaria, así que un admin de inmobiliaria podía leer
-- el correo y la solicitud de leads de todos los tenants. Se cierra el hueco:
-- solo el admin global gestiona ARCO. La UI (AdminPanel) ya oculta el panel;
-- esto lo hace cumplir en la base, que es donde importa.
--
-- Depende de public.get_my_inmobiliaria() (20260729_project_catalog.sql).

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'admin'
     and public.get_my_inmobiliaria() is null;
$$;

grant execute on function public.is_global_admin() to authenticated;

drop policy if exists "ARCO select admin" on public.arco_requests;
create policy "ARCO select admin"
  on public.arco_requests
  for select
  using (public.is_global_admin());

drop policy if exists "ARCO update admin" on public.arco_requests;
create policy "ARCO update admin"
  on public.arco_requests
  for update
  using (public.is_global_admin())
  with check (public.is_global_admin());

-- El lead conserva acceso a lo suyo: "ARCO select own" / "ARCO insert own"
-- no se tocan.
