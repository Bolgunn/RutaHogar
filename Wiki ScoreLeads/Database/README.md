# Database — RutaHogar

Supabase (PostgreSQL) project: **adgnxtjkqedtvkwcizzn** — East US (Ohio)

---

## Tables

| Table | Purpose |
| :---- | :------ |
| [[profiles]] | One row per authenticated user. Stores name, role, and onboarding answers. |
| [[evaluations]] | One row per completed pre-qualification. Stores score, financial inputs, and AI explanation. |
| [[improvement_goals]] | Improvement plan tasks linked to an evaluation. One user can have many goals. |

---

## Entity relationships

```
auth.users (Supabase managed)
    │
    └─▶ profiles (id → auth.users.id)
            │
            ├─▶ evaluations (user_id → profiles.id)
            │
            └─▶ improvement_goals (user_id → profiles.id)
                        │
                        └─▶ evaluations (evaluation_id → evaluations.id)  [optional FK]
```

---

## Roles

Defined in `frontend/src/services/auth.js` and enforced via `profiles.role`:

| Role value | Label | Access |
| :--------- | :---- | :----- |
| `usuario` | Usuario | Own profile, own evaluations, own goals |
| `ejecutivo` | Ejecutivo comercial | Read all profiles and evaluations (leads dashboard) |
| `admin` | Admin | Full access |

RLS policies use `profiles.role` to gate cross-user reads. The role value is normalized through `normalizeRole()` in `profileService.js` — aliases like `usuario_comun` and `ejecutivo_comercial` map to the canonical values above.

> **Note (2026-06-04):** The `profiles` UPDATE policy intentionally has no `with_check` clause, allowing users to update their own `role` field. This is a temporary dev convenience and must be locked down before production.

---

## RLS summary

| Table | SELECT | INSERT | UPDATE | DELETE |
| :---- | :----- | :----- | :----- | :----- |
| `profiles` | Own row + staff can read all | Own row | Own row (no field restriction) | — |
| `evaluations` | Own row + staff can read all | Own row | Own row | Own row |
| `improvement_goals` | Own row | Own row | Own row | Own row |

All three tables have `FORCE ROW LEVEL SECURITY = false` — service-role connections bypass RLS. Anon key connections respect RLS.

---

## Schema source

`supabase/schema.sql` — canonical definition. Migrations are in `supabase/migrations/`.

Last corrective migration applied: `20260604_corrective_audit.sql`

---

## Known issues (code-side, not yet fixed)

These are application bugs where the DB schema is correct but the service layer does not use it properly.

**#10 — `updateGoalProgress` never writes to Supabase**
- File: `frontend/src/services/goalsService.js:165`
- The function saves `progress_data` only to `localStorage`, even when Supabase is configured. The `improvement_goals.progress_data` column exists and is never written to.

**#11 — `acceptEvaluationPlan` is a stub**
- File: `frontend/src/services/evaluationService.js:220`
- The Supabase branch of this function returns `null` without executing any query. `evaluations.plan_accepted_at` is never written.

**#12 — Staff `getEvaluations` is over-filtered by the JS layer**
- File: `frontend/src/services/evaluationService.js:151`
- RLS correctly allows `ejecutivo` / `admin` to read all evaluations. However, when a valid UUID is passed, the query adds `.eq("user_id", userId)`, limiting results to the staff member's own rows. The leads dashboard only shows the logged-in staff member's evaluations instead of all leads.
