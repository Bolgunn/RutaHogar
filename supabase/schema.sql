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
  constraint profiles_role_check check (role in ('usuario', 'ejecutivo', 'admin', 'admin_inmobiliario'))
);

alter table public.profiles
add column if not exists onboarding_data jsonb,
add column if not exists last_lead_seen_at timestamptz,
add column if not exists phone text,
add column if not exists rut text,
add column if not exists birth_date date;

alter table public.profiles
add column if not exists consent_data jsonb,
add column if not exists reliability_status text not null default 'normal' check (reliability_status in ('normal', 'sospechoso', 'en_revision', 'descartado', 'reactivado', 'silenciado'));

create table if not exists public.lead_status_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  old_status text,
  new_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

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
  fraud_score_probability numeric,
  shap_top_factors jsonb,
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
add column if not exists plan_accepted_at timestamptz,
add column if not exists fraud_score_probability numeric,
add column if not exists shap_top_factors jsonb;

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

-- Los privilegios habilitan las operaciones; las policies RLS de abajo siguen
-- limitando las filas visibles y modificables para authenticated.
grant select, insert, update, delete
on table public.evaluations
to authenticated;

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
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]))
  );

drop policy if exists "Evaluations insert own" on public.evaluations;
create policy "Evaluations insert own"
on public.evaluations
for insert
with check (auth.uid() = user_id::uuid);

-- Entrega solo contacto de leads a ejecutivos y administradores. La función
-- evita abrir lectura directa de todos los perfiles personales al staff.
drop function if exists public.list_lead_contacts(uuid[]);
create or replace function public.list_lead_contacts(p_user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  phone text,
  reliability_status text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  -- evaluations.email no se completa desde HU13: el correo sale de auth.users.
  select p.id, p.full_name, p.phone, coalesce(p.reliability_status, 'normal') as reliability_status,
         u.email::text as email
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and p.role = 'usuario'
    and coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]);
$$;

revoke all on function public.list_lead_contacts(uuid[]) from public;
grant execute on function public.list_lead_contacts(uuid[]) to authenticated;

-- Permite actualizar de forma segura el estado de confiabilidad de un lead
create or replace function public.update_lead_reliability(
  p_lead_id uuid,
  p_reporter_id uuid default null,
  p_new_status text default 'silenciado',
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_status text;
  v_changed_by uuid;
  v_role text;
begin
  v_changed_by := auth.uid();
  v_role := public.get_my_role();

  if v_role not in ('ejecutivo', 'admin', 'admin_inmobiliario') then
    raise exception 'Unauthorized';
  end if;

  select reliability_status into v_old_status from public.profiles where id = p_lead_id;
  
  update public.profiles 
  set reliability_status = p_new_status, updated_at = now()
  where id = p_lead_id;

  insert into public.lead_status_history (profile_id, changed_by, old_status, new_status, reason)
  values (p_lead_id, v_changed_by, v_old_status, p_new_status, coalesce(p_reason, 'Cambio de estado'));
end;
$$;

revoke all on function public.update_lead_reliability(uuid, uuid, text, text) from public;
grant execute on function public.update_lead_reliability(uuid, uuid, text, text) to authenticated;

alter table public.lead_status_history enable row level security;
drop policy if exists "Staff select lead_status_history" on public.lead_status_history;
create policy "Staff select lead_status_history"
on public.lead_status_history for select
using (public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario'));

-- Entrega a administradores globales y de inmobiliaria los leads en revisión y silenciados
create or replace function public.get_reported_leads_for_admin()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  rut text,
  reliability_status text,
  created_at timestamptz,
  fraud_score_probability numeric,
  shap_top_factors jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (p.id)
    p.id,
    u.email::text as email,
    p.full_name,
    p.phone,
    p.rut,
    p.reliability_status,
    e.created_at,
    e.fraud_score_probability,
    e.shap_top_factors
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.evaluations e on e.user_id = p.id
  where p.reliability_status in ('en_revision', 'silenciado', 'descartado', 'sospechoso')
    and (
      public.get_my_role() = 'admin'
      or (
        public.get_my_role() = 'admin_inmobiliario'
        and (
          exists (
            select 1 from public.proyectos pr
            where pr.inmobiliaria_id = public.get_my_inmobiliaria()
            and (
              pr.comuna = coalesce(e.target_commune, e.financial_data->'input'->>'comuna_objetivo')
              or pr.comuna = p.onboarding_data->>'comuna_interes'
              or pr.comuna = p.onboarding_data->>'comuna_alternativa'
            )
          )
          or exists (
            select 1 from public.lead_status_history lsh
            join public.profiles exec_p on exec_p.id = lsh.changed_by
            where lsh.profile_id = p.id
            and exec_p.inmobiliaria_id = public.get_my_inmobiliaria()
          )
        )
      )
    )
  order by p.id, e.created_at desc;
$$;

revoke all on function public.get_reported_leads_for_admin() from public;
grant execute on function public.get_reported_leads_for_admin() to authenticated;

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
  select public.get_my_role() in ('admin', 'admin_inmobiliario')
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
  set role = 'admin_inmobiliario',
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
      public.get_my_role() in ('admin', 'admin_inmobiliario')
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
      public.get_my_role() in ('admin', 'admin_inmobiliario')
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

-- Complete public BCCh bundles used only by backend service credentials.
create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  effective_date date not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint market_snapshots_embedded_metadata_check check (
    snapshot->>'effective_date' = effective_date::text
    and (snapshot->>'fetched_at')::timestamptz = fetched_at
  )
);

create index if not exists market_snapshots_resolution_idx
  on public.market_snapshots (effective_date desc, fetched_at desc, id desc);

alter table public.market_snapshots enable row level security;
revoke all on table public.market_snapshots from anon, authenticated;

-- HU17: backend-only reviewed benefits and immutable scenarios owned by the lead.
create table if not exists public.housing_benefit_catalog_versions (
  id uuid primary key default gen_random_uuid(), version text not null unique,
  status text not null check (status in ('draft', 'published', 'retired')),
  official_source_metadata jsonb not null check (jsonb_typeof(official_source_metadata) = 'object'),
  source_checksum text not null, effective_from date, effective_to date, published_at timestamptz,
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) > 0),
  created_at timestamptz not null default now(),
  constraint housing_benefit_catalog_published_check check ((status = 'published') = (published_at is not null))
);
alter table public.housing_benefit_catalog_versions enable row level security;
revoke all on table public.housing_benefit_catalog_versions from anon, authenticated;

create table if not exists public.mortgage_scenarios (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  project_id uuid references public.proyectos(id) on delete set null,
  parent_scenario_id uuid references public.mortgage_scenarios(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  project_snapshot jsonb not null check (jsonb_typeof(project_snapshot) = 'object'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  market_reference_snapshot jsonb not null check (jsonb_typeof(market_reference_snapshot) = 'object'),
  benefit_catalogue_snapshot jsonb not null check (jsonb_typeof(benefit_catalogue_snapshot) in ('object', 'null')),
  created_at timestamptz not null default now()
);
create index if not exists mortgage_scenarios_owner_created_idx on public.mortgage_scenarios (user_id, created_at desc);
alter table public.mortgage_scenarios enable row level security;
grant select, insert, delete on table public.mortgage_scenarios to authenticated;
revoke update on table public.mortgage_scenarios from authenticated;
drop policy if exists "Mortgage scenarios select own" on public.mortgage_scenarios;
create policy "Mortgage scenarios select own" on public.mortgage_scenarios for select using (auth.uid() = user_id);
drop policy if exists "Mortgage scenarios insert own consented evaluation" on public.mortgage_scenarios;
create policy "Mortgage scenarios insert own consented evaluation" on public.mortgage_scenarios for insert with check (
  auth.uid() = user_id and exists (select 1 from public.evaluations e where e.id = evaluation_id and e.user_id = auth.uid() and coalesce((e.financial_data -> 'input' ->> 'consentimiento')::boolean, false))
);
drop policy if exists "Mortgage scenarios delete own" on public.mortgage_scenarios;
create policy "Mortgage scenarios delete own" on public.mortgage_scenarios for delete using (auth.uid() = user_id);

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
     and to_jsonb(old)->'target_project_snapshot' = 'null'::jsonb
     and jsonb_typeof(to_jsonb(new)->'target_project_snapshot') = 'object'
     and to_jsonb(new)->'target_project_snapshot' <> '{}'::jsonb
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
  select id, nullif(target_project_snapshot, 'null'::jsonb) into plan_id_value, frozen_target_project
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
      plan_data->'original_plan_snapshot', nullif(plan_data->'target_project_snapshot', 'null'::jsonb),
      plan_data->'provenance');
  elsif frozen_target_project is null
      and jsonb_typeof(p_records->'target_project_snapshot') = 'object'
      and p_records->'target_project_snapshot' <> '{}'::jsonb then
    update tracking_plans
      set target_project_snapshot = p_records->'target_project_snapshot'
      where id = plan_id_value and nullif(target_project_snapshot, 'null'::jsonb) is null;
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

-- =============================================================
-- RutaHogar — Etapa comercial del lead por inmobiliaria
-- =============================================================
-- Espejo de migrations/20260930120000_commercial_stage.sql (sin el backfill,
-- que solo aplica a bases con datos). Diseño: docs/stories/commercial-stage/PLAN.md.
-- Incluye migrations/20261005120000_commercial_stage_project_tracks.sql (sin su
-- guardia): registros por proyecto. Diseño: docs/stories/commercial-stage-project-tracks/PLAN.md.


create table if not exists public.commercial_stage_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  subject_user_id uuid not null,
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete restrict,
  actor_id uuid,
  actor_role text not null,
  stage_before text,
  stage_after text not null,
  reason text,
  source text not null,
  constraint commercial_stage_events_actor_role_check
    check (actor_role in ('ejecutivo', 'admin', 'admin_inmobiliario', 'sistema')),
  constraint commercial_stage_events_system_actor_check
    check ((actor_role = 'sistema') = (actor_id is null)),
  constraint commercial_stage_events_stage_before_check
    check (stage_before in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido')),
  constraint commercial_stage_events_stage_after_check
    check (stage_after in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido')),
  constraint commercial_stage_events_source_check
    check (source in ('web', 'backend', 'job', 'backfill'))
);

-- Historial por proyecto. Sin FK a proyectos a propósito: el trigger de inmutabilidad
-- impide que un ON DELETE actúe sobre el historial, y un RESTRICT aquí
-- bloquearía borrar proyectos que solo tienen historial. Quien protege el
-- borrado es la FK de lead_project_commercial_stage.
alter table public.commercial_stage_events
  add column if not exists proyecto_id uuid;

-- Un evento sin cambio de etapa solo puede ser la "revivida" general: hecha
-- por una persona, sin proyecto y con motivo.
alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_change_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_change_check
    check (
      stage_before is distinct from stage_after
      or (proyecto_id is null and actor_role <> 'sistema' and length(trim(coalesce(reason, ''))) > 0)
    );

alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_lead_level_stage_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_lead_level_stage_check
    check (proyecto_id is not null or stage_after not in ('en_negociacion', 'reserva', 'venta_cerrada'));

-- Los trabajos solo actúan sobre registros de proyecto.
alter table public.commercial_stage_events
  drop constraint if exists commercial_stage_events_job_project_check;
alter table public.commercial_stage_events
  add constraint commercial_stage_events_job_project_check
    check (source <> 'job' or proyecto_id is not null);


create index if not exists commercial_stage_events_pair_idx
  on public.commercial_stage_events (subject_user_id, inmobiliaria_id, occurred_at, id);
create index if not exists commercial_stage_events_tenant_idx
  on public.commercial_stage_events (inmobiliaria_id, occurred_at);
create index if not exists commercial_stage_events_record_idx
  on public.commercial_stage_events (subject_user_id, inmobiliaria_id, proyecto_id, occurred_at, id);
create index if not exists commercial_stage_events_proyecto_idx
  on public.commercial_stage_events (proyecto_id, occurred_at)
  where proyecto_id is not null;

create table if not exists public.lead_commercial_stage (
  subject_user_id uuid not null,
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete restrict,
  stage text not null,
  last_event_id uuid not null references public.commercial_stage_events(id),
  updated_at timestamptz not null,
  primary key (subject_user_id, inmobiliaria_id),
  constraint lead_commercial_stage_stage_check
    check (stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido'))
);

create index if not exists lead_commercial_stage_tenant_idx
  on public.lead_commercial_stage (inmobiliaria_id, stage);

-- Etapa vigente de cada registro de proyecto. Igual que en la base, sin FK
-- en subject_user_id para que la supresión del §5.8 pueda reemplazar el id.
-- ON DELETE RESTRICT hacia proyectos: una reserva o una venta no deben
-- desaparecer de HU 15 porque alguien borró el proyecto; se marca agotado.
create table if not exists public.lead_project_commercial_stage (
  subject_user_id uuid not null,
  inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete restrict,
  proyecto_id uuid not null references public.proyectos(id) on delete restrict,
  stage text not null,
  last_event_id uuid not null references public.commercial_stage_events(id),
  updated_at timestamptz not null,
  primary key (subject_user_id, inmobiliaria_id, proyecto_id),
  constraint lead_project_commercial_stage_stage_check
    check (stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada', 'perdido'))
);

create index if not exists lead_project_commercial_stage_proyecto_idx
  on public.lead_project_commercial_stage (proyecto_id, stage);
create index if not exists lead_project_commercial_stage_tenant_idx
  on public.lead_project_commercial_stage (inmobiliaria_id, stage);

-- Única definición de "el lead pertenece a este proyecto": lo marcó como
-- favorito o declaró su comuna. HU 15 la reutiliza.
create or replace function public.lead_belongs_to_proyecto(p_lead uuid, p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.proyectos pr on pr.id = p_proyecto
    where p.id = p_lead
      and p.role = 'usuario'
      and (
        exists (
          select 1
          from public.proyecto_favoritos f
          where f.usuario_id = p.id
            and f.proyecto_id = pr.id
        )
        or lower(trim(pr.comuna)) in (
          select lower(trim(declared.comuna))
          from (
            select e.target_commune as comuna from public.evaluations e where e.user_id = p.id
            union all
            select e.alternative_commune from public.evaluations e where e.user_id = p.id
            union all
            select e.financial_data -> 'input' ->> 'comuna_objetivo' from public.evaluations e where e.user_id = p.id
            union all
            select p.onboarding_data ->> 'comuna_interes'
            union all
            select p.onboarding_data ->> 'comuna_alternativa'
          ) declared
          where nullif(trim(declared.comuna), '') is not null
        )
      )
  );
$$;

-- Misma regla que la base, ahora expresada sobre la de proyecto para que
-- exista una sola vez: favorito en un proyecto de la inmobiliaria o comuna de
-- uno de ellos equivale a "existe un proyecto de la inmobiliaria al que el
-- lead pertenece".
create or replace function public.lead_belongs_to_inmobiliaria(p_lead uuid, p_inmobiliaria uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_inmobiliaria is not null
    and exists (
      select 1
      from public.proyectos pr
      where pr.inmobiliaria_id = p_inmobiliaria
        and public.lead_belongs_to_proyecto(p_lead, pr.id)
    );
$$;

-- is_ejecutivo_asignado no mira el estado y las policies de proyectos dependen
-- de eso; para escribir etapas el ejecutivo debe estar vinculado.
create or replace function public.is_ejecutivo_vinculado(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proyecto_ejecutivos pe
    where pe.proyecto_id = p_proyecto
      and pe.estado = 'vinculado'
      and (
        pe.ejecutivo_id = auth.uid()
        or pe.ejecutivo_email = public.get_my_email()
      )
  );
$$;

-- Única regla de alcance de escritura sobre un registro de proyecto. Devuelve
-- null si se permite, o el código de error. El RPC y commercial_stage_scope
-- la usan las dos, así la interfaz y la base no pueden discrepar.
-- Un registro ya creado sigue siendo escribible aunque el lead deje de
-- pertenecer al proyecto (quitó el favorito, cambió de comuna): crearlo
-- exigió pertenencia real, y así se puede cerrar una reserva igual.
create or replace function public.commercial_stage_project_access(
  p_lead uuid,
  p_proyecto uuid,
  p_role text,
  p_tenant uuid
) returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.proyectos pr
      where pr.id = p_proyecto and pr.inmobiliaria_id = p_tenant
    ) then 'proyecto_not_in_scope'
    when p_role = 'ejecutivo' and not public.is_ejecutivo_vinculado(p_proyecto) then 'proyecto_not_in_scope'
    when not exists (
      select 1 from public.lead_project_commercial_stage s
      where s.subject_user_id = p_lead
        and s.inmobiliaria_id = p_tenant
        and s.proyecto_id = p_proyecto
    ) and not public.lead_belongs_to_proyecto(p_lead, p_proyecto) then 'lead_not_in_scope'
  end;
$$;

create or replace function public.lead_in_my_inmobiliaria(p_lead uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lead_belongs_to_inmobiliaria(p_lead, public.get_my_inmobiliaria());
$$;

-- Reglas de transición (docs/stories/commercial-stage/PLAN.md). El mensaje de
-- cada excepción es un código estable que el frontend traduce.
create or replace function public.commercial_stage_transition_check(
  p_from text,
  p_to text,
  p_role text,
  p_reason text
) returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  stage_order constant text[] := array['nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion', 'reserva', 'venta_cerrada'];
  from_rank integer := array_position(stage_order, p_from);
  to_rank integer := array_position(stage_order, p_to);
  has_reason boolean := length(trim(coalesce(p_reason, ''))) > 0;
begin
  if p_to is null or (to_rank is null and p_to <> 'perdido') then
    raise exception 'invalid_stage';
  end if;
  if p_from = p_to then
    raise exception 'same_stage';
  end if;

  if p_from = 'venta_cerrada' then
    if p_to <> 'perdido' then raise exception 'invalid_transition'; end if;
    if coalesce(p_role, '') not in ('admin', 'admin_inmobiliario') then
      raise exception 'admin_required' using errcode = '42501';
    end if;
    if not has_reason then raise exception 'reason_required'; end if;
    return;
  end if;

  if p_from = 'perdido' then
    if p_to = 'venta_cerrada' then raise exception 'invalid_transition'; end if;
    if not has_reason then raise exception 'reason_required'; end if;
    return;
  end if;

  if (p_to = 'perdido' or to_rank < from_rank) and not has_reason then
    raise exception 'reason_required';
  end if;
end;
$$;

-- RPC de escritura. Se elimina la firma de 4 argumentos para que PostgREST
-- no vea dos sobrecargas ambiguas; las llamadas con argumentos nombrados de
-- antes siguen resolviendo y actúan sobre el registro general.
drop function if exists public.change_commercial_stage(uuid, text, text, text);

create or replace function public.change_commercial_stage(
  p_lead uuid,
  p_to_stage text,
  p_reason text default null,
  p_expected_stage text default null,
  p_proyecto uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text := public.get_my_role();
  caller_tenant uuid := public.get_my_inmobiliaria();
  access_error text;
  current_stage text;
  has_projects boolean;
  all_lost boolean;
  is_revival boolean := false;
  saved public.commercial_stage_events;
begin
  if caller_id is null
     or coalesce(caller_role, '') not in ('ejecutivo', 'admin', 'admin_inmobiliario')
     or caller_tenant is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_proyecto is null then
    if not public.lead_belongs_to_inmobiliaria(p_lead, caller_tenant) then
      raise exception 'lead_not_in_scope' using errcode = '42501';
    end if;
  else
    access_error := public.commercial_stage_project_access(p_lead, p_proyecto, caller_role, caller_tenant);
    if access_error is not null then
      raise exception '%', access_error using errcode = '42501';
    end if;
  end if;

  -- Un candado por (lead, inmobiliaria), no por registro: las reglas que
  -- cruzan registros ("tiene registros de proyecto", "todos perdidos") y los
  -- trabajos de agotar/reponer quedan serializados con cada escritura.
  perform pg_advisory_xact_lock(hashtextextended(p_lead::text || ':' || caller_tenant::text, 0));

  if p_proyecto is null then
    select stage into current_stage
    from public.lead_commercial_stage
    where subject_user_id = p_lead and inmobiliaria_id = caller_tenant
    for update;
  else
    select stage into current_stage
    from public.lead_project_commercial_stage
    where subject_user_id = p_lead and inmobiliaria_id = caller_tenant and proyecto_id = p_proyecto
    for update;
  end if;
  current_stage := coalesce(current_stage, 'nuevo');

  if p_expected_stage is not null and p_expected_stage <> current_stage then
    raise exception 'stale_stage';
  end if;

  if p_proyecto is null then
    select count(*) > 0, count(*) > 0 and bool_and(stage = 'perdido')
      into has_projects, all_lost
    from public.lead_project_commercial_stage
    where subject_user_id = p_lead and inmobiliaria_id = caller_tenant;

    if p_to_stage in ('en_negociacion', 'reserva', 'venta_cerrada') then
      raise exception 'project_required';
    end if;
    if p_to_stage = 'perdido' and has_projects then
      raise exception 'project_required';
    end if;
    -- Revivir: todos sus proyectos se perdieron, pero el lead sigue vivo.
    if p_to_stage = current_stage and current_stage <> 'perdido' and all_lost then
      if length(trim(coalesce(p_reason, ''))) = 0 then
        raise exception 'reason_required';
      end if;
      is_revival := true;
    end if;
  end if;

  if not is_revival then
    perform public.commercial_stage_transition_check(current_stage, p_to_stage, caller_role, p_reason);
  end if;

  insert into public.commercial_stage_events (
    subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
    stage_before, stage_after, reason, source
  ) values (
    p_lead, caller_tenant, p_proyecto, caller_id, caller_role,
    current_stage, p_to_stage, nullif(trim(p_reason), ''), 'web'
  )
  returning * into saved;

  if p_proyecto is null then
    insert into public.lead_commercial_stage (subject_user_id, inmobiliaria_id, stage, last_event_id, updated_at)
    values (p_lead, caller_tenant, p_to_stage, saved.id, saved.occurred_at)
    on conflict (subject_user_id, inmobiliaria_id) do update
      set stage = excluded.stage,
          last_event_id = excluded.last_event_id,
          updated_at = excluded.updated_at;
  else
    insert into public.lead_project_commercial_stage (subject_user_id, inmobiliaria_id, proyecto_id, stage, last_event_id, updated_at)
    values (p_lead, caller_tenant, p_proyecto, p_to_stage, saved.id, saved.occurred_at)
    on conflict (subject_user_id, inmobiliaria_id, proyecto_id) do update
      set stage = excluded.stage,
          last_event_id = excluded.last_event_id,
          updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object(
    'stage', saved.stage_after,
    'event_id', saved.id,
    'occurred_at', saved.occurred_at,
    'proyecto_id', saved.proyecto_id
  );
end;
$$;

-- RPC de lectura para el panel: qué registros ve quien llama y cuáles puede
-- escribir. A un ejecutivo solo le muestra los proyectos a los que está
-- vinculado, más los que ya tienen registro del lead (para leer su
-- historial). No devuelve actor, motivo ni datos del lead.
create or replace function public.commercial_stage_scope(p_lead uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role text := public.get_my_role();
  caller_tenant uuid := public.get_my_inmobiliaria();
begin
  if auth.uid() is null
     or coalesce(caller_role, '') not in ('ejecutivo', 'admin', 'admin_inmobiliario')
     or caller_tenant is null then
    return jsonb_build_object('lead_level_writable', false, 'lead_level', null, 'proyectos', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'lead_level_writable', public.lead_belongs_to_inmobiliaria(p_lead, caller_tenant),
    'lead_level', (
      select jsonb_build_object('stage', s.stage, 'updated_at', s.updated_at)
      from public.lead_commercial_stage s
      where s.subject_user_id = p_lead and s.inmobiliaria_id = caller_tenant
    ),
    'proyectos', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pr.id,
          'nombre', pr.nombre,
          'estado', pr.estado,
          'stage', s.stage,
          'updated_at', s.updated_at,
          'writable', public.commercial_stage_project_access(p_lead, pr.id, caller_role, caller_tenant) is null
        )
        order by pr.nombre, pr.id
      )
      from public.proyectos pr
      left join public.lead_project_commercial_stage s
        on s.proyecto_id = pr.id
       and s.subject_user_id = p_lead
       and s.inmobiliaria_id = caller_tenant
      where pr.inmobiliaria_id = caller_tenant
        and (s.proyecto_id is not null or public.lead_belongs_to_proyecto(p_lead, pr.id))
        and (caller_role <> 'ejecutivo' or s.proyecto_id is not null or public.is_ejecutivo_vinculado(pr.id))
    ), '[]'::jsonb)
  );
end;
$$;

-- El historial no se edita ni se borra (ISO 27001 A.8.15, Spike §5.2). La
-- única excepción prevista es el procedimiento de supresión del §5.8, que
-- corre como dueño de la tabla y deshabilita este trigger en su transacción.
create or replace function public.commercial_stage_reject_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'immutable_history' using errcode = '23514';
end;
$$;

drop trigger if exists commercial_stage_events_immutable on public.commercial_stage_events;
create trigger commercial_stage_events_immutable
  before update or delete on public.commercial_stage_events
  for each row execute function public.commercial_stage_reject_mutation();

-- Trabajos de agotar y reponer. Son un trigger y no un servicio porque el
-- frontend escribe proyectos.estado directamente y cualquier escritor debe
-- dispararlos. Cada corrida lee el estado actual, así que alternar el estado
-- varias veces es seguro, y agotado → agotado no dispara. Los motivos son
-- códigos fijos que no identifican al lead.
create or replace function public.commercial_stage_project_estado_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  current_stage text;
  closure public.commercial_stage_events;
  saved public.commercial_stage_events;
begin
  if new.estado = 'agotado' then
    for rec in
      select s.subject_user_id, s.inmobiliaria_id
      from public.lead_project_commercial_stage s
      where s.proyecto_id = new.id
        and s.stage in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion')
      order by s.subject_user_id, s.inmobiliaria_id
    loop
      perform pg_advisory_xact_lock(hashtextextended(rec.subject_user_id::text || ':' || rec.inmobiliaria_id::text, 0));

      select s.stage into current_stage
      from public.lead_project_commercial_stage s
      where s.subject_user_id = rec.subject_user_id
        and s.inmobiliaria_id = rec.inmobiliaria_id
        and s.proyecto_id = new.id
      for update;
      if current_stage is null
         or current_stage not in ('nuevo', 'contactado', 'en_plan_mejora', 'en_negociacion') then
        continue;
      end if;

      perform public.commercial_stage_transition_check(current_stage, 'perdido', 'sistema', 'proyecto_agotado');

      insert into public.commercial_stage_events (
        subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
        stage_before, stage_after, reason, source
      ) values (
        rec.subject_user_id, rec.inmobiliaria_id, new.id, null, 'sistema',
        current_stage, 'perdido', 'proyecto_agotado', 'job'
      )
      returning * into saved;

      update public.lead_project_commercial_stage
      set stage = saved.stage_after, last_event_id = saved.id, updated_at = saved.occurred_at
      where subject_user_id = rec.subject_user_id
        and inmobiliaria_id = rec.inmobiliaria_id
        and proyecto_id = new.id;
    end loop;

  elsif old.estado = 'agotado' then
    -- Solo se reabren los registros cuyo último evento sigue siendo el cierre
    -- automático: si una persona los movió después, su decisión se respeta.
    for rec in
      select s.subject_user_id, s.inmobiliaria_id
      from public.lead_project_commercial_stage s
      join public.commercial_stage_events e on e.id = s.last_event_id
      where s.proyecto_id = new.id
        and e.actor_role = 'sistema'
        and e.source = 'job'
        and e.stage_after = 'perdido'
        and e.reason = 'proyecto_agotado'
      order by s.subject_user_id, s.inmobiliaria_id
    loop
      perform pg_advisory_xact_lock(hashtextextended(rec.subject_user_id::text || ':' || rec.inmobiliaria_id::text, 0));

      closure := null;
      select e.* into closure
      from public.lead_project_commercial_stage s
      join public.commercial_stage_events e on e.id = s.last_event_id
      where s.subject_user_id = rec.subject_user_id
        and s.inmobiliaria_id = rec.inmobiliaria_id
        and s.proyecto_id = new.id
        and e.actor_role = 'sistema'
        and e.source = 'job'
        and e.stage_after = 'perdido'
        and e.reason = 'proyecto_agotado'
      for update of s;
      if closure.id is null then
        continue;
      end if;

      perform public.commercial_stage_transition_check('perdido', closure.stage_before, 'sistema', 'proyecto_repuesto');

      insert into public.commercial_stage_events (
        subject_user_id, inmobiliaria_id, proyecto_id, actor_id, actor_role,
        stage_before, stage_after, reason, source
      ) values (
        rec.subject_user_id, rec.inmobiliaria_id, new.id, null, 'sistema',
        'perdido', closure.stage_before, 'proyecto_repuesto', 'job'
      )
      returning * into saved;

      update public.lead_project_commercial_stage
      set stage = saved.stage_after, last_event_id = saved.id, updated_at = saved.occurred_at
      where subject_user_id = rec.subject_user_id
        and inmobiliaria_id = rec.inmobiliaria_id
        and proyecto_id = new.id;
    end loop;
  end if;

  return null;
end;
$$;

drop trigger if exists proyectos_commercial_stage_jobs on public.proyectos;
create trigger proyectos_commercial_stage_jobs
  after update of estado on public.proyectos
  for each row
  when (old.estado is distinct from new.estado)
  execute function public.commercial_stage_project_estado_changed();

-- Privilegios (H12): los roles del navegador solo leen, y RLS acota qué.
alter table public.commercial_stage_events enable row level security;
alter table public.lead_commercial_stage enable row level security;

revoke all on public.commercial_stage_events, public.lead_commercial_stage from anon, authenticated;
grant select on public.commercial_stage_events, public.lead_commercial_stage to authenticated;
grant select, insert on public.commercial_stage_events to service_role;
grant select, insert, update on public.lead_commercial_stage to service_role;

-- El personal ve las etapas de su inmobiliaria; el admin global, todas. El
-- lead no tiene política: los motivos son notas internas del personal.
drop policy if exists "Commercial stage events select tenant" on public.commercial_stage_events;
create policy "Commercial stage events select tenant"
  on public.commercial_stage_events
  for select
  to authenticated
  using (
    (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and public.get_my_inmobiliaria() = inmobiliaria_id
    )
    or (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  );

drop policy if exists "Lead commercial stage select tenant" on public.lead_commercial_stage;
create policy "Lead commercial stage select tenant"
  on public.lead_commercial_stage
  for select
  to authenticated
  using (
    (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and public.get_my_inmobiliaria() = inmobiliaria_id
    )
    or (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  );

alter table public.lead_project_commercial_stage enable row level security;

revoke all on public.lead_project_commercial_stage from anon, authenticated;
grant select on public.lead_project_commercial_stage to authenticated;
grant select, insert, update on public.lead_project_commercial_stage to service_role;

drop policy if exists "Lead project commercial stage select tenant" on public.lead_project_commercial_stage;
create policy "Lead project commercial stage select tenant"
  on public.lead_project_commercial_stage
  for select
  to authenticated
  using (
    (
      public.get_my_role() in ('ejecutivo', 'admin', 'admin_inmobiliario')
      and public.get_my_inmobiliaria() = inmobiliaria_id
    )
    or (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
  );

revoke all on function public.lead_belongs_to_inmobiliaria(uuid, uuid),
  public.lead_in_my_inmobiliaria(uuid),
  public.commercial_stage_transition_check(text, text, text, text),
  public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_reject_mutation() from public, anon, authenticated;
grant execute on function public.lead_in_my_inmobiliaria(uuid),
  public.change_commercial_stage(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.lead_belongs_to_inmobiliaria(uuid, uuid),
  public.change_commercial_stage(uuid, text, text, text, uuid) to service_role;

-- Privilegios. El navegador ejecuta change_commercial_stage (firma nueva),
-- commercial_stage_scope y lead_in_my_inmobiliaria; nada más de esta historia.
revoke all on function public.lead_belongs_to_proyecto(uuid, uuid),
  public.is_ejecutivo_vinculado(uuid),
  public.commercial_stage_project_access(uuid, uuid, text, uuid),
  public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_scope(uuid),
  public.commercial_stage_project_estado_changed() from public, anon, authenticated;
grant execute on function public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_scope(uuid) to authenticated;
grant execute on function public.lead_belongs_to_proyecto(uuid, uuid),
  public.is_ejecutivo_vinculado(uuid),
  public.commercial_stage_project_access(uuid, uuid, text, uuid),
  public.change_commercial_stage(uuid, text, text, text, uuid),
  public.commercial_stage_scope(uuid) to service_role;


-- Evaluaciones staff acotadas por inmobiliaria en una sola consulta
-- (20261008120000). Solo service_role: el backend fija el tenant del actor.
-- Misma regla que lead_belongs_to_inmobiliaria (favorito en un proyecto del
-- tenant o comuna declarada de uno de ellos), en forma de conjunto: llamarla por
-- lead evaluaba lead_belongs_to_proyecto lead × proyecto y tardaba ~7 s en
-- producción. Si cambia esa regla, cambiar también esta.
create or replace function public.staff_evaluations_for_inmobiliaria(p_inmobiliaria uuid)
returns setof public.evaluations
language sql
stable
set search_path = public
as $$
  with tenant_projects as materialized (
    select pr.id, lower(trim(pr.comuna)) as comuna
    from public.proyectos pr
    where pr.inmobiliaria_id = p_inmobiliaria
  ),
  declared as (
    select e.user_id, lower(trim(c.comuna)) as comuna
    from public.evaluations e
    cross join lateral (values (e.target_commune), (e.alternative_commune),
      (e.financial_data -> 'input' ->> 'comuna_objetivo')) c(comuna)
    union all
    select p.id, lower(trim(c.comuna))
    from public.profiles p
    cross join lateral (values (p.onboarding_data ->> 'comuna_interes'),
      (p.onboarding_data ->> 'comuna_alternativa')) c(comuna)
  ),
  scoped as materialized (
    select p.id as user_id
    from public.profiles p
    where p.role = 'usuario'
      and (
        exists (
          select 1
          from public.proyecto_favoritos f
          join tenant_projects tp on tp.id = f.proyecto_id
          where f.usuario_id = p.id
        )
        or exists (
          select 1
          from declared d
          join tenant_projects tp on tp.comuna = d.comuna
          where d.user_id = p.id
            and d.comuna <> ''
        )
      )
  )
  select e.*
  from public.evaluations e
  where e.user_id in (select scoped.user_id from scoped)
  order by e.created_at desc;
$$;

revoke all on function public.staff_evaluations_for_inmobiliaria(uuid) from public, anon, authenticated;
grant execute on function public.staff_evaluations_for_inmobiliaria(uuid) to service_role;


-- Backfill (decisión Q5): cada lead con evaluación parte en 'nuevo' en cada
-- inmobiliaria a la que pertenece, fechado en su primera evaluación. Volver a
-- ejecutarlo no inserta nada. Los leads que se vuelvan elegibles después no
-- tienen fila y el RPC los lee como 'nuevo'.
create or replace function public.commercial_stage_backfill()
returns integer
language plpgsql
set search_path = public
as $$
declare
  inserted_count integer;
begin
  with eligible as (
    select p.id as subject_user_id,
           i.id as inmobiliaria_id,
           (select min(e.created_at) from public.evaluations e where e.user_id = p.id) as first_evaluation_at
    from public.profiles p
    cross join public.inmobiliarias i
    where p.role = 'usuario'
      and exists (select 1 from public.evaluations e where e.user_id = p.id)
      and not exists (
        select 1 from public.lead_commercial_stage s
        where s.subject_user_id = p.id and s.inmobiliaria_id = i.id
      )
      and public.lead_belongs_to_inmobiliaria(p.id, i.id)
  ),
  inserted as (
    insert into public.commercial_stage_events (
      occurred_at, subject_user_id, inmobiliaria_id, actor_id, actor_role,
      stage_before, stage_after, reason, source
    )
    select first_evaluation_at, subject_user_id, inmobiliaria_id, null, 'sistema',
           null, 'nuevo', null, 'backfill'
    from eligible
    returning id, occurred_at, subject_user_id, inmobiliaria_id
  )
  insert into public.lead_commercial_stage (subject_user_id, inmobiliaria_id, stage, last_event_id, updated_at)
  select subject_user_id, inmobiliaria_id, 'nuevo', id, occurred_at
  from inserted;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.commercial_stage_backfill() from public, anon, authenticated;

-- =============================================================
-- Cambios relevantes desde la ultima visita
-- Espejo de supabase/migrations/20261006120000_lead_change_events.sql
-- =============================================================

create table if not exists public.lead_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  materiality_key text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  detected_at timestamptz not null default clock_timestamp(),
  project_id uuid references public.proyectos(id) on delete set null,
  project_name text,
  tone text not null default 'info',
  title text not null,
  summary text not null,
  previous_value jsonb,
  current_value jsonb,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  source text not null default 'job',
  seen_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint lead_change_events_type_check check (event_type in (
    'project_compatible_unlocked', 'score_band_improved', 'monthly_plan_summary',
    'uf_reachability_crossed', 'quick_update_submitted'
  )),
  constraint lead_change_events_tone_check check (tone in ('positive', 'info', 'warning')),
  constraint lead_change_events_source_check check (source in ('job', 'landing', 'quick_update', 'backfill')),
  constraint lead_change_events_title_check check (length(trim(title)) > 0),
  constraint lead_change_events_summary_check check (length(trim(summary)) > 0),
  unique (user_id, event_type, materiality_key)
);

create index if not exists lead_change_events_user_unseen_idx
  on public.lead_change_events (user_id, seen_at, occurred_at desc, id desc);
create index if not exists lead_change_events_user_type_idx
  on public.lead_change_events (user_id, event_type, occurred_at desc);

create table if not exists public.lead_change_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lead_change_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  status text not null,
  provider text,
  provider_message_id text,
  recipient text,
  subject text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  error_code text,
  attempted_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint lead_change_notifications_channel_check check (channel in ('email')),
  constraint lead_change_notifications_status_check check (status in ('skipped', 'queued', 'sent', 'failed'))
);

create index if not exists lead_change_notifications_user_channel_idx
  on public.lead_change_notifications (user_id, channel, attempted_at desc);
create index if not exists lead_change_notifications_event_idx
  on public.lead_change_notifications (event_id, channel);

create table if not exists public.lead_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  channel text not null default 'email',
  enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, event_type, channel),
  constraint lead_notification_preferences_type_check check (event_type in (
    'project_compatible_unlocked', 'score_band_improved', 'monthly_plan_summary',
    'uf_reachability_crossed', 'quick_update_submitted'
  )),
  constraint lead_notification_preferences_channel_check check (channel in ('email', 'in_app'))
);

alter table public.lead_change_events enable row level security;
alter table public.lead_change_notifications enable row level security;
alter table public.lead_notification_preferences enable row level security;

drop policy if exists "Lead change events select own" on public.lead_change_events;
create policy "Lead change events select own" on public.lead_change_events
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Lead change events update own seen" on public.lead_change_events;
create policy "Lead change events update own seen" on public.lead_change_events
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Lead notification preferences select own" on public.lead_notification_preferences;
create policy "Lead notification preferences select own" on public.lead_notification_preferences
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Lead notification preferences upsert own" on public.lead_notification_preferences;
create policy "Lead notification preferences upsert own" on public.lead_notification_preferences
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Lead change notifications select none" on public.lead_change_notifications;
create policy "Lead change notifications select none" on public.lead_change_notifications
  for select to authenticated using (false);

revoke insert, delete on public.lead_change_events from anon, authenticated;
revoke insert, update, delete on public.lead_change_notifications from anon, authenticated;
grant select, update on public.lead_change_events to authenticated;
grant select, insert, update on public.lead_notification_preferences to authenticated;
grant select, insert, update, delete on public.lead_change_events,
  public.lead_change_notifications, public.lead_notification_preferences to service_role;

create or replace function public.lead_changes_due_leads(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_data order by row_data->>'user_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'user_id', e.user_id,
      'email', u.email,
      'latest_evaluation_id', e.id,
      'latest_evaluation_at', e.created_at,
      'classification', e.classification,
      'score', e.score,
      'financial_data', e.financial_data,
      'previous_evaluation', prev.previous_evaluation,
      'last_lead_change_email_at', (
        select max(n.sent_at)
        from public.lead_change_notifications n
        where n.user_id = e.user_id and n.channel = 'email' and n.status = 'sent'
      )
    ) as row_data
    from (
      select distinct on (ev.user_id) ev.*
      from public.evaluations ev
      where ev.user_id is not null
      order by ev.user_id, ev.created_at desc nulls last, ev.id desc
    ) e
    left join auth.users u on u.id = e.user_id
    left join lateral (
      select jsonb_build_object(
        'id', p.id,
        'created_at', p.created_at,
        'classification', p.classification,
        'score', p.score,
        'financial_data', p.financial_data
      ) as previous_evaluation
      from public.evaluations p
      where p.user_id = e.user_id and p.id <> e.id
      order by p.created_at desc nulls last, p.id desc
      limit 1
    ) prev on true
    order by e.created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) rows;
$$;

create or replace function public.lead_changes_record_event(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  saved public.lead_change_events%rowtype;
begin
  insert into public.lead_change_events (
    id, user_id, event_type, materiality_key, occurred_at, project_id, project_name,
    tone, title, summary, previous_value, current_value, payload, source
  ) values (
    coalesce((p_event->>'id')::uuid, gen_random_uuid()),
    (p_event->>'user_id')::uuid,
    p_event->>'event_type',
    p_event->>'materiality_key',
    coalesce((p_event->>'occurred_at')::timestamptz, clock_timestamp()),
    nullif(p_event->>'project_id', '')::uuid,
    nullif(p_event->>'project_name', ''),
    coalesce(nullif(p_event->>'tone', ''), 'info'),
    p_event->>'title',
    p_event->>'summary',
    p_event->'previous_value',
    p_event->'current_value',
    coalesce(p_event->'payload', '{}'::jsonb),
    coalesce(nullif(p_event->>'source', ''), 'job')
  )
  on conflict (user_id, event_type, materiality_key) do update set
    detected_at = public.lead_change_events.detected_at
  returning * into saved;

  return to_jsonb(saved);
end;
$$;

create or replace function public.lead_changes_record_notification(p_notification jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  saved public.lead_change_notifications%rowtype;
begin
  insert into public.lead_change_notifications (
    event_id, user_id, channel, status, provider, provider_message_id,
    recipient, subject, payload, error_code, sent_at
  ) values (
    (p_notification->>'event_id')::uuid,
    (p_notification->>'user_id')::uuid,
    coalesce(nullif(p_notification->>'channel', ''), 'email'),
    p_notification->>'status',
    nullif(p_notification->>'provider', ''),
    nullif(p_notification->>'provider_message_id', ''),
    nullif(p_notification->>'recipient', ''),
    nullif(p_notification->>'subject', ''),
    coalesce(p_notification->'payload', '{}'::jsonb),
    nullif(p_notification->>'error_code', ''),
    case when p_notification->>'status' = 'sent' then clock_timestamp() else null end
  ) returning * into saved;

  return to_jsonb(saved);
end;
$$;

grant execute on function public.lead_changes_due_leads(integer) to service_role;
grant execute on function public.lead_changes_record_event(jsonb) to service_role;
grant execute on function public.lead_changes_record_notification(jsonb) to service_role;

create or replace function public.lead_changes_record_quick_update(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  saved public.lead_change_events%rowtype;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_event->>'event_type' is distinct from 'quick_update_submitted' then
    raise exception 'invalid_event_type';
  end if;

  insert into public.lead_change_events (
    user_id, event_type, materiality_key, occurred_at, project_name,
    tone, title, summary, previous_value, current_value, payload, source
  ) values (
    caller,
    'quick_update_submitted',
    coalesce(nullif(p_event->>'materiality_key', ''), 'quick-update:' || gen_random_uuid()::text),
    coalesce((p_event->>'occurred_at')::timestamptz, clock_timestamp()),
    nullif(p_event->>'project_name', ''),
    coalesce(nullif(p_event->>'tone', ''), 'positive'),
    coalesce(nullif(p_event->>'title', ''), 'Actualizaste un dato de tu perfil'),
    coalesce(nullif(p_event->>'summary', ''), 'Registramos un avance reportado desde Inicio.'),
    p_event->'previous_value',
    p_event->'current_value',
    coalesce(p_event->'payload', '{}'::jsonb),
    'quick_update'
  ) returning * into saved;

  return to_jsonb(saved);
end;
$$;

grant execute on function public.lead_changes_record_quick_update(jsonb) to authenticated;

-- =============================================================
-- HU19 — Portal Inmobiliario (RAG) sobre public.proyectos_rag
-- =============================================================
-- Espejo de migrations/20260920000000_hu19_proyectos_rag.sql con
-- migrations/20261005150000_hu19_proyectos_rag_lock_writes.sql y
-- migrations/20261006090000_hu19_proyectos_rag_campos_catalogo.sql ya aplicadas.

create extension if not exists vector;

create table if not exists public.proyectos_rag (
    id uuid primary key default gen_random_uuid(),
    nombre text,
    descripcion text,
    valor_uf numeric,
    precio_clp numeric,
    comuna text,
    direccion text,
    tipo_vivienda text,
    dormitorios integer default 0,
    banos integer default 0,
    superficie_m2 numeric default 0,
    url text,
    imagen_url text,
    fuente text,
    estado text default 'disponible',
    inmobiliaria text,
    precio_desde boolean not null default false,
    embedding vector(384),
    created_at timestamptz default now()
);

-- Indice HNSW para busqueda por similitud semantica de coseno
create index if not exists proyectos_rag_embedding_hnsw_idx
  on public.proyectos_rag using hnsw (embedding vector_cosine_ops);

-- Indice secundario por comuna para acelerar filtros
create index if not exists proyectos_rag_comuna_idx
  on public.proyectos_rag (lower(comuna));

-- Lectura pública para el portal. Solo service_role (que salta RLS) escribe el
-- catálogo; ver 20261005150000_hu19_proyectos_rag_lock_writes.sql.
alter table public.proyectos_rag enable row level security;

drop policy if exists "Allow public read access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public read access to proyectos_rag"
  on public.proyectos_rag for select
  using (true);

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

-- RPC Function: match_proyectos_rag
create or replace function public.match_proyectos_rag (
  query_embedding vector(384),
  match_threshold float default 0.0,
  match_count int default 20,
  filter_commune text default null,
  filter_max_price_uf float default null,
  filter_property_type text default null
)
returns table (
  id uuid,
  nombre text,
  descripcion text,
  valor_uf numeric,
  precio_clp numeric,
  comuna text,
  direccion text,
  tipo_vivienda text,
  dormitorios int,
  banos int,
  superficie_m2 numeric,
  url text,
  imagen_url text,
  fuente text,
  estado text,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    p.id,
    p.nombre,
    p.descripcion,
    p.valor_uf,
    p.precio_clp,
    p.comuna,
    p.direccion,
    p.tipo_vivienda,
    p.dormitorios,
    p.banos,
    p.superficie_m2,
    p.url,
    p.imagen_url,
    p.fuente,
    p.estado,
    cast(1 - (p.embedding <=> query_embedding) as float) as similarity
  from public.proyectos_rag p
  where (1 - (p.embedding <=> query_embedding)) >= match_threshold
    and (filter_commune is null or lower(p.comuna) = lower(filter_commune))
    and (filter_max_price_uf is null or p.valor_uf <= filter_max_price_uf)
    and (filter_property_type is null or lower(p.tipo_vivienda) = lower(filter_property_type))
  order by p.embedding <=> query_embedding
  limit match_count;
end;
$$;
-- =============================================================
-- RutaHogar — HU 15: hechos del embudo comercial
-- =============================================================
-- Migraciones 20261005150000 y 20261005160000 (plan aceptado, ALG-18 G32). Diseño: docs/stories/HU15-dashboard-conversion-tiempos/PLAN.md.
-- Solo lectura: { now, proyectos, facts } del alcance de quien llama (ALG-18 Inputs).
create or replace function public.commercial_funnel_facts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.get_my_role();
  v_tenant uuid := public.get_my_inmobiliaria();
  v_scope uuid[];
  v_scope_text text[];
  v_proyectos jsonb;
  v_facts jsonb;
begin
  if v_uid is null
     or v_tenant is null
     or coalesce(v_role, '') not in ('admin_inmobiliario', 'admin', 'ejecutivo') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(pr.id order by pr.nombre, pr.id), '{}')
    into v_scope
  from public.proyectos pr
  where pr.inmobiliaria_id = v_tenant
    and (v_role <> 'ejecutivo' or public.is_ejecutivo_vinculado(pr.id));
  v_scope_text := v_scope::text[];

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id,
           'nombre', pr.nombre,
           'comuna', pr.comuna,
           'tipo', pr.tipo,
           'precio_min_uf', pr.precio_min_uf,
           'precio_max_uf', pr.precio_max_uf,
           'estado', pr.estado
         ) order by array_position(v_scope, pr.id)), '[]'::jsonb)
    into v_proyectos
  from public.proyectos pr
  where pr.id = any(v_scope);

  with lead_projects as (
    select p.id as lead, s.proyecto_id
    from public.profiles p
    cross join unnest(v_scope) as s(proyecto_id)
    where p.role = 'usuario'
      and exists (select 1 from public.evaluations e where e.user_id = p.id)
      and (
        public.lead_belongs_to_proyecto(p.id, s.proyecto_id)
        or exists (
          select 1
          from public.commercial_stage_events ev
          where ev.subject_user_id = p.id
            and ev.inmobiliaria_id = v_tenant
            and ev.proyecto_id = s.proyecto_id
        )
      )
  ),
  leads as (
    select lp.lead,
           row_number() over (order by lp.lead) as n,
           jsonb_agg(lp.proyecto_id order by array_position(v_scope, lp.proyecto_id)) as proyectos
    from lead_projects lp
    group by lp.lead
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', l.n::text,
           'first_evaluation_at', (select min(e.created_at) from public.evaluations e where e.user_id = l.lead),
           'evaluaciones', (
             select jsonb_agg(jsonb_build_object(
                      'at', e.created_at,
                      'project_goal_id', case
                        when e.financial_data -> 'input' -> 'project_goal' ->> 'id' = any(v_scope_text)
                          then e.financial_data -> 'input' -> 'project_goal' ->> 'id'
                      end
                    ) order by e.created_at, e.id)
             from public.evaluations e
             where e.user_id = l.lead
           ),
           'evaluacion_actual', (
             select jsonb_build_object(
                      'input', coalesce(e.financial_data -> 'input', '{}'::jsonb),
                      'onboarding', coalesce(pf.onboarding_data, '{}'::jsonb),
                      'result', coalesce(e.financial_data -> 'result', '{}'::jsonb)
                    )
             from public.evaluations e
             join public.profiles pf on pf.id = e.user_id
             where e.user_id = l.lead
             order by e.created_at desc, e.id desc
             limit 1
           ),
           'proyectos', l.proyectos,
           'postulaciones', coalesce((
             select jsonb_agg(jsonb_build_object('proyecto_id', g.proyecto_id, 'first_at', g.first_at)
                              order by g.first_at, g.proyecto_id)
             from (
               select e.financial_data -> 'input' -> 'project_goal' ->> 'id' as proyecto_id,
                      min(e.created_at) as first_at
               from public.evaluations e
               where e.user_id = l.lead
                 and e.financial_data -> 'input' -> 'project_goal' ->> 'id' = any(v_scope_text)
               group by 1
             ) g
           ), '[]'::jsonb),
           'stage_events', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'proyecto_id', ev.proyecto_id,
                      'stage_after', ev.stage_after,
                      'occurred_at', ev.occurred_at,
                      'por_sistema', ev.actor_role = 'sistema',
                      'por_mi', coalesce(ev.actor_id = v_uid, false)
                    ) order by ev.occurred_at, ev.id)
             from public.commercial_stage_events ev
             where ev.subject_user_id = l.lead
               and ev.inmobiliaria_id = v_tenant
               and (ev.proyecto_id is null or ev.proyecto_id = any(v_scope))
           ), '[]'::jsonb),
           'plan', (
             select jsonb_build_object(
                      'baseline_at', acc.at,
                      'target_proyecto_id', case when acc.goal = any(v_scope_text) then acc.goal end
                    )
             from (
               select ee.effective_at as at,
                      e.financial_data -> 'input' -> 'project_goal' ->> 'id' as goal
               from public.evaluation_events ee
               join public.evaluations e on e.id = ee.evaluation_id and e.user_id = ee.user_id
               where ee.user_id = l.lead
                 and ee.kind = 'plan_accepted'
               union all
               select e.plan_accepted_at,
                      e.financial_data -> 'input' -> 'project_goal' ->> 'id'
               from public.evaluations e
               where e.user_id = l.lead
                 and e.plan_accepted_at is not null
               order by 1, 2
               limit 1
             ) acc
           ),
           'favoritos', coalesce((
             select jsonb_agg(jsonb_build_object('proyecto_id', f.proyecto_id, 'created_at', f.created_at)
                              order by f.created_at, f.proyecto_id)
             from public.proyecto_favoritos f
             where f.usuario_id = l.lead
               and f.proyecto_id = any(v_scope)
           ), '[]'::jsonb),
           'progress_update_ats', coalesce((
             select jsonb_agg(te.recorded_at order by te.recorded_at, te.event_id)
             from public.tracking_events te
             where te.user_id = l.lead
               and te.event_kind in ('data_update', 'evaluation')
           ), '[]'::jsonb),
           'confirmed_goal_ats', coalesce((
             select jsonb_agg(ge.recorded_at order by ge.recorded_at, ge.event_id)
             from public.improvement_goal_events ge
             where ge.user_id = l.lead
               and ge.confirmed
           ), '[]'::jsonb)
         ) order by l.n), '[]'::jsonb)
    into v_facts
  from leads l;

  return jsonb_build_object('now', clock_timestamp(), 'proyectos', v_proyectos, 'facts', v_facts);
end;
$$;

revoke all on function public.commercial_funnel_facts() from public, anon, authenticated;
grant execute on function public.commercial_funnel_facts() to authenticated;
-- HU18 — Participación y consentimiento del co-deudor
-- Espejo acumulado de las migraciones HU18 de consentimiento.
-- =============================================================

create table if not exists public.co_debtor_invitations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.profiles(id) on delete restrict,
  recipient_email text not null check (length(trim(recipient_email)) > 0),
  recipient_rut text
    check (recipient_rut is null or recipient_rut ~ '^[0-9]{7,8}-[0-9K]$'),
  ingreso_mensual_complementario numeric,
  deuda_mensual_complementario numeric,
  tipo_contrato_complementario text,
  continuidad_laboral_complementario text,
  morosidad_complementario text,
  token_digest text not null unique check (length(trim(token_digest)) > 0),
  management_token_digest text
    check (management_token_digest is null or length(trim(management_token_digest)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'expired', 'confirmed', 'revoked', 'declined', 'replaced')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  replaced_at timestamptz,
  replacement_of_invitation_id uuid
    references public.co_debtor_invitations(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint co_debtor_invitations_expiry_check check (expires_at > created_at),
  constraint co_debtor_invitations_replacement_check check (
    replacement_of_invitation_id is distinct from id
  ),
  constraint co_debtor_invitations_declared_complement_check check (
    num_nonnulls(
      ingreso_mensual_complementario,
      deuda_mensual_complementario,
      tipo_contrato_complementario,
      continuidad_laboral_complementario,
      morosidad_complementario
    ) = 0
    or (
      num_nonnulls(
        ingreso_mensual_complementario,
        deuda_mensual_complementario,
        tipo_contrato_complementario,
        continuidad_laboral_complementario,
        morosidad_complementario
      ) = 5
      and ingreso_mensual_complementario >= 0
      and deuda_mensual_complementario >= 0
      and tipo_contrato_complementario in ('indefinido', 'plazo_fijo', 'independiente', 'honorarios_variable')
      and continuidad_laboral_complementario in ('menos_6_meses', 'entre_6_y_12_meses', 'entre_1_y_3_anios', 'mas_3_anios')
      and morosidad_complementario in ('si', 'no')
    )
  )
);

create unique index if not exists co_debtor_invitations_one_pending_per_lead_idx
  on public.co_debtor_invitations (lead_id)
  where status = 'pending';
create unique index if not exists co_debtor_invitations_management_token_digest_idx
  on public.co_debtor_invitations (management_token_digest)
  where management_token_digest is not null;
create index if not exists co_debtor_invitations_lead_created_idx
  on public.co_debtor_invitations (lead_id, created_at desc);
create index if not exists co_debtor_invitations_expiry_idx
  on public.co_debtor_invitations (expires_at)
  where status = 'pending';

create table if not exists public.co_debtor_confirmations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique
    references public.co_debtor_invitations(id) on delete restrict,
  ingreso_mensual_complementario numeric not null
    check (ingreso_mensual_complementario >= 0),
  deuda_mensual_complementario numeric not null
    check (deuda_mensual_complementario >= 0),
  tipo_contrato_complementario text not null
    check (tipo_contrato_complementario in ('indefinido', 'plazo_fijo', 'independiente', 'honorarios_variable')),
  continuidad_laboral_complementario text not null
    check (continuidad_laboral_complementario in (
      'menos_6_meses', 'entre_6_y_12_meses', 'entre_1_y_3_anios', 'mas_3_anios'
    )),
  morosidad_complementario text not null
    check (morosidad_complementario in ('si', 'no')),
  treatment_consent_version text not null
    check (length(trim(treatment_consent_version)) > 0),
  treatment_consented_at timestamptz not null,
  confirmed_at timestamptz not null default now()
);

create index if not exists co_debtor_confirmations_confirmed_idx
  on public.co_debtor_confirmations (confirmed_at desc);

create table if not exists public.co_debtor_consent_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null
    references public.co_debtor_invitations(id) on delete restrict,
  event_type text not null
    check (event_type in ('invited', 'replaced', 'expired', 'consent_granted', 'confirmed', 'revoked', 'declined')),
  actor_type text not null
    check (actor_type in ('lead', 'co_debtor', 'system')),
  invitation_status text not null
    check (invitation_status in ('pending', 'expired', 'confirmed', 'revoked', 'declined', 'replaced')),
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists co_debtor_consent_events_invitation_occurred_idx
  on public.co_debtor_consent_events (invitation_id, occurred_at, id);

create or replace function public.hu18_reject_consent_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'co_debtor_consent_events_are_append_only' using errcode = '23514';
end;
$$;

drop trigger if exists co_debtor_consent_events_append_only on public.co_debtor_consent_events;
create trigger co_debtor_consent_events_append_only
  before update or delete on public.co_debtor_consent_events
  for each row execute function public.hu18_reject_consent_event_mutation();

alter table public.co_debtor_invitations enable row level security;
alter table public.co_debtor_confirmations enable row level security;
alter table public.co_debtor_consent_events enable row level security;

drop policy if exists "Co-debtor invitations select own lead" on public.co_debtor_invitations;
create policy "Co-debtor invitations select own lead"
  on public.co_debtor_invitations
  for select to authenticated
  using (auth.uid() = lead_id);

drop policy if exists "Co-debtor invitations insert own lead" on public.co_debtor_invitations;
create policy "Co-debtor invitations insert own lead"
  on public.co_debtor_invitations
  for insert to authenticated
  with check (auth.uid() = lead_id);

drop policy if exists "Co-debtor confirmations select own lead" on public.co_debtor_confirmations;
create policy "Co-debtor confirmations select own lead"
  on public.co_debtor_confirmations
  for select to authenticated
  using (
    exists (
      select 1
      from public.co_debtor_invitations invitation
      where invitation.id = invitation_id
        and invitation.lead_id = auth.uid()
    )
  );

drop policy if exists "Co-debtor consent events select own lead" on public.co_debtor_consent_events;
create policy "Co-debtor consent events select own lead"
  on public.co_debtor_consent_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.co_debtor_invitations invitation
      where invitation.id = invitation_id
        and invitation.lead_id = auth.uid()
    )
  );

revoke all on table public.co_debtor_invitations,
  public.co_debtor_confirmations,
  public.co_debtor_consent_events from anon, authenticated;
grant select, insert on table public.co_debtor_invitations to authenticated;
grant select on table public.co_debtor_confirmations,
  public.co_debtor_consent_events to authenticated;
grant select, insert, update, delete on table public.co_debtor_invitations,
  public.co_debtor_confirmations to service_role;
grant select, insert on table public.co_debtor_consent_events to service_role;

create or replace function public.hu18_create_invitation(
  p_lead_id uuid, p_recipient_email text, p_token_digest text, p_expires_at timestamptz
)
returns table (invitation_id uuid, previous_invitation_id uuid)
language plpgsql security definer set search_path = public
as $$
declare existing_invitation public.co_debtor_invitations%rowtype; created_id uuid;
begin
  perform 1 from public.profiles where id = p_lead_id for update;
  if not found then raise exception 'hu18_lead_not_found' using errcode = 'P0001'; end if;
  select * into existing_invitation from public.co_debtor_invitations
    where lead_id = p_lead_id and status = 'pending' for update;
  if found and existing_invitation.expires_at <= clock_timestamp() then
    update public.co_debtor_invitations set status = 'expired' where id = existing_invitation.id;
    insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
      values (existing_invitation.id, 'expired', 'system', 'expired');
    existing_invitation := null;
  elsif found then
    update public.co_debtor_invitations set status = 'replaced', replaced_at = clock_timestamp()
      where id = existing_invitation.id;
    insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
      values (existing_invitation.id, 'replaced', 'lead', 'replaced');
  end if;
  insert into public.co_debtor_invitations
    (lead_id, recipient_email, token_digest, expires_at, replacement_of_invitation_id)
    values (p_lead_id, lower(trim(p_recipient_email)), p_token_digest, p_expires_at,
      case when existing_invitation.id is null then null else existing_invitation.id end)
    returning id into created_id;
  insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
    values (created_id, 'invited', 'lead', 'pending');
  return query select created_id, existing_invitation.id;
end;
$$;

-- Declared-complement overload used by the authenticated Edge Function. Its
-- values stay on the invitation until the co-debtor confirms their own data.
create or replace function public.hu18_create_invitation(
  p_lead_id uuid,
  p_recipient_email text,
  p_recipient_rut text,
  p_token_digest text,
  p_expires_at timestamptz,
  p_ingreso_mensual_complementario numeric,
  p_deuda_mensual_complementario numeric,
  p_tipo_contrato_complementario text,
  p_continuidad_laboral_complementario text,
  p_morosidad_complementario text
)
returns table (invitation_id uuid, previous_invitation_id uuid)
language plpgsql security definer set search_path = public
as $$
declare created_invitation record;
begin
  select * into created_invitation from public.hu18_create_invitation(
    p_lead_id, p_recipient_email, p_recipient_rut, p_token_digest, p_expires_at
  );
  update public.co_debtor_invitations
    set ingreso_mensual_complementario = p_ingreso_mensual_complementario,
        deuda_mensual_complementario = p_deuda_mensual_complementario,
        tipo_contrato_complementario = p_tipo_contrato_complementario,
        continuidad_laboral_complementario = p_continuidad_laboral_complementario,
        morosidad_complementario = p_morosidad_complementario
    where id = created_invitation.invitation_id;
  return query select created_invitation.invitation_id, created_invitation.previous_invitation_id;
end;
$$;

-- RUT-aware overload used only by the authenticated Edge Function. The
-- original four-argument operation remains for existing hosted callers.
create or replace function public.hu18_create_invitation(
  p_lead_id uuid,
  p_recipient_email text,
  p_recipient_rut text,
  p_token_digest text,
  p_expires_at timestamptz
)
returns table (invitation_id uuid, previous_invitation_id uuid)
language plpgsql security definer set search_path = public
as $$
declare created_invitation record;
begin
  if p_recipient_rut !~ '^[0-9]{7,8}-[0-9K]$' then
    raise exception 'hu18_invalid_recipient_rut' using errcode = 'P0001';
  end if;
  select * into created_invitation from public.hu18_create_invitation(
    p_lead_id, p_recipient_email, p_token_digest, p_expires_at
  );
  update public.co_debtor_invitations
    set recipient_rut = p_recipient_rut
    where id = created_invitation.invitation_id;
  return query select created_invitation.invitation_id, created_invitation.previous_invitation_id;
end;
$$;

create or replace function public.hu18_revert_invitation_after_delivery_failure(
  p_invitation_id uuid, p_previous_invitation_id uuid default null
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare current_status text;
begin
  select status into current_status from public.co_debtor_invitations
    where id = p_invitation_id for update;
  if current_status is distinct from 'pending' then return false; end if;
  update public.co_debtor_invitations set status = 'replaced', replaced_at = clock_timestamp()
    where id = p_invitation_id;
  insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'replaced', 'system', 'replaced');
  if p_previous_invitation_id is not null then
    update public.co_debtor_invitations set status = 'pending', replaced_at = null
      where id = p_previous_invitation_id and status = 'replaced';
  end if;
  return true;
end;
$$;

create or replace function public.hu18_expire_invitation(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare invitation public.co_debtor_invitations%rowtype;
begin
  select * into invitation from public.co_debtor_invitations where id = p_invitation_id for update;
  if not found or invitation.status <> 'pending' or invitation.expires_at > clock_timestamp() then return false; end if;
  update public.co_debtor_invitations set status = 'expired' where id = invitation.id;
  insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
    values (invitation.id, 'expired', 'system', 'expired');
  return true;
end;
$$;

create or replace function public.hu18_expire_invitations()
returns table (invitation_id uuid, recipient_email text, lead_id uuid)
language plpgsql security definer set search_path = public
as $$
declare invitation public.co_debtor_invitations%rowtype;
begin
  for invitation in select * from public.co_debtor_invitations
    where status = 'pending' and expires_at <= clock_timestamp() for update skip locked
  loop
    update public.co_debtor_invitations set status = 'expired' where id = invitation.id;
    insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
      values (invitation.id, 'expired', 'system', 'expired');
    invitation_id := invitation.id; recipient_email := invitation.recipient_email; lead_id := invitation.lead_id;
    return next;
  end loop;
end;
$$;

create or replace function public.hu18_confirm_invitation(
  p_invitation_id uuid, p_ingreso_mensual_complementario numeric,
  p_deuda_mensual_complementario numeric, p_tipo_contrato_complementario text,
  p_continuidad_laboral_complementario text, p_morosidad_complementario text,
  p_treatment_consent_version text, p_management_token_digest text
)
returns table (recipient_email text, lead_id uuid)
language plpgsql security definer set search_path = public
as $$
declare invitation public.co_debtor_invitations%rowtype;
begin
  select * into invitation from public.co_debtor_invitations where id = p_invitation_id for update;
  if not found then raise exception 'hu18_invitation_not_found' using errcode = 'P0001'; end if;
  if invitation.status = 'pending' and invitation.expires_at <= clock_timestamp() then
    update public.co_debtor_invitations set status = 'expired' where id = invitation.id;
    insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
      values (invitation.id, 'expired', 'system', 'expired');
    return;
  end if;
  if invitation.status <> 'pending' then raise exception 'hu18_invitation_not_pending' using errcode = 'P0001'; end if;
  if length(trim(p_management_token_digest)) = 0 then
    raise exception 'hu18_management_token_missing' using errcode = 'P0001';
  end if;
  insert into public.co_debtor_confirmations (
    invitation_id, ingreso_mensual_complementario, deuda_mensual_complementario,
    tipo_contrato_complementario, continuidad_laboral_complementario, morosidad_complementario,
    treatment_consent_version, treatment_consented_at
  ) values (
    invitation.id, p_ingreso_mensual_complementario, p_deuda_mensual_complementario,
    p_tipo_contrato_complementario, p_continuidad_laboral_complementario, p_morosidad_complementario,
    p_treatment_consent_version, clock_timestamp()
  );
  update public.co_debtor_invitations set status = 'confirmed', consumed_at = clock_timestamp(),
    management_token_digest = p_management_token_digest where id = invitation.id;
  insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
    values (invitation.id, 'consent_granted', 'co_debtor', 'confirmed'),
      (invitation.id, 'confirmed', 'co_debtor', 'confirmed');
  return query select invitation.recipient_email, invitation.lead_id;
end;
$$;

create or replace function public.hu18_revoke_consent(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare current_status text;
begin
  select status into current_status from public.co_debtor_invitations where id = p_invitation_id for update;
  if not found then raise exception 'hu18_invitation_not_found' using errcode = 'P0001'; end if;
  if current_status = 'revoked' then return false; end if;
  if current_status <> 'confirmed' then raise exception 'hu18_consent_not_confirmed' using errcode = 'P0001'; end if;
  update public.co_debtor_invitations set status = 'revoked' where id = p_invitation_id;
  insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'revoked', 'co_debtor', 'revoked');
  return true;
end;
$$;

create or replace function public.hu18_decline_invitation(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare current_status text;
begin
  select status into current_status from public.co_debtor_invitations where id = p_invitation_id for update;
  if not found then raise exception 'hu18_invitation_not_found' using errcode = 'P0001'; end if;
  if current_status <> 'pending' then raise exception 'hu18_invitation_not_pending' using errcode = 'P0001'; end if;
  update public.co_debtor_invitations set status = 'declined', consumed_at = clock_timestamp() where id = p_invitation_id;
  insert into public.co_debtor_consent_events (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'declined', 'co_debtor', 'declined');
  return true;
end;
$$;

revoke all on function public.hu18_create_invitation(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.hu18_create_invitation(uuid, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.hu18_create_invitation(uuid, text, text, text, timestamptz, numeric, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.hu18_revert_invitation_after_delivery_failure(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hu18_expire_invitation(uuid) from public, anon, authenticated;
revoke all on function public.hu18_expire_invitations() from public, anon, authenticated;
revoke all on function public.hu18_confirm_invitation(uuid, numeric, numeric, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.hu18_revoke_consent(uuid) from public, anon, authenticated;
revoke all on function public.hu18_decline_invitation(uuid) from public, anon, authenticated;
grant execute on function public.hu18_create_invitation(uuid, text, text, timestamptz),
  public.hu18_create_invitation(uuid, text, text, text, timestamptz),
  public.hu18_create_invitation(uuid, text, text, text, timestamptz, numeric, numeric, text, text, text),
  public.hu18_revert_invitation_after_delivery_failure(uuid, uuid), public.hu18_expire_invitation(uuid),
  public.hu18_expire_invitations(), public.hu18_confirm_invitation(uuid, numeric, numeric, text, text, text, text, text),
  public.hu18_revoke_consent(uuid), public.hu18_decline_invitation(uuid) to service_role;

-- HU18 Step 8: staff never reads raw evaluation/history snapshots directly.
-- The backend applies consent-state redaction and the existing commercial
-- tenant scope before returning an executive projection.
drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Evaluations select sales" on public.evaluations;

drop policy if exists "Scoring history select staff" on public.scoring_history;
drop policy if exists "Evaluation events select staff" on public.evaluation_events;
-- ScoreLeads — HU16: Historial de estados de leads para admins
-- =============================================================

create or replace function public.get_lead_status_history_for_admin()
returns table (
  history_id uuid,
  profile_id uuid,
  lead_name text,
  lead_email text,
  changed_by_name text,
  changed_by_email text,
  old_status text,
  new_status text,
  reason text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select 
    h.id as history_id,
    p.id as profile_id,
    p.full_name as lead_name,
    u_lead.email::text as lead_email,
    p_changer.full_name as changed_by_name,
    u_changer.email::text as changed_by_email,
    h.old_status,
    h.new_status,
    h.reason,
    h.created_at
  from public.lead_status_history h
  join public.profiles p on p.id = h.profile_id
  join auth.users u_lead on u_lead.id = p.id
  left join public.profiles p_changer on p_changer.id = h.changed_by
  left join auth.users u_changer on u_changer.id = h.changed_by
  where (
    public.get_my_role() = 'admin'
    or (
      public.get_my_role() = 'admin_inmobiliario'
      and (
        exists (
          select 1 from public.evaluations e
          join public.proyectos pr on pr.inmobiliaria_id = public.get_my_inmobiliaria()
          where e.user_id = p.id
          and (
            pr.comuna = coalesce(e.target_commune, e.financial_data->'input'->>'comuna_objetivo')
            or pr.comuna = p.onboarding_data->>'comuna_interes'
            or pr.comuna = p.onboarding_data->>'comuna_alternativa'
          )
        )
        or exists (
          select 1 from public.lead_status_history lsh
          join public.profiles exec_p on exec_p.id = lsh.changed_by
          where lsh.profile_id = p.id
          and exec_p.inmobiliaria_id = public.get_my_inmobiliaria()
        )
      )
    )
  )
  order by h.created_at desc;
$$;

grant execute on function public.get_lead_status_history_for_admin() to authenticated;

-- Migración para controlar avances irreales en el plan de mejora (HU16)

CREATE OR REPLACE FUNCTION public.check_housing_plan_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_new_progress jsonb;
  v_old_progress jsonb;
  v_new_total numeric := 0;
  v_old_total numeric := 0;
  v_income numeric := 0;
  v_month jsonb;
  v_profile RECORD;
  v_days_active numeric;
  v_months_active numeric;
  v_max_logical_savings numeric;
  v_fraud_reason jsonb := NULL;
BEGIN
  -- Extraer el array de meses registrados en el plan de ahorro
  v_new_progress := NEW.housing_plan->'progress'->'months';
  v_old_progress := OLD.housing_plan->'progress'->'months';

  -- Si no hay progreso nuevo, no hacemos nada
  IF v_new_progress IS NULL OR v_new_progress = v_old_progress THEN
    RETURN NEW;
  END IF;

  -- Sumar total ahorrado en el nuevo snapshot
  IF jsonb_typeof(v_new_progress) = 'array' THEN
    FOR v_month IN SELECT * FROM jsonb_array_elements(v_new_progress) LOOP
      v_new_total := v_new_total + COALESCE((v_month->>'savedAmount')::numeric, 0);
    END LOOP;
  END IF;

  -- Sumar total ahorrado en el viejo snapshot
  IF jsonb_typeof(v_old_progress) = 'array' THEN
    FOR v_month IN SELECT * FROM jsonb_array_elements(v_old_progress) LOOP
      v_old_total := v_old_total + COALESCE((v_month->>'savedAmount')::numeric, 0);
    END LOOP;
  END IF;

  -- Verificar el comportamiento de ahorro
  IF v_new_total > v_old_total THEN
    -- Obtenemos el ingreso mensual del snapshot inicial
    v_income := COALESCE((NEW.financial_data->'input'->>'ingreso_mensual')::numeric, 0);
    
    IF v_income > 0 THEN
      -- Calculamos la velocidad del tiempo
      v_days_active := EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 86400;
      v_months_active := GREATEST(0, v_days_active / 30.0);
      
      -- Techo máximo de la realidad: 3 sueldos iniciales + 1 sueldo entero por cada mes que ha pasado
      v_max_logical_savings := (v_income * 3) + (v_income * v_months_active);

      -- REGLA 1: Salto gigante en una sola petición (Regla original)
      IF (v_new_total - v_old_total) > (v_income * 3) THEN
        v_fraud_reason := '"Avance irreal vs renta mensual en Plan de Mejora"'::jsonb;
        
      -- REGLA 2: Velocidad de ahorro imposible / Smurfing (Micro-transacciones para evadir regla 1)
      ELSIF v_new_total > v_max_logical_savings THEN
        v_fraud_reason := '"Velocidad de ahorro matemáticamente imposible (Smurfing detectado)"'::jsonb;
      END IF;

      -- Si se violó alguna regla, castigamos
      IF v_fraud_reason IS NOT NULL THEN
        -- Obtenemos el estado actual del lead
        SELECT reliability_status INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
        
        -- Si el lead está normal o reactivado, lo marcamos para revisión
        IF v_profile.reliability_status IN ('normal', 'reactivado') THEN
          UPDATE public.profiles 
          SET reliability_status = 'en_revision', updated_at = now() 
          WHERE id = NEW.user_id;
        END IF;
        
        -- Inyectamos el flag en la evaluación
        NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || v_fraud_reason;
        NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 100);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger en la tabla evaluations
DROP TRIGGER IF EXISTS trg_check_housing_plan_progress ON public.evaluations;
CREATE TRIGGER trg_check_housing_plan_progress
BEFORE UPDATE ON public.evaluations
FOR EACH ROW
WHEN (OLD.housing_plan IS DISTINCT FROM NEW.housing_plan)
EXECUTE FUNCTION public.check_housing_plan_progress();

-- Trigger para marcar fraude desde el ML o reglas SQL en el momento del INSERT
CREATE OR REPLACE FUNCTION public.check_ml_fraud_on_insert()
RETURNS trigger AS $$
DECLARE
  v_profile RECORD;
  v_device_hash text;
  v_intentos integer;
  v_ahorro_previo numeric;
  v_ahorro_actual numeric;
  v_renta numeric;
  v_time_to_submit numeric;
BEGIN
  v_device_hash := NEW.financial_data->'input'->>'device_id_hash';
  v_time_to_submit := COALESCE((NEW.financial_data->'input'->>'time_to_submit')::numeric, 999);

  -- 1. Evaluamos reglas duras en la BD (Fallback robusto y bypass de RLS por SECURITY DEFINER)
  IF v_device_hash IS NOT NULL THEN
    
    -- Tanteo: más de 3 intentos en 15 minutos
    SELECT count(*) INTO v_intentos 
    FROM public.evaluations 
    WHERE financial_data->'input'->>'device_id_hash' = v_device_hash
    AND created_at >= now() - interval '15 minutes';
    
    IF v_intentos >= 3 THEN 
       NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
       NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Tanteo detectado: demasiadas evaluaciones en corto tiempo"'::jsonb;
    END IF;
    
    -- Avance irreal: salto ilógico en 24 horas
    SELECT (financial_data->'input'->>'ahorro_disponible')::numeric INTO v_ahorro_previo
    FROM public.evaluations
    WHERE financial_data->'input'->>'device_id_hash' = v_device_hash
    AND created_at >= now() - interval '24 hours'
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_ahorro_previo IS NOT NULL THEN
       v_ahorro_actual := COALESCE((NEW.financial_data->'input'->>'ahorro_disponible')::numeric, 0);
       v_renta := COALESCE((NEW.financial_data->'input'->>'ingreso_mensual')::numeric, 0);
       IF v_ahorro_actual > (v_ahorro_previo + (v_renta * 3)) THEN
          NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
          NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Avance de ahorro irreal detectado en 24h"'::jsonb;
       END IF;
    END IF;
  END IF;

  -- Script automatizado
  IF v_time_to_submit < 5 THEN
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 95.0);
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Tiempo de llenado anormalmente bajo (<5s)"'::jsonb;
  END IF;

  -- 2. Si cualquier regla (o el ML mismo) arrojó fraude, marcamos el perfil
  IF NEW.fraud_score_probability >= 90 THEN
    SELECT reliability_status INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
    
    IF v_profile.reliability_status IN ('normal', 'reactivado') THEN
      UPDATE public.profiles 
      SET reliability_status = 'sospechoso', updated_at = now() 
      WHERE id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_ml_fraud_on_insert ON public.evaluations;
CREATE TRIGGER trg_check_ml_fraud_on_insert
BEFORE INSERT ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.check_ml_fraud_on_insert();
