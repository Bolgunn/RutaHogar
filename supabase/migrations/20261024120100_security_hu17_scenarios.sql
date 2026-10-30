-- HU17: RLS does not protect TRUNCATE; grant only the documented operations.
revoke all on table public.mortgage_scenarios from public, anon, authenticated;
grant select, insert, delete on table public.mortgage_scenarios to authenticated;
grant all on table public.mortgage_scenarios to service_role;
revoke all on table public.housing_benefit_catalog_versions from public, anon, authenticated;
grant all on table public.housing_benefit_catalog_versions to service_role;
