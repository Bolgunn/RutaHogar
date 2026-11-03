-- =============================================================
-- Rollback HU24 — restaura EXECUTE de las RPC de tickets
-- =============================================================

grant execute on function public.update_support_ticket_status(uuid, text, text) to authenticated;
grant execute on function public.submit_ticket_user_feedback(uuid, text, text) to authenticated;
