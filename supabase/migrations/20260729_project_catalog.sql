-- =============================================================
-- ScoreLeads — HU 7: catálogo multi-tenant de proyectos inmobiliarios
-- =============================================================
-- Tablas: inmobiliarias, proyectos, proyecto_ejecutivos
-- Columna nueva: profiles.inmobiliaria_id (NULL = admin global / dev)
-- Los helpers son SECURITY DEFINER para no volver a caer en la
-- recursión 42P17 (ver 20260604_fix_rls_infinite_recursion.sql).

create extension if not exists pgcrypto;

-- -------------------------------------------------------------
-- 1. Inmobiliarias (tenants)
-- -------------------------------------------------------------
create table if not exists public.inmobiliarias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists inmobiliaria_id uuid references public.inmobiliarias(id) on delete set null;

create index if not exists profiles_inmobiliaria_idx
  on public.profiles (inmobiliaria_id);

-- -------------------------------------------------------------
-- 2. Proyectos
-- -------------------------------------------------------------
create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete cascade,
  nombre text not null,
  comuna text not null,
  tipo text not null,
  precio_min_uf numeric not null,
  precio_max_uf numeric not null,
  estado text not null default 'disponible',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyectos_tipo_check check (tipo in ('departamento', 'casa')),
  constraint proyectos_estado_check check (estado in ('disponible', 'en_construccion', 'agotado')),
  constraint proyectos_precio_check check (
    precio_min_uf > 0 and precio_max_uf > 0 and precio_min_uf <= precio_max_uf
  )
);

-- E2: nombre único por inmobiliaria, insensible a mayúsculas
create unique index if not exists proyectos_nombre_por_inmobiliaria_idx
  on public.proyectos (inmobiliaria_id, lower(nombre));

create index if not exists proyectos_inmobiliaria_estado_idx
  on public.proyectos (inmobiliaria_id, estado);

drop trigger if exists proyectos_set_updated_at on public.proyectos;
create trigger proyectos_set_updated_at
before update on public.proyectos
for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- 3. Vínculo proyecto ↔ ejecutivo (tolerante a pendientes y a CRM)
-- -------------------------------------------------------------
-- La PK es (proyecto_id, ejecutivo_email) porque el ejecutivo puede
-- no tener cuenta todavía: queda 'pendiente' hasta que se registre.
create table if not exists public.proyecto_ejecutivos (
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  ejecutivo_id uuid references public.profiles(id) on delete set null,
  ejecutivo_email text not null,
  source text not null default 'manual',
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  primary key (proyecto_id, ejecutivo_email),
  constraint proyecto_ejecutivos_source_check check (source in ('manual', 'crm')),
  constraint proyecto_ejecutivos_estado_check check (estado in ('pendiente', 'vinculado'))
);

create index if not exists proyecto_ejecutivos_ejecutivo_idx
  on public.proyecto_ejecutivos (ejecutivo_id);

-- -------------------------------------------------------------
-- 4. Helpers SECURITY DEFINER (no disparan RLS)
-- -------------------------------------------------------------
create or replace function public.get_my_inmobiliaria()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select inmobiliaria_id from public.profiles where id = auth.uid();
$$;

create or replace function public.get_proyecto_inmobiliaria(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select inmobiliaria_id from public.proyectos where id = p_project_id;
$$;

-- Admin del tenant del proyecto (o admin global con inmobiliaria_id NULL)
create or replace function public.can_admin_inmobiliaria(p_inmobiliaria_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.get_my_role() = 'admin'
    and (
      public.get_my_inmobiliaria() is null
      or public.get_my_inmobiliaria() = p_inmobiliaria_id
    );
$$;

-- E3: asigna un ejecutivo por correo. El ejecutivo puede no existir aún.
create or replace function public.assign_executive(p_project_id uuid, p_email text)
returns public.proyecto_ejecutivos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inmobiliaria uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_exec_id uuid;
  v_exec_inmobiliaria uuid;
  v_row public.proyecto_ejecutivos;
begin
  v_inmobiliaria := public.get_proyecto_inmobiliaria(p_project_id);
  if v_inmobiliaria is null then
    raise exception 'Proyecto no encontrado.';
  end if;

  if not public.can_admin_inmobiliaria(v_inmobiliaria) then
    raise exception 'No tienes permisos para administrar este proyecto.';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Correo del ejecutivo inválido.';
  end if;

  select p.id, p.inmobiliaria_id
    into v_exec_id, v_exec_inmobiliaria
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
    and p.role = 'ejecutivo'
  limit 1;

  -- Sin cuenta todavía: queda pendiente y se resuelve al registrarse.
  if v_exec_id is null then
    insert into public.proyecto_ejecutivos (proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
    values (p_project_id, null, v_email, 'manual', 'pendiente')
    on conflict (proyecto_id, ejecutivo_email) do update
      set source = 'manual'
    returning * into v_row;
    return v_row;
  end if;

  if v_exec_inmobiliaria is null then
    update public.profiles set inmobiliaria_id = v_inmobiliaria where id = v_exec_id;
  elsif v_exec_inmobiliaria <> v_inmobiliaria then
    raise exception 'Este ejecutivo ya pertenece a otra inmobiliaria.';
  end if;

  insert into public.proyecto_ejecutivos (proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
  values (p_project_id, v_exec_id, v_email, 'manual', 'vinculado')
  on conflict (proyecto_id, ejecutivo_email) do update
    set ejecutivo_id = excluded.ejecutivo_id,
        estado = 'vinculado',
        source = 'manual'
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.unassign_executive(p_project_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inmobiliaria uuid := public.get_proyecto_inmobiliaria(p_project_id);
begin
  if v_inmobiliaria is null then
    raise exception 'Proyecto no encontrado.';
  end if;

  if not public.can_admin_inmobiliaria(v_inmobiliaria) then
    raise exception 'No tienes permisos para administrar este proyecto.';
  end if;

  delete from public.proyecto_ejecutivos
  where proyecto_id = p_project_id
    and ejecutivo_email = lower(trim(coalesce(p_email, '')));

  return true;
end;
$$;

-- Onboarding de un cliente real: solo un admin global puede crear admins de tenant.
create or replace function public.assign_admin(p_inmobiliaria_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_target uuid;
begin
  if coalesce(public.get_my_role(), '') <> 'admin' or public.get_my_inmobiliaria() is not null then
    raise exception 'Solo un administrador global puede asignar administradores de inmobiliaria.';
  end if;

  if not exists (select 1 from public.inmobiliarias where id = p_inmobiliaria_id) then
    raise exception 'Inmobiliaria no encontrada.';
  end if;

  select p.id into v_target
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = v_email
  limit 1;

  if v_target is null then
    raise exception 'No existe una cuenta registrada con ese correo.';
  end if;

  update public.profiles
  set role = 'admin',
      inmobiliaria_id = p_inmobiliaria_id
  where id = v_target;

  return v_target;
end;
$$;

-- Resuelve vínculos 'pendiente' cuyo correo ya tiene cuenta de ejecutivo.
create or replace function public.resolve_pending_executives()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope uuid := public.get_my_inmobiliaria();
  v_count integer := 0;
begin
  if coalesce(public.get_my_role(), '') not in ('admin', 'ejecutivo') then
    return 0;
  end if;

  update public.profiles p
  set inmobiliaria_id = c.inmobiliaria_id
  from (
    select distinct on (prof.id) prof.id as exec_id, pr.inmobiliaria_id
    from public.proyecto_ejecutivos pe
    join public.proyectos pr on pr.id = pe.proyecto_id
    join auth.users u on lower(u.email) = pe.ejecutivo_email
    join public.profiles prof on prof.id = u.id
    where pe.estado = 'pendiente'
      and prof.role = 'ejecutivo'
      and prof.inmobiliaria_id is null
      and (v_scope is null or pr.inmobiliaria_id = v_scope)
    order by prof.id, pe.created_at
  ) c
  where p.id = c.exec_id;

  update public.proyecto_ejecutivos pe
  set ejecutivo_id = m.exec_id,
      estado = 'vinculado'
  from (
    select pe2.proyecto_id, pe2.ejecutivo_email, prof.id as exec_id
    from public.proyecto_ejecutivos pe2
    join public.proyectos pr on pr.id = pe2.proyecto_id
    join auth.users u on lower(u.email) = pe2.ejecutivo_email
    join public.profiles prof on prof.id = u.id
    where pe2.estado = 'pendiente'
      and prof.role = 'ejecutivo'
      and prof.inmobiliaria_id = pr.inmobiliaria_id
      and (v_scope is null or pr.inmobiliaria_id = v_scope)
  ) m
  where pe.proyecto_id = m.proyecto_id
    and pe.ejecutivo_email = m.ejecutivo_email;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.get_my_inmobiliaria() to authenticated;
grant execute on function public.get_proyecto_inmobiliaria(uuid) to authenticated;
grant execute on function public.can_admin_inmobiliaria(uuid) to authenticated;
grant execute on function public.assign_executive(uuid, text) to authenticated;
grant execute on function public.unassign_executive(uuid, text) to authenticated;
grant execute on function public.assign_admin(uuid, text) to authenticated;
grant execute on function public.resolve_pending_executives() to authenticated;

-- -------------------------------------------------------------
-- 5. RLS
-- -------------------------------------------------------------
alter table public.inmobiliarias enable row level security;
alter table public.proyectos enable row level security;
alter table public.proyecto_ejecutivos enable row level security;

-- Inmobiliarias: cualquier staff autenticado las lee (necesita el nombre del tenant);
-- solo el admin global las crea o renombra.
drop policy if exists "Inmobiliarias select staff" on public.inmobiliarias;
create policy "Inmobiliarias select staff"
  on public.inmobiliarias
  for select
  using (public.get_my_role() = any (array['admin'::text, 'ejecutivo'::text]));

drop policy if exists "Inmobiliarias insert global admin" on public.inmobiliarias;
create policy "Inmobiliarias insert global admin"
  on public.inmobiliarias
  for insert
  with check (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null);

drop policy if exists "Inmobiliarias update global admin" on public.inmobiliarias;
create policy "Inmobiliarias update global admin"
  on public.inmobiliarias
  for update
  using (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  with check (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null);

-- Proyectos: CRUD del admin de su tenant; el ejecutivo solo lee su tenant (base de HU 13).
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

drop policy if exists "Proyectos insert admin tenant" on public.proyectos;
create policy "Proyectos insert admin tenant"
  on public.proyectos
  for insert
  with check (public.can_admin_inmobiliaria(inmobiliaria_id));

drop policy if exists "Proyectos update admin tenant" on public.proyectos;
create policy "Proyectos update admin tenant"
  on public.proyectos
  for update
  using (public.can_admin_inmobiliaria(inmobiliaria_id))
  with check (public.can_admin_inmobiliaria(inmobiliaria_id));

drop policy if exists "Proyectos delete admin tenant" on public.proyectos;
create policy "Proyectos delete admin tenant"
  on public.proyectos
  for delete
  using (public.can_admin_inmobiliaria(inmobiliaria_id));

-- proyecto_ejecutivos: mismo criterio de tenant vía el proyecto padre.
-- Las mutaciones pasan por los RPC; aquí solo se abre lectura.
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

-- Profiles: cierra el hueco multi-tenant. Un admin con inmobiliaria asignada
-- solo ve/edita ejecutivos de su inmobiliaria (o sin inmobiliaria, para poder
-- captarlos); el admin global (NULL) conserva acceso total.
drop policy if exists "Profiles select admin" on public.profiles;
create policy "Profiles select admin"
  on public.profiles
  for select
  using (
    public.get_my_role() = 'admin'
    and (
      public.get_my_inmobiliaria() is null
      or (
        role = 'ejecutivo'
        and (inmobiliaria_id = public.get_my_inmobiliaria() or inmobiliaria_id is null)
      )
    )
  );

drop policy if exists "Permitir a los admins actualizar cualquier perfil" on public.profiles;
drop policy if exists "Profiles update admin" on public.profiles;
create policy "Profiles update admin"
  on public.profiles
  for update
  using (
    public.get_my_role() = 'admin'
    and (
      public.get_my_inmobiliaria() is null
      or (
        role = 'ejecutivo'
        and (inmobiliaria_id = public.get_my_inmobiliaria() or inmobiliaria_id is null)
      )
    )
  )
  with check (
    public.get_my_role() = 'admin'
    and (
      public.get_my_inmobiliaria() is null
      or (
        role = 'ejecutivo'
        and (inmobiliaria_id = public.get_my_inmobiliaria() or inmobiliaria_id is null)
      )
    )
  );

-- -------------------------------------------------------------
-- 6. Seed de prueba (solo inmobiliarias imaginarias)
-- -------------------------------------------------------------
-- El cliente real (Echeverría Izquierdo) NO se siembra: se incorpora
-- con assign_admin + la UI de inmobiliarias.
insert into public.inmobiliarias (nombre)
values
  ('Inmobiliaria Andes (demo)'),
  ('Inmobiliaria Pacífico (demo)')
on conflict (nombre) do nothing;

-- Los dos primeros proyectos reproducen los ejemplos trabajados de
-- Spike 1 E4 §9.2, para que el matching de HU 13 sea verificable contra
-- números publicados: con el Perfil 2 (capacidad 3.060 UF, comuna_objetivo
-- Ñuñoa, clasificación Medio) "Altos de Macul" debe dar afinidad 62,1
-- ("Cercano", brecha 140,4 UF ≈ $1,15 MM de ahorro) y "Parque Lo Espejo"
-- afinidad 70,0 ("Compatible", sin brecha). No cambiar sus valores sin
-- actualizar el spike.
-- Los cuatro restantes cubren, a propósito: proyecto agotado (E4) y sobre el
-- tope FOGAES, venta en verde dentro del feed, comuna fuera de
-- PRECIOS_REFERENCIA_UF, y proyecto de precio único (precio_min = precio_max).
insert into public.proyectos (inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado)
select i.id, v.nombre, v.comuna, v.tipo, v.precio_min_uf, v.precio_max_uf, v.estado
from (
  values
    ('Inmobiliaria Andes (demo)', 'Altos de Macul', 'Macul', 'departamento', 2400::numeric, 3200::numeric, 'disponible'),
    ('Inmobiliaria Andes (demo)', 'Parque Lo Espejo', 'Lo Espejo', 'departamento', 1800::numeric, 2600::numeric, 'disponible'),
    ('Inmobiliaria Andes (demo)', 'Mirador Las Condes', 'Las Condes', 'departamento', 8000::numeric, 11000::numeric, 'agotado'),
    ('Inmobiliaria Pacífico (demo)', 'Terrazas de Maipú', 'Maipú', 'casa', 2900::numeric, 3900::numeric, 'en_construccion'),
    ('Inmobiliaria Pacífico (demo)', 'Bosques de Colina', 'Colina', 'casa', 3400::numeric, 5200::numeric, 'disponible'),
    ('Inmobiliaria Pacífico (demo)', 'Puerta Sur', 'San Bernardo', 'departamento', 4500::numeric, 4500::numeric, 'disponible')
) as v(inmobiliaria, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado)
join public.inmobiliarias i on i.nombre = v.inmobiliaria
on conflict do nothing;
