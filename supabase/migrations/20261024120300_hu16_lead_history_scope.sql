-- Global admins have no tenant; tenant staff see only leads in their scope.
-- lead_in_my_inmobiliaria uses the current lead/project relationship, not the actor.
drop policy if exists "Staff select lead_status_history" on public.lead_status_history;
create policy "Staff select lead_status_history" on public.lead_status_history
  for select to authenticated
  using (
    (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
    or (
      public.get_my_role() in ('admin', 'admin_inmobiliario', 'ejecutivo')
      and public.get_my_inmobiliaria() is not null
      and public.lead_in_my_inmobiliaria(profile_id)
    )
  );
revoke all on function public.get_reported_leads_for_admin() from public, anon, authenticated;
revoke all on function public.get_lead_status_history_for_admin() from public, anon, authenticated;
grant execute on function public.get_reported_leads_for_admin() to authenticated, service_role;
grant execute on function public.get_lead_status_history_for_admin() to authenticated, service_role;
