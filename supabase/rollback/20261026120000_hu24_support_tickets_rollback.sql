-- =============================================================
-- Rollback HU24 — support_tickets
-- =============================================================

drop function if exists public.submit_ticket_user_feedback(uuid, text, text);
drop function if exists public.submit_ticket_user_feedback(uuid, text);
drop function if exists public.update_support_ticket_status(uuid, text, text);
drop function if exists public.update_support_ticket_status(uuid, text);
drop table if exists public.support_tickets cascade;
