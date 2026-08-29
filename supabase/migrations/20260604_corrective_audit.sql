-- =============================================================
-- RutaHogar — Corrective migration (audit 2026-06-04)
-- Fixes items: 1, 2, 3, 5, 6, 7, 8, 9, 13
-- Item 4 (profile role self-escalation) skipped intentionally.
-- =============================================================


-- -------------------------------------------------------------
-- #1  improvement_goals — add all missing RLS policies
--     (RLS was ON but zero policies existed → full deny-all)
-- -------------------------------------------------------------
drop policy if exists "Improvement goals select own" on public.improvement_goals;
create policy "Improvement goals select own"
  on public.improvement_goals
  for select
  using (auth.uid() = user_id);

drop policy if exists "Improvement goals insert own" on public.improvement_goals;
create policy "Improvement goals insert own"
  on public.improvement_goals
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Improvement goals update own" on public.improvement_goals;
create policy "Improvement goals update own"
  on public.improvement_goals
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Improvement goals delete own" on public.improvement_goals;
create policy "Improvement goals delete own"
  on public.improvement_goals
  for delete
  using (auth.uid() = user_id);


-- -------------------------------------------------------------
-- #2  evaluations — add missing email column
--     (ALTER in schema.sql was never applied to the live DB)
-- -------------------------------------------------------------
alter table public.evaluations
  add column if not exists email text;


-- -------------------------------------------------------------
-- #3  profiles — fix onboarding_data from text to jsonb
--     (no rows have data, cast is safe)
-- -------------------------------------------------------------
alter table public.profiles
  alter column onboarding_data type jsonb
  using case
    when onboarding_data is null or onboarding_data = '' then null
    else onboarding_data::jsonb
  end;


-- -------------------------------------------------------------
-- #5  evaluations — add missing UPDATE policy
-- -------------------------------------------------------------
drop policy if exists "Evaluations update own" on public.evaluations;
create policy "Evaluations update own"
  on public.evaluations
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- -------------------------------------------------------------
-- #6  evaluations — add missing DELETE policy
--     (defined in schema.sql but never applied to live DB)
-- -------------------------------------------------------------
drop policy if exists "Evaluations delete own" on public.evaluations;
create policy "Evaluations delete own"
  on public.evaluations
  for delete
  using (auth.uid() = user_id);


-- -------------------------------------------------------------
-- #7  Add all missing CHECK constraints
-- -------------------------------------------------------------
alter table public.evaluations
  drop constraint if exists evaluations_score_check,
  add  constraint evaluations_score_check
    check (score between 0 and 100);

alter table public.evaluations
  drop constraint if exists evaluations_classification_check,
  add  constraint evaluations_classification_check
    check (classification in ('Alto', 'Medio', 'Bajo'));

alter table public.improvement_goals
  drop constraint if exists improvement_goals_status_check,
  add  constraint improvement_goals_status_check
    check (status in ('pendiente', 'en_progreso', 'completada'));

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add  constraint profiles_role_check
    check (role in ('usuario', 'ejecutivo', 'admin'));


-- -------------------------------------------------------------
-- #8  improvement_goals — enforce NOT NULL on required columns
--     All 16 existing rows already have these fields populated,
--     so no backfill is needed. The SET DEFAULT covers future
--     inserts that omit status.
-- -------------------------------------------------------------
alter table public.improvement_goals
  alter column user_id  set not null,
  alter column title    set not null,
  alter column status   set not null,
  alter column status   set default 'pendiente';


-- -------------------------------------------------------------
-- #9  improvement_goals.id — fix type from text to uuid
--     All 16 existing IDs are valid UUID strings, cast is safe.
-- -------------------------------------------------------------
alter table public.improvement_goals
  alter column id type uuid using id::uuid;


-- -------------------------------------------------------------
-- #13 Fix column types that were added as text instead of
--     timestamptz (deleted_at, completed_at)
--     Both columns have zero non-null rows, cast is safe.
-- -------------------------------------------------------------
alter table public.evaluations
  alter column deleted_at type timestamptz
  using deleted_at::timestamptz;

alter table public.improvement_goals
  alter column completed_at type timestamptz
  using completed_at::timestamptz;


-- -------------------------------------------------------------
-- Restore updated_at trigger on improvement_goals
-- (defined in schema.sql but not confirmed on live DB)
-- -------------------------------------------------------------
drop trigger if exists improvement_goals_set_updated_at on public.improvement_goals;
create trigger improvement_goals_set_updated_at
  before update on public.improvement_goals
  for each row execute function public.set_updated_at();
