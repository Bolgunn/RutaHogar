drop policy if exists "Scoring history select staff" on public.scoring_history;
create policy "Scoring history select staff"
  on public.scoring_history
  for select
  using (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text]));
