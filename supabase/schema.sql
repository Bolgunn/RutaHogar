-- RutaHogar platform schema.
-- Ejecutar en Supabase SQL Editor o como migracion inicial.
-- Tablas principales de RutaHogar: profiles, evaluations, improvement_goals, scoring_history.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'usuario',
  onboarding_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('usuario', 'ejecutivo', 'admin'))
);

alter table public.profiles
add column if not exists onboarding_data jsonb,
add column if not exists last_lead_seen_at timestamptz,
add column if not exists phone text,
add column if not exists birth_date date;

alter table public.profiles
add column if not exists consent_data jsonb;

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null,
  classification text not null,
  objective text,
  property_type text,
  target_commune text,
  alternative_commune text,
  purchase_timeline text,
  financial_data jsonb,
  explanation text,
  recommendations jsonb not null default '[]'::jsonb,
  plan_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint evaluations_score_check check (score between 0 and 100),
  constraint evaluations_classification_check check (classification in ('Alto', 'Medio', 'Bajo'))
);

alter table public.evaluations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and tablename = 'evaluations'
    and schemaname = 'public'
  ) then
    alter publication supabase_realtime add table public.evaluations;
  end if;
end;
$$;

alter table public.evaluations
add column if not exists objective text,
add column if not exists property_type text,
add column if not exists target_commune text,
add column if not exists alternative_commune text,
add column if not exists purchase_timeline text,
add column if not exists financial_data jsonb,
add column if not exists plan_accepted_at timestamptz;

create table if not exists public.improvement_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  evaluation_id uuid references public.evaluations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pendiente',
  progress_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint improvement_goals_status_check check (status in ('pendiente', 'en_progreso', 'completada'))
);

alter table public.improvement_goals
add column if not exists progress_data jsonb;

create table if not exists public.scoring_history (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null,
  classification text not null,
  snapshot jsonb not null,
  component_scores jsonb not null,
  algorithm_version text not null,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint scoring_history_score_check check (score between 0 and 100),
  constraint scoring_history_classification_check check (classification in ('Alto', 'Medio', 'Bajo')),
  constraint scoring_history_channel_check check (channel in ('web', 'chatbot', 'whatsapp', 'vendedor'))
);

alter table public.scoring_history
add column if not exists algorithm_version text,
add column if not exists channel text;

alter table public.scoring_history
alter column algorithm_version set not null,
alter column channel set not null;

create index if not exists scoring_history_user_created_idx
  on public.scoring_history (user_id, created_at desc);

create table if not exists public.arco_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null,
  email text not null,
  descripcion text not null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arco_requests_tipo_check check (tipo in ('acceso', 'rectificacion', 'cancelacion', 'oposicion', 'otro')),
  constraint arco_requests_estado_check     check (estado in ('pendiente', 'en_proceso', 'rechazado', 'procesado'))
);

alter table public.arco_requests enable row level security;

drop policy if exists "ARCO insert own" on public.arco_requests;
create policy "ARCO insert own"
  on public.arco_requests
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "ARCO select own" on public.arco_requests;
create policy "ARCO select own"
  on public.arco_requests
  for select
  using (auth.uid() = user_id);

-- Las políticas de admin sobre ARCO viven al final de este archivo: dependen de
-- is_global_admin(), que a su vez necesita profiles.inmobiliaria_id.

drop trigger if exists arco_requests_set_updated_at on public.arco_requests;
create trigger arco_requests_set_updated_at
  before update on public.arco_requests
  for each row execute function public.set_updated_at();

create index if not exists arco_requests_user_created_idx
  on public.arco_requests (user_id, created_at desc);

create index if not exists arco_requests_estado_idx
  on public.arco_requests (estado);

create index if not exists evaluations_user_created_idx
  on public.evaluations (user_id, created_at desc);

create index if not exists improvement_goals_user_evaluation_idx
  on public.improvement_goals (user_id, evaluation_id, created_at);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists improvement_goals_set_updated_at on public.improvement_goals;
create trigger improvement_goals_set_updated_at
before update on public.improvement_goals
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.evaluations enable row level security;
alter table public.improvement_goals enable row level security;
alter table public.scoring_history enable row level security;

-- Helper SECURITY DEFINER: lee el rol del usuario sin disparar RLS
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "Profiles select own" on public.profiles;
create policy "Profiles select own"
on public.profiles
for select
using (auth.uid() = id::uuid);

drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own"
on public.profiles
for insert
with check (auth.uid() = id::uuid);

drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own"
on public.profiles
for update
using (auth.uid() = id::uuid)
with check (auth.uid() = id::uuid);

drop policy if exists "Profiles select admin" on public.profiles;
create policy "Profiles select admin"
  on public.profiles
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

drop policy if exists "Permitir a los admins actualizar cualquier perfil" on public.profiles;
create policy "Permitir a los admins actualizar cualquier perfil"
  on public.profiles
  for update
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

alter table public.evaluations 
add column if not exists email text;

drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select
  using (
    (auth.uid() = user_id)
    or
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]))
  );

drop policy if exists "Evaluations insert own" on public.evaluations;
create policy "Evaluations insert own"
on public.evaluations
for insert
with check (auth.uid() = user_id::uuid);

-- Entrega solo contacto de leads a ejecutivos y administradores. La función
-- evita abrir lectura directa de todos los perfiles personales al staff.
create or replace function public.list_lead_contacts(p_user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.phone
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and p.role = 'usuario'
    and coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text]);
$$;

revoke all on function public.list_lead_contacts(uuid[]) from public;
grant execute on function public.list_lead_contacts(uuid[]) to authenticated;

drop policy if exists "Evaluations delete own" on public.evaluations;
create policy "Evaluations delete own"
on public.evaluations
for delete
using (auth.uid() = user_id::uuid);

drop policy if exists "Improvement goals select own" on public.improvement_goals;
create policy "Improvement goals select own"
on public.improvement_goals
for select
using (auth.uid() = user_id::uuid);

drop policy if exists "Improvement goals insert own" on public.improvement_goals;
create policy "Improvement goals insert own"
on public.improvement_goals
for insert
with check (auth.uid() = user_id::uuid);

drop policy if exists "Improvement goals update own" on public.improvement_goals;
create policy "Improvement goals update own"
on public.improvement_goals
for update
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

drop policy if exists "Improvement goals delete own" on public.improvement_goals;
create policy "Improvement goals delete own"
on public.improvement_goals
for delete
using (auth.uid() = user_id::uuid);

drop policy if exists "Scoring history insert own" on public.scoring_history;
create policy "Scoring history insert own"
on public.scoring_history
for insert
with check (auth.uid() = user_id::uuid);

drop policy if exists "Scoring history select own" on public.scoring_history;
create policy "Scoring history select own"
on public.scoring_history
for select
using (auth.uid() = user_id::uuid);

-- Migracion: endurecer FK para evitar borrado en cascada del historial inmutable.
alter table public.scoring_history
  drop constraint if exists scoring_history_evaluation_id_fkey,
  add constraint scoring_history_evaluation_id_fkey
    foreign key (evaluation_id) references public.evaluations(id) on delete restrict;

-- =============================================================
-- HU 7 — Catálogo multi-tenant de proyectos inmobiliarios
-- Espejo de supabase/migrations/20260729_project_catalog.sql
-- =============================================================

create table if not exists public.inmobiliarias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists inmobiliaria_id uuid references public.inmobiliarias(id) on delete set null;

create index if not exists profiles_inmobiliaria_idx
  on public.profiles (inmobiliaria_id);

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

create unique index if not exists proyectos_nombre_por_inmobiliaria_idx
  on public.proyectos (inmobiliaria_id, lower(nombre));

create index if not exists proyectos_inmobiliaria_estado_idx
  on public.proyectos (inmobiliaria_id, estado);

drop trigger if exists proyectos_set_updated_at on public.proyectos;
create trigger proyectos_set_updated_at
before update on public.proyectos
for each row execute function public.set_updated_at();

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

-- El correo vive en auth.users, que el rol `authenticated` no puede leer. Una
-- policy se evalua CON LOS PRIVILEGIOS DE QUIEN CONSULTA, asi que un subselect
-- a auth.users dentro de un USING no devuelve null: revienta con "permission
-- denied for table users" y tumba el SELECT entero. Por eso el correo se lee
-- por aca, en SECURITY DEFINER, igual que get_my_role y get_my_inmobiliaria.
create or replace function public.get_my_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;

grant execute on function public.get_my_email() to authenticated;

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
        or pe.ejecutivo_email = public.get_my_email()
      )
  );
$$;

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

alter table public.inmobiliarias enable row level security;
alter table public.proyectos enable row level security;
alter table public.proyecto_ejecutivos enable row level security;

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

drop policy if exists "Proyectos select tenant" on public.proyectos;
-- El ejecutivo solo ve los proyectos donde esta asignado (HU 10, migracion
-- 20260831090000). El admin conserva el catalogo completo de su tenant.
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

drop policy if exists "Proyecto ejecutivos select tenant" on public.proyecto_ejecutivos;
-- El ejecutivo ve sus propias asignaciones y nada mas, siempre dentro de su
-- tenant: sin ese gate, una asignacion 'pendiente' creada por el admin de otra
-- inmobiliaria tecleando un correo seria legible por el dueno de ese correo.
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
      and public.get_my_inmobiliaria() = public.get_proyecto_inmobiliaria(proyecto_id)
      and (
        ejecutivo_id = auth.uid()
        or ejecutivo_email = public.get_my_email()
      )
    )
  );

-- Cierra el hueco multi-tenant en profiles: el admin con inmobiliaria asignada
-- solo ve/edita ejecutivos de su inmobiliaria; el admin global conserva todo.
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

insert into public.inmobiliarias (nombre)
values
  ('Inmobiliaria Andes (demo)'),
  ('Inmobiliaria Pacífico (demo)')
on conflict (nombre) do nothing;

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
-- =============================================================
-- ScoreLeads — HU 7: alta de ejecutivos comerciales por el admin
-- =============================================================
-- El alta de la cuenta ocurre en la Edge Function `create-executive`
-- (necesita service_role para tocar auth.users). Aquí solo va la lectura
-- del roster, que la UI usa para listar los ejecutivos del tenant.
--
-- `profiles` no guarda el correo — vive en auth.users, que el cliente no
-- puede leer. Por eso el listado pasa por esta función SECURITY DEFINER
-- en vez de un select directo desde el frontend.

create or replace function public.list_inmobiliaria_executives(p_inmobiliaria_id uuid default null)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  inmobiliaria_id uuid,
  inmobiliaria_nombre text,
  proyectos_asignados bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    u.email::text,
    p.full_name,
    p.phone,
    p.inmobiliaria_id,
    i.nombre,
    (select count(*) from public.proyecto_ejecutivos pe where pe.ejecutivo_id = p.id),
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.inmobiliarias i on i.id = p.inmobiliaria_id
  where p.role = 'ejecutivo'
    -- Solo un admin lee el roster; el scoped admin queda acotado a su tenant.
    and coalesce(public.get_my_role(), '') = 'admin'
    and (
      public.get_my_inmobiliaria() is null
      or p.inmobiliaria_id = public.get_my_inmobiliaria()
    )
    and (p_inmobiliaria_id is null or p.inmobiliaria_id = p_inmobiliaria_id)
  order by p.full_name nulls last, u.email;
$$;

grant execute on function public.list_inmobiliaria_executives(uuid) to authenticated;

-- =============================================================
-- Solicitudes ARCO: solo el admin global
-- =============================================================
-- Una solicitud ARCO es un derecho de datos personales de un lead y no
-- pertenece a ninguna inmobiliaria. Un admin con inmobiliaria asignada no debe
-- leer correos ni solicitudes de leads de otros tenants.
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
