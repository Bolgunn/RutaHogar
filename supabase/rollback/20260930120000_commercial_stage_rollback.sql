-- Revierte 20260930120000_commercial_stage.sql.
-- Borra el historial de etapas comerciales: exportarlo antes si ya hay datos reales.
begin;

drop function if exists public.commercial_stage_backfill();
drop function if exists public.change_commercial_stage(uuid, text, text, text);
drop function if exists public.commercial_stage_transition_check(text, text, text, text);
drop function if exists public.lead_in_my_inmobiliaria(uuid);
drop function if exists public.lead_belongs_to_inmobiliaria(uuid, uuid);

drop table if exists public.lead_commercial_stage;
drop trigger if exists commercial_stage_events_immutable on public.commercial_stage_events;
drop table if exists public.commercial_stage_events;
drop function if exists public.commercial_stage_reject_mutation();

commit;
