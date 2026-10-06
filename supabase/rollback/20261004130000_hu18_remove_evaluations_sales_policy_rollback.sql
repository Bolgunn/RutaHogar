-- Rollback HU18 Step 8 direct-evaluation privacy hardening.
-- This restores only the legacy policy removed by the paired migration.
begin;

create policy "Evaluations select sales"
  on public.evaluations
  for select to authenticated
  using (
    (auth.uid() = user_id)
    or
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]))
  );

commit;
