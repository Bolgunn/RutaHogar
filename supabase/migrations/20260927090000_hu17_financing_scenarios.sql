-- HU17: reviewed benefit versions and immutable owner-only financing scenarios.
create table if not exists public.housing_benefit_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null check (status in ('draft', 'published', 'retired')),
  official_source_metadata jsonb not null check (jsonb_typeof(official_source_metadata) = 'object'),
  source_checksum text not null,
  effective_from date,
  effective_to date,
  published_at timestamptz,
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) > 0),
  created_at timestamptz not null default now(),
  constraint housing_benefit_catalog_published_check check ((status = 'published') = (published_at is not null))
);
alter table public.housing_benefit_catalog_versions enable row level security;
revoke all on table public.housing_benefit_catalog_versions from anon, authenticated;

create table if not exists public.mortgage_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
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
  auth.uid() = user_id and exists (
    select 1 from public.evaluations e
    where e.id = evaluation_id and e.user_id = auth.uid()
      and coalesce((e.financial_data -> 'input' ->> 'consentimiento')::boolean, false)
  )
);
drop policy if exists "Mortgage scenarios delete own" on public.mortgage_scenarios;
create policy "Mortgage scenarios delete own" on public.mortgage_scenarios for delete using (auth.uid() = user_id);
