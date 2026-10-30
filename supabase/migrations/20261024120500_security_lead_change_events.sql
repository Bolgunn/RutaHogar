-- Service-only event ingestion; authenticated quick updates remain available.
revoke all on table public.lead_change_events, public.lead_change_notifications,
  public.lead_notification_preferences from public, anon, authenticated;
grant select, update on table public.lead_change_events to authenticated;
grant select on table public.lead_change_notifications to authenticated;
grant select, insert, update on table public.lead_notification_preferences to authenticated;
grant all on table public.lead_change_events, public.lead_change_notifications,
  public.lead_notification_preferences to service_role;
revoke all on function public.lead_changes_due_leads(integer) from public, anon, authenticated;
revoke all on function public.lead_changes_record_event(jsonb) from public, anon, authenticated;
revoke all on function public.lead_changes_record_notification(jsonb) from public, anon, authenticated;
revoke all on function public.lead_changes_record_quick_update(jsonb) from public, anon, authenticated;
grant execute on function public.lead_changes_due_leads(integer) to service_role;
grant execute on function public.lead_changes_record_event(jsonb) to service_role;
grant execute on function public.lead_changes_record_notification(jsonb) to service_role;
grant execute on function public.lead_changes_record_quick_update(jsonb) to authenticated, service_role;
