# PLAN — HU13: Seguimiento mensual

- **Story:** `Wiki RutaHogar/UserStories/HU13-seguimiento-mensual.md` · **Actor:** Lead
- **Status:** Planned · Sprint 2 · 3 SP · **Depends on / Required by:** HU4 evaluation flow and ALG-9 are implemented; HU20 may later consume the update-due state
- **Branch:** `feat/hu13-seguimiento-mensual`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first: `docs/algorithms/ALG-11.md` and `docs/algorithms/ALG-11-cases.json`; they are the
  authority for append-only lineage, replay, corrections, ownership, and idempotency.
- Read first: `docs/algorithms/ALG-12.md` and `docs/algorithms/ALG-12-cases.json`; they are the
  authority for frozen goals, progress, regression, and the E2 states.
- Read first: `docs/algorithms/ALG-13.md` and `docs/algorithms/ALG-13-cases.json`; they are the
  authority for observed projections and the requirement to execute real scoring, ALG-9, and
  project-fit.
- Read first: `supabase/schema.sql`, `frontend/src/services/evaluationService.js`, and
  `frontend/src/services/getScoringHistory.js`; they expose the current mutable persistence paths
  that this story must retire for evaluations and tracking.
- Read first: `backend/app/scoring.py`, `backend/app/scoring_engine/improvement_plan.py`,
  `backend/app/scoring_engine/purchase_capacity.py`, and
  `backend/app/scoring_engine/project_fit.py`; these remain the normative engines and must be
  invoked, not copied.
- Stop and report if the Build would need a new financial threshold, a fixed projection horizon,
  a guessed verification predicate for a goal, or a second implementation of scoring/capacity/
  project-fit.
- Stop and report if a current scoring action cannot be frozen as either a typed verifiable goal
  or an explicitly non-verifiable goal without interpreting free text.
- Stop and report if the database transaction cannot insert the evaluation, scoring history,
  tracking event, baseline, and baseline goals as one all-or-nothing operation.
- Stop and report if `feat/scoring-bcch` is required to make the HU13 core work. That branch is a
  future integration dependency, not a source of files or logic for this Build.

## Goal

Allow a Lead to open **Mi progreso** from Plan de mejora, submit partial financial updates (better
or worse), and see an immutable history from the first valid evaluation: score and classification,
financial variables, frozen baseline goals and their progress, a complete timeline with correction
audit, and an observed-data projection of the first date on which the frozen housing objective is
actually `compatible`. The feature must preserve the provenance of every real evaluation, keep
derived projections out of history, and work without BCCh or AI-based numeric decisions.

## Approach & decisions

Introduce a small tracking domain behind authenticated backend endpoints. PostgreSQL stores only
append-only source facts and frozen baseline definitions; pure Python code reconstructs the active
line and runs ALG-11/12/13, while the frontend consumes their results without rebuilding financial
rules in JavaScript. A single database RPC, called by the authenticated backend, is the transaction
boundary for every real evaluation and its related tracking records.

| Decision | Rationale |
| :------- | :-------- |
| Add `tracking_plans`, `tracking_events`, and `improvement_goal_events`; extend `improvement_goals` instead of creating a second goals table | The current schema has no baseline/root or lineage. Reusing `improvement_goals` preserves its role while giving tracked goals a stable identity and frozen quantitative contract. |
| Store both the submitted presence-preserving patch and the complete snapshot as recorded | The patch is required to replay corrections; the stored snapshot is required for immutable audit. Reconstructed snapshots are derived views and never overwrite the recorded snapshot. |
| Represent `previous` and `correction_of` as self-references; represent `annuls` as the deterministic result of correction resolution | This maps ALG-11 semantics directly without maintaining a mutable `active` flag. The winning correction is selected by `(recorded_at, event_id)`. |
| Keep one immutable HU13 baseline per user, rooted at the first valid evaluation/plan in the new flow | The Grill froze the original plan and excluded legacy backfill. Later evaluations must not regenerate the baseline. |
| Freeze both raw plan representations for audit, but normalize goals only from `structured_improvement_plan` | The structured representation contains quantitative fields. Legacy `improvement_plan` text may be displayed as source context but is not a normative progress contract. |
| Assign every baseline goal a database UUID once, plus its source action type and ordinal | Current scoring actions have no stable IDs. Identity must be created once at baseline, not regenerated from later evaluations or mutable text. |
| Persist manual confirmation/revocation as append-only goal events | Non-verifiable goals need user confirmation and historical evidence; verifiable goals remain controlled by current data and cannot be forced to `cumplida`. |
| Replace mutable `scoring_history.events` and evaluation/goal status writes with append-only events | Appending into one JSON array and updating evaluations violate RNF5 and lose concurrency/audit guarantees. Existing rows remain readable but are frozen. |
| Run scoring before persistence, then insert all real records through one RPC transaction | A scoring failure creates nothing; an RPC failure rolls back the evaluation, scoring history, tracking event, baseline, and goals together. |
| Authenticate the user in FastAPI, derive `subject_user_id` from the bearer token, and use a server-only Supabase credential for the transactional RPC | Direct clients cannot forge scores or write history. RLS still restricts reads to the owner, and authenticated roles receive no direct UPDATE/DELETE permission on tracking history. |
| Treat a correction that changes the latest effective state as one command that appends the correction and a new current evaluation in the same transaction | Historical evaluations are not recalculated. The new evaluation is explicitly recorded at correction time and carries current versions/provenance. |
| Compute goal status and projections on read; do not persist their current derived result | Regression can reopen a goal, corrections can alter the active line, and projection versions can change. Persisting these views would create another mutable source of truth. |
| Project only explicitly eligible numeric fields and hold every other field constant | This follows ALG-13 and prevents category, morosidad, employment, market data, or arbitrary numeric-looking fields from being assumed to improve. |
| Add a pure rule-boundary adapter over the current engines | ALG-13 requires a complete finite milestone set. The adapter exposes existing transition points/predicates without copying their values or changing scoring behavior. |
| Select the current user state from reconstructed lineage, never from `evaluations[0]` | `useLeads` currently prioritizes classification over recency. Commercial ranking may keep its own ordering, but it cannot choose the user's current evaluation. |
| Calculate the 30-day visual indicator from the latest active `data_update` and an explicit clock | It is UI state, not an email/push schedule and not the projected prequalification date. `getNextPrequalificationDate` is not reused. |
| Do not store HU13 source data or progress in `localStorage` | Supabase is the source of truth. Offline/demo behavior uses test doubles or a clear unavailable state, never a second production store. |

### Contradiction resolution map

| # | Current contradiction | Concrete PLAN task |
| :- | :-------------------- | :----------------- |
| 1 | `evaluations` permits UPDATE/DELETE | Step 2 removes normal authenticated mutation policies/grants; Step 6 replaces required adjunct changes with append-only evaluation events and removes physical-delete UI/service paths. |
| 2 | `scoring_history` mutates one row | Steps 2 and 6 freeze its `events` JSON and append future lifecycle facts to `evaluation_events`. |
| 3 | No lineage/correction relations exist | Steps 2 and 3 add and enforce `previous_event_id`, `correction_of_event_id`, correction effect, root/baseline, and deterministic replay. |
| 4 | Evaluation and history creation are not atomic | Step 6 introduces one transactional persistence RPC and failure/rollback tests. |
| 5 | Two plan representations disagree | Step 4 freezes both for audit but makes normalized `structured_improvement_plan` the only quantitative source. |
| 6 | `improvement_goals` is outside the real flow | Steps 2 and 4 make its tracked rows immutable baseline definitions and add append-only confirmation events. |
| 7 | The current evaluation can be selected in classification order | Steps 6 and 9 use latest active lineage/evaluation and separate it from staff ranking. |
| 8 | Forms reject genuine worsening | Step 9 replaces monotonic client validation with the domain field contract and sends only present fields. |
| 9 | `buildFinancialInput()` loses `project_goal` identity/metadata | Steps 1 and 6 define a canonical complete snapshot contract that preserves the frozen target project through merge and scoring adapters. |
| 10 | Current projections use local percentages/amounts/caps | Steps 7 and 12 retire those HU13 call paths in favor of ALG-13 OLS plus real engines. |
| 11 | `getNextPrequalificationDate` only adds 30 days | Steps 7, 10, and 12 replace it with the first real `compatible` milestone; the independent 30-day rule remains only an update indicator. |
| 12 | Scoring/algorithm versions are inconsistently retained | Steps 1, 2, and 6 add one provenance envelope copied to each real evaluation event/history record. |
| 13 | Projections risk looking like evaluations | Steps 7 and 8 expose them only as derived GET responses and prohibit persistence in the repository interface. |
| 14 | Corrected history must leave metrics but remain auditable | Steps 3, 8, and 10 expose separate active and audit views; tests prove excluded records cannot feed ALG-12/13 or charts. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | Yes, only through an adapter that invokes existing deterministic scoring and exposes existing rule boundaries. Implements ALG-11, ALG-12, and ALG-13; consumes ALG-9 unchanged. ALG-8 and ALG-10 are not consumed. No score weight, threshold, capacity constant, project-fit predicate, or ALG document changes. |
| 2 | Needs RLS / multi-tenant scoping? | Yes. Every new table has RLS. Owners may read their own rows; no client may update/delete immutable history; transactional writes occur through the authenticated backend after deriving the owner from the token. Cross-user references are rejected in both service and database constraints/RPC validation. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes. Add one forward migration, a matching rollback, and the same final state in `supabase/schema.sql`. The PR merger applies the reviewed migration manually to hosted Supabase and records the result, per `docs/database.md`. No legacy backfill. |
| 4 | Changes the `POST /score` contract? | No. `POST /score` remains frozen. HU13 calls the same internal deterministic scoring service through a story-local adapter and adds separate `/tracking` endpoints. |
| 5 | Consent / privacy impact? | Yes: more financial states and correction history are retained. Existing explicit consent remains required before the baseline. Responses are owner-scoped, logs must omit financial payloads/tokens, and legal ARCO erasure remains a separate privileged process rather than a user history correction. No new external sharing, AI decision, email, or push. |

## Entities

### Database

The Build creates a dated migration such as
`supabase/migrations/20260920_hu13_immutable_tracking.sql`, its matching
`supabase/rollback/20260920_hu13_immutable_tracking_rollback.sql`, and mirrors the result in
`supabase/schema.sql`. The final timestamp is chosen at Build start after checking for concurrent
migrations.

| Entity | New/changed contract |
| :----- | :------------------- |
| `tracking_plans` (new) | `id`, `user_id`, immutable `baseline_evaluation_id`, `root_event_id`, `baseline_at`, raw `original_plan_snapshot` (structured and legacy representations), frozen `target_project_snapshot`, baseline provenance/algorithm versions, and `created_at`. Enforce one active HU13 baseline per user and same-owner references. No normal UPDATE/DELETE. |
| `tracking_events` (new) | `event_id` UUID primary key/idempotency key, `plan_id`, `user_id`, `event_kind` (`baseline`, `data_update`, `evaluation`, `correction`), `effective_at`, authoritative `recorded_at`, non-empty `reason`, presence-preserving `patch`, immutable `recorded_complete_snapshot`, `previous_event_id`, `correction_of_event_id`, `correction_effect` (`replace`, `annul`), optional `evaluation_id`, canonical request fingerprint, algorithm version, and provenance. Self-references must remain in the same plan/user; indexes support plan/user, effective order, audit order, and correction lookup. No mutable `active` flag. |
| `evaluation_events` (new) | Append-only lifecycle facts currently written into `evaluations` or `scoring_history.events`: acceptance, narrative generation, housing-plan metadata, or other non-core annotations. Contains event ID, evaluation/user IDs, kind, immutable payload, effective/recorded timestamps, and provenance. It never changes the core evaluation snapshot. |
| `improvement_goals` (changed) | Existing ID becomes the stable goal identity. Add nullable legacy-safe references to `tracking_plan_id` and `baseline_event_id`, `source_action_type`, `source_ordinal`, `metric`, `goal_type`, `direction`, typed `initial_value`, typed `target_value`, `unit`, `target_at`, `verification_kind`, `verification_source`, and definition version. New tracked rows require a complete frozen contract; legacy rows remain readable and are not backfilled. Tracked rows are insert-once and their effective status is derived, not updated in `status`. |
| `improvement_goal_events` (new) | Append-only owner confirmations/revocations for non-verifiable goals: event ID, plan/goal/user IDs, `confirmed`, effective/recorded timestamps, reason, and source event. Direct confirmation of a verifiable goal is rejected before insert. |
| `evaluations` (changed policies/use) | Existing rows remain. Remove ordinary user UPDATE/DELETE paths, preserve the full financial input and result provenance, and create every future evaluation as a new row. If needed, add explicit provenance columns rather than relying on lossy normalization. Widen only existing checks that currently cannot store a valid engine classification such as `Requiere antecedentes`; do not map it to `Bajo`. |
| `scoring_history` (changed policies/use) | Existing rows and legacy `events` JSON remain immutable. Remove UPDATE policy/use; each real evaluation still receives one immutable scoring history row with score, component scores, classification, algorithm/scoring version, channel, and complete input/result snapshots. |

`annuls` is a derived set, not a column maintained by UPDATE. A SQL view may expose safe ordered source
rows, but the authoritative active-line resolution stays in the tested ALG-11 pure module. Database
constraints/RPC validation reject missing, cyclic, cross-plan, and cross-user references; a plan-row
lock serializes competing appends. Exact idempotent retries return the existing command result;
reuse of an event ID with a different canonical payload returns a conflict.

All new tables enable RLS. Owner SELECT uses `auth.uid() = user_id`; authenticated roles have no
direct UPDATE/DELETE on immutable records. Direct INSERT is also withheld where it could forge
evaluations or provenance. The backend verifies the Supabase bearer token, derives the owner rather
than accepting it from JSON, and invokes narrowly granted RPCs with the server credential. The RPC
rechecks same-owner relations and performs the transaction. Service secrets stay in environment
configuration and never enter frontend code, fixtures, logs, or documentation.

No legacy backfill is performed. Existing evaluations, goals, and scoring history remain readable
as pre-HU13 data; the first valid evaluation/plan created through the new command establishes the
new normative baseline. Rollback removes the RPCs, new policies/constraints, tables, and added
columns and restores the prior policies. Because that discards HU13 event data, it is safe only
before real HU13 use or after an explicit export; after production use, prefer a forward fix. The
rollback is rehearsed against a disposable/local Supabase database before hosted migration.

### Backend contracts and modules

Probable files (adjust only to match an existing package convention discovered at Build start):

- `backend/app/tracking/contracts.py`: Pydantic presence-preserving requests/responses and the
  financial field contract. It must use field-set information so omitted and explicit `null` remain
  distinct.
- `backend/app/tracking/lineage.py`: pure ALG-11 implementation; no database, clock, random ID, or
  scoring calls.
- `backend/app/tracking/goal_contract.py`: one-time conversion of structured scoring actions into
  immutable typed goals. It copies values/predicates already emitted or referenced by current code;
  it never parses prose or invents a comparator.
- `backend/app/tracking/goal_progress.py`: pure ALG-12 implementation.
- `backend/app/tracking/projection.py`: per-variable OLS, sufficiency/direction checks, provenance,
  and material milestone search from ALG-13.
- `backend/app/tracking/scoring_adapter.py`: invokes deterministic `calculate_score` with AI off,
  consumes its ALG-9/project-fit outputs once, and preserves `project_goal` and market context.
- `backend/app/scoring_engine/rule_boundaries.py`: a behavior-preserving adapter over constants and
  predicates already owned by scoring, ALG-9, and project-fit. If an inline threshold must be
  exposed, move it to one shared named constant with characterization tests; do not duplicate or
  alter its value.
- `backend/app/tracking/repository.py`: reads immutable source sets and calls transactional RPCs;
  it has no business calculations and exposes no method for persisting projections.
- `backend/app/tracking/service.py`: authenticates ownership context, orchestrates pure functions,
  scoring, and persistence, and maps domain failures to controlled errors.
- `backend/app/tracking/routes.py` and `backend/app/main.py`: thin HTTP wiring only.
- `backend/requirements.txt`: add only the reviewed client/auth dependency required to validate a
  Supabase token and call RPCs; pin it consistently with project policy, without embedding keys.

The canonical provenance envelope contains at least the tracking algorithm version, current
scoring/algorithm version, ALG-9 capacity version and assumptions, project-fit/scoring runner
version, market snapshot/assumptions available at evaluation time, source event IDs, and cutoff.
Historical envelopes are copied, never reconstructed from current settings.

### Endpoints

All endpoints require `Authorization: Bearer <Supabase access token>` and infer the user from it.
They never accept an authoritative `user_id` in the body.

| Method and path | Request | Response / behavior |
| :-------------- | :------ | :------------------ |
| `GET /tracking` | Optional explicit `as_of`; no body | Baseline, latest active complete snapshot/evaluation, summary since baseline, frozen goals with ALG-12 results, update-due inputs, and links/cursors for history. Returns an empty/not-started state when no HU13 baseline exists. |
| `GET /tracking/history?view=active\|audit&cursor=...` | View and pagination cursor | Deterministically ordered active effective states or complete audit records. Audit includes replaced/annulled source records and relations; active excludes them. |
| `POST /tracking/events` | `event_id`, `event_kind` (`data_update` or `evaluation`), `effective_at`, non-empty `reason`, optional `previous_event_id`, and presence-preserving `patch`. A data update requires at least one present field; reevaluation may use an empty patch. | Merges server-side against the latest effective snapshot, validates the complete state, executes real scoring, and atomically appends evaluation/history/tracking records. The first complete valid request also creates baseline and frozen goals. Exact replay returns the original response; a changed payload with the same ID returns `409`. |
| `POST /tracking/events/{target_event_id}/corrections` | New `event_id`, `effective_at` for the command, reason, `correction_effect` (`replace` or `annul`), and replacement patch when required | Appends a correction without rewriting the target. If latest effective state changes, the same command appends a separately identified current evaluation with current provenance; no prior evaluation is recalculated. |
| `POST /tracking/goals/{goal_id}/confirmations` | `event_id`, `confirmed`, `effective_at`, reason | Appends confirmation/revocation only for an owner and only when the frozen goal is non-verifiable. Verifiable contradiction returns controlled validation error and creates no row. |
| `GET /tracking/projection?as_of=...` | Explicit cutoff; frozen project comes from baseline | Returns ALG-13 `projected`, `already_compatible`, or `not_projectable`, including causes, observations, exclusions, milestones, versions, and assumptions. It never writes an evaluation or event. |

Controlled HTTP errors are: `401` invalid/missing token; `403 owner_mismatch`; `404` unknown
plan/event/goal in the owner's scope; `409 idempotency_conflict` or `lineage_conflict`; `422`
invalid/incomplete patch, invalid lineage, invalid correction, or manual confirmation incompatible
with a verifiable goal; and `503` missing/unavailable persistence configuration. A mathematically
valid `not_projectable` result is a successful `200`, not an infrastructure error.

### Frontend surface

- Add `frontend/src/features/tracking/ProgressPage.jsx` and focused presentational components for
  current summary, baseline comparison, goals, timeline, projection, complete history, and
  correction audit.
- Add `frontend/src/features/tracking/UpdateFinancialDataForm.jsx`. Form state distinguishes
  untouched, supplied value, and explicit clear; serialization omits untouched keys and sends
  `null` only for fields whose backend contract permits it. Remove savings-up/debt-down-only
  validation and display worsening values honestly.
- Add `frontend/src/services/trackingService.js` for authenticated HTTP calls and response/error
  normalization. No score/progress/projection math belongs here.
- Add small pure display helpers under `frontend/src/lib/tracking/`, including
  `isUpdateDue(lastActiveUpdateAt, asOf)` with the closed 30-day rule and injected time for tests.
- Add **Mi progreso** from the existing Plan de mejora surface and route it as
  `/plan-mejora/progreso` through the application's current routing pattern. Do not redesign other
  navigation.
- Summary shows latest score/classification, change from baseline, project-fit/capacity, primary
  variables, and last update. Timeline charts primary score/income/debt/savings and lets secondary
  snapshot fields be inspected without treating them as projection inputs.
- Goals show initial/current/target, percentage, remaining value/condition, action state, temporal
  state, prior completion/regression evidence, and a confirmation action only when non-verifiable.
- History defaults to active records; an explicit audit view shows corrections, targets, reasons,
  recorded/effective dates, and replaced/annulled relations. Audit-only rows never enter chart
  series.
- Projection shows the estimated first compatible date only for `projected` or the cutoff for
  `already_compatible`; otherwise it shows the explicit cause and observation sufficiency. It is
  labeled derived and is never presented as a completed evaluation.
- At 30 elapsed days from the latest active `data_update`, show a visual update-pending indicator
  and CTA. Do not send email/push and do not use that date as a compatibility estimate.
- Replace HU13 uses of `financialTracking.js`, `monthlyPlanService.js`, and
  `getNextPrequalificationDate`; do not preserve their local percentage, amount, cap, or fixed-date
  projections. Keep unrelated simulation/catalog behavior outside this story.
- Stop using `evaluations[0]` as the user's current state. Obtain the current state from `/tracking`;
  keep commercial staff ranking in its own selector. Remove ordinary evaluation deletion from the
  user UI. ARCO remains separately privileged.

## Algorithms

Referenced, never restated:

- `ALG-11` — implemented as-is in the pure lineage layer; no changes or new numbers.
- `ALG-12` — implemented as-is in the pure baseline-goal layer; the closed tolerance is already
  documented there and is not redefined by this PLAN.
- `ALG-13` — implemented as-is in the pure projection layer; no fixed horizon or score trend.
- `ALG-9` — consumed unchanged for purchase capacity through the existing scoring orchestration.
- `ALG-8` — reviewed but not consumed; benefit eligibility is not HU13's compatibility predicate.
- `ALG-10` — reviewed but not consumed; commercial affinity ranking is outside user progress.

**Local logic** (no ALG number, story-local): normalization of one structured baseline action into
an immutable typed goal; exact 30-day update-due presentation; HTTP/auth/error mapping; pagination;
and adapters that expose existing scoring boundaries without defining financial rules.

## Scope

**In:** immutable owner-scoped tracking; complete snapshots from partial updates; genuine
improvements and regressions; baseline and typed goals frozen from the first valid flow; score,
classification, variables, capacity and project-fit history; append-only corrections and audit;
ALG-12 goal/action/temporal progress; ALG-13 projection and explicit `not_projectable` states;
**Mi progreso** summary, timeline, history, update form, projection, and 30-day visual indicator;
RLS, atomicity, idempotency, version provenance, schema/rollback synchronization, and E1–E4 evidence.

**Out:** BCCh fetching or code from `feat/scoring-bcch` (future integration); recalculating old
evaluations; legacy-user backfill; physical user deletion of individual history rows; fraud labels;
what-if simulation; email/push reminders (HU20); AI-generated numeric decisions; new scoring,
capacity, or project-fit rules; catalog affinity/ALG-10; benefit eligibility/ALG-8; and unrelated UI
or tenant-model redesign.

## Steps

1. **Freeze contracts and create the normative test harness.**
   - Files: new `backend/app/tracking/__init__.py`, `backend/app/tracking/contracts.py`,
     `backend/tests/tracking/conftest.py`, `backend/tests/tracking/test_alg11_cases.py`,
     `test_alg12_cases.py`, and `test_alg13_cases.py`.
   - Change: define typed event/snapshot/goal/projection/provenance contracts, preserve Pydantic
     field presence, and load all three JSON case files without translating expected business
     values. Define the allowlist/domain/nullability metadata from the existing score input model;
     include the full frozen `project_goal` rather than the current lossy frontend whitelist.
   - Tests: case-file schema/unique-ID validation; omitted-versus-null serialization; complete
     baseline validation; provenance round-trip; no implicit clock/AI/randomness in pure contracts.
   - Done when: all 44 ALG cases are collected as individually named tests and fail only because
     their pure implementations do not exist yet; contracts cannot silently drop project metadata.

2. **Add append-only persistence, RLS, and rollback.**
   - Files: new dated migration and rollback under `supabase/migrations/` and
     `supabase/rollback/`, synchronized `supabase/schema.sql`, new
     `supabase/tests/hu13_tracking.sql`, and update `docs/database.md` only if the migration adds a
     new hosted-application caveat not already documented.
   - Change: create/alter the entities above, constraints, indexes, policies, privileges, and
     transactional RPC skeletons. Freeze UPDATE/DELETE on evaluations/scoring history/tracked goals;
     retain read compatibility for legacy rows. Reject cross-owner/self-reference errors and lock
     the plan during append. Do not seed or backfill a baseline.
   - Tests: apply migration from current schema; assert FK/check/unique constraints; owner read;
     other-user denial; direct mutation denial; same-owner valid lineage; exact rollback on a
     disposable database; `node scripts/check-schema-drift.js` with no new unexplained drift.
   - Done when: no authenticated SQL path can UPDATE/DELETE immutable HU13 history, every table has
     RLS, schema and migration agree, and the rollback has been rehearsed without hosted changes.

3. **Implement ALG-11 and immutable repository reads.**
   - Files: `backend/app/tracking/lineage.py`, `backend/app/tracking/repository.py`,
     `backend/tests/tracking/test_alg11_cases.py`, and
     `backend/tests/tracking/test_lineage_invariants.py`.
   - Change: canonical request equality; ownership/lineage/cycle validation; correction slot
     resolution; deterministic active/audit ordering; replay of presence-preserving patches; and
     exclusion/provenance sets. Repository returns unordered immutable source sets and never marks
     a row active or rewrites reconstructed descendants.
   - Tests: all 13 ALG-11 fixtures; permutation/property checks; cross-user/cross-plan references;
     correction chains; equal timestamps; malformed patch atomic rejection; repository mapping.
   - Done when: the same event set always produces the same complete active line, correction audit
     remains intact, and no pure test needs Supabase, network, or current time.

4. **Freeze the first valid plan and normalize stable baseline goals.**
   - Files: `backend/app/tracking/goal_contract.py`, existing
     `backend/app/scoring_engine/improvement_plan.py` only if a behavior-preserving exported
     predicate/reference is needed, and new `backend/tests/tracking/test_goal_contract.py`.
   - Change: atomically copy raw structured and legacy plans, target project, baseline snapshot, and
     provenance; convert each structured action to one typed goal with a generated-once ID, source
     ordinal/type, metric, direction, initial/target values, unit, target date derived from the
     original estimated months where applicable, and explicit verification source. Classify a goal
     as non-verifiable when current code exposes no objective predicate; never infer one from prose.
   - Tests: numeric increase/reduction, boolean/categorical references already available, manual
     goal, stable ID after later evaluations, empty structured plan, duplicate action types, month-
     end target-date arithmetic, and preservation of both raw representations/project identity.
   - Done when: a later scoring result cannot change baseline/goal rows, every verifiable goal points
     to an executable existing field/predicate, and no legacy prose drives numeric progress.

5. **Implement ALG-12 over the frozen contract.**
   - Files: `backend/app/tracking/goal_progress.py`,
     `backend/tests/tracking/test_alg12_cases.py`, and
     `backend/tests/tracking/test_goal_progress_history.py`.
   - Change: calculate action status, temporal status, initial/current/target/remaining values,
     progress percentages, verification decision, and completion/regression evidence from the
     ALG-11 active line and append-only goal events.
   - Tests: all 14 ALG-12 fixtures; exact tolerance boundaries; missing/invalid target dates;
     manual confirmation/revocation; corrected completion excluded from effective evidence; no
     update to goal definitions or current-status columns.
   - Done when: every output is deterministic from explicit inputs and a verifiable goal cannot be
     made `cumplida` against current data.

6. **Make updates, corrections, and real evaluations atomic.**
   - Files: `backend/app/tracking/service.py`, `backend/app/tracking/repository.py`,
     `backend/app/tracking/scoring_adapter.py`, transactional functions in the Step 2 migration/
     schema, `frontend/src/services/evaluationService.js`,
     `frontend/src/services/getScoringHistory.js`, `frontend/src/services/goalsService.js`, and new
     `backend/tests/tracking/test_tracking_transactions.py`.
   - Change: merge patches server-side, invoke current scoring once with AI off, preallocate linked
     event IDs, and commit evaluation + scoring history + tracking event + optional baseline/goals/
     evaluation events in one RPC. Append a current evaluation after a latest-state-changing
     correction without rewriting earlier evaluation results. Replace plan acceptance and similar
     mutable annotations with `evaluation_events`; stop physical-delete and JSON-array append paths.
     Preserve valid engine classifications and full project/market metadata.
   - Tests: forced failure at each insert leaves zero partial rows; exact retry writes once and
     returns same result; changed retry conflicts; concurrent append with stale `previous` conflicts;
     worsening values succeed; explicit null follows field contract; correction produces audit plus
     a new current evaluation but leaves historic snapshots/results byte-identical.
   - Done when: there is one authoritative transaction path for every new real evaluation, no
     normal frontend service mutates/deletes history, and current selection is based on lineage.

7. **Implement ALG-13 with the real-engine milestone adapter.**
   - Files: `backend/app/tracking/projection.py`,
     `backend/app/tracking/scoring_adapter.py`, new
     `backend/app/scoring_engine/rule_boundaries.py`, existing scoring files only for shared-constant
     extraction without value changes, `backend/tests/tracking/test_alg13_cases.py`, and
     `backend/tests/tracking/test_projection_scoring_adapter.py`.
   - Change: select active per-variable observations, fit OLS over all valid observations and
     distinct dates, hold non-projectable fields, construct future states, enumerate all reachable
     material boundaries, and invoke current scoring/ALG-9/project-fit until the first real
     `compatible` result. Return explicit causes and full provenance; expose no persistence method.
   - Tests: all 17 ALG-13 fixtures; characterization tests before/after extracting any shared
     constants; spy asserts score is never extrapolated and runners are called once per material
     state; no arbitrary month/day loop or horizon; repository spy proves zero writes.
   - Done when: `project_fit.status == "compatible"` is the only success predicate, an unreachable
     path terminates with a documented cause, and no threshold is copied into tracking code.

8. **Expose authenticated tracking endpoints and controlled errors.**
   - Files: `backend/app/tracking/routes.py`, `backend/app/tracking/service.py`,
     `backend/app/main.py`, `backend/requirements.txt`, and new
     `backend/tests/tracking/test_tracking_api.py`.
   - Change: add the six endpoint contracts above, token-to-user authentication, cursored history,
     domain-to-HTTP error mapping, and response schemas. Keep controllers free of financial logic.
     Projection GET is read-only; correction and confirmation validate ownership before lookup data
     can leak.
   - Tests: unauthenticated/expired token; owner success; other-user 403/404-safe behavior; invalid
     patch/correction/confirmation; 409 variants; not-started and insufficient-history responses;
     pagination order; unavailable persistence; response snapshot/provenance shape.
   - Done when: API tests can run with fake auth/repository, integration tests can use local
     Supabase, and no route duplicates a formula or accepts a body owner as authoritative.

9. **Add Mi progreso, the summary, and a truthful partial-update form.**
   - Files: `frontend/src/App.jsx`, `frontend/src/components/FinancialTracking.jsx`,
     `frontend/src/components/RegisterMilestone.jsx` (retire or reduce to a wrapper), new files under
     `frontend/src/features/tracking/`, `frontend/src/services/trackingService.js`, and focused
     Vitest files beside them.
   - Change: add the Plan de mejora entry/route, load `/tracking`, render current/baseline summary,
     and serialize only touched form fields. Allow decrease/increase on every domain-valid numeric
     value, make explicit clearing deliberate, keep project identity server-owned, and show all
     controlled errors/accessibility states.
   - Tests: route/CTA; loading/error/not-started; one-field request omits all untouched keys;
     explicit null differs from omission; savings decrease/debt increase/income decrease submit;
     double submit reuses the same event ID; current state does not depend on classification sort.
   - Done when: a user can create the baseline or update one field without client-side merging or
     monotonic restrictions, and the returned server snapshot replaces local assumptions.

10. **Render goals, timeline, projection, history, and correction audit.**
    - Files: remaining components under `frontend/src/features/tracking/`,
      `frontend/src/lib/tracking/series.js`, `frontend/src/services/trackingService.js`, and their
      Vitest tests.
    - Change: display all E1/E2/E3/E4 surfaces; build chart series only from `view=active`; expose
      audit records separately; provide correction action/reason flow; show ALG-12 amounts and
      statuses; present projection/date or explicit empty cause and provenance summary.
    - Tests: active series excludes replaced/annulled rows; audit retains them; completed then
      regressed goal; primary/secondary variable rendering; all temporal/action states; manual
      confirmation only for non-verifiable goals; projection success/already-compatible/all empty
      causes; correction UI refreshes both active and audit views.
    - Done when: the UI cannot mistake audit rows or projected milestones for real observations and
      every server state has a clear accessible presentation.

11. **Add the 30-day visual update indicator.**
    - Files: `frontend/src/lib/tracking/updateDue.js`, its Vitest file, and the progress summary/CTA
      components.
    - Change: compute elapsed time from latest active data-update timestamp and an injected `as_of`;
      show the indicator at exactly 30 days and later, hide before then, and do nothing external.
    - Tests: 29 days 23:59, exact 30 days, later, timezone/ISO boundary, no prior update, correction
      of the latest update, and proof that the value is not displayed as projected compatibility.
    - Done when: the indicator is deterministic and no scheduler, email, push, or history row is
      created.

12. **Retire conflicting HU13 paths and complete integration coverage.**
    - Files: `frontend/src/services/financialTracking.js`,
      `frontend/src/services/monthlyPlanService.js`, `frontend/src/components/MonthlyPlan.jsx`,
      `frontend/src/hooks/useLeads.js`, `frontend/src/App.jsx`, and new end-to-end/integration tests
      under the project's established test locations.
    - Change: remove HU13 dependencies on local projections and `getNextPrequalificationDate`;
      isolate staff classification ranking from current-user selection; ensure no localStorage goal
      state is used; keep unrelated simulator/catalog behavior unchanged.
    - Tests: search/characterization assertion that progress routes import only the tracking service;
      end-to-end baseline → partial worsening → new evaluation → goal regression → correction
      → audit → projection/empty projection; browser reload returns identical server state.
    - Done when: there is one HU13 source of truth and no legacy helper can influence progress,
      projection, or update-due output.

13. **Verify E1–E4 and migration readiness.**
    - Files: tests/evidence produced above and the PR description; no new product behavior.
    - Change: run backend tests, `npm --prefix frontend test`,
      `npm --prefix frontend run build`, schema-drift check, local migration/rollback/RLS suite, and
      a Tier 2 review against hosted Supabase only after approval and with test accounts. Record
      version/provenance examples and screenshots for all four acceptance criteria.
    - Tests/reviewer path: two owned users prove isolation; first evaluation freezes baseline;
      partial worse/better updates; same-ID retry; intermediate correction; manual and automatic
      goals; insufficient and sufficient projection histories; browser timeline/audit/update-due.
    - Done when: every acceptance row below has automated evidence plus the stated reviewer proof,
      no hosted migration is applied by the agent automatically, and rollback/forward-fix ownership
      is recorded for the merger.

## ALG case-to-test map

Each JSON file is loaded directly and parametrized by its case `id`; no case is copied into a
second fixture that can drift.

| ALG | Cases | Concrete automated test |
| :-- | :---- | :---------------------- |
| ALG-11 | 13: `primera_evaluacion_fija_baseline`, `parche_de_un_campo_conserva_el_resto`, `empeoramientos_reales_son_validos`, `correccion_del_ultimo_registro`, `correccion_intermedia_reconstruye_descendientes`, `anulacion_intermedia_omite_su_parche`, `multiples_correcciones_gana_la_ultima_registrada`, `timestamps_iguales_usan_event_id`, `reintento_identico_es_idempotente`, `doble_envio_mismo_id_distinto_payload_es_conflicto`, `omitido_y_null_explicito_son_distintos`, `null_en_campo_obligatorio_rechaza_todo`, `usuario_no_puede_operar_sobre_otro_usuario` | `backend/tests/tracking/test_alg11_cases.py::test_alg11_case[<id>]`; ownership, persistence immutability, and transaction consequences are repeated at repository/RLS/API level. |
| ALG-12 | 14: `meta_ya_cumplida_en_baseline`, `objetivo_igual_al_inicial_sin_division_por_cero`, `aumento_con_progreso_parcial_atrasado`, `reduccion_con_progreso_parcial_en_trayectoria`, `limite_superior_mas_cinco_pp_sigue_dentro`, `limite_inferior_menos_cinco_pp_sigue_dentro`, `regresion_reabre_meta_sin_borrar_evidencia`, `meta_booleana_verificable`, `meta_categorica_no_infiere_orden`, `dato_insuficiente_no_inventa_progreso`, `usuario_no_fuerza_meta_verificable`, `meta_no_verificable_confirmada_manualmente`, `condicion_desaparece_despues_de_cumplirse`, `condicion_reaparece_y_vuelve_a_cumplida` | `backend/tests/tracking/test_alg12_cases.py::test_alg12_case[<id>]`; confirmation ownership and append-only evidence are repeated in goal-event API/RLS tests and representative states in frontend tests. |
| ALG-13 | 17: `cero_observaciones`, `una_observacion`, `dos_fechas_validas_permiten_regresion`, `misma_fecha_repetida_no_es_suficiente`, `pendiente_cero_no_inventa_fecha`, `tendencia_contraria_al_objetivo`, `ahorro_creciente_se_proyecta`, `deuda_decreciente_se_proyecta_hasta_dominio`, `serie_no_monotona_usa_todas_las_observaciones`, `correccion_excluye_outlier_y_cambia_tendencia`, `objetivo_ya_compatible_hoy`, `proyecto_objetivo_ausente`, `datos_incompletos_impiden_ejecutar_reglas`, `cruce_de_threshold_recalcula_score_real`, `capacidad_suficiente_no_basta_si_project_fit_no_compatible`, `bloqueador_no_proyectable_impide_compatibilidad`, `versiones_historicas_distintas_no_recalculan_historia` | `backend/tests/tracking/test_alg13_cases.py::test_alg13_case[<id>]`; real-engine invocation, boundary completeness, zero persistence, and frontend causes have separate integration tests. |

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — Given an active plan, when the user consults history, then income, employment, debts and savings updates are shown | 1–3, 6, 8–10, 12–13 | All ALG-11 fixtures; SQL append-only/RLS suite; atomic API update test; active versus audit frontend series; reviewer submits partial better and worse values, reloads, and sees complete snapshots without corrected rows in charts. |
| `E2` — Each goal is shown as `adelantado`, `dentro_de_lo_esperado`, or `atrasado` from actual versus expected progress | 4–5, 8, 10, 13 | All 14 ALG-12 fixtures including exact ±5 pp boundaries, automatic/manual verification and regression; goal component tests; reviewer verifies initial/current/target/remaining values and frozen baseline after a new evaluation. |
| `E3` — The estimate updates dynamically from real progress | 7–8, 10, 12–13 | All 17 ALG-13 fixtures; real scoring/ALG-9/project-fit adapter tests; zero-write projection test; reviewer sees either the first real compatible date or an explicit `not_projectable` cause—never a fixed +30-day or linear-score estimate. |
| `E4` — The user sees how eligibility evolves over time | 3, 5–10, 12–13 | Timeline/history UI tests and end-to-end flow show score/classification, capacity, project-fit, primary/secondary variables, goal states, corrections and provenance; corrected events stay audit-only. |
| Closed Grill rule — update pending after 30 days, visual only | 9, 11, 13 | Boundary/timezone unit tests and reviewer clock fixture; no notification/scheduler/network side effect. |
| RNF5 / immutable history | 2–3, 6, 8, 12–13 | SQL denial of UPDATE/DELETE, atomic rollback injection, idempotency/concurrency tests, checksum comparison of prior rows before/after correction, and hosted two-user RLS verification. |

## Risks

- **Story size:** the original 3 SP estimate predates append-only lineage, an authenticated backend
  persistence boundary, and real-engine projection milestones. Keep the steps independently
  reviewable; do not reduce scope by restoring local projections or mutable rows.
- **Boundary completeness:** scoring/project-fit thresholds are not uniformly exported today. A
  characterization-first refactor is required; if a complete boundary provider cannot be built
  without a new rule/horizon, stop rather than approximate ALG-13.
- **Concurrent lineage:** partial updates based on stale state can silently lose intent. The plan
  row lock, `previous_event_id`, canonical idempotency, and 409 retry flow are mandatory.
- **Legacy mutation callers:** plan acceptance, AI narrative retry, goal progress, and delete flows
  currently assume UPDATE/DELETE. Inventory all callers before policy removal so they move to
  append-only events or are explicitly retired without breaking unrelated screens.
- **Raw financial privacy:** complete snapshots increase retained sensitive data. Keep them out of
  logs/errors, return only owner-scoped data, and preserve the separate privileged ARCO process.
- **Hosted-only evidence:** local tests cannot by themselves prove hosted RLS/configuration. The
  merger owns the manual migration and Tier 2 two-user verification.
- **Historical version diversity:** source observations may come from different scoring versions.
  Preserve them as provenance; only projected future states use the explicitly recorded current
  runner version, exactly as ALG-13 requires.

## Assumptions

- The Build environment will provide a server-only Supabase credential and a supported way to
  validate the caller's access token. Without them, tracking endpoints return a controlled `503`;
  they do not fall back to localStorage or unauthenticated writes.
- `feat/scoring-bcch` may later change the market snapshot consumed by a **new** evaluation. HU13
  will accept that snapshot/version through the provenance contract; old events retain their
  original context and are never recalculated. No HU13 core step is blocked on that branch.
- Current test data may start a fresh HU13 baseline. No migration/backfill policy for legacy users
  is part of this story, as explicitly closed in the Grill.
