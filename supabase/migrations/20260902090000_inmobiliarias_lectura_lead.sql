-- =============================================================
-- RutaHogar — nombre de inmobiliaria visible en el catálogo lead
-- =============================================================
-- El usuario ya puede leer proyectos no agotados. Esta política permite
-- resolver el nombre comercial de su inmobiliaria, pero solo cuando esa
-- inmobiliaria tiene al menos un proyecto que el usuario puede explorar.
-- No concede permisos de escritura.

drop policy if exists "Inmobiliarias select lead catalog" on public.inmobiliarias;
create policy "Inmobiliarias select lead catalog"
  on public.inmobiliarias
  for select
  using (
    public.get_my_role() = 'usuario'
    and exists (
      select 1
      from public.proyectos
      where proyectos.inmobiliaria_id = inmobiliarias.id
        and proyectos.estado <> 'agotado'
    )
  );
