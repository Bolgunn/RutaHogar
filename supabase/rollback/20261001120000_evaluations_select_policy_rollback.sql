drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select
  using (
    (auth.uid() = user_id)
    or
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]))
  );
