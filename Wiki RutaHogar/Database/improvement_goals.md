# Table: improvement_goals

Improvement plan tasks generated from a scoring evaluation. Each row is one actionable goal for a user. A user can have many goals across multiple evaluations.

---

## Columns

| Column | Type | Nullable | Default | Notes |
| :----- | :--- | :------- | :------ | :---- |
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | NO | — | References `profiles(id)` — cascade delete. |
| `evaluation_id` | `uuid` | YES | — | References `evaluations(id)` — cascade delete. Optional — a goal can exist without an evaluation. |
| `title` | `text` | NO | — | Short label for the goal (e.g. `"Reducir deuda mensual"`). |
| `description` | `text` | YES | — | Longer explanation of the goal. |
| `status` | `text` | NO | `'pendiente'` | One of `pendiente`, `en_progreso`, `completada`. Enforced by CHECK constraint. |
| `progress_data` | `jsonb` | YES | — | Progress tracking object (monthly amounts, milestones). **Written only to localStorage — never persisted to Supabase.** |
| `completed_at` | `timestamptz` | YES | — | Completion timestamp. Added manually — no service reads or writes it yet. |
| `created_at` | `timestamptz` | YES | — | Set on insert. |
| `updated_at` | `timestamptz` | YES | — | Auto-updated by `improvement_goals_set_updated_at` trigger on every UPDATE. |

---

## Constraints

| Name | Type | Definition |
| :--- | :--- | :--------- |
| `improvement_goals_pkey` | PRIMARY KEY | `id` |
| `improvement_goals_user_id_fkey` | FOREIGN KEY | `user_id → profiles(id) ON DELETE CASCADE` |
| `improvement_goals_status_check` | CHECK | `status IN ('pendiente', 'en_progreso', 'completada')` |

> **Note:** There is no explicit FK constraint on `evaluation_id` in the live DB despite the schema defining one. Referential integrity for `evaluation_id` is not enforced at the DB level.

---

## Indexes

| Name | Definition |
| :--- | :--------- |
| `improvement_goals_pkey` | UNIQUE on `id` |
| `improvement_goals_user_evaluation_idx` | `(user_id, evaluation_id, created_at)` — optimizes loading goals per evaluation |

---

## RLS policies

| Policy | Command | Rule |
| :----- | :------ | :--- |
| `Improvement goals select own` | SELECT | `auth.uid() = user_id` |
| `Improvement goals insert own` | INSERT | `auth.uid() = user_id` |
| `Improvement goals update own` | UPDATE | `auth.uid() = user_id` |
| `Improvement goals delete own` | DELETE | `auth.uid() = user_id` |

Users can only access their own goals. Staff roles have no elevated access to this table.

---

## Trigger

`improvement_goals_set_updated_at` — fires `BEFORE UPDATE`, sets `updated_at = now()`.

---

## Service layer

| Operation | Function | File |
| :-------- | :------- | :--- |
| Read goals | `getGoals(userId, evaluationId?)` | `goalsService.js` |
| Create goal | `createGoal(userId, evaluationId, goal)` | `goalsService.js` |
| Update status | `updateGoalStatus(goalId, userId, status)` | `goalsService.js` |
| Update progress | `updateGoalProgress(goalId, userId, progressData)` | `goalsService.js` — **writes to localStorage only** |
| Delete goal | `deleteGoal(goalId, userId)` | `goalsService.js` |

All functions fall back to `localStorage` when Supabase is not configured (`isSupabaseDataConfigured = false`).

---

## `progress_data` shape

Stored in `localStorage` only (key: `RutaHogar_goal_progress`). Shape is free-form but typically:

```json
{
  "current_amount": 450000,
  "target_amount": 2000000,
  "monthly_contributions": [100000, 150000, 200000],
  "last_updated": "2026-06-04T12:00:00Z"
}
```

---

## Notes

- `progress_data` is never written to Supabase. See Known Issues #10 in [[README]].
- `completed_at` was added manually in the Supabase dashboard. No code sets it — status `completada` is the current way to mark a goal done.
- Goals are loaded with localStorage progress merged in via `withStoredProgress()`, even when Supabase is the source of truth for the goal itself.
