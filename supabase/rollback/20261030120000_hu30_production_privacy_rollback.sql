-- Containment only: never restore raw financial browser access or TRUNCATE.
begin;
revoke all on function public.commercial_funnel_facts(),
  public.hu30_commercial_funnel_facts_raw() from public, anon, authenticated;
revoke all on function public.hu30_commercial_funnel_source(uuid) from public,anon,authenticated,service_role;
commit;
