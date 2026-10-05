# PLAN — Commercial stage per project ("project tracks")

- **Story:** no wiki HU of its own. A prerequisite of `Wiki RutaHogar/UserStories/HU15-dashboard-conversion-tiempos.md`
  that amends the commercial-stage base (`docs/stories/commercial-stage/PLAN.md`, PR #101) · **Actor:**
  Ejecutivo comercial · Administrador inmobiliario · the system (sell-out / restock job)
- **Status:** planned 2026-10-04 (grill Q1–Q9 with Bolgunn, owner of PR #101) · **Depends on:** PR #101
  (merged, live since 2026-10-04) · **Required by:** HU 15 steps 6–12
  (`docs/stories/HU15-dashboard-conversion-tiempos/PLAN.md` and `docs/algorithms/ALG-18-commercial-funnel-metrics.md`,
  both on `feat/hu15-dashboard-conversion-tiempos`, not yet on `develop`)
- **Branch:** `feat/commercial-stage-project-tracks` from `origin/develop` · **PR target:** `develop`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first: `supabase/migrations/20260930120000_commercial_stage.sql`. Every object this story
  amends is there, and its style (`begin; … commit;`, idempotent DDL, Spanish comments that give the
  reason, stable error codes as messages) is the style to follow. **Do not edit that file.** Every
  change goes into the new migration.
- Read first: `supabase/tests/commercial_stage.sql`. The new test file copies its harness
  (`cs_expect_error`, `set local role authenticated` + `request.jwt.claims`, `begin; … rollback;`).
  The old file must still pass with only the minimal edits listed in *Amendments during build* A1
  (it cannot pass byte-for-byte: it moves a lead to `reserva` without a project, which R1 forbids).
  Together with T13 that is the proof that requirement 11 holds.
- Read first: ALG-18 **R3** (overall stage O1–O5, cause of loss) and **Requirements on other work**,
  in `docs/algorithms/ALG-18-commercial-funnel-metrics.md` on `feat/hu15-dashboard-conversion-tiempos`
  (`git show origin/feat/hu15-dashboard-conversion-tiempos:docs/algorithms/ALG-18-commercial-funnel-metrics.md`,
  or the `hu15` worktree). `overallStage.js` implements R3 as written there.
- Read first: `frontend/src/lib/commercial/stageRules.js`, `frontend/src/services/commercialStageService.js`,
  `frontend/src/components/CommercialStagePanel.jsx`. They change in place.
- Stop and report if: a fixed requirement (table below) cannot be met as written. That changes
  ALG-18 and goes back to HU 15's author. Also stop if the migration's guard raises against prod at
  push time, if an automatic transition other than the two jobs seems needed, or if a stage or
  transition not listed here comes up.
- Before `supabase db push`: run `supabase migration list --linked` and confirm the remote history
  matches the repository. Prod has a hand-applied, unregistered `20261003000000` (HU 16). Never paste
  this migration into the SQL editor (two outages so far: 2026-10-01 and 2026-10-03).
  `20261003120000_lead_status_history_read` (PR #108) was applied in prod before it existed on
  `develop`. That blocked `db push` until PR #108 merged into `develop` (2026-10-05) and this branch
  merged `develop`. If `migration list` shows any other remote-only version, stop: do not
  `migration repair` it away.

## Goal

PR #101 gives each lead **one** commercial stage per inmobiliaria. HU 15 needs to know **which
project** a negotiation, reservation or sale belongs to, and to tell "lost on project A" apart from
"lost as a customer". This story turns the single record into a set of **records**: one lead-level
record (lead, inmobiliaria, `null`) plus one per (lead, inmobiliaria, project). Each record follows
the existing transition table on its own. A project selling out closes its open records, and a
restock reopens them. It is the last prerequisite of HU 15 apart from `fix/admin-inmobiliario-role`.

## Fixed requirements

Decided in HU 15's grills (ALG-18 G1–G8, "Requirements on other work"). They are the specification
and the grill did not reopen them. **None proved infeasible.** One reading is made explicit (R5,
"every project record" implies at least one exists, matching ALG-18 O2/O3).

| # | Requirement |
| :- | :---------- |
| R1 | Events carry a nullable `proyecto_id`; `null` = lead-level. `en_negociacion`, `reserva`, `venta_cerrada` always name a project. Lead-level stages: `nuevo`, `contactado`, `en_plan_mejora`, and `perdido` only while the lead has no project record (G1) |
| R2 | Each (lead, inmobiliaria, project) is a record with its own current stage; the lead-level record is (lead, inmobiliaria, `null`); a record with no events reads as `nuevo` (G2) |
| R3 | Each record follows the existing transition table on its own (G2) |
| R4 | Write scope (G3): ejecutivo → project records only on projects where they are `proyecto_ejecutivos.estado = 'vinculado'`, lead-level for any lead of their inmobiliaria; `admin_inmobiliario` / `admin` with an inmobiliaria → any record of their inmobiliaria's projects; actor = `auth.uid()`, tenant = `get_my_inmobiliaria()` |
| R5 | Revival (G4): while every project record of the lead (≥ 1) is `perdido`, a same-stage lead-level event is allowed with a required reason |
| R6 | Sell-out job (G6): `proyectos.estado` → `agotado` inserts `perdido` events (`sistema`, `actor_id` null, `source = 'job'`) for that project's records at `nuevo` … `en_negociacion`; nothing else touched, no record created. The **only** automatic transition: amends base Q3 |
| R7 | Restock job (G7): `estado` leaves `agotado` → each record whose **latest** event is that closure gets a system event back to its `stage_before` |
| R8 | System reasons are fixed codes that never identify the lead: `proyecto_agotado`, `proyecto_repuesto` |
| R9 | Events keep `actor_id` and `actor_role`; this story exports no actor id |
| R10 | One eligibility helper per scope: `lead_belongs_to_proyecto(p_lead, p_proyecto)`, stable, `security definer`, not granted to browser roles |
| R11 | Everything PR #101 guarantees stays: append-only history + immutability trigger, RLS tenant scoping, actor ≠ subject, erasure by re-keying `subject_user_id`, `stale_stage` |

## Approach & decisions

The design is additive. The live `lead_commercial_stage` table becomes the lead-level record without
any change to its shape. A sibling table holds the project records. The single write RPC gains a
trailing `p_proyecto` argument, and a trigger on `proyectos.estado` runs the two jobs. Everything
lives in one new migration. PR #101's migration is never edited, and its test file keeps passing
unchanged.

| # | Decision | Rationale |
| :- | :------- | :-------- |
| Q1 | **A separate `lead_project_commercial_stage` table** (PK `subject_user_id, inmobiliaria_id, proyecto_id`, all not null). `lead_commercial_stage` is unchanged and *is* the lead-level record. Events gain one nullable `proyecto_id` column | Leaves the PK, backfill and rollback of a live table untouched. No dependence on `NULLS NOT DISTINCT` (prod is PG 17.6, but disposable test databases need not be). HU 15 reads only events, so the split is invisible to it. Rejected: one table with a `NULLS NOT DISTINCT` unique index (rewrites a live PK), and a sentinel uuid (a fake id leaks into every query and breaks HU 15's `null` convention) |
| Q2 | **No data migration.** The migration starts with a **guard**: if any lead-level event or `lead_commercial_stage` row holds `en_negociacion`/`reserva`/`venta_cerrada`, raise `lead_level_late_stage_exists` and abort | Prod on 2026-10-04 (read-only `supabase db query --linked`): **22 events, all `sistema`/`backfill` `null → nuevo`, 0 with a late stage; 22 current rows, all `nuevo`, 0 `perdido`**; 20 projects, 3 `agotado`; 2 `proyecto_ejecutivos` rows `pendiente`. Nothing violates R1 today. Staff can still create a violation before this merges, and the guard turns that into a clean failed push and a human decision, never a silent grandfathering. The append-only trigger forbids rewriting history anyway |
| Q3 | **Extend the one RPC.** Drop `change_commercial_stage(uuid,text,text,text)` and recreate it with a trailing `p_proyecto uuid default null`. `p_expected_stage` is compared with the **targeted record** (missing = `nuevo`). The advisory lock stays **per (lead, inmobiliaria)**. New codes: `project_required`, `proyecto_not_in_scope`. The return adds `proyecto_id` | Current callers (4 named args) keep working as lead-level moves. Dropping the old signature avoids two overloads that PostgREST would find ambiguous. One lock per lead serializes the cross-record checks (R1's "has a project record", R5's "all `perdido`") with every write and job on that lead. Rejected: a second RPC that duplicates every check |
| Q4 | **The jobs are a trigger**: `after update of estado on proyectos`, `when (old.estado is distinct from new.estado)`, `security definer`. Records are processed in `(subject_user_id, inmobiliaria_id)` order under the same advisory lock. `events.proyecto_id` has **no FK**. `lead_project_commercial_stage.proyecto_id` has an FK to `proyectos` **`on delete restrict`**, so a project with any commercial record cannot be deleted, and the delete flow says "márcalo agotado" | The frontend writes `estado` directly (`projectService.setProjectStatus`) and the local provider must keep working, so the job cannot live in a service. A trigger catches every writer. Repeated toggles are safe because each run reads current state, and `agotado → agotado` does not fire. An FK on events could never cascade (the immutability trigger rejects deletes), and `restrict` on history would also block deletion. `restrict` on records stops a reservation or sale from silently vanishing from HU 15. Rejected: cascading records away, and job logic in `setProjectStatus` |
| Q5 | **Sticky records.** Creating a project record needs `lead_belongs_to_proyecto(lead, P)`. Once it exists it stays writable by anyone with write scope on P, even after the lead stops belonging (removed favorite, changed comuna). Lead-level writes keep PR #101's rule (`lead_belongs_to_inmobiliaria` now) | An executive must be able to close `reserva → venta_cerrada` after the buyer unfavorites. This is not the self-widening PR #101 rejected: creating the record needed real eligibility, read scope (RLS) is per tenant either way, and history never grants a new lead or a new project. Rejected: strict eligibility (drift blocks closing a deal), and automatic closure on drift (a second automatic transition, contradicts R6) |
| Q6 | **The overall-stage rule (ALG-18 R3 O1–O5 + cause G8) is implemented once**, in a new pure `frontend/src/lib/commercial/overallStage.js`, **landed by this story**. The lead-card badge is its first consumer. HU 15's `funnelMetrics.js` calls it at each replay step instead of re-implementing it. The badge shows the **tenant-wide** overall stage (all records of the caller's inmobiliaria) | The handbook's promotion rule: a second consumer means a shared `lib/` function. The badge cannot stay on the lead-level row once project records exist. Its input (each record's current stage plus the instant and `por_sistema` of its latest event) is exactly what O3's "strictly later" test and G8 need, and HU 15's replay can build the same input at any moment. The behaviour is ALG-18's, unchanged. ALG-18's "implemented in" row is amended in HU 15's PR (below), not here |
| Q7 | **A read RPC `commercial_stage_scope(p_lead)`** feeds the panel: the records the caller may see and which ones they may write. The panel gains a "Registro" selector (lead-level + projects). `stageRules.js` mirrors the new lead-level limits and revival. History labels each event with its project. The badge uses `overallStage` | Write scope (R4 + vinculado + sticky eligibility) and eligibility are server-side facts. An ejecutivo cannot read unassigned projects through RLS. Computing them in the browser would duplicate G3 in JS. `writable` is computed by the same SQL function the RPC uses, so the UI and the database cannot disagree |
| Q8 | **Two helpers, one rule each.** `lead_belongs_to_proyecto(p_lead, p_proyecto)` holds the comuna/favorite rule for one project, and `lead_belongs_to_inmobiliaria` is **redefined** as "exists a tenant project the lead belongs to". `is_ejecutivo_vinculado(p_proyecto)` = `is_ejecutivo_asignado` + `estado = 'vinculado'`. `is_ejecutivo_asignado` is **unchanged** (the `proyectos` RLS depends on it) | R10, and the rule then exists once. The redefinition is behaviour-preserving: favorite-on-a-tenant-project OR comuna-of-a-tenant-project equals "exists a tenant project p with favorite-on-p OR comuna-of-p". A SQL test asserts the equivalence on every fixture pair. HU 15's `commercial_funnel_facts()` reuses both helpers |
| Q9 | **The HU 16 reliability guard is not built here.** When it lands it applies **per record**: forward moves on any record are rejected for `silenciado`/`descartado`. `perdido`, backward moves, revival and both jobs stay allowed | `reliability_status` exists in prod only by hand (PR #97 unmerged, drift memo). Building against it would repeat the 2026-10-01/03 outages. Recording the per-record semantics now saves HU 16 a grill question |
| D1 | **Lead-level same-stage events are revival only.** Revival needs ≥ 1 project record, every one `perdido`, the lead-level current stage **not** `perdido`, and a non-blank reason. Otherwise same-stage stays `same_stage` | O3 requires a non-`perdido` lead-level stage to revive. With no project record, "all `perdido`" is vacuous and would reopen `same_stage` for every lead |
| D2 | **The database enforces what it can without reading other rows.** The new checks are: late stages need a `proyecto_id`; a same-stage event must be lead-level, non-system and carry a reason; `source = 'job'` needs a `proyecto_id`. The cross-row rules (lead-level `perdido` vs existing project records, "all `perdido`") live in the RPC under the lock | A CHECK cannot read other rows. Everything else is pinned below the RPC, so a future writer (backend, `service_role`) cannot bypass R1/R5's shape |
| D3 | **No extra rule for records on an already-`agotado` project.** A person may still create or move a record on an `agotado` project. The job fires only on the transition | Not in R1–R11, and adding one would amend G6. HU 15's default band catalog already excludes `agotado` projects (ALG-18 A4). `reserva → venta_cerrada` on a sold-out project must stay possible anyway |
| D4 | **`commercial_stage_scope` reveals to an ejecutivo only** the projects they are `vinculado` to, plus projects where the lead already has a record (names needed for history and the badge). Admins see every tenant project the lead belongs to or has a record on | It keeps HU 10's rule that an ejecutivo does not browse unassigned projects, while history stays legible |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No. No path under `backend/app/scoring_engine/`, no ALG changed, no number introduced. `overallStage.js` implements ALG-18 R3 without numbers. ALG-18's "implemented in" row is amended by HU 15's PR |
| 2 | Needs RLS / multi-tenant scoping? | Yes. `lead_project_commercial_stage` gets PR #101's policy verbatim (staff of the tenant + global admin read; no lead read; browser roles read only). Writes only through `security definer` functions that take the tenant from `get_my_inmobiliaria()`. `commercial_stage_scope` is tenant-scoped and returns `[]` for a null tenant. Helpers are not granted to browser roles. S6 holds |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes: `supabase/migrations/<ts>_commercial_stage_project_tracks.sql`, `<ts>` later than every migration on `develop` and `main` (≥ `20261005120000`), plus rollback and `schema.sql` sync. Applied **after merge** by the merger (Bolgunn) with `supabase db push`, after `supabase migration list --linked` shows aligned history. Never via the SQL editor. If the Q2 guard raises, stop and decide by hand |
| 4 | Changes the `POST /score` contract? | No |
| 5 | Consent / privacy impact? | No new personal data. System events carry fixed reason codes (R8). `commercial_stage_scope` returns no actor id, reason or lead data (R9). The §5.8 erasure procedure (not built) must also re-key `subject_user_id` in `lead_project_commercial_stage`. That table has no FK to `profiles`/`auth.users`, by construction. Staff reasons remain free text under the existing "no financial values" warning |

> 1 and 3 are checked against the diff by CI.

## Entities

### Existing, unchanged

`lead_commercial_stage` (now explicitly the **lead-level record**: shape, PK, policy, backfill
untouched), `commercial_stage_transition_check`, `commercial_stage_reject_mutation` + trigger,
`commercial_stage_backfill`, `lead_in_my_inmobiliaria`, `is_ejecutivo_asignado`, `proyectos`,
`proyecto_ejecutivos`, `proyecto_favoritos`.

### Migration `supabase/migrations/<ts>_commercial_stage_project_tracks.sql`

`begin; … commit;`, idempotent like PR #101's. Order matters, so it is listed in order.

**0. Guard (Q2).** A `do $$` block raises `lead_level_late_stage_exists` if
`exists (select 1 from commercial_stage_events where stage_after in ('en_negociacion','reserva','venta_cerrada'))`
or the same on `lead_commercial_stage.stage`. Every existing event is lead-level, since the column
does not exist yet. On a re-run (column present), restrict the event test to `proyecto_id is null`.

**1. `commercial_stage_events` — amended**

| Change | Definition |
| :----- | :--------- |
| new column | `proyecto_id uuid` null, **no FK** (Q4). `null` = lead-level |
| replace `commercial_stage_events_change_check` | `stage_before is distinct from stage_after or (proyecto_id is null and actor_role <> 'sistema' and length(trim(coalesce(reason, ''))) > 0)` — R5, D1, D2 |
| new `commercial_stage_events_lead_level_stage_check` | `proyecto_id is not null or stage_after not in ('en_negociacion','reserva','venta_cerrada')` — R1 |
| new `commercial_stage_events_job_project_check` | `source <> 'job' or proyecto_id is not null` — the job only ever acts on project records (R6) |
| new index | `(subject_user_id, inmobiliaria_id, proyecto_id, occurred_at, id)` |
| new index | `(proyecto_id, occurred_at) where proyecto_id is not null` |

`add column` and `add constraint` are DDL and fire no row trigger, so the immutability trigger is not
in the way. Existing rows satisfy every new check (guard + prod counts).

**2. `public.lead_project_commercial_stage` — new** (current state of project records)

| Column | Type | Notes |
| :----- | :--- | :---- |
| `subject_user_id` | uuid not null | PK part, **no FK** (erasure, as in PR #101) |
| `inmobiliaria_id` | uuid not null FK `inmobiliarias(id)` `on delete restrict` | PK part |
| `proyecto_id` | uuid not null FK `proyectos(id)` **`on delete restrict`** | PK part (Q4) |
| `stage` | text not null, same check as `lead_commercial_stage.stage` | |
| `last_event_id` | uuid not null FK `commercial_stage_events(id)` | |
| `updated_at` | timestamptz not null | = `occurred_at` of `last_event_id` |

Indexes: `(proyecto_id, stage)` for the jobs; `(inmobiliaria_id, stage)`. RLS, grants and the
select policy are copied from `lead_commercial_stage` (named `"Lead project commercial stage select tenant"`):
`revoke all from anon, authenticated`; `grant select to authenticated`;
`grant select, insert, update to service_role`.

**3. Helpers** — all `stable security definer set search_path = public`, revoked from
`public, anon, authenticated`, granted to `service_role` only.

- `lead_belongs_to_proyecto(p_lead uuid, p_proyecto uuid) returns boolean` (R10): lead profile
  `role = 'usuario'` **and** (a `proyecto_favoritos` row for `p_proyecto` **or** one of the four
  declared comunas, as in PR #101's body including `financial_data->'input'->>'comuna_objetivo'`,
  equals `lower(trim(proyectos.comuna))` of `p_proyecto`). `false` for a null or unknown project.
- `lead_belongs_to_inmobiliaria(p_lead, p_inmobiliaria)` — **redefined** (Q8):
  `p_inmobiliaria is not null and exists (select 1 from proyectos pr where pr.inmobiliaria_id = p_inmobiliaria and lead_belongs_to_proyecto(p_lead, pr.id))`.
  Same signature, privileges unchanged.
- `is_ejecutivo_vinculado(p_proyecto uuid) returns boolean` (Q8, R4): `exists` a `proyecto_ejecutivos`
  row for `p_proyecto` with `estado = 'vinculado'` and (`ejecutivo_id = auth.uid()` or
  `ejecutivo_email = get_my_email()`).
- `commercial_stage_project_access(p_lead uuid, p_proyecto uuid, p_role text, p_tenant uuid) returns text`
  — **the single write-scope rule for project records**. It returns `null` when allowed, else an
  error code, checked in this order:
  1. the project does not exist or `proyectos.inmobiliaria_id <> p_tenant` → `proyecto_not_in_scope`;
  2. `p_role = 'ejecutivo'` and not `is_ejecutivo_vinculado(p_proyecto)` → `proyecto_not_in_scope`;
  3. no `lead_project_commercial_stage` row for (`p_lead`, `p_tenant`, `p_proyecto`) **and** not
     `lead_belongs_to_proyecto(p_lead, p_proyecto)` → `lead_not_in_scope` (Q5: sticky once created).

**4. Write RPC — `change_commercial_stage`, replaced** (Q3)

`drop function if exists public.change_commercial_stage(uuid, text, text, text);` then
`create function public.change_commercial_stage(p_lead uuid, p_to_stage text, p_reason text default null, p_expected_stage text default null, p_proyecto uuid default null) returns jsonb`,
`security definer set search_path = public`.

1. `forbidden` exactly as today (caller, staff role, non-null tenant).
2. Scope: `p_proyecto is null` → `lead_not_in_scope` unless `lead_belongs_to_inmobiliaria(p_lead, tenant)`
   (unchanged). Otherwise raise the code returned by `commercial_stage_project_access` (errcode `42501`).
3. `pg_advisory_xact_lock(hashtextextended(p_lead::text || ':' || tenant::text, 0))`, the **same key**
   as today.
4. Read the targeted record's stage `for update` (lead-level table or project table); missing = `nuevo`.
5. `p_expected_stage` not null and ≠ current → `stale_stage`.
6. Lead-level only (`p_proyecto is null`), with `has_projects` = any project record for (lead,
   tenant) and `all_lost` = `has_projects` and none of them ≠ `perdido`:
   - `p_to_stage in ('en_negociacion','reserva','venta_cerrada')` → `project_required` (R1);
   - `p_to_stage = 'perdido'` and `has_projects` → `project_required` (R1);
   - `p_to_stage = current` and `current <> 'perdido'` and `all_lost` → **revival** (R5, D1):
     `reason_required` if the reason is blank, else skip step 7.
7. `commercial_stage_transition_check(current, p_to_stage, role, p_reason)`, unchanged (R3).
8. Insert the event (`proyecto_id = p_proyecto`, `actor_id = auth.uid()`, `actor_role = role`,
   `source = 'web'`, `nullif(trim(p_reason), '')`). Upsert the targeted record with `last_event_id`.
9. Return `{ stage, event_id, occurred_at, proyecto_id }`.

Grants: `revoke all … from public, anon, authenticated`; `grant execute … to authenticated, service_role`.

**5. Read RPC — `commercial_stage_scope(p_lead uuid) returns jsonb`** (Q7, D4), `stable security definer`,
granted to `authenticated`.

- Not staff, or null tenant → `{ "lead_level_writable": false, "lead_level": null, "proyectos": [] }`.
- `lead_level_writable` = `lead_belongs_to_inmobiliaria(p_lead, tenant)`; `lead_level` =
  `{ stage, updated_at }` of the lead-level row or `null`.
- `proyectos`: tenant projects where (`lead_belongs_to_proyecto` **or** a record exists), and, for
  an ejecutivo, (`is_ejecutivo_vinculado` **or** a record exists). Order by `nombre`. Each element is
  `{ id, nombre, estado, stage, updated_at, writable }`, where `stage`/`updated_at` are the record's or
  `null`, and `writable` = `commercial_stage_project_access(...) is null`.
- No actor id, reason or lead attribute in the payload (R9).

**6. Jobs — trigger on `proyectos`** (R6, R7, R8, Q4)

`commercial_stage_project_estado_changed() returns trigger`, `security definer set search_path = public`,
revoked from browser roles. Trigger `proyectos_commercial_stage_jobs`:
`after update of estado on public.proyectos for each row when (old.estado is distinct from new.estado)`.

- **Sell-out** (`new.estado = 'agotado'`): for each `lead_project_commercial_stage` row with
  `proyecto_id = new.id` and `stage in ('nuevo','contactado','en_plan_mejora','en_negociacion')`,
  ordered by `(subject_user_id, inmobiliaria_id)`: take the advisory lock for (lead, tenant),
  re-read the row `for update`, and if it is still in that set, insert an event (`actor_id null`,
  `actor_role 'sistema'`, `source 'job'`, `proyecto_id new.id`, `stage_before` = stage,
  `stage_after 'perdido'`, `reason 'proyecto_agotado'`) and update the row.
- **Restock** (`old.estado = 'agotado'`, new ≠ `agotado`): for each row of the project whose
  `last_event_id` is an event with `actor_role 'sistema'`, `source 'job'`, `stage_after 'perdido'`,
  `reason 'proyecto_agotado'` (same order and lock, re-checked after locking): insert an event back to
  that closure's `stage_before` (`stage_before 'perdido'`, `reason 'proyecto_repuesto'`) and update
  the row. Records a person touched after the closure no longer have it as latest event and are left
  alone.
- Both paths call `commercial_stage_transition_check(from, to, 'sistema', reason)` as an assertion.
  Neither path ever touches `reserva`, `venta_cerrada`, already-`perdido` rows (sell-out), the
  lead-level table, or leads without a record.

**7. Privileges recap.** Browser roles can execute `change_commercial_stage` (new signature),
`commercial_stage_scope` and `lead_in_my_inmobiliaria`, and nothing else from this story.

### Rows that already exist

None change. The 22 backfill events become lead-level events (`proyecto_id null`), which they
already are by construction, and the 22 `lead_commercial_stage` rows become lead-level records. No
project record is created for existing leads (R6's "no record is created"; ALG-18 O1/R2 read a
missing record as `nuevo`). The 3 projects already `agotado` have no records, so no job runs for them.

### Rollback — `supabase/rollback/<ts>_commercial_stage_project_tracks_rollback.sql`

In dependency order: drop the trigger on `proyectos` and its function. Drop `commercial_stage_scope`
and the 5-argument `change_commercial_stage`, and recreate PR #101's 4-argument body and grants. Drop
`commercial_stage_project_access`, `is_ejecutivo_vinculado`, then restore PR #101's body of
`lead_belongs_to_inmobiliaria` and drop `lead_belongs_to_proyecto`. Drop `lead_project_commercial_stage`
and its policy. Drop the two new checks and the two indexes. Restore the original
`commercial_stage_events_change_check`, then drop `proyecto_id`.
**The header must say it:** once project records, job events or revival events exist, the rollback
**destroys project attribution** (`drop column`) and the original change check fails on revival
events. It is meant for a failed deploy, not for use after go-live.

### `supabase/schema.sql`

Mirror the migration's DDL, functions, trigger and policy (not the guard). Replace the
`change_commercial_stage` and `lead_belongs_to_inmobiliaria` bodies in place rather than appending
second copies.

## Algorithms

- `ALG-18` (on `feat/hu15-dashboard-conversion-tiempos`) — **consumed, not modified here**. R3's
  overall stage and cause of loss (O1–O5, G8) are implemented as written in `overallStage.js`.
  **Amendment owed by HU 15's PR:** the ALG-18 header "Runs on / implemented in" names
  `frontend/src/lib/commercial/overallStage.js` for R3's overall stage, and `funnelMetrics.js`
  imports it.

**Local logic** (no ALG number): the transition table (base plan) and its per-record application.
Also the lead-level limits, revival, write scope and the two jobs. None has a tunable number.

## Scope

**In:** the migration, rollback, `schema.sql` sync and SQL tests. Also `overallStage.js` and its
tests, the `stageRules.js` changes, service, panel, badge, the project-delete message, and the wiki
updates listed in step 12.

**Out:**
- `commercial_funnel_facts()` and every HU 15 metric → HU 15 (steps 6–12 of its plan).
- The HU 16 reliability guard → HU 16, per-record semantics recorded in Q9.
- The §5.8 erasure procedure → its own story. The requirement to re-key the new table is recorded in
  standing question 5 and in the wiki.
- `admin_inmobiliario` frontend support → `fix/admin-inmobiliario-role`. The SQL already accepts the role.
- A stage filter on the dashboard (RNF 7 E2), the funnel, charts → follow-ups.
- Any edit to ALG-18, HU 15's plan, or PR #101's migration. The amendments owed are listed below.

## Steps

1. **Migration** `supabase/migrations/<ts>_commercial_stage_project_tracks.sql`, sections 0–7 above
   in that order. Spanish comments explain the reason (guard, sticky records, why no FK on events,
   why `restrict` on records, why one lock per lead).
2. **Rollback** `supabase/rollback/<ts>_commercial_stage_project_tracks_rollback.sql`, with the
   warning header.
3. **`supabase/schema.sql`** sync (Entities, last subsection).
4. **SQL tests** `supabase/tests/commercial_stage_project_tracks.sql` (cases below). Run it and the
   minimally amended `supabase/tests/commercial_stage.sql` (A1) with `ON_ERROR_STOP` against a disposable database
   (`hu13_bootstrap.sql` + `schema.sql` + migrations). Then apply and revert the rollback once to
   prove it runs.
5. **`frontend/src/lib/commercial/overallStage.js`** (pure, Q6):
   `overallStage(records) → { stage, causa }`, where
   `records = [{ proyecto_id: string | null, stage, at, por_sistema }]` (each record's current stage,
   plus the instant and `por_sistema` of its latest event; `[]` allowed). `causa` is
   `'por_agotamiento' | 'por_gestion'` when `stage = 'perdido'`, else `null`. Rows O1–O5 and G8
   exactly as ALG-18 R3 states them, with ranks from `STAGES`. Instants are compared as instants, not
   strings. Tests in `frontend/src/lib/commercial/__tests__/overallStage.test.js`, one `it` per R3 row
   and edge case, **named by the ALG-18 id** (`O1 …`, `O3 strictly later revives`,
   `O3 same instant does not revive`, `O4 …`, `O5 …`, `G8 all system → por_agotamiento`,
   `G8 mixed → por_gestion`, `lead-level perdido ignored once a project record exists`), plus
   "does not mutate input".
6. **`frontend/src/lib/commercial/stageRules.js`** — still a mirror; the database stays authoritative:
   - `PROJECT_ONLY_STAGES = ['en_negociacion','reserva','venta_cerrada']`.
   - `allowedTargets(from, role, scope = { level: 'proyecto' })`. For `scope.level === 'lead'` it
     drops `PROJECT_ONLY_STAGES`, and drops `perdido` when `scope.hasProjectRecords`. It adds `from`
     itself (revival) when `scope.allProjectRecordsPerdido && from !== 'perdido'`. The default
     argument keeps today's behaviour for project records.
   - `reasonRequired(from, to)` returns `true` when `from === to` (revival).
   - Extend `__tests__/stageRules.test.js` with one case per new rule. Keep the existing cases
     unchanged and passing.
7. **`frontend/src/services/commercialStageService.js`**:
   - `getCommercialRecords(leadIds, inmobiliariaId)` replaces `getCommercialStages`. It reads both
     current-state tables (same batching, same tenant filter) and embeds the latest event's
     `actor_role` through the `last_event_id` FK. It returns
     `{ [leadId]: [{ proyecto_id, stage, at: updated_at, por_sistema }] }`. For a global admin
     (no `inmobiliariaId`) it keeps today's choice: the tenant with the most recent `updated_at`.
   - `getCommercialStageScope(leadId)` → `rpc('commercial_stage_scope')`. It replaces
     `canManageLeadStage` in the panel. Keep `canManageLeadStage` exported only if another caller
     exists (grep). Otherwise remove it.
   - `getCommercialStageHistory` also selects `proyecto_id`.
   - `changeCommercialStage({ leadId, toStage, reason, expectedStage, proyectoId })` passes
     `p_proyecto: proyectoId || null`.
   - `ERROR_MESSAGES` gains `project_required` ("Negociación, reserva y venta se registran en un
     proyecto; perder al lead se marca en cada proyecto.") and `proyecto_not_in_scope` ("No estás
     vinculado a ese proyecto."). Keep the existing messages.
   - Without Supabase: `{}`, a scope with nothing writable, `[]`. The UI shows `nuevo` read-only, as today.
8. **`frontend/src/components/CommercialStagePanel.jsx`**:
   - Props: `leadId`, `records` (from step 7), `role`, `onChanged`.
   - Loads `getCommercialStageScope` + history. A "Registro" `<select>`: "Lead (general)" first, then
     each scope project with its current stage. Non-writable entries are shown but the form is
     disabled with a note ("Solo lectura: no estás vinculado a este proyecto").
   - Targets come from `allowedTargets(current, role, scope)`, with `hasProjectRecords` /
     `allProjectRecordsPerdido` taken from the scope payload. Revival is labelled "Mantener en
     <etapa> (sigue vivo)". The reason is required whenever `reasonRequired` says so.
   - It submits `expectedStage` = the selected record's stage and `proyectoId`. On success it reloads
     the scope and history and calls `onChanged(leadId)`.
   - History: each line is prefixed with the project's `nombre` from the scope, or "General" for
     `null`. Unknown ids show "Proyecto". System lines show "Sistema · proyecto agotado/repuesto"
     from the reason code.
   - `CommercialStageBadge({ records })` renders `overallStage(records)`. When `causa ===
     'por_agotamiento'` it adds the hint "por agotamiento".
   - Update `CommercialStagePanel.test.jsx` (no Supabase: renders `nuevo`, read-only, no throw).
9. **`frontend/src/components/DashboardLeads.jsx`**: load `getCommercialRecords` where
   `getCommercialStages` was loaded. Pass `records` to the badge and the panel, and after a change
   reload records for that lead.
10. **`frontend/src/services/projectService.js` → `deleteProject`**: map an FK violation (`23503`)
    to "Este proyecto tiene historial comercial y no se puede eliminar; márcalo como agotado.".
    `AdminProjectCatalog.jsx` already shows the thrown message. Check this, don't change it.
11. **Base plan pointer.** In `docs/stories/commercial-stage/PLAN.md`, add one line under the
    decisions table: "Q3 and the single-record model are amended by
    `docs/stories/commercial-stage-project-tracks/PLAN.md`." No other edit.
12. **Wiki** (Spanish product docs):
    - `Wiki RutaHogar/Database/lead_commercial_stage.md`: covers both current-state tables (lead-level
      vs project), `proyecto_id`, lead-level limits, revival, write scope (vinculado, sticky records),
      the two jobs and their reason codes, `on delete restrict`, the helpers, the new RPC argument and
      error codes, `commercial_stage_scope`, and the erasure re-key list including the new table.
    - `Wiki RutaHogar/UserStories/HU15-dashboard-conversion-tiempos.md`: note that the per-project
      stage data layer exists (link this plan), and that `perdido` has two levels and a cause.
    - `Wiki RutaHogar/UserStories/HU16-gestion-leads-inconsistentes.md`: the Q9 per-record guard sentence.
13. **Gates**: `npm test`, `npm run lint`, `npm run build` in `frontend/`, and both SQL files green.
    Then the PR against `develop`, carrying the "Owed by HU 15" list below and the push instructions
    from standing question 3.

### SQL tests — `supabase/tests/commercial_stage_project_tracks.sql`

The harness is copied from `commercial_stage.sql` with a `pt_` fixture prefix. Fixtures: inmobiliaria
A with P1 (Ñuñoa) and P2 (Providencia), inmobiliaria B with PB (Ñuñoa). Ejecutivo E1 in A is
`vinculado` on P1 and has a `pendiente` row on P2. Admin AA in A, ejecutivo EB in B, a global admin.
Leads: L1 declares Ñuñoa (belongs to P1 in A and to PB in B); L2 favorited P2; L3 declares Ñuñoa and
favorited P2 (belongs to both A projects). `admin_inmobiliario` cases run only if
`profiles_role_check` admits the role (`fix/admin-inmobiliario-role`). Otherwise they are skipped
with a `raise notice`, and the `admin` cases cover R4.

| Case | Covers | Assertion |
| :--- | :----- | :-------- |
| T1 | R1 | E1, L1 lead-level → `en_negociacion` / `reserva` / `venta_cerrada` → `project_required`. As owner, inserting a lead-level `reserva` event violates `commercial_stage_events_lead_level_stage_check` |
| T2 | R1 | L2, no project record: lead-level → `perdido` (with reason) ok and stored with `proyecto_id null`. Reopen. After AA creates L2's P2 record, lead-level → `perdido` → `project_required` |
| T3 | R2 | E1 moves L1 on P1 with `p_expected_stage 'nuevo'` (no row yet) → ok. The lead-level row is unchanged. The P1 row has its own stage and `last_event_id`. The event's `proyecto_id` = P1 and `stage_before` = `nuevo` |
| T4 | R3 | On L3/P1: backward without reason → `reason_required`; `venta_cerrada → perdido` by E1 → `admin_required`, by AA → ok; `perdido → venta_cerrada` → `invalid_transition`. L3's P2 record and lead-level row are unaffected throughout |
| T5 | R4 | E1 on L3/P1 ok, with `actor_id` = E1 and `inmobiliaria_id` = A. E1 on L3/P2 (`pendiente`) → `proyecto_not_in_scope`. E1 on PB → `proyecto_not_in_scope`. E1 lead-level on L2 (not on E1's projects) → ok. AA on L3/P2 → ok. EB on L1/P1 → `proyecto_not_in_scope`. AA on L2/P1 (L2 does not belong to P1) → `lead_not_in_scope` |
| T6 | R4, Q5 | Sticky record: delete L2's P2 favorite. `lead_belongs_to_proyecto(L2, P2)` = false, yet AA moves L2/P2 → ok. A **new** record on P2 for a non-belonging lead → `lead_not_in_scope` |
| T7 | R5, D1 | L3 with P1 and P2 both `perdido`: lead-level same stage without reason → `reason_required`; with reason → ok, event `stage_before = stage_after`. With P2 not `perdido` → `same_stage`. L1 with no project record in A → `same_stage`. Lead-level `perdido` same-stage → `same_stage`. As owner, a same-stage event with `proyecto_id` set, or with `actor_role 'sistema'`, violates the change check |
| T8 | R6 | Records on P1 at `nuevo`, `contactado`, `en_negociacion`, `reserva`, `venta_cerrada`, `perdido` (several leads). Admin sets P1 `agotado`: exactly the first three get one event each (`sistema`, `actor_id null`, `job`, `proyecto_agotado`, `proyecto_id` P1) and are `perdido`; the others are untouched; no lead-level event; no row for a P1-eligible lead without one. Re-setting `agotado` adds nothing |
| T9 | R7 | Before restock, AA reopens one closed record by hand. P1 → `disponible`: the other closed records go back to their exact `stage_before` (`proyecto_repuesto`); the hand-reopened record is untouched; `reserva`/`venta_cerrada` untouched. A second `agotado` → `disponible` cycle repeats both correctly |
| T10 | R8 | Every `source = 'job'` event has `reason in ('proyecto_agotado','proyecto_repuesto')` and contains no lead id |
| T11 | R9 | Job events have `actor_role 'sistema'` / `actor_id null`; staff events have `actor_id = auth.uid()`. The `commercial_stage_scope` and `change_commercial_stage` payloads contain no key named `actor_id`, `reason` or `subject_user_id` |
| T12 | R10, Q8 | `lead_belongs_to_proyecto` truth table over {L1,L2,L3} × {P1,P2,PB}. For every fixture (lead, inmobiliaria), `lead_belongs_to_inmobiliaria` equals `exists` over that tenant's projects. `authenticated` cannot execute either helper, `is_ejecutivo_vinculado`, or `commercial_stage_project_access` |
| T13 | R11 | As `authenticated`: insert/update/delete on `lead_project_commercial_stage` → permission denied. EB selects 0 rows of A's. A lead selects 0 rows. The global admin sees A's and B's rows. As owner, update/delete of a job event → `immutable_history`. A stale `p_expected_stage` on a project record → `stale_stage`. The catalog shows no FK on `lead_project_commercial_stage.subject_user_id` |
| T14 | Q4 | Deleting P2 while it has records → FK violation (`23503`). Deleting a project with no records → ok |
| T15 | Q3 | A 4-argument named call (`p_lead, p_to_stage, p_reason, p_expected_stage`) still resolves and acts lead-level. `commercial_stage_scope` for E1 on L3 lists P1 `writable: true`, and lists P2 only once a record exists, then `writable: false`. For the global admin it returns the empty shape |
| T16 | Q2 | The guard's query returns 0 on the fixtures after T1–T15 (lead-level late stages cannot be created), so a re-run of the guard passes |

## Acceptance criteria map

Every HU 15 requirement on this branch (ALG-18 "Requirements on other work" 1–7, plus the RPC and
helper needs in HU 15's plan), and the R-table above.

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| ALG-18 req 1 / R1 — nullable `proyecto_id`; late stages need a project; lead-level `perdido` only without project records | 1, 4 | T1, T2; check constraint in T1 |
| ALG-18 req 2 / R2, R3 — independent records, missing = `nuevo`, transition table per record | 1, 4 | T3, T4 |
| ALG-18 req 3 / R4 — write scope (vinculado, tenant admins, admin-only undo, actor/tenant from session) | 1, 4 | T4, T5 |
| ALG-18 req 4 / R5 — same-stage lead-level revival with reason, only while every project record is `perdido` | 1, 4, 6 | T7; `stageRules.test.js` revival case |
| ALG-18 req 5 / R6 — sell-out job | 1, 4 | T8 |
| ALG-18 req 6 / R7 — restock job, persons' later moves respected | 1, 4 | T9 |
| ALG-18 req 7 / R8 — non-identifying system reasons | 1, 4 | T10 |
| HU 15 plan `stage_events` source (`proyecto_id`, `actor_role`, `actor_id` kept for `por_sistema` / `por_mi`, ordering by `(occurred_at, id)`) / R9 | 1 | T11; index `(subject_user_id, inmobiliaria_id, proyecto_id, occurred_at, id)` present |
| HU 15 plan `lead_belongs_to_proyecto` exists, not browser-granted / R10 | 1, 4 | T12 |
| HU 15 plan ejecutivo scope = `vinculado` projects (reusable helper) | 1 | T5, T12 (`is_ejecutivo_vinculado`) |
| ALG-18 R3 O1–O5 + G8 implemented once, in `lib/` | 5, 8 | `overallStage.test.js` cases named O1–O5, G8 |
| R11 — PR #101 guarantees intact | 1–4 | `commercial_stage.sql` passes with the A1 edits only; the original file passes on the rolled-back schema; T13 |
| Q2 — no existing row violates R1; guard | 1 | prod counts above (2026-10-04); T16; push succeeds (merger) |
| Q4 — project with commercial records cannot be deleted; clear message | 1, 10 | T14; reviewer: as admin, try deleting a project with a record → Spanish message, project still listed |
| Q7 — panel selector, read-only projects, revival option, history per project; badge = overall stage | 6–9 | reviewer steps below; `CommercialStagePanel.test.jsx` |
| Local without Supabase still renders | 7–9 | reviewer: unset `VITE_SUPABASE_*`, open the leads dashboard → badge `Nuevo`, panel read-only, no new console errors |
| Rollback runs | 2 | step 4: apply + rollback on the disposable database |

**Reviewer steps (Tier 2)**, on a disposable or preview database with the migration applied:
1. As an ejecutivo `vinculado` on P1, open a lead of P1. "Registro" lists "Lead (general)" and P1.
   The lead-level stage list offers no negotiation, reservation or sale. Move P1 to `en_negociacion`,
   and the card badge reads "En negociación".
2. Mark P1 `perdido` with a reason. The badge reads "Perdido". The lead-level list offers "Mantener en
   <etapa> (sigue vivo)" and requires a reason. Submit it, and the badge shows the lead-level stage.
3. As admin, set P1 `agotado`. An open record on P1 becomes `perdido`, the history shows "Sistema ·
   proyecto agotado", and the badge hint reads "por agotamiento". Set it back to `disponible`, and the
   record returns to its previous stage.
4. A project the ejecutivo is not `vinculado` to, where the lead has a record, appears read-only.

## Owed by other work (for the PR description; not edited here)

- **ALG-18 (HU 15's PR):** the "Runs on / implemented in" row adds
  `frontend/src/lib/commercial/overallStage.js` for R3's overall stage and cause, and
  `funnelMetrics.js` calls it at each replay step.
- **HU 15 plan:** `commercial_funnel_facts()` should reuse `is_ejecutivo_vinculado` (its step 2
  inlines the vinculado check today) and `lead_belongs_to_proyecto` (created here, so the "unless
  already present" branch applies).
- **HU 15 / ALG-18, for Bolgunn to decide:** with sticky records (Q5), a lead can keep a standing
  sale on P after it stops belonging to P. HU 15's fact universe (leads with `lead_belongs_to_proyecto`
  on an in-scope project *today*) and R10's `p ∈ lead.proyectos` would then drop that sale from the
  dashboard. Including "or has a record on an in-scope project" in the universe would fix it. That is
  an ALG-18 change, not made here.
- **HU 16:** the per-record reliability guard (Q9).
- **§5.8 erasure procedure:** re-key `subject_user_id` in `lead_project_commercial_stage` too.

## Assumptions

- **`fix/admin-inmobiliario-role`** may merge before or after this branch. The SQL already accepts
  `admin_inmobiliario` (PR #101). The frontend uses the existing `role` prop and needs no role key of
  its own. The SQL tests skip the `admin_inmobiliario` cases until `profiles_role_check` admits the
  role. Do not add the role to the check here. Prod already admits it, and one `admin_inmobiliario`
  profile exists (checked 2026-10-04), so the R4 tenant-admin path is live there even though
  `develop`'s `schema.sql` may not allow it yet.
- **Prod schema facts the migration relies on** (read-only, 2026-10-04): `commercial_stage_events`
  has no `proyecto_id` yet; the only trigger on `proyectos` is `proyectos_set_updated_at`; no
  function named `lead_belongs_to_proyecto`, `is_ejecutivo_vinculado` or `commercial_stage_scope`
  exists; `proyecto_ejecutivos` has 27 rows (25 `vinculado` with an `ejecutivo_id`, 2 `pendiente`
  without one).
- **`setProjectStatus` keeps writing `proyectos.estado` directly.** The jobs depend only on the
  column changing, not on who changes it. `proyectos` updates stay admin-only by RLS
  (`can_admin_inmobiliaria`), and that is not changed here.
- **A project's `inmobiliaria_id` never changes.** The jobs act on a project's records whatever
  their `inmobiliaria_id`. If projects ever move between tenants, revisit this.

## Amendments during build

Made by the build session (2026-10-04) and approved by Bolgunn where marked. No fixed requirement
(R1–R11) changed.

| # | What changed | Why |
| :- | :----------- | :-- |
| A1 | **`supabase/tests/commercial_stage.sql` is edited minimally** (approved by Bolgunn). Lead A's moves in the executive-A and admin-A sections target CS Proyecto A's record (`p_proyecto`), executive A gets a `vinculado` row on it, test 1 reads `lead_project_commercial_stage`, and test 11's `job` row names a project. Every expected error code and every other case is unchanged | The plan required the file to pass unchanged, but it cannot. Its test 1 moves a lead to `reserva` and later `venta_cerrada` without a project, exactly what R1 forbids (`project_required`). Its test 11 inserts a lead-level `job` row expecting `system_actor_check`, and Postgres checks CHECK constraints in name order, so the new `job_project_check` fires first. R1 and R11 both hold: only the plan's way of proving R11 was infeasible. The original file still passes on the schema after the rollback (step 4) |
| A2 | T12 also compares `lead_belongs_to_inmobiliaria` with **PR #101's original body** (recreated inside the test transaction) on every fixture pair, in addition to the "exists over projects" equivalence | Q8 claims the redefinition preserves behaviour; comparing with the old body proves it directly |
| A3 | The new test file grants `select, update on proyectos` to `authenticated` inside its rolled-back transaction, and fixture comunas vary spacing but not case | Hosted Supabase grants table privileges to `authenticated` and lets RLS decide, but the disposable database does not, and T8/T9 must fire the jobs from an admin's RLS-checked update. A disposable cluster created with `--locale=C` does not lower-case `Ñ`, which would make the case-folding comparison environment-dependent |
| A4 | **The commercial-funnel algorithm is renumbered ALG-17 → ALG-18** (decided by Bolgunn, HU 15's author, after IsaiasACF's review). Every reference in this plan, `overallStage.js`, its test and the wiki now says ALG-18. The header comment of migration `20261005120000` still says ALG-17, because that file was already applied in prod and is not edited | HU 18 (PR #111) published `ALG-17-co-debtor-consent-resolution.md` and `ALG-17-cases.json` first. The funnel's document existed only on the local HU 15 branch, which renames it to `ALG-18-commercial-funnel-metrics.md`. ALG-18 is unused on every branch |
