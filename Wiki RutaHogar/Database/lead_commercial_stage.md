# Tables: lead_commercial_stage · commercial_stage_events

Each lead's commercial stage **per real estate company** (inmobiliaria): where it is in the sales process, who moved it, when and why. Two tables, following the Spike 2 · E2 split between current state and history:

- `commercial_stage_events` is the **history**. It is append-only, with one row per transition. HU 15 computes funnel times from it.
- `lead_commercial_stage` is the **current stage**, one row per (lead, inmobiliaria). It is a cheap projection of the latest event, written in the same transaction as that event.

Migration: `supabase/migrations/20260930120000_commercial_stage.sql` · Rollback: `supabase/rollback/20260930120000_commercial_stage_rollback.sql` · Tests: `supabase/tests/commercial_stage.sql` · Design: `docs/stories/commercial-stage/PLAN.md` · Basis: `docs/research/spike2-e2-auditoria-historial-versionado.md` (§5.5, §5.6, §5.8).

---

## Stages

| Value | Label | Meaning |
| :---- | :---- | :------ |
| `nuevo` | Nuevo | Evaluated, not yet managed. A lead with no row is read as `nuevo`. |
| `contactado` | Contactado | First contact made. |
| `en_plan_mejora` | En plan de mejora | Following an improvement plan. |
| `en_negociacion` | En negociación | Visit, quote or project chosen. |
| `reserva` | Reserva | Reservation paid. |
| `venta_cerrada` | Venta cerrada | Promesa de compraventa signed. |
| `perdido` | Perdido | Terminal, not ranked. |

## Transitions

Enforced by `commercial_stage_transition_check()` in the database. `frontend/src/lib/commercial/stageRules.js` mirrors it for the UI only.

| From → to | Allowed | Reason | Who |
| :-- | :-- | :-- | :-- |
| same → same | ✗ | — | — |
| forward (skipping stages is allowed) | ✓ | optional | staff |
| backward among non-terminal stages | ✓ | required | staff |
| any non-terminal → `perdido` | ✓ | required | staff |
| `perdido` → any stage except `venta_cerrada` | ✓ | required | staff |
| `venta_cerrada` → `perdido` | ✓ | required | `admin` / `admin_inmobiliario` only |
| `venta_cerrada` → anything else, `perdido` → `venta_cerrada` | ✗ | — | — |

No transition is automatic yet. The schema already accepts the system as an actor (`actor_role = 'sistema'`, `actor_id` null), so an automatic rule can be added without a migration.

---

## Columns

### `commercial_stage_events`

| Column | Type | Nullable | Notes |
| :----- | :--- | :------- | :---- |
| `id` | `uuid` | NO | Primary key. |
| `occurred_at` | `timestamptz` | NO | `clock_timestamp()`. |
| `subject_user_id` | `uuid` | NO | The lead. **No FK**, on purpose (see Erasure). |
| `inmobiliaria_id` | `uuid` | NO | `→ inmobiliarias(id) ON DELETE RESTRICT`. |
| `actor_id` | `uuid` | YES | Who acted. Null **only** for the system. No FK. |
| `actor_role` | `text` | NO | `ejecutivo`, `admin`, `admin_inmobiliario` or `sistema`. |
| `stage_before` | `text` | YES | Null only on a backfilled first event. |
| `stage_after` | `text` | NO | |
| `reason` | `text` | YES | Staff free text. Must not contain financial values. |
| `source` | `text` | NO | `web`, `backend`, `job` or `backfill`. |

Checks: `(actor_role = 'sistema') = (actor_id is null)`, so the lead is never recorded as the actor (Spike H8), and `stage_before is distinct from stage_after`.

### `lead_commercial_stage`

| Column | Type | Nullable | Notes |
| :----- | :--- | :------- | :---- |
| `subject_user_id` | `uuid` | NO | PK part. No FK. |
| `inmobiliaria_id` | `uuid` | NO | PK part. `→ inmobiliarias(id) ON DELETE RESTRICT`. |
| `stage` | `text` | NO | Current stage. |
| `last_event_id` | `uuid` | NO | `→ commercial_stage_events(id)`. |
| `updated_at` | `timestamptz` | NO | `occurred_at` of `last_event_id`. |

---

## Who writes and who reads

| Action | Lead | Ejecutivo / admin of the inmobiliaria | Global admin (no inmobiliaria) |
| :-- | :-- | :-- | :-- |
| Change the stage (`change_commercial_stage` RPC) | ✗ | ✓ for leads of **their** inmobiliaria | ✗ |
| Read stages and history | ✗ | Own inmobiliaria only | All |
| INSERT / UPDATE / DELETE on the tables | ✗ | ✗ (revoked) | ✗ (revoked) |

- **Tenant from the session:** `change_commercial_stage(p_lead, p_to_stage, p_reason, p_expected_stage)` takes the inmobiliaria from `get_my_inmobiliaria()`, never from a parameter, and records `auth.uid()` as the actor.
- **Race protection:** `p_expected_stage` rejects the change if someone else moved the lead first (`stale_stage`).
- **Error codes:** `forbidden`, `lead_not_in_scope`, `stale_stage`, `same_stage`, `reason_required`, `admin_required`, `invalid_transition`, `invalid_stage`.
- **Which leads belong to an inmobiliaria** is decided by one helper, `lead_belongs_to_inmobiliaria(lead, inmobiliaria)` (`lead_in_my_inmobiliaria(lead)` for the caller). A lead (`role = 'usuario'`) belongs when either:
  - one of its declared comunas matches a project of the inmobiliaria, compared case- and space-insensitively. The comunas are `evaluations.target_commune`, `alternative_commune`, `financial_data.input.comuna_objetivo`, and `onboarding_data.comuna_interes` / `comuna_alternativa`;
  - **or** it marked one of the inmobiliaria's projects as a favorite.

  HU 16 and the Spike H14 fix should reuse this helper instead of defining another rule.
- **Revoked privileges (Spike H12):** `anon` and `authenticated` only keep `SELECT`. RLS limits that to their own inmobiliaria, and leads get no rows.
- **Immutability:** the `commercial_stage_events_immutable` trigger rejects any UPDATE or DELETE, even from the table owner.

---

## Erasure (Spike §5.8)

`subject_user_id` and `actor_id` have no foreign key. Deleting an account does not cascade into the history, and the future erasure procedure can replace the lead's id with a random one with no mapping table. HU 15's counts and durations stay correct after an erasure. That procedure is the only planned exception to the immutability trigger: it runs as table owner and disables the trigger inside its own transaction. It must also blank `reason`, which is free text and may identify the lead. That procedure is not implemented yet.

---

## Backfill

The migration runs `commercial_stage_backfill()` once. Every `usuario` lead with at least one evaluation starts in `nuevo` in each inmobiliaria it belongs to:
- the event has actor `sistema`, `source = 'backfill'`, and is dated at the lead's first evaluation;
- running it again inserts nothing;
- leads that become eligible later have no row, and the RPC reads a missing row as `nuevo`.

---

## Mapping to `audit_events`

The history columns are the Spike §5.5 subset. When `audit_events` exists, the history becomes `INSERT … SELECT` with `event_type = 'commercial_stage_changed'`, `before`/`after` from `stage_before`/`stage_after`, and `entity_type = 'lead_commercial_stage'`.

---

## Consumers

- [[../UserStories/HU15-dashboard-conversion-tiempos|HU 15]]:
  - the funnel counts `lead_commercial_stage`;
  - time from preevaluación to `venta_cerrada` = the `venta_cerrada` event's `occurred_at` minus the lead's first `evaluations.created_at`;
  - times between stages = differences between consecutive events;
  - plan impact = leads with `tracking_plans.baseline_at` before their `venta_cerrada` event.
- [[../RNF/RNF7-dashboard-movil-ejecutivo|RNF 7]] E3: the badge on the lead card in `DashboardLeads`.
- [[../UserStories/HU16-gestion-leads-inconsistentes|HU 16]]: reliability is a **separate** dimension. Pending once PR #97 merges: reject forward moves for `silenciado` / `descartado` leads, while `perdido` and backward moves stay allowed.
