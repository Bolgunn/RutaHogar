-- HU18 Step 8: staff evaluations are available only through the authenticated
-- server-side projections. Remove the legacy hosted policy that bypasses them.
begin;

drop policy if exists "Evaluations select sales" on public.evaluations;

commit;
