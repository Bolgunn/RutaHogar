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
using (auth.uid() = id);

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
using (auth.uid() = user_id);

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

drop policy if exists "Scoring history select staff" on public.scoring_history;
create policy "Scoring history select staff"
  on public.scoring_history
  for select
  using (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]));

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

create table if not exists public.proyecto_favoritos (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id)
);

create index if not exists proyecto_favoritos_usuario_idx
  on public.proyecto_favoritos (usuario_id);

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
alter table public.proyecto_favoritos enable row level security;

drop policy if exists "Inmobiliarias select staff" on public.inmobiliarias;
create policy "Inmobiliarias select staff"
  on public.inmobiliarias
  for select
  using (public.get_my_role() = any (array['admin'::text, 'ejecutivo'::text]));

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

drop policy if exists "Proyectos select lead" on public.proyectos;
create policy "Proyectos select lead"
  on public.proyectos
  for select
  using (
    public.get_my_role() = 'usuario'
    and estado <> 'agotado'
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

drop policy if exists "Proyecto favoritos select propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos select propio"
  on public.proyecto_favoritos
  for select
  using (usuario_id = auth.uid());

drop policy if exists "Proyecto favoritos insert propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos insert propio"
  on public.proyecto_favoritos
  for insert
  with check (usuario_id = auth.uid());

drop policy if exists "Proyecto favoritos delete propio" on public.proyecto_favoritos;
create policy "Proyecto favoritos delete propio"
  on public.proyecto_favoritos
  for delete
  using (usuario_id = auth.uid());

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

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

revoke execute on function public.find_user_id_by_email(text) from public;
revoke execute on function public.find_user_id_by_email(text) from anon;
revoke execute on function public.find_user_id_by_email(text) from authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

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

-- HU13: immutable source facts. Apply manually after review; no legacy backfill.
begin;

create unique index if not exists evaluations_id_user_unique on public.evaluations(id, user_id);
create table if not exists public.tracking_plans (
  id uuid primary key,
  user_id uuid not null unique references public.profiles(id),
  baseline_evaluation_id uuid not null,
  root_event_id uuid not null,
  baseline_at timestamptz not null,
  original_plan_snapshot jsonb not null,
  target_project_snapshot jsonb,
  provenance jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(id, user_id),
  foreign key(baseline_evaluation_id, user_id) references public.evaluations(id, user_id)
);

create table if not exists public.tracking_events (
  event_id uuid primary key,
  plan_id uuid not null,
  user_id uuid not null,
  event_kind text not null check (event_kind in ('baseline', 'data_update', 'evaluation', 'correction')),
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  reason text not null check (length(trim(reason)) > 0),
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  recorded_complete_snapshot jsonb not null check (jsonb_typeof(recorded_complete_snapshot) = 'object'),
  previous_event_id uuid,
  correction_of_event_id uuid,
  correction_effect text check (correction_effect in ('replace', 'annul')),
  evaluation_id uuid,
  canonical_request jsonb,
  command_result jsonb,
  algorithm_version text not null,
  provenance jsonb not null,
  unique(event_id, plan_id, user_id),
  foreign key(plan_id, user_id) references public.tracking_plans(id, user_id),
  foreign key(evaluation_id, user_id) references public.evaluations(id, user_id),
  foreign key(previous_event_id, plan_id, user_id)
    references public.tracking_events(event_id, plan_id, user_id),
  foreign key(correction_of_event_id, plan_id, user_id)
    references public.tracking_events(event_id, plan_id, user_id),
  check (previous_event_id is distinct from event_id),
  check (correction_of_event_id is distinct from event_id),
  check ((event_kind = 'correction' and correction_of_event_id is not null and correction_effect is not null)
      or (event_kind <> 'correction' and correction_of_event_id is null and correction_effect is null)),
  check (correction_effect is distinct from 'annul' or patch = '{}'::jsonb)
);

alter table public.tracking_plans drop constraint if exists tracking_plans_root_fk;
alter table public.tracking_plans add constraint tracking_plans_root_fk
  foreign key(root_event_id, id, user_id)
  references public.tracking_events(event_id, plan_id, user_id) deferrable initially deferred;

create index if not exists tracking_events_effective_idx
  on public.tracking_events(user_id, plan_id, effective_at, recorded_at, event_id);
create index if not exists tracking_events_audit_idx
  on public.tracking_events(user_id, plan_id, recorded_at, event_id);
create index if not exists tracking_events_correction_idx
  on public.tracking_events(correction_of_event_id);
create unique index if not exists tracking_events_evaluation_unique
  on public.tracking_events(evaluation_id) where evaluation_id is not null;
create unique index if not exists tracking_events_baseline_unique
  on public.tracking_events(plan_id) where event_kind = 'baseline';

alter table public.improvement_goals
  add column if not exists tracking_plan_id uuid,
  add column if not exists baseline_event_id uuid,
  add column if not exists source_action_type text,
  add column if not exists source_ordinal integer,
  add column if not exists metric text,
  add column if not exists goal_type text,
  add column if not exists direction text,
  add column if not exists initial_value jsonb,
  add column if not exists target_value jsonb,
  add column if not exists unit text,
  add column if not exists target_at timestamptz,
  add column if not exists verification_kind text,
  add column if not exists verification_source jsonb,
  add column if not exists definition_version text;
create unique index if not exists improvement_goals_id_plan_user_unique
  on public.improvement_goals(id, tracking_plan_id, user_id);
alter table public.improvement_goals drop constraint if exists improvement_goals_tracking_fk;
alter table public.improvement_goals add constraint improvement_goals_tracking_fk
  foreign key(tracking_plan_id, user_id) references public.tracking_plans(id, user_id);
alter table public.improvement_goals drop constraint if exists improvement_goals_baseline_fk;
alter table public.improvement_goals add constraint improvement_goals_baseline_fk
  foreign key(baseline_event_id, tracking_plan_id, user_id)
  references public.tracking_events(event_id, plan_id, user_id);
alter table public.improvement_goals drop constraint if exists improvement_goals_tracking_contract;
alter table public.improvement_goals add constraint improvement_goals_tracking_contract check (
  tracking_plan_id is null or (
    baseline_event_id is not null and source_action_type is not null and source_ordinal is not null
    and goal_type in ('numeric', 'boolean', 'categorical') and goal_type is not null
    and verification_kind in ('automatic', 'manual') and verification_kind is not null
    and target_value is not null and definition_version is not null
    and (goal_type <> 'numeric' or
      (direction in ('increase', 'reduce') and direction is not null and initial_value is not null))
    and (verification_kind <> 'automatic' or verification_source is not null)
  )
);

create table if not exists public.improvement_goal_events (
  event_id uuid primary key,
  goal_id uuid not null,
  plan_id uuid not null,
  user_id uuid not null,
  confirmed boolean not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  reason text not null check(length(trim(reason)) > 0),
  source_event_id uuid not null,
  canonical_request jsonb not null,
  foreign key(goal_id, plan_id, user_id) references public.improvement_goals(id, tracking_plan_id, user_id),
  foreign key(source_event_id, plan_id, user_id) references public.tracking_events(event_id, plan_id, user_id)
);

create table if not exists public.evaluation_events (
  event_id uuid primary key,
  evaluation_id uuid not null,
  user_id uuid not null,
  kind text not null,
  payload jsonb not null,
  effective_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  provenance jsonb not null,
  foreign key(evaluation_id, user_id) references public.evaluations(id, user_id)
);

alter table public.evaluations drop constraint if exists evaluations_classification_check;
alter table public.evaluations add constraint evaluations_classification_check
  check (classification in ('Alto', 'Medio', 'Bajo', 'Requiere antecedentes'));
alter table public.scoring_history drop constraint if exists scoring_history_classification_check;
alter table public.scoring_history add constraint scoring_history_classification_check
  check (classification in ('Alto', 'Medio', 'Bajo', 'Requiere antecedentes'));
alter table public.scoring_history add column if not exists events jsonb not null default '[]'::jsonb;

alter table public.tracking_plans enable row level security;
alter table public.tracking_events enable row level security;
alter table public.improvement_goal_events enable row level security;
alter table public.evaluation_events enable row level security;

drop policy if exists "Tracking plans select own" on public.tracking_plans;
create policy "Tracking plans select own" on public.tracking_plans
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Tracking events select own" on public.tracking_events;
create policy "Tracking events select own" on public.tracking_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Goal events select own" on public.improvement_goal_events;
create policy "Goal events select own" on public.improvement_goal_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Evaluation events select own" on public.evaluation_events;
create policy "Evaluation events select own" on public.evaluation_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Evaluation events select staff" on public.evaluation_events;
create policy "Evaluation events select staff" on public.evaluation_events
  for select to authenticated using (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]));

-- Disable legacy mutation policies rather than leave permissive alternatives.
drop policy if exists "Evaluations update own" on public.evaluations;
create policy "Evaluations update own" on public.evaluations
  for update using (false) with check (false);
drop policy if exists "Evaluations delete own" on public.evaluations;
create policy "Evaluations delete own" on public.evaluations
  for delete using (false);
drop policy if exists "Scoring history update own" on public.scoring_history;
create policy "Scoring history update own" on public.scoring_history
  for update using (false) with check (false);
drop policy if exists "Improvement goals insert own" on public.improvement_goals;
create policy "Improvement goals insert own" on public.improvement_goals
  for insert with check (auth.uid() = user_id and tracking_plan_id is null);
drop policy if exists "Improvement goals update own" on public.improvement_goals;
create policy "Improvement goals update own" on public.improvement_goals
  for update using (auth.uid() = user_id and tracking_plan_id is null)
  with check (auth.uid() = user_id and tracking_plan_id is null);
drop policy if exists "Improvement goals delete own" on public.improvement_goals;
create policy "Improvement goals delete own" on public.improvement_goals
  for delete using (auth.uid() = user_id and tracking_plan_id is null);

revoke insert, update, delete on public.tracking_plans, public.tracking_events,
  public.improvement_goal_events, public.evaluation_events from anon, authenticated;
grant select on public.tracking_plans, public.tracking_events,
  public.improvement_goal_events, public.evaluation_events to authenticated;
grant select, insert on public.tracking_plans, public.tracking_events,
  public.improvement_goal_events, public.evaluation_events to service_role;
revoke insert, update, delete on public.evaluations, public.scoring_history from anon, authenticated;

create or replace function public.hu13_reject_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'tracking_plans' and tg_op = 'UPDATE'
     and old.target_project_snapshot is null
     and new.target_project_snapshot is not null
     and jsonb_typeof(new.target_project_snapshot) = 'object'
     and new.target_project_snapshot <> '{}'::jsonb
     and (to_jsonb(new) - 'target_project_snapshot') = (to_jsonb(old) - 'target_project_snapshot') then
    return new;
  end if;
  if tg_table_name = 'improvement_goals' then
    if old.tracking_plan_id is null then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  end if;
  raise exception 'immutable_history' using errcode = '23514';
end;
$$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'tracking_plans', 'tracking_events', 'improvement_goal_events',
    'evaluation_events', 'evaluations', 'scoring_history', 'improvement_goals'
  ] loop
    execute format('drop trigger if exists hu13_immutable on public.%I', relation_name);
    execute format(
      'create trigger hu13_immutable before update or delete on public.%I
       for each row execute function public.hu13_reject_mutation()', relation_name
    );
  end loop;
end;
$$;

-- The backend validates the bearer subject; only service_role can call these RPCs.
-- One read statement observes a consistent database snapshot.
create or replace function public.hu13_read(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan', (select to_jsonb(p) from tracking_plans p where user_id = p_user_id),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by recorded_at, event_id)
      from tracking_events e where user_id = p_user_id), '[]'::jsonb),
    'goals', coalesce((select jsonb_agg(to_jsonb(g) order by source_ordinal)
      from improvement_goals g where user_id = p_user_id and tracking_plan_id is not null), '[]'::jsonb),
    'goal_events', coalesce((select jsonb_agg(to_jsonb(g) order by effective_at, recorded_at, event_id)
      from improvement_goal_events g where user_id = p_user_id), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(to_jsonb(e))
      from evaluations e where user_id = p_user_id), '[]'::jsonb),
    'revision', (select event_id from tracking_events where user_id = p_user_id
      order by recorded_at desc, event_id desc limit 1)
  );
$$;

create or replace function public.hu13_commit(
  p_user_id uuid, p_command jsonb, p_expected_revision uuid, p_records jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  existing tracking_events%rowtype;
  current_revision uuid;
  plan_id_value uuid;
  frozen_target_project jsonb;
  item jsonb;
  result jsonb;
  plan_data jsonb := p_records->'plan';
  stamp timestamptz;
begin
  -- The profile lock also serializes two competing first-baseline commands.
  perform 1 from profiles where id = p_user_id for update;
  if not found then raise exception 'not_found'; end if;
  select * into existing from tracking_events where event_id = (p_command->>'event_id')::uuid;
  if found then
    if existing.user_id <> p_user_id then raise exception 'owner_mismatch'; end if;
    if existing.canonical_request is distinct from p_command then raise exception 'idempotency_conflict'; end if;
    return existing.command_result;
  end if;
  select event_id into current_revision from tracking_events where user_id = p_user_id
    order by recorded_at desc, event_id desc limit 1;
  if current_revision is distinct from p_expected_revision then raise exception 'lineage_conflict'; end if;
  select id, target_project_snapshot into plan_id_value, frozen_target_project
    from tracking_plans where user_id = p_user_id for update;
  if plan_id_value is null then
    plan_id_value := (plan_data->>'id')::uuid;
    if plan_id_value is null then raise exception 'invalid_baseline'; end if;
  elsif plan_data is not null and plan_data <> 'null'::jsonb then
    raise exception 'immutable_baseline';
  end if;
  result := p_records->'result';
  if result is null or jsonb_array_length(p_records->'events') < 1
    or (p_records->'events'->0->>'event_id')::uuid <> (p_command->>'event_id')::uuid then
    raise exception 'invalid_command';
  end if;
  for item in select value from jsonb_array_elements(p_records->'evaluations') loop
    insert into evaluations(id, user_id, score, classification, financial_data, recommendations, explanation)
    values ((item->>'id')::uuid, p_user_id, round((item->'result'->>'score')::numeric),
      item->'result'->>'classification',
      jsonb_build_object('input', item->'snapshot', 'result', item->'result', 'provenance', item->'provenance'),
      coalesce(item->'result'->'recommendations', '[]'::jsonb), item->'result'->>'explanation');
    insert into scoring_history(evaluation_id, user_id, score, classification, snapshot,
      component_scores, algorithm_version, channel)
    values ((item->>'id')::uuid, p_user_id, round((item->'result'->>'score')::numeric),
      item->'result'->>'classification',
      jsonb_build_object('input', item->'snapshot', 'result', item->'result', 'provenance', item->'provenance'),
      item->'result'->'component_scores', item->'result'->>'algorithm_version', 'web');
  end loop;
  if plan_data is not null and plan_data <> 'null'::jsonb then
    insert into tracking_plans(id, user_id, baseline_evaluation_id, root_event_id, baseline_at,
      original_plan_snapshot, target_project_snapshot, provenance)
    values (plan_id_value, p_user_id, (plan_data->>'baseline_evaluation_id')::uuid,
      (plan_data->>'root_event_id')::uuid, (plan_data->>'baseline_at')::timestamptz,
      plan_data->'original_plan_snapshot', plan_data->'target_project_snapshot', plan_data->'provenance');
  elsif frozen_target_project is null
      and jsonb_typeof(p_records->'target_project_snapshot') = 'object'
      and p_records->'target_project_snapshot' <> '{}'::jsonb then
    update tracking_plans
      set target_project_snapshot = p_records->'target_project_snapshot'
      where id = plan_id_value and target_project_snapshot is null;
  end if;
  for item in select value from jsonb_array_elements(p_records->'events') loop
    stamp := clock_timestamp();
    -- Relations must name already inserted rows, preventing cycles among new events.
    if item->>'previous' is not null and not exists (
      select 1 from tracking_events where event_id = (item->>'previous')::uuid
        and plan_id = plan_id_value and user_id = p_user_id
    ) then raise exception 'invalid_lineage'; end if;
    if item->>'correction_of' is not null and not exists (
      select 1 from tracking_events where event_id = (item->>'correction_of')::uuid
        and plan_id = plan_id_value and user_id = p_user_id
    ) then raise exception 'invalid_lineage'; end if;
    insert into tracking_events(event_id, plan_id, user_id, event_kind, effective_at,
      recorded_at, reason, patch, recorded_complete_snapshot, previous_event_id,
      correction_of_event_id, correction_effect, evaluation_id, canonical_request,
      command_result, algorithm_version, provenance)
    values ((item->>'event_id')::uuid, plan_id_value, p_user_id, item->>'event_kind',
      (item->>'effective_at')::timestamptz, stamp, item->>'reason', item->'patch',
      item->'recorded_complete_snapshot', (item->>'previous')::uuid,
      (item->>'correction_of')::uuid, item->>'correction_effect', (item->>'evaluation_id')::uuid,
      p_command, result, item->>'algorithm_version', item->'provenance');
  end loop;
  for item in select value from jsonb_array_elements(p_records->'goals') loop
    insert into improvement_goals(id, user_id, evaluation_id, title, description, progress_data,
      tracking_plan_id, baseline_event_id, source_action_type, source_ordinal, metric,
      goal_type, direction, initial_value, target_value, unit, target_at, verification_kind,
      verification_source, definition_version)
    values ((item->>'id')::uuid, p_user_id, (plan_data->>'baseline_evaluation_id')::uuid,
      item->>'title', item->>'description', item, plan_id_value, (plan_data->>'root_event_id')::uuid,
      item->>'source_action_type', (item->>'source_ordinal')::integer, item->>'source',
      item->>'type', item->>'direction', item->'initial_value', item->'target_value', item->>'unit',
      (item->>'target_at')::timestamptz,
      case when (item->>'verifiable')::boolean then 'automatic' else 'manual' end,
      item->'source', item->>'definition_version');
  end loop;
  return result;
end;
$$;

create or replace function public.hu13_confirm_goal(p_user_id uuid, p_goal_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare goal improvement_goals%rowtype; existing improvement_goal_events%rowtype; source_id uuid;
begin
  perform 1 from profiles where id = p_user_id for update;
  select * into goal from improvement_goals
    where id = p_goal_id and user_id = p_user_id and tracking_plan_id is not null;
  if not found then raise exception 'not_found'; end if;
  if goal.verification_kind <> 'manual' then raise exception 'verifiable_data_contradiction'; end if;
  select * into existing from improvement_goal_events where event_id = (p_command->>'event_id')::uuid;
  if found then
    if existing.user_id <> p_user_id then raise exception 'owner_mismatch'; end if;
    if existing.goal_id <> p_goal_id or existing.canonical_request <> p_command then
      raise exception 'idempotency_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  select event_id into source_id from tracking_events where user_id = p_user_id
    order by recorded_at desc, event_id desc limit 1;
  insert into improvement_goal_events(event_id, goal_id, plan_id, user_id, confirmed,
    effective_at, reason, source_event_id, canonical_request)
  values ((p_command->>'event_id')::uuid, p_goal_id, goal.tracking_plan_id, p_user_id,
    (p_command->>'confirmed')::boolean, (p_command->>'effective_at')::timestamptz,
    p_command->>'reason', source_id, p_command) returning * into existing;
  return to_jsonb(existing);
end;
$$;

create or replace function public.hu13_annotate_evaluation(p_user_id uuid, p_evaluation_id uuid, p_command jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare existing evaluation_events%rowtype;
begin
  perform 1 from profiles where id = p_user_id for update;
  perform 1 from evaluations where id = p_evaluation_id and user_id = p_user_id;
  if not found then raise exception 'not_found'; end if;
  if p_command->>'kind' not in ('plan_accepted', 'narrative', 'housing_plan', 'milestone') then
    raise exception 'invalid_annotation';
  end if;
  select * into existing from evaluation_events where event_id = (p_command->>'event_id')::uuid;
  if found then
    if existing.user_id <> p_user_id then raise exception 'owner_mismatch'; end if;
    if existing.evaluation_id <> p_evaluation_id or existing.provenance->'command' <> p_command then
      raise exception 'idempotency_conflict';
    end if;
    return to_jsonb(existing);
  end if;
  insert into evaluation_events(event_id, evaluation_id, user_id, kind, payload, effective_at, provenance)
  values ((p_command->>'event_id')::uuid, p_evaluation_id, p_user_id, p_command->>'kind',
    p_command->'payload', (p_command->>'effective_at')::timestamptz, jsonb_build_object('command', p_command))
  returning * into existing;
  return to_jsonb(existing);
end;
$$;

revoke all on function public.hu13_read(uuid),
  public.hu13_commit(uuid, jsonb, uuid, jsonb),
  public.hu13_confirm_goal(uuid, uuid, jsonb),
  public.hu13_annotate_evaluation(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.hu13_read(uuid),
  public.hu13_commit(uuid, jsonb, uuid, jsonb),
  public.hu13_confirm_goal(uuid, uuid, jsonb),
  public.hu13_annotate_evaluation(uuid, uuid, jsonb) to service_role;

commit;
