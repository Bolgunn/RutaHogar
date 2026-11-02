-- HU19: favoritos desde el portal. proyecto_favoritos.proyecto_id apuntaba solo a
-- public.proyectos, pero los avisos del portal viven en public.proyectos_rag. Una
-- clave foránea no puede apuntar a dos tablas, así que se reemplaza por un trigger
-- que acepta un id presente en cualquiera de las dos y por triggers que reproducen
-- el ON DELETE CASCADE. Las funciones son SECURITY DEFINER para comportarse como la
-- FK: no dependen de lo que el RLS le deje ver al lead.
--
-- Ojo: la ingesta vacía proyectos_rag, y eso borra los favoritos de esos avisos
-- (igual que el cascade que reemplaza). Reingestar el catálogo reinicia sus estrellas.
begin;

alter table public.proyecto_favoritos
  drop constraint if exists proyecto_favoritos_proyecto_id_fkey;

create index if not exists proyecto_favoritos_proyecto_idx
  on public.proyecto_favoritos (proyecto_id);

create or replace function public.proyecto_favoritos_validar_proyecto ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.proyectos where id = new.proyecto_id)
     and not exists (select 1 from public.proyectos_rag where id = new.proyecto_id) then
    raise exception 'El proyecto % no existe', new.proyecto_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function public.proyecto_favoritos_borrar_huerfanos ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.proyecto_favoritos where proyecto_id = old.id;
  return old;
end;
$$;

revoke execute on function public.proyecto_favoritos_validar_proyecto() from public, anon, authenticated;
revoke execute on function public.proyecto_favoritos_borrar_huerfanos() from public, anon, authenticated;

drop trigger if exists proyecto_favoritos_validar on public.proyecto_favoritos;
create trigger proyecto_favoritos_validar
  before insert on public.proyecto_favoritos
  for each row execute function public.proyecto_favoritos_validar_proyecto();

drop trigger if exists proyectos_borrar_favoritos on public.proyectos;
create trigger proyectos_borrar_favoritos
  after delete on public.proyectos
  for each row execute function public.proyecto_favoritos_borrar_huerfanos();

drop trigger if exists proyectos_rag_borrar_favoritos on public.proyectos_rag;
create trigger proyectos_rag_borrar_favoritos
  after delete on public.proyectos_rag
  for each row execute function public.proyecto_favoritos_borrar_huerfanos();

commit;
