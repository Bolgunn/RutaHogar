-- Revierte 20260920000000_hu19_proyectos_rag.sql. Borra el catálogo del portal;
-- se repuebla con backend/scripts/ingest_apify.py. La extensión vector se deja.
drop function if exists public.match_proyectos_rag(vector, float, int, text, float, text);
drop function if exists public.truncate_proyectos_rag();
drop table if exists public.proyectos_rag;
