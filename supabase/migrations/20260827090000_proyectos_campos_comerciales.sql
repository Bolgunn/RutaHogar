-- =============================================================
-- ScoreLeads — CATALOGO-UNICO: campos comerciales del proyecto
-- =============================================================
-- Amplía el catálogo de HU 7 con los dos datos que la página de simulación
-- mostraba desde `frontend/src/data/mockProjects.js` y que el catálogo real no
-- tenía. Al borrarse el mock, sin estas columnas la información se perdería.
--
--   descripcion       texto libre de vitrina, el que ve el usuario final.
--   entrega_estimada  mes de entrega en formato 'YYYY-MM'. Es text y no date
--                     porque la entrega se cotiza por mes: un `date` obligaría
--                     a inventar un día que nadie declaró.
--
-- Ambas son NULL en las filas existentes y la UI no renderiza nada cuando
-- faltan, así que no hay backfill.
--
-- Migración aparte y no una edición de 20260729_project_catalog.sql: ese
-- archivo usa `create table if not exists`, de modo que editarlo sería un no-op
-- donde `proyectos` ya existe (por ejemplo, en los previews ya desplegados).
-- `add column if not exists` es correcto en ambos casos.
--
-- NO toca RLS: `proyectos` ya está acotada por `inmobiliaria_id` y estas dos
-- columnas son inventario comercial, no dato personal.

alter table public.proyectos
add column if not exists descripcion text;

alter table public.proyectos
add column if not exists entrega_estimada text;

-- `add constraint` no admite `if not exists`, así que se consulta el catálogo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.proyectos'::regclass
      and conname = 'proyectos_entrega_estimada_check'
  ) then
    alter table public.proyectos
    add constraint proyectos_entrega_estimada_check check (
      entrega_estimada is null
      or entrega_estimada ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    );
  end if;
end;
$$;
