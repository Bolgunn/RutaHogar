-- La ingesta Apify guardó tipo_vivienda en plural ("casas", "departamentos") y el
-- filtro del portal compara contra singular, así que filtrar por tipo nunca
-- devolvía filas. ingest_apify.py ya normaliza; esto corrige las filas existentes.
update public.proyectos_rag set tipo_vivienda = 'casa' where lower(tipo_vivienda) = 'casas';
update public.proyectos_rag set tipo_vivienda = 'departamento' where lower(tipo_vivienda) = 'departamentos';
