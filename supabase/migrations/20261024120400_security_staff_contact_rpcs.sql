-- Keep the current contact function body, including email and role checks.
revoke all on function public.list_lead_contacts(uuid[]) from public, anon, authenticated;
revoke all on function public.update_lead_reliability(uuid, text) from public, anon, authenticated;
revoke all on function public.update_lead_reliability(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.list_lead_contacts(uuid[]) to authenticated, service_role;
grant execute on function public.update_lead_reliability(uuid, text) to authenticated, service_role;
grant execute on function public.update_lead_reliability(uuid, uuid, text, text) to authenticated, service_role;
