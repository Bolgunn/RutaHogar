-- HU18 Step 8: raw co-debtor fields may not reach staff browsers through
-- immutable evaluation/history snapshots. Staff uses the authenticated backend
-- projection, which applies current consent and commercial scope server-side.
begin;

drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Scoring history select staff" on public.scoring_history;
drop policy if exists "Evaluation events select staff" on public.evaluation_events;

commit;
