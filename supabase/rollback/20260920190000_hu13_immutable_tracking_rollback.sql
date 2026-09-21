-- Apply only before real HU13 use or after an explicitly reviewed export.
begin;
drop function if exists public.hu13_read(uuid);
drop function if exists public.hu13_commit(uuid, jsonb, uuid, jsonb);
drop function if exists public.hu13_confirm_goal(uuid, uuid, jsonb);
drop function if exists public.hu13_annotate_evaluation(uuid, uuid, jsonb);
drop trigger if exists hu13_immutable on public.evaluations;
drop trigger if exists hu13_immutable on public.scoring_history;
drop trigger if exists hu13_immutable on public.improvement_goals;
drop policy if exists "Improvement goals insert own" on public.improvement_goals;
drop policy if exists "Improvement goals update own" on public.improvement_goals;
drop policy if exists "Improvement goals delete own" on public.improvement_goals;
drop table if exists public.improvement_goal_events;
drop table if exists public.evaluation_events;
alter table public.improvement_goals
  drop column if exists tracking_plan_id,
  drop column if exists baseline_event_id,
  drop column if exists source_action_type,
  drop column if exists source_ordinal,
  drop column if exists metric,
  drop column if exists goal_type,
  drop column if exists direction,
  drop column if exists initial_value,
  drop column if exists target_value,
  drop column if exists unit,
  drop column if exists target_at,
  drop column if exists verification_kind,
  drop column if exists verification_source,
  drop column if exists definition_version;
alter table if exists public.tracking_plans drop constraint if exists tracking_plans_root_fk;
drop table if exists public.tracking_events;
drop table if exists public.tracking_plans;
drop function if exists public.hu13_reject_mutation();
drop index if exists public.evaluations_id_user_unique;

-- Fail rather than erase or recategorize HU13 evaluations incompatible with the old contract.
alter table public.evaluations drop constraint if exists evaluations_classification_check;
alter table public.evaluations add constraint evaluations_classification_check
  check (classification in ('Alto', 'Medio', 'Bajo'));
alter table public.scoring_history drop constraint if exists scoring_history_classification_check;
alter table public.scoring_history add constraint scoring_history_classification_check
  check (classification in ('Alto', 'Medio', 'Bajo'));

drop policy if exists "Evaluations update own" on public.evaluations;
create policy "Evaluations update own" on public.evaluations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Evaluations delete own" on public.evaluations;
create policy "Evaluations delete own" on public.evaluations
  for delete using (auth.uid() = user_id);
drop policy if exists "Scoring history update own" on public.scoring_history;
create policy "Scoring history update own" on public.scoring_history
  for update using (auth.uid() = user_id::uuid) with check (auth.uid() = user_id::uuid);
drop policy if exists "Improvement goals insert own" on public.improvement_goals;
create policy "Improvement goals insert own" on public.improvement_goals
  for insert with check (auth.uid() = user_id);
drop policy if exists "Improvement goals update own" on public.improvement_goals;
create policy "Improvement goals update own" on public.improvement_goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Improvement goals delete own" on public.improvement_goals;
create policy "Improvement goals delete own" on public.improvement_goals
  for delete using (auth.uid() = user_id);
grant insert, update, delete on public.evaluations, public.scoring_history to authenticated;
commit;
