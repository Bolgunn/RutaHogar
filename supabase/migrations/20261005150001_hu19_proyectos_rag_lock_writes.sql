-- HU19: proyectos_rag permitía INSERT/UPDATE/DELETE a cualquiera con la clave
-- publishable (policies "using (true)") y truncate_proyectos_rag, SECURITY
-- DEFINER, era ejecutable por anon. Desde ahora solo service_role (que salta RLS)
-- escribe el catálogo; la lectura pública del portal se mantiene.
drop policy if exists "Allow public delete access to proyectos_rag" on public.proyectos_rag;
drop policy if exists "Allow public insert access to proyectos_rag" on public.proyectos_rag;
drop policy if exists "Allow public update access to proyectos_rag" on public.proyectos_rag;

-- Defensa en profundidad: aunque alguien recree una policy permisiva, anon y
-- authenticated no tienen el privilegio de tabla para escribir.
revoke insert, update, delete, truncate on table public.proyectos_rag from anon, authenticated;
grant select on table public.proyectos_rag to anon, authenticated;
grant select, insert, update, delete, truncate on table public.proyectos_rag to service_role;

create or replace function public.truncate_proyectos_rag ()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.proyectos_rag;
end;
$$;

revoke execute on function public.truncate_proyectos_rag() from public, anon, authenticated;
grant execute on function public.truncate_proyectos_rag() to service_role;
