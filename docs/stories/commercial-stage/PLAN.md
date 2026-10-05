# PLAN — Base de estados comerciales (commercial stage per lead)

- **Consumers:** `Wiki RutaHogar/UserStories/HU15-dashboard-conversion-tiempos.md` (funnel, times),
  `HU16-gestion-leads-inconsistentes.md` (separate reliability dimension),
  `HU14-analisis-evolucion-comercial-lead.md`, `HU12-derivacion-comercial.md` (CRM stays out of
  scope), `Wiki RutaHogar/RNF/RNF7-dashboard-movil-ejecutivo.md` (E3: stage on the lead card)
- **Status:** Implemented on `feat/commercial-stage-base` (design approved 2026-09-30) · **Actor:** Ejecutivo comercial ·
  Administrador inmobiliario
- **Branch:** `feat/commercial-stage-base` from `origin/develop` · **PR target:** `develop`
- **Foundation:** `docs/research/spike2-e2-auditoria-historial-versionado.md` (§3.2 H1, H3, H8,
  H12, H13, H14; §5.1, §5.5, §5.6, §5.8)

## Start here

- Read first: `docs/research/spike2-e2-auditoria-historial-versionado.md` §5.5, §5.6 and §5.8.
  They set the event shape, the actor ≠ subject rule and the erasure constraint.
- Read first: `supabase/migrations/20260920190000_hu13_immutable_tracking.sql`. This is the
  in-repo precedent for append-only tables, the revoked browser privileges, the
  `hu13_reject_mutation` trigger and the `SECURITY DEFINER` RPCs. Follow its style.
- Read first: `supabase/migrations/20260831090000_proyectos_scope_ejecutivo.sql`, for the tenant
  helpers (`get_my_role`, `get_my_inmobiliaria`, `get_my_email`) and their SECURITY DEFINER
  rationale.
- Read first: `supabase/tests/hu13_tracking.sql`, for the SQL test style.
- Do **not** build on PR #97 (`feat/hu16-gestion-leads-inconsistentes-sospechosos`). It is
  unmerged, and its `lead_status_history` has the defects listed in "Coordination with PR #97".
  Do not edit that branch.
- Stop and report if the build would need: a stage or transition not listed here, a lead-side
  write path, an automatic transition, a new dependency, or a change to `POST /score`.

## Decisions (settled with the team on 2026-09-30)

| # | Question | Decision |
| :-- | :-- | :-- |
| Q1 | Stages | `nuevo` → `contactado` → `en_plan_mejora` → `en_negociacion` → `reserva` → `venta_cerrada`, plus terminal `perdido`. `venta_cerrada` = promesa de compraventa signed. |
| Q2 | Transitions | See "Transition rules". Forward moves may skip stages; moving backwards, marking `perdido` and reopening need a reason; `venta_cerrada` can only go to `perdido`, admin only. |
| Q3 | Automatic transitions | None in this PR. The schema accepts `actor_role = 'sistema'` with a null `actor_id`, so a rule can be added later without a migration. HU 15 measures plan impact from `tracking_plans.baseline_at`, not from the stage. |
| Q4a | Event store | A dedicated `commercial_stage_events` (append-only) plus `lead_commercial_stage` (current state). Its columns are the §5.5 `audit_events` subset, so a later move is an `INSERT … SELECT` with `event_type = 'commercial_stage_changed'`. `audit_events` is not created here. |
| Q4b | Tenancy | Keyed by (lead, inmobiliaria). The tenant always comes from `get_my_inmobiliaria()`. Eligibility goes through one helper: PR #97's comuna rule, fixed, plus favorite projects, without the history-based self-widening branch. |
| Q4c | Reliability (HU 16) | Independent in this PR, with no reference to `reliability_status`. Follow-up once PR #97 merges: the RPC rejects forward moves for `silenciado`/`descartado` leads, while `perdido` and backward moves stay allowed. |
| Q5 | Existing leads | Backfill a `nuevo` row plus a system event for each eligible (lead, inmobiliaria) pair. `occurred_at` = the lead's first evaluation, `source = 'backfill'`. Leads who become eligible later have no row, and the RPC reads a missing row as `nuevo`. |
| Q6 | PR scope | Foundation (migration, `schema.sql` sync, RLS/grants, SQL tests, service) plus a minimal UI in `DashboardLeads`. No HU 15 funnel. |

## Stages and transition rules

Order (rank): `nuevo` 1, `contactado` 2, `en_plan_mejora` 3, `en_negociacion` 4, `reserva` 5,
`venta_cerrada` 6. `perdido` has no rank and is terminal.

| From → to | Allowed | Reason | Who |
| :-- | :-- | :-- | :-- |
| same → same | ✗ `same_stage` | — | — |
| forward among ranked stages (skips allowed) | ✓ | optional | staff |
| backward among non-terminal stages | ✓ | **required** | staff |
| any non-terminal → `perdido` | ✓ | **required** | staff |
| `perdido` → any ranked stage except `venta_cerrada` (reopen) | ✓ | **required** | staff |
| `perdido` → `venta_cerrada` | ✗ `invalid_transition` | — | — |
| `venta_cerrada` → `perdido` | ✓ | **required** | admin only (`admin`, `admin_inmobiliario`) |
| `venta_cerrada` → anything else | ✗ `invalid_transition` | — | — |

"Staff" means `ejecutivo`, `admin` or `admin_inmobiliario` with a non-null `inmobiliaria_id`.
`admin_inmobiliario` comes from PR #97 and is accepted now so no follow-up is needed; it is
harmless before that role exists. A reason is required means `length(trim(reason)) > 0`. Reasons
are free text for staff and **must not contain financial values**; the UI says so.

## Database — `supabase/migrations/20260930120000_commercial_stage.sql`

Wrapped in `begin; … commit;` and idempotent (`if not exists`, `drop … if exists`), like HU 13.
It is applied manually after review.

### Tables

`public.commercial_stage_events` (append-only history)

| Column | Type | Notes |
| :-- | :-- | :-- |
| `id` | uuid PK default `gen_random_uuid()` | |
| `occurred_at` | timestamptz not null default `clock_timestamp()` | |
| `subject_user_id` | uuid not null | The lead. **No FK**, see Erasure. |
| `inmobiliaria_id` | uuid not null FK `inmobiliarias(id)` `on delete restrict` | |
| `actor_id` | uuid null | **No FK.** Null only for the system. |
| `actor_role` | text not null check in (`ejecutivo`, `admin`, `admin_inmobiliario`, `sistema`) | |
| `stage_before` | text null, check in the stage list | Null only on the first event of a pair. |
| `stage_after` | text not null, check in the stage list | |
| `reason` | text null | |
| `source` | text not null check in (`web`, `backend`, `job`, `backfill`) | |

Checks: `(actor_role = 'sistema') = (actor_id is null)` (H8: the system is explicit and the lead
is never the actor); `stage_before is distinct from stage_after`.
Index: `(subject_user_id, inmobiliaria_id, occurred_at, id)`, and `(inmobiliaria_id, occurred_at)`
for HU 15.

`public.lead_commercial_stage` (current state, one row per pair)

| Column | Type | Notes |
| :-- | :-- | :-- |
| `subject_user_id` | uuid not null | PK part, no FK |
| `inmobiliaria_id` | uuid not null FK `inmobiliarias(id)` `on delete restrict` | PK part |
| `stage` | text not null, check in the stage list | |
| `last_event_id` | uuid not null FK `commercial_stage_events(id)` | Ties current state to its event |
| `updated_at` | timestamptz not null | = `occurred_at` of `last_event_id` |

Only the RPC writes this table. Its row is the "cheap to query" projection of the latest event;
the event table remains the source of truth (H1 lesson: history is never an updated column).

### Tenant helpers (single scoping seam, reusable by HU 16 and H14)

- `public.lead_belongs_to_inmobiliaria(p_lead uuid, p_inmobiliaria uuid) returns boolean`:
  `stable security definer set search_path = public`, **not granted** to `anon` or
  `authenticated`. True when the lead's profile has `role = 'usuario'` **and** either:
  - one of the lead's declared comunas matches a `proyectos.comuna` of `p_inmobiliaria`, compared
    by `lower(trim(...))`. The comunas are `evaluations.target_commune`,
    `evaluations.alternative_commune`, `profiles.onboarding_data->>'comuna_interes'` and
    `profiles.onboarding_data->>'comuna_alternativa'`;
  - **or** the lead has a `proyecto_favoritos` row for a project of `p_inmobiliaria`.

  PR #97's `lead_status_history` branch is intentionally absent: writing history must never widen
  read or write scope.
- `public.lead_in_my_inmobiliaria(p_lead uuid) returns boolean`: same check with
  `get_my_inmobiliaria()`, false when that is null. Granted to `authenticated`.

### Transition check

`public.commercial_stage_transition_check(p_from text, p_to text, p_role text, p_reason text)
returns void`, `immutable`. It raises `invalid_stage`, `same_stage`, `invalid_transition`,
`reason_required` or `admin_required` (the message is the code; `admin_required` uses errcode `42501`, the rest the
default `P0001`) following the table above.
It is not granted to browser roles; the RPC calls it.

### Write RPC

`public.change_commercial_stage(p_lead uuid, p_to_stage text, p_reason text default null,
p_expected_stage text default null) returns jsonb`, `security definer set search_path = public`.

1. `v_role := get_my_role()`, `v_tenant := get_my_inmobiliaria()`. Raise `forbidden` unless the
   role is staff and the tenant is not null (a global admin with a null tenant is read-only).
2. Raise `lead_not_in_scope` unless `lead_belongs_to_inmobiliaria(p_lead, v_tenant)`.
3. `select stage … for update` from `lead_commercial_stage` for (p_lead, v_tenant). A missing row
   means `nuevo`. Use `pg_advisory_xact_lock(hashtext(p_lead::text || v_tenant::text))` before the
   read so that two first-ever writes serialize too.
4. If `p_expected_stage` is not null and differs from the current stage → `stale_stage`.
5. `commercial_stage_transition_check(current, p_to_stage, v_role, p_reason)`.
6. Insert the event (`actor_id = auth.uid()`, `actor_role = v_role`, `source = 'web'`,
   `stage_before` = the current stage, `nullif(trim(p_reason), '')`). Upsert the current row with
   `last_event_id`. Return `{ stage, event_id, occurred_at }`.

The lead id is only ever the subject; the actor is always `auth.uid()`.

### Privileges, RLS, immutability (H12)

- `alter table … enable row level security` on both tables.
- `revoke all on both tables from anon, authenticated;` `grant select on both to authenticated;`
  `grant select, insert, update on lead_commercial_stage to service_role;`
  `grant select, insert on commercial_stage_events to service_role;`
- Policy `Commercial stage select tenant` (on both tables, `for select to authenticated`):
  `get_my_role() in ('ejecutivo','admin','admin_inmobiliario') and get_my_inmobiliaria() =
  inmobiliaria_id` **or** `(get_my_role() = 'admin' and get_my_inmobiliaria() is null)`
  (the global admin). Leads have no read policy, so stage notes are never exposed to them.
- Trigger `commercial_stage_events_immutable`: `before update or delete for each row` raises
  `immutable_history`. The §5.8 erasure procedure (not in this PR) is the only documented
  exception. It must run as the table owner and disable the trigger inside its own transaction.
- Functions: `revoke all … from public, anon, authenticated`, then
  `grant execute on change_commercial_stage, lead_in_my_inmobiliaria to authenticated`.

### Backfill (inside the same migration)

Implemented as `public.commercial_stage_backfill() returns integer`, which is not granted to any
browser role. The migration calls it once, and the tests call the same function.

For each `(p.id, i.id)` where `p.role = 'usuario'`, the lead has at least one evaluation, and
`lead_belongs_to_inmobiliaria(p.id, i.id)`, and no row exists yet:
insert an event (`stage_before null`, `stage_after 'nuevo'`, `actor_role 'sistema'`,
`actor_id null`, `source 'backfill'`, `occurred_at = min(evaluations.created_at)`) and the matching
current row. Re-running inserts nothing.

### Erasure (Spike §5.8), by construction

- No FK from `subject_user_id` or `actor_id` to `profiles` or `auth.users`, so an account deletion
  cannot cascade into the history (unlike PR #97's `on delete cascade`, and unlike the H13 path).
- The erasure procedure can later re-key `subject_user_id` to a random uuid in both tables, with no
  mapping table. Stages, dates and staff actions stay, so HU 15's counts and durations remain
  correct.
- `reason` is staff free text and may identify the lead. The erasure procedure must blank it. This
  is recorded as a requirement on that procedure and on E1, not implemented here.

### Rollback and schema sync

- `supabase/rollback/20260930120000_commercial_stage_rollback.sql`: drop the RPC, the helpers, the
  trigger and its function, the policies, and both tables, in dependency order.
- `supabase/schema.sql`: append the same DDL, policies and functions (without the backfill) so the
  file matches the migrations (H11).

## Tests — `supabase/tests/commercial_stage.sql`

Style of `hu13_tracking.sql`: `begin; … rollback;`, run with `ON_ERROR_STOP` against a disposable
database, with fixture users in `auth.users` + `profiles`. Two inmobiliarias (A, B), each with a
project in a different comuna. Executive and admin in A, executive in B, a global admin (null
tenant), and two leads: one in A's comuna, one favoriting B's project. Impersonation uses
`set local role authenticated` + `set local request.jwt.claims = '{"sub": "..."}'`. Negative cases
use a `do $$ … exception when … $$` block that fails if no error was raised.

1. Executive A moves lead A `nuevo → reserva` (skip), with no reason. One event, current = `reserva`,
   actor = executive, `stage_before = 'nuevo'`.
2. Executive A on the lead that only belongs to B → `lead_not_in_scope`.
3. A lead calls the RPC for itself and for another lead → `forbidden`.
4. A lead selects from both tables → 0 rows. Executive B sees none of A's rows.
5. Backward move without a reason → `reason_required`; with a reason → ok. `→ perdido` without a
   reason → `reason_required`. Reopen from `perdido` needs a reason.
6. Executive: `venta_cerrada → perdido` → `admin_required`. Admin A → ok.
   `venta_cerrada → reserva` → `invalid_transition`. `perdido → venta_cerrada` →
   `invalid_transition`.
7. Same stage → `same_stage`. A stale `p_expected_stage` → `stale_stage`.
8. As `authenticated`: insert, update or delete on either table → permission denied. As owner:
   update or delete on events → `immutable_history`.
9. Global admin: selects rows from A and B; the RPC → `forbidden`.
10. Backfill: call `commercial_stage_backfill()` in the test. The eligible pairs get exactly one `nuevo`/`sistema`/
    `backfill` event dated at the first evaluation, and a second run adds nothing.
11. Check constraint: an event with `actor_role = 'sistema'` and a non-null `actor_id` is rejected,
    and so is a non-system event with a null `actor_id`.

## Frontend

- `frontend/src/lib/commercial/stageRules.js`: `STAGES` (value, label, rank), `stageLabel`,
  `allowedTargets(from, role)`, `reasonRequired(from, to)`. It mirrors the SQL table above; the
  database stays authoritative.
  Tests: `frontend/src/lib/commercial/__tests__/stageRules.test.js` (Vitest), one case per row of
  the transition table.
- `frontend/src/services/commercialStageService.js` (pattern: `isSupabaseDataConfigured`,
  `logSupabaseError` from `profileService`):
  - `getCommercialStages(leadIds)`: select from `lead_commercial_stage`, returning
    `{ [leadId]: { stage, updated_at } }`. Missing leads are read as `nuevo` by the caller.
  - `getCommercialStageHistory(leadId)`: events for the caller's tenant (RLS enforces it), oldest
    first.
  - `changeCommercialStage({ leadId, toStage, reason, expectedStage })`: calls the RPC and maps the
    error codes to Spanish messages (`stale_stage` → "Otro ejecutivo actualizó esta etapa; recarga
    para ver el cambio", etc.).
  - `canManageLeadStage(leadId)`: calls `rpc('lead_in_my_inmobiliaria')`.
  - Without Supabase it returns empty or `null`, and the UI shows `nuevo` with the control
    disabled. This keeps CLAUDE.md's rule that the app works locally without Supabase.
- `frontend/src/components/CommercialStagePanel.jsx` (badge + panel; tested without Supabase in
  `CommercialStagePanel.test.jsx`) and `frontend/src/components/DashboardLeads.jsx`:
  - Load the stages for the visible leads once per lead list.
  - Lead card: a stage badge (RNF 7 E3).
  - Lead detail: a selector limited to `allowedTargets`, a reason textarea shown and required when
    `reasonRequired`, a submit that passes `expectedStage`, the last few changes (date, stage
    before → after, reason), and a disabled state with an explanation when
    `canManageLeadStage` is false.
  - No funnel, no charts, no new filters (RNF 7 E2 stage filter is a follow-up).

## Wiki

- New `Wiki RutaHogar/Database/lead_commercial_stage.md`: both tables, the stages and transitions,
  the writers (RPC only), RLS, immutability, erasure, and the mapping to `commercial_stage_changed`
  in §5.5.
- `Wiki RutaHogar/Database/README.md`: link the new page.
- `HU15-dashboard-conversion-tiempos.md` note: the stage now exists. E2 durations are differences
  between `commercial_stage_events.occurred_at`; the start is the first evaluation; plan impact =
  leads with `tracking_plans.baseline_at` before their `venta_cerrada` event.
- `HU16-gestion-leads-inconsistentes.md` note: reliability is a separate dimension, plus the
  follow-up guard from Q4c.

## Coordination with PR #97 (for the PR description; do not edit that branch)

- `lead_status_history` has **no RLS**. With default grants, `anon` and `authenticated` can read,
  insert, update and delete any row.
- `update_lead_reliability()` is `SECURITY DEFINER`, granted to `authenticated`, and checks no role,
  tenant or transition. Any logged-in lead can change any lead's status, including their own.
- The tenant scoping's `lead_status_history` branch lets any executive widen their tenant's read
  scope by writing history. `lead_belongs_to_inmobiliaria` here is the proposed replacement.
- `sweep_fraudulent_leads()` inserts `lead_id`, `previous_status` and `changed_by_role`, which don't
  exist, and records the lead as `changed_by` (H8). The housing-plan trigger changes the status
  without writing any history.
- `check_housing_plan_progress` is a `BEFORE UPDATE` on `evaluations`, which HU 13's
  `hu13_immutable` trigger on `develop` already rejects.
- The scoping reads `evaluations.input`, which is absent from `schema.sql` (the columns are
  `target_commune`/`alternative_commune`). The `language sql` functions and policy may fail to
  create; check the live database (H11).
- `profile_id on delete cascade` conflicts with §5.8. The migrations are loose `supabase/*.sql`
  files, and `housing_plan_trigger.sql` is UTF-16 with `\$\$` escapes.
- Suggested convergence: reliability transitions move to the same event shape (or to
  `audit_events` as `lead_status_changed`) and reuse `lead_belongs_to_inmobiliaria`.

## Out of scope

`audit_events`; automatic transitions; the HU 15 funnel and metrics; CRM integration (HdU 5); the
§5.8 erasure procedure; tightening `evaluations`/`scoring_history` reads (H14/E1); any change to
PR #97 or `POST /score`; new dependencies.

## Done when

- The migration applies cleanly to a disposable database built from `schema.sql` + migrations, and
  the rollback reverses it.
- `supabase/tests/commercial_stage.sql` passes with `ON_ERROR_STOP`.
- `npm test` passes, including `stageRules.test.js`; `npm run build` succeeds.
- With Supabase unset, the dashboard renders, shows `nuevo`, and the control is disabled with no
  console errors beyond the expected silent ones.
- The wiki pages are updated and the PR against `develop` lists the PR #97 coordination items.
