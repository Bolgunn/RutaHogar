-- HU19: Migration for Portal Inmobiliario Inteligente (RAG Vector Search)
-- Habilita pgvector, crea la tabla public.properties, la funcion RPC match_properties, RLS y datos semilla.

create extension if not exists vector;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_uf numeric not null,
  price_clp numeric,
  commune text not null,
  address text,
  property_type text not null default 'departamento', -- 'departamento', 'casa', etc.
  bedrooms integer default 1,
  bathrooms integer default 1,
  surface_m2 numeric,
  url text,
  image_url text,
  source text not null default 'Portal Inmobiliario (Apify)',
  embedding vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indice HNSW para busqueda vectorial rapida por distancia coseno
create index if not exists properties_embedding_hnsw_idx
  on public.properties using hnsw (embedding vector_cosine_ops);

-- Indice secundario por comuna para acelerar filtros combinados
create index if not exists properties_commune_idx
  on public.properties (lower(commune));

-- RLS policies: Catalogo publico para lectura
alter table public.properties enable row level security;

drop policy if exists "Allow public read access to properties" on public.properties;
create policy "Allow public read access to properties"
  on public.properties for select
  using (true);

-- Trigger para updated_at
drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- RPC Function: match_properties
create or replace function public.match_properties (
  query_embedding vector(384),
  match_threshold float default 0.0,
  match_count int default 20,
  filter_commune text default null,
  filter_max_price_uf float default null,
  filter_property_type text default null
)
returns table (
  id uuid,
  title text,
  description text,
  price_uf numeric,
  price_clp numeric,
  commune text,
  address text,
  property_type text,
  bedrooms int,
  bathrooms int,
  surface_m2 numeric,
  url text,
  image_url text,
  source text,
  similarity float
)
language plpgsql
stable
as $$
begin
  return query
  select
    p.id,
    p.title,
    p.description,
    p.price_uf,
    p.price_clp,
    p.commune,
    p.address,
    p.property_type,
    p.bedrooms,
    p.bathrooms,
    p.surface_m2,
    p.url,
    p.image_url,
    p.source,
    cast(1 - (p.embedding <=> query_embedding) as float) as similarity
  from public.properties p
  where (1 - (p.embedding <=> query_embedding)) >= match_threshold
    and (filter_commune is null or lower(p.commune) = lower(filter_commune))
    and (filter_max_price_uf is null or p.price_uf <= filter_max_price_uf)
    and (filter_property_type is null or lower(p.property_type) = lower(filter_property_type))
  order by p.embedding <=> query_embedding
  limit match_count;
end;
$$;
