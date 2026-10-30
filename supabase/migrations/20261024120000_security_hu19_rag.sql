-- HU19: public reads; catalog writes and destructive RPC are service-only.
drop policy if exists "Insert publico RAG" on public.proyectos_rag;
drop policy if exists "Update publico RAG" on public.proyectos_rag;
drop policy if exists "Allow public read access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public read access to proyectos_rag" on public.proyectos_rag for select using (true);
revoke all on table public.proyectos_rag from public, anon, authenticated;
grant select on table public.proyectos_rag to anon, authenticated;
grant select, insert, update, delete, truncate on table public.proyectos_rag to service_role;
revoke all on function public.truncate_proyectos_rag() from public, anon, authenticated;
grant execute on function public.truncate_proyectos_rag() to service_role;
