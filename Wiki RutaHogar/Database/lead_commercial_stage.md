# Tables: lead_commercial_stage · lead_project_commercial_stage · commercial_stage_events

Each lead's commercial stage **per real estate company** (inmobiliaria): where it is in the sales process, who moved it, when and why. Per inmobiliaria a lead has several **records**, each with its own stage:

- the **lead-level record** (lead, inmobiliaria): the relationship with the customer before or across projects;
- one **project record** per (lead, inmobiliaria, project): the negotiation, reservation or sale on that project.

Three tables, following the Spike 2 · E2 split between current state and history:

- `commercial_stage_events` is the **history** of every record. It is append-only, with one row per transition. `proyecto_id` says which record it belongs to (`null` = lead-level). HU 15 computes funnel times from it.
- `lead_commercial_stage` is the **current stage of the lead-level record**, one row per (lead, inmobiliaria).
- `lead_project_commercial_stage` is the **current stage of each project record**, one row per (lead, inmobiliaria, project).

Both current-state tables are cheap projections of each record's latest event, written in the same transaction as that event. A record with no row reads as `nuevo`.

Migrations: `supabase/migrations/20260930120000_commercial_stage.sql` (base) and `20261005120000_commercial_stage_project_tracks.sql` (project records) · Rollbacks: `supabase/rollback/` (same names, `_rollback`) · Tests: `supabase/tests/commercial_stage.sql`, `supabase/tests/commercial_stage_project_tracks.sql` · Design: `docs/stories/commercial-stage/PLAN.md`, amended by `docs/stories/commercial-stage-project-tracks/PLAN.md` · Basis: `docs/research/spike2-e2-auditoria-historial-versionado.md` (§5.5, §5.6, §5.8).

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

**Lead-level vs project.** `en_negociacion`, `reserva` and `venta_cerrada` always belong to a project record. The lead-level record can only be at `nuevo`, `contactado`, `en_plan_mejora` or `perdido`, and `perdido` only while the lead has **no project record**. Once it has one, losing the lead is marked project by project (`project_required` otherwise).

**Revival.** While every project record of the lead (at least one) is `perdido`, staff can record a lead-level event that keeps the lead-level stage (for example `contactado → contactado`) with a **required reason**: "this lead is still alive, just not on those projects". It is the only same-stage event allowed, and never from `perdido`.

**Overall stage.** The badge on the lead card shows one stage per lead, computed from all its records by `frontend/src/lib/commercial/overallStage.js` (ALG-17 R3). It is the highest stage among records that are not lost, or `perdido` when every project record is lost, unless a later revival exists. When lost, it says whether the loss was only **por agotamiento** (every loss made by the sell-out job) or **por gestión**.

## Transitions

Enforced by `commercial_stage_transition_check()` in the database. Each record follows the table on its own. `frontend/src/lib/commercial/stageRules.js` mirrors it, plus the lead-level limits and revival, for the UI only.

| From → to | Allowed | Reason | Who |
| :-- | :-- | :-- | :-- |
| same → same | ✗ | — | — |
| forward (skipping stages is allowed) | ✓ | optional | staff |
| backward among non-terminal stages | ✓ | required | staff |
| any non-terminal → `perdido` | ✓ | required | staff |
| `perdido` → any stage except `venta_cerrada` | ✓ | required | staff |
| `venta_cerrada` → `perdido` | ✓ | required | `admin` / `admin_inmobiliario` only |
| `venta_cerrada` → anything else, `perdido` → `venta_cerrada` | ✗ | — | — |

## Automatic transitions: the sell-out and restock jobs

These are the **only** automatic transitions. They are a trigger on `proyectos` (`proyectos_commercial_stage_jobs`, `after update of estado`), so they run whoever changes the project's `estado`:

| Project `estado` | Effect | Event |
| :-- | :-- | :-- |
| → `agotado` (sell-out) | every record of that project at `nuevo`, `contactado`, `en_plan_mejora` or `en_negociacion` becomes `perdido` | `actor_role 'sistema'`, `actor_id` null, `source 'job'`, `reason 'proyecto_agotado'` |
| `agotado` → anything else (restock) | every record whose **latest** event is still that closure goes back to the stage it had before | same, `reason 'proyecto_repuesto'` |

- `reserva`, `venta_cerrada` and already-lost records are never touched, nor the lead-level record, nor leads without a record on the project (no record is created).
- If staff moved a closed record after the sell-out, the restock leaves it alone.
- `agotado → agotado` does nothing; repeated cycles are safe.
- The reasons are **fixed codes** that never identify the lead.

---

## Columns

### `commercial_stage_events`

| Column | Type | Nullable | Notes |
| :----- | :--- | :------- | :---- |
| `id` | `uuid` | NO | Primary key. |
| `occurred_at` | `timestamptz` | NO | `clock_timestamp()`. |
| `subject_user_id` | `uuid` | NO | The lead. **No FK**, on purpose (see Erasure). |
| `inmobiliaria_id` | `uuid` | NO | `→ inmobiliarias(id) ON DELETE RESTRICT`. |
| `proyecto_id` | `uuid` | YES | The project record this event belongs to; `null` = lead-level. **No FK**: the immutability trigger means no `ON DELETE` could act on history. |
| `actor_id` | `uuid` | YES | Who acted. Null **only** for the system. No FK. |
| `actor_role` | `text` | NO | `ejecutivo`, `admin`, `admin_inmobiliario` or `sistema`. |
| `stage_before` | `text` | YES | Null only on a backfilled first event. |
| `stage_after` | `text` | NO | |
| `reason` | `text` | YES | Staff free text. Must not contain financial values. |
| `source` | `text` | NO | `web`, `backend`, `job` or `backfill`. |

Checks:
- `(actor_role = 'sistema') = (actor_id is null)`, so the lead is never recorded as the actor (Spike H8);
- a change of stage, **or** a lead-level revival (same stage, `proyecto_id` null, not `sistema`, non-blank reason);
- `en_negociacion`, `reserva` and `venta_cerrada` need a `proyecto_id`;
- `source = 'job'` needs a `proyecto_id`.

Indexes include `(subject_user_id, inmobiliaria_id, proyecto_id, occurred_at, id)`, the order HU 15 replays events in, and `(proyecto_id, occurred_at)` for project rows.

### `lead_commercial_stage`

| Column | Type | Nullable | Notes |
| :----- | :--- | :------- | :---- |
| `subject_user_id` | `uuid` | NO | PK part. No FK. |
| `inmobiliaria_id` | `uuid` | NO | PK part. `→ inmobiliarias(id) ON DELETE RESTRICT`. |
| `stage` | `text` | NO | Current stage. |
| `last_event_id` | `uuid` | NO | `→ commercial_stage_events(id)`. |
| `updated_at` | `timestamptz` | NO | `occurred_at` of `last_event_id`. |

### `lead_project_commercial_stage`

| Column | Type | Nullable | Notes |
| :----- | :--- | :------- | :---- |
| `subject_user_id` | `uuid` | NO | PK part. No FK. |
| `inmobiliaria_id` | `uuid` | NO | PK part. `→ inmobiliarias(id) ON DELETE RESTRICT`. |
| `proyecto_id` | `uuid` | NO | PK part. `→ proyectos(id) ON DELETE RESTRICT`: a project with commercial records **cannot be deleted**. The admin catalog says "márcalo como agotado" instead, so a reservation or sale never silently disappears from HU 15. |
| `stage` | `text` | NO | Current stage. |
| `last_event_id` | `uuid` | NO | `→ commercial_stage_events(id)`. |
| `updated_at` | `timestamptz` | NO | `occurred_at` of `last_event_id`. |

---

## Who writes and who reads

| Action | Lead | Ejecutivo / admin of the inmobiliaria | Global admin (no inmobiliaria) |
| :-- | :-- | :-- | :-- |
| Change a lead-level record (`change_commercial_stage` RPC) | ✗ | ✓ for leads of **their** inmobiliaria | ✗ |
| Change a project record (same RPC, `p_proyecto`) | ✗ | ejecutivo: projects where they are `vinculado`; admin / `admin_inmobiliario`: any project of their inmobiliaria | ✗ |
| Read stages and history | ✗ | Own inmobiliaria only | All |
| INSERT / UPDATE / DELETE on the tables | ✗ | ✗ (revoked) | ✗ (revoked) |

- **Tenant from the session:** `change_commercial_stage(p_lead, p_to_stage, p_reason, p_expected_stage, p_proyecto)` takes the inmobiliaria from `get_my_inmobiliaria()`, never from a parameter, and records `auth.uid()` as the actor. `p_proyecto` (default `null`) picks the record: `null` = lead-level, so calls written before project records existed still work. It returns `{ stage, event_id, occurred_at, proyecto_id }`.
- **Race protection:** `p_expected_stage` rejects the change if someone else moved **that record** first (`stale_stage`). One lock per (lead, inmobiliaria) serializes every write and job on the lead.
- **Error codes:** `forbidden`, `lead_not_in_scope`, `proyecto_not_in_scope`, `project_required`, `stale_stage`, `same_stage`, `reason_required`, `admin_required`, `invalid_transition`, `invalid_stage`.
- **Which leads belong to a project** is decided by one helper, `lead_belongs_to_proyecto(lead, proyecto)`. A lead (`role = 'usuario'`) belongs when either:
  - one of its declared comunas matches the project's comuna, compared case- and space-insensitively. The comunas are `evaluations.target_commune`, `alternative_commune`, `financial_data.input.comuna_objetivo`, and `onboarding_data.comuna_interes` / `comuna_alternativa`;
  - **or** it marked the project as a favorite.
- **Which leads belong to an inmobiliaria:** `lead_belongs_to_inmobiliaria(lead, inmobiliaria)` = the lead belongs to at least one of its projects (`lead_in_my_inmobiliaria(lead)` for the caller). Same result as before project records existed; it is now defined on top of the project rule so the rule exists once.

  HU 15, HU 16 and the Spike H14 fix should reuse these helpers instead of defining another rule.
- **Write scope for a project record** is one function, `commercial_stage_project_access(lead, proyecto, role, inmobiliaria)`. The project must belong to the caller's inmobiliaria. An ejecutivo must be `vinculado` to it (`is_ejecutivo_vinculado(proyecto)`: a `proyecto_ejecutivos` row with `estado = 'vinculado'`; `pendiente` is not enough). **Creating** the record needs `lead_belongs_to_proyecto`. Once created, a record stays writable even if the lead stops belonging (unfavorites, changes comuna), so a reservation can still be closed.
- **What the panel may show:** `commercial_stage_scope(lead)` returns the lead-level stage and whether it is writable, plus the projects the caller may see, each with its record's stage (or `null`) and `writable`, computed with the same function as the RPC. An ejecutivo sees the projects they are `vinculado` to, plus any project where the lead already has a record (read-only if not `vinculado`). It never returns actor ids, reasons or lead data. The global admin gets an empty result.
- **Helpers are not callable from the browser.** Only `change_commercial_stage`, `commercial_stage_scope` and `lead_in_my_inmobiliaria` are granted to `authenticated`.
- **Revoked privileges (Spike H12):** `anon` and `authenticated` only keep `SELECT`. RLS limits that to their own inmobiliaria, and leads get no rows.
- **Immutability:** the `commercial_stage_events_immutable` trigger rejects any UPDATE or DELETE, even from the table owner.

---

## Erasure (Spike §5.8)

`subject_user_id` and `actor_id` have no foreign key, in any of the three tables. Deleting an account does not cascade into the history, and the future erasure procedure can replace the lead's id with a random one with no mapping table. It must re-key `subject_user_id` in **`commercial_stage_events`, `lead_commercial_stage` and `lead_project_commercial_stage`**. HU 15's counts and durations stay correct after an erasure. That procedure is the only planned exception to the immutability trigger: it runs as table owner and disables the trigger inside its own transaction. It must also blank `reason`, which is free text and may identify the lead. That procedure is not implemented yet.

---

## Backfill

The migration runs `commercial_stage_backfill()` once. Every `usuario` lead with at least one evaluation starts in `nuevo` in each inmobiliaria it belongs to:
- the event has actor `sistema`, `source = 'backfill'`, and is dated at the lead's first evaluation;
- running it again inserts nothing;
- leads that become eligible later have no row, and the RPC reads a missing row as `nuevo`.

The backfill only ever wrote lead-level records. No project record was created for existing leads.

---

## Mapping to `audit_events`

The history columns are the Spike §5.5 subset. When `audit_events` exists, the history becomes `INSERT … SELECT` with `event_type = 'commercial_stage_changed'`, `before`/`after` from `stage_before`/`stage_after`, and `entity_type = 'lead_commercial_stage'`.

---

## Consumers

- [[../UserStories/HU15-dashboard-conversion-tiempos|HU 15]]:
  - the funnel replays `commercial_stage_events` per record and uses the overall stage (`overallStage.js`, ALG-17 R3), with `perdido` split by cause;
  - time from preevaluación to `venta_cerrada` = the `venta_cerrada` event's `occurred_at` minus the lead's first `evaluations.created_at`;
  - times between stages = differences between consecutive events;
  - plan impact = leads with `tracking_plans.baseline_at` before their `venta_cerrada` event.
- [[../RNF/RNF7-dashboard-movil-ejecutivo|RNF 7]] E3: the badge on the lead card in `DashboardLeads` (overall stage, with the "por agotamiento" hint).
- [[../UserStories/HU16-gestion-leads-inconsistentes|HU 16]]: reliability is a **separate** dimension. Pending once PR #97 merges: reject forward moves **on any record** for `silenciado` / `descartado` leads, while `perdido`, backward moves, revival and both jobs stay allowed.
