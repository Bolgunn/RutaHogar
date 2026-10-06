-- Immutable, complete BCCh bundles. Application validation enforces ALG-9 provenance.
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
