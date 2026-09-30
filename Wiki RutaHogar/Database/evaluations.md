# Table: evaluations

One row per completed pre-qualification. Stores the full snapshot of a scoring event: financial inputs, onboarding context, score result, AI explanation, and recommendations.

---

## Columns

| Column | Type | Nullable | Default | Notes |
| :----- | :--- | :------- | :------ | :---- |
| `id` | `uuid` | NO | `gen_random_uuid()` | Primary key. |
| `user_id` | `uuid` | YES | — | References `profiles(id)` — cascade delete. |
| `email` | `text` | YES | — | Denormalized email at time of evaluation. Written by `buildRow()`. |
| `score` | `bigint` | YES | — | 0–100. Enforced by CHECK constraint. |
| `classification` | `text` | YES | — | `Alto`, `Medio`, or `Bajo`. Enforced by CHECK constraint. |
| `objective` | `text` | YES | — | e.g. `"comprar"`. From onboarding. |
| `property_type` | `text` | YES | — | e.g. `"departamento"`. From onboarding. |
| `target_commune` | `text` | YES | — | Primary commune of interest. From onboarding or `input.comuna_objetivo`. |
| `alternative_commune` | `text` | YES | — | Fallback commune. From onboarding. |
| `purchase_timeline` | `text` | YES | — | e.g. `"6_a_12_meses"`. From onboarding. |
| `financial_data` | `jsonb` | YES | — | Full payload sent to `POST /score`. See shape below. |
| `explanation` | `text` | YES | — | AI-generated explanation text (`ai_explanation` from backend). |
| `recommendations` | `jsonb` | YES | — | Object with `items`, `risks`, `improvement_plan` arrays. See shape below. |
| `plan_accepted_at` | `timestamptz` | YES | — | Set when user accepts improvement plan. **Currently never written — stub in service.** |
| `deleted_at` | `timestamptz` | YES | — | Soft-delete marker. Added manually — no service reads or writes it yet. |
| `origen` | `text` | NO | `'web'` | Source of evaluation. Added manually — no service reads or writes it yet. |
| `algoritmo_version` | `text` | YES | — | Scoring algorithm version tag. Added manually — no service reads or writes it yet. |
| `component_breakdown` | `jsonb` | YES | — | Per-component score breakdown. Added manually — no service reads or writes it yet. |
| `created_at` | `timestamptz` | YES | — | Set on insert. Written explicitly by `buildRow()` client-side (`new Date().toISOString()`) — do not rely on DB default. |

---

## Constraints

| Name | Type | Definition |
| :--- | :--- | :--------- |
| `evaluations_pkey` | PRIMARY KEY | `id` |
| `evaluations_user_id_fkey` | FOREIGN KEY | `user_id → profiles(id) ON DELETE CASCADE` |
| `evaluations_score_check` | CHECK | `score BETWEEN 0 AND 100` |
| `evaluations_classification_check` | CHECK | `classification IN ('Alto', 'Medio', 'Bajo')` |

---

## Indexes

| Name | Definition |
| :--- | :--------- |
| `evaluations_pkey` | UNIQUE on `id` |
| `evaluations_user_created_idx` | `(user_id, created_at DESC)` — optimizes the common query pattern |

---

## RLS policies

| Policy | Command | Rule |
| :----- | :------ | :--- |
| `Evaluations select own` | SELECT | `auth.uid() = user_id` OR role is `ejecutivo`/`admin` |
| `Evaluations insert own` | INSERT | `auth.uid() = user_id` |
| `Evaluations update own` | UPDATE | `auth.uid() = user_id` |
| `Evaluations delete own` | DELETE | `auth.uid() = user_id` |

Staff (`ejecutivo`, `admin`) can SELECT all rows via the SELECT policy. This drives the leads dashboard.

---

## Realtime configuration

Required for the ejecutivo notification system to receive live INSERT events:

```sql
alter table public.evaluations replica identity full;
alter publication supabase_realtime add table public.evaluations;
```

`REPLICA IDENTITY FULL` is necessary so Supabase can apply RLS filtering on realtime events. Both lines are in `schema.sql` and must be run manually on existing instances. See las notas de implementacion de [[../UserStories/HU2-priorizacion-leads|HU 2]].

---

## Service layer

| Operation | Function | File |
| :-------- | :------- | :--- |
| Create | `createEvaluation(userId, payload)` | `evaluationService.js` |
| Read all (user or staff) | `getEvaluations(userId)` | `evaluationService.js` |
| Read latest | `getLatestEvaluation(userId)` | `evaluationService.js` |
| Delete | `deleteEvaluation(evaluationId, userId)` | `evaluationService.js` |
| Accept plan | `acceptEvaluationPlan(evaluationId, userId)` | `evaluationService.js` — **stub, never writes to DB** |

All functions fall back to `localStorage` when Supabase is not configured (`isSupabaseDataConfigured = false`).

---

## `financial_data` shape

Full payload from `POST /score` (see `CLAUDE.md` for field definitions):

```json
{
  "ingreso_mensual": 1500000,
  "deuda_mensual": 200000,
  "ahorro_disponible": 8000000,
  "dividendo_estimado": 350000,
  "tipo_contrato": "indefinido",
  "continuidad_laboral": "mas_3_anios",
  "morosidad_actual": "no",
  "consentimiento": true,
  "comuna_objetivo": "Providencia",
  "complemento_renta": false
}
```

---

## `recommendations` shape

```json
{
  "items": ["Mantén tu deuda bajo el 40% del ingreso.", "..."],
  "risks": ["ingreso_dividendo", "deuda_alta"],
  "improvement_plan": ["Paso 1: ...", "Paso 2: ..."]
}
```

---

## Notes

- `score` is stored as `bigint` in the live DB (schema.sql defines `integer`). Functionally equivalent for the 0–100 range.
- `user_id` is nullable in the live DB despite the schema intending NOT NULL. A future migration should enforce this.
- `plan_accepted_at` is never written. See Known Issues #11 in [[README]].
- `deleted_at`, `origen`, `algoritmo_version`, `component_breakdown` were added manually in the Supabase dashboard and have no corresponding code. They represent future intentions (soft delete, audit trail, versioning) but are not part of the active application.
- Staff `getEvaluations` is inadvertently filtered to own rows by the JS layer despite RLS allowing full access. See Known Issues #12 in [[README]].
