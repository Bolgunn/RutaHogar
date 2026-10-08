-- HU19: la sección Proyectos muestra avisos del portal con el mismo formato que
-- el catálogo (inmobiliaria y precio "desde" o fijo). El dump de Apify trae ambos
-- datos (`seller`, `price_text`) pero la ingesta los descartaba.
-- `inmobiliaria` es null cuando el aviso no informa vendedor: no se deduce del título.
alter table public.proyectos_rag
  add column if not exists inmobiliaria text,
  add column if not exists precio_desde boolean not null default false;
