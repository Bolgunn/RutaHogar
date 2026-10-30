-- HU 21 — Configuración comercial y priorización por inmobiliaria (ALG-19).
-- Insert-only versions of each inmobiliaria's commercial criteria: the history is the data.
-- Backend-only table: RLS on and no policy for anon/authenticated (deny-all). Only the backend's
-- service_role reads and inserts; nobody updates or deletes. An empty table means defaults, so
-- this can be applied before or after the code that reads it.
begin;

create table if not exists public.configuracion_comercial (
  id uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references public.inmobiliarias(id),
  version int not null check (version >= 1),
  criterios jsonb not null check (jsonb_typeof(criterios) = 'object'),
  alg_version text not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint configuracion_comercial_version_unique unique (inmobiliaria_id, version)
);

create index if not exists configuracion_comercial_latest_idx
  on public.configuracion_comercial (inmobiliaria_id, version desc);

alter table public.configuracion_comercial enable row level security;
revoke all on table public.configuracion_comercial from public, anon, authenticated, service_role;
grant select, insert on table public.configuracion_comercial to service_role;

commit;
