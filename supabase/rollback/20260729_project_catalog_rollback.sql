-- =============================================================
-- ScoreLeads — ROLLBACK de HU 7 (catálogo de proyectos)
-- Revierte por completo supabase/migrations/20260729_project_catalog.sql
-- =============================================================
--
-- ⚠️  DESTRUCTIVO. Al ejecutarlo se pierden de forma irreversible:
--       · todos los proyectos del catálogo (`proyectos`)
--       · todas las asignaciones proyecto ↔ ejecutivo (`proyecto_ejecutivos`)
--       · todas las inmobiliarias (`inmobiliarias`), incluidas las demo
--       · la inmobiliaria asignada a cada perfil (`profiles.inmobiliaria_id`)
--     Los perfiles, roles, evaluaciones e historial NO se tocan.
--     Si quieres conservar el catálogo, respáldalo antes:
--       create table respaldo_proyectos as select * from public.proyectos;
--       create table respaldo_proyecto_ejecutivos as select * from public.proyecto_ejecutivos;
--       create table respaldo_inmobiliarias as select * from public.inmobiliarias;
--       create table respaldo_profiles_tenant as
--         select id, inmobiliaria_id from public.profiles where inmobiliaria_id is not null;
--
-- El orden importa y no es negociable:
--   1. policies  → 2. functions → 3. columna → 4. tablas
-- (ver el paso 5 para por qué NO se recrean las policies de profiles)
-- Las policies dependen de las funciones y `assign_executive` devuelve el tipo
-- compuesto de `proyecto_ejecutivos`, así que invertir el orden hace fallar el
-- DROP por dependencias.
--
-- Todo usa `if exists`: es idempotente y seguro incluso si la migración quedó
-- aplicada a medias. Se ejecuta completo en una transacción.
--
-- NOTA: `public.get_my_role()` NO se elimina — es anterior a HU 7
-- (20260604_fix_rls_infinite_recursion.sql) y lo usan las policies de
-- arco_requests y evaluations.

begin;

-- -------------------------------------------------------------
-- 1. Policies creadas por HU 7
-- -------------------------------------------------------------
-- Deben caer antes que las funciones y antes que la columna a la que apuntan.

-- `profiles` siempre existe, así que basta con `if exists`.
drop policy if exists "Profiles select admin" on public.profiles;
drop policy if exists "Profiles update admin" on public.profiles;

-- Las tablas del catálogo pueden no existir (rollback repetido o migración a
-- medias). `drop policy if exists` igual falla si la TABLA no existe — el
-- `if exists` solo cubre la policy — así que se consulta antes con to_regclass.
do $$
begin
  if to_regclass('public.proyecto_ejecutivos') is not null then
    execute 'drop policy if exists "Proyecto ejecutivos select tenant" on public.proyecto_ejecutivos';
  end if;

  if to_regclass('public.proyectos') is not null then
    execute 'drop policy if exists "Proyectos select tenant" on public.proyectos';
    execute 'drop policy if exists "Proyectos insert admin tenant" on public.proyectos';
    execute 'drop policy if exists "Proyectos update admin tenant" on public.proyectos';
    execute 'drop policy if exists "Proyectos delete admin tenant" on public.proyectos';
  end if;

  if to_regclass('public.inmobiliarias') is not null then
    execute 'drop policy if exists "Inmobiliarias select staff" on public.inmobiliarias';
    execute 'drop policy if exists "Inmobiliarias insert global admin" on public.inmobiliarias';
    execute 'drop policy if exists "Inmobiliarias update global admin" on public.inmobiliarias';
  end if;
end;
$$;

-- -------------------------------------------------------------
-- 2. Funciones y RPC de HU 7
-- -------------------------------------------------------------
drop function if exists public.resolve_pending_executives();
drop function if exists public.assign_admin(uuid, text);
drop function if exists public.unassign_executive(uuid, text);
drop function if exists public.assign_executive(uuid, text);
drop function if exists public.can_admin_inmobiliaria(uuid);
drop function if exists public.get_proyecto_inmobiliaria(uuid);
drop function if exists public.get_my_inmobiliaria();

-- -------------------------------------------------------------
-- 3. Columna de tenant en profiles
-- -------------------------------------------------------------
-- Antes de soltar `inmobiliarias`, porque la referencia por FK.
drop index if exists public.profiles_inmobiliaria_idx;

alter table public.profiles
drop column if exists inmobiliaria_id;

-- -------------------------------------------------------------
-- 4. Tablas del catálogo (hijo → padre)
-- -------------------------------------------------------------
-- El trigger proyectos_set_updated_at y los índices caen con la tabla.
drop table if exists public.proyecto_ejecutivos;
drop table if exists public.proyectos;
drop table if exists public.inmobiliarias;

-- -------------------------------------------------------------
-- 5. Policies de profiles previas a HU 7 — NO se restauran
-- -------------------------------------------------------------
-- ⚠️  HALLAZGO VERIFICADO EN EL PUSH DEL 2026-07-31.
--     `schema.sql` declara "Profiles select admin" y "Permitir a los admins
--     actualizar cualquier perfil", pero **nunca se habían aplicado a la base
--     real**. Al correr la migración, Postgres respondió:
--
--       NOTICE: policy "Profiles select admin" for relation "public.profiles"
--               does not exist, skipping
--       NOTICE: policy "Permitir a los admins actualizar cualquier perfil"
--               for relation "public.profiles" does not exist, skipping
--
--     Es decir: antes de HU 7 los admins **no** tenían ninguna policy sobre
--     `profiles` más allá de "Profiles select/insert/update own". HU 7 no
--     acotó un acceso amplio preexistente: lo creó (acotado por inmobiliaria).
--
--     Por eso el rollback SOLO elimina las policies de HU 7 (paso 1) y no crea
--     nada: ese es el estado real anterior a la migración. Recrear las de
--     schema.sql daría a los admins un acceso que esta base nunca tuvo.
--
--     Si en algún momento se decide que el admin SÍ debe leer/editar todos los
--     perfiles (que es lo que schema.sql siempre asumió), agregar esto —
--     usando get_my_role() y NO el `exists (select … from profiles)` de
--     schema.sql, que es justamente el patrón 42P17 que arregló
--     20260605_fix_rls_infinite_recursion.sql:
--
--       create policy "Profiles select admin"
--         on public.profiles for select
--         using (public.get_my_role() = 'admin');
--
--       create policy "Profiles update admin"
--         on public.profiles for update
--         using (public.get_my_role() = 'admin')
--         with check (public.get_my_role() = 'admin');

commit;

-- -------------------------------------------------------------
-- Verificación (ejecutar aparte, después del commit)
-- -------------------------------------------------------------
-- Las tres consultas deben devolver 0 filas:
--
-- select tablename from pg_tables
--  where schemaname = 'public'
--    and tablename in ('inmobiliarias', 'proyectos', 'proyecto_ejecutivos');
--
-- select proname from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and proname in ('get_my_inmobiliaria', 'get_proyecto_inmobiliaria',
--                    'can_admin_inmobiliaria', 'assign_executive',
--                    'unassign_executive', 'assign_admin',
--                    'resolve_pending_executives');
--
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'profiles'
--    and column_name = 'inmobiliaria_id';
--
-- Y estas dos deben seguir existiendo (no las toca el rollback):
--
-- select proname from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and proname = 'get_my_role';
--
-- select policyname from pg_policies
--  where schemaname = 'public' and tablename = 'profiles';
