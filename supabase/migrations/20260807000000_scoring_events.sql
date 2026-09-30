-- Migration: Trazabilidad de eventos del plan de ahorro en scoring_history
-- Registra cuando se presenta "No viable" y qué acción tomó el usuario después.

alter table public.scoring_history
  add column if not exists events jsonb not null default '[]'::jsonb;

drop policy if exists "Scoring history update own" on public.scoring_history;
create policy "Scoring history update own"
  on public.scoring_history
  for update
  using (auth.uid() = user_id::uuid)
  with check (auth.uid() = user_id::uuid);
