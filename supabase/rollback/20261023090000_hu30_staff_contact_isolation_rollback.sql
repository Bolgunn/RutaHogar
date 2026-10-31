-- Safe rollback: disable affected client reads; never restore cross-tenant access.
-- Retain functions/data and use forward correction/reapply to resume these reads.
begin;
revoke all on function public.list_lead_contacts(uuid[]),public.get_reported_leads_for_admin(),public.get_lead_status_history_for_admin() from public,anon,authenticated;
drop policy if exists "Staff select lead_status_history" on public.lead_status_history;
create policy "Staff select lead_status_history" on public.lead_status_history
  for select to authenticated using (false);
commit;
