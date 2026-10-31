-- Restaura el estado inseguro previo; solo para revertir un despliegue fallido.
grant insert, update, delete on table public.proyectos_rag to anon, authenticated;
grant execute on function public.truncate_proyectos_rag() to public, anon, authenticated;

create or replace function public.truncate_proyectos_rag ()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.proyectos_rag;
end;
$$;

drop policy if exists "Allow public delete access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public delete access to proyectos_rag"
  on public.proyectos_rag for delete
  using (true);

drop policy if exists "Allow public insert access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public insert access to proyectos_rag"
  on public.proyectos_rag for insert
  with check (true);

drop policy if exists "Allow public update access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public update access to proyectos_rag"
  on public.proyectos_rag for update
  using (true);
