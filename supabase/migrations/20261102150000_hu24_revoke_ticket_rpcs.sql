-- =============================================================
-- HU24 — Las escrituras de tickets pasan solo por el backend
-- El cliente ya no llama estas RPC. Mantener EXECUTE permitiría guardar texto
-- sin la redacción de datos personales que aplica el backend.
-- =============================================================

revoke all on function public.update_support_ticket_status(uuid, text, text) from authenticated;
revoke all on function public.submit_ticket_user_feedback(uuid, text, text) from authenticated;
