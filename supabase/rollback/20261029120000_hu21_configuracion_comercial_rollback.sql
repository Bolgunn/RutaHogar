-- Rollback of 20261029120000_hu21_configuracion_comercial.sql. Drops every saved commercial
-- configuration version; export the table first if its history must be kept. Leads fall back to
-- the engine's stored priority, which is what an empty table already meant.
drop table if exists public.configuracion_comercial;
