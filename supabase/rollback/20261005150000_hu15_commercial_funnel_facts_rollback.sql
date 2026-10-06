-- Revierte 20261005150000_hu15_commercial_funnel_facts.sql.
-- Solo elimina la función de lectura que creó; no toca datos ni las funciones
-- de project tracks que reutiliza.
begin;

drop function if exists public.commercial_funnel_facts();

commit;
