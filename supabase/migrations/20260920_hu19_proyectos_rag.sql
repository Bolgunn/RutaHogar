-- HU19: Migration for tabla public.proyectos_rag con soporte pgvector
-- Crea la tabla public.proyectos_rag, indices vectoriales, la funcion RPC match_proyectos_rag y politicas RLS.

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
    embedding vector(384),
    created_at timestamptz default now()
);

-- Indice HNSW para busqueda por similitud semantica de coseno
create index if not exists proyectos_rag_embedding_hnsw_idx
  on public.proyectos_rag using hnsw (embedding vector_cosine_ops);

-- Indice secundario por comuna para acelerar filtros
create index if not exists proyectos_rag_comuna_idx
  on public.proyectos_rag (lower(comuna));

-- RLS policies: Acceso completo para proyectos_rag
alter table public.proyectos_rag enable row level security;

drop policy if exists "Allow public read access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public read access to proyectos_rag"
  on public.proyectos_rag for select
  using (true);

drop policy if exists "Allow public delete access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public delete access to proyectos_rag"
  on public.proyectos_rag for delete
  using (true);

drop policy if exists "Allow public insert access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public insert access to proyectos_rag"
  on public.proyectos_rag for insert
  with check (true);

drop policy if exists "Allow public update access to proyectos_rag" on public.proyectos_rag;
create policy "Allow public update access to proyectos_rag"
  on public.proyectos_rag for update
  using (true);

-- RPC Function: truncate_proyectos_rag
create or replace function public.truncate_proyectos_rag ()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.proyectos_rag;
end;
$$;


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
