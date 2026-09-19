# PLAN — SCORING-BCCH: Initial scoring with persisted BCCh snapshots

- **Story:** SCORING-BCCH (user-defined scope; no HU number assigned) · **Actors:** lead, backend operator, evaluation reviewer.
- **Status:** implementation plan; no implementation authorized by this document's creation.
- **Branch:** `feat/scoring-bcch` (already exists).
- **Depends on:** the updated ALG-1/ALG-9 documents and fixtures; Supabase persistence; operational BCCh access. Build starts in a fresh session after the prerequisites below are resolved.

## Technical prerequisites closed — 2026-09-18

- **Exact term source:** `F022.PZCHV.PER50.Z.Z.Z.D`. The official BCCh table *Indicadores Mercado de la Vivienda → Plazo de créditos hipotecarios para la vivienda (meses)* identifies its `Percentil 50` row with that machine series code. The table, selector and captured source attributes are recorded in [OPERATIONS.md](OPERATIONS.md); this is not an inferred code.
- **BCCh transport/authentication:** use the BDE REST endpoint with the backend-only API Key Token as the mandatory `token` URL parameter. The official REST documentation specifies `function=GetSeries` and `timeseries=<series-id>`; the adapter must redactor-log query URLs so the token is never emitted.
- **Refresh topology:** the future backend refresh command is manually executable in local development. Production is a GitHub Actions scheduled workflow, once per day, with `workflow_dispatch` for an operator-run recovery/seed. It invokes the same out-of-band command with backend secrets; it is never an HTTP route and never runs during `/score`.
- **Runtime identifiers proposed for Build:** `ALGORITHM_VERSION = "1.2.0"` and `SCORING_VERSION = "1.2.0"`. Current values are `1.1.0-prep` (engine, explicitly non-functional) and `1.1.0` (orchestrator). This is a backward-compatible but behaviorally material scoring release, so the minor version advances together; `MATCHING_VERSION = "e4-matching-v1"` is unchanged.
- **Gate baseline:** pytest test files, ALG case files, Vitest tests and the schema-drift script exist, but there is no configured pytest dependency/runner, ESLint, Playwright journey, commit-lint, ALG-path gate or general CI workflow. `node scripts/check-schema-drift.js` currently fails on pre-existing schema/migration divergence. Details and the exact status are in [OPERATIONS.md](OPERATIONS.md).

## Start here

Read first:

- [ALG-1](../../algorithms/ALG-1.md) and its linked cases.
- [ALG-9](../../algorithms/ALG-9-purchase-capacity.md) and its linked cases.
- `backend/app/scoring.py`: weighted scoring supersedes the legacy additive score, but legacy findings still affect the response.
- `backend/app/main.py`: request validation, `/score` and `/score/explain`.
- `frontend/src/services/evaluationService.js`: full input/result snapshots already live in `evaluations.financial_data`.

Also read the [handbook](../../HANDBOOK.md), [database procedure](../../database.md), and files named by each step. All repository paths below are relative to the repository root.

Stop and report if a required BCCh statistic cannot be identified with the specified units/provenance, if a fixture contradicts its ALG, or if integrating another consumer requires changing a business rule outside ALG-1/ALG-9. Do not substitute a different statistic, invent market defaults, reinterpret a fixture, or rewrite historical results to proceed.

## Goal

Implement the documented initial score and purchase capacity using a complete, persisted BCCh snapshot resolved by infrastructure. A lead's geographic preferences must not change initial financial scoring. Each completed evaluation retains its actual market inputs and algorithm version, allowing its numeric result to be reproduced without contacting BCCh or recalculating historical evaluations.

## Approach & decisions

Separate market acquisition, snapshot persistence/resolution, and pure financial computation. Refresh market data outside scoring requests; a scoring request reads a validated persisted snapshot and supplies it explicitly to the engine. Reuse the existing evaluation JSON persistence instead of adding a parallel evaluation store.

| Decision | Rationale |
| :------- | :-------- |
| One backend BCCh adapter and a pure snapshot validator | Source units and provenance are normalized once; neither ALG performs network or clock access. |
| Append-only complete snapshots in a new `public.market_snapshots` table | Inspection of `supabase/schema.sql` and migrations found no existing market cache. `evaluations` and `scoring_history` contain personal evaluation data and are not a market cache. |
| No BCCh call from `/score`, including on an empty cache | Avoid per-score external dependencies. A first refresh is a deployment prerequisite; missing usable data has an explicit failure path. |
| Preserve the last valid complete bundle | A failed refresh never publishes a partial bundle, changes its original timestamps, or mixes values from different saved bundles. No new freshness cutoff is introduced. |
| Embed the complete used snapshot in the existing result JSON | Existing `financial_data.result_snapshot`/`result` and history snapshots already preserve added result fields. Reproduction does not depend on a mutable pointer or a retained cache row. |
| Keep initial financial indicators separate from a declared property objective | An income-supported reference is not a property's asking price. Project fit and benefits must not receive a manufactured property price. |
| Preserve successful response fields; add ALG-9 output/assumptions | Existing clients retain their result envelope. Missing market data is an HTTP failure, not a new risk classification. |
| Historical explanation retries use saved result context | The existing `/score/explain` currently recomputes; retrying narrative generation must not run today's algorithm or resolve today's snapshot. |

### BCCh acquisition contract

The adapter must fetch the exact sources already selected in ALG-9:

| Snapshot field | BCCh source | Normalization |
| :------------- | :---------- | :------------ |
| `uf_value_clp` | `F073.UFF.PRE.Z.D` | CLP per UF; retain the observation date. |
| `tasa_anual_uf` | `F022.VIV.TIP.MA03.UF.Z.M` | Annual ratio from the published rate unit; preserve its monthly observation period. |
| `ltv_referencial` | `F034.RPV.PPO.BCCH.Z.Z.T` | Ratio from the published unit; retain its original period, rather than presenting it as a daily observation. |
| `plazo_referencial_anios` | `F022.PZCHV.PER50.Z.Z.Z.D` — Percentil 50 of “Plazo de créditos hipotecarios para la vivienda” | Published months converted to years without truncation. The official-table verification and evidence are recorded in `OPERATIONS.md`; do not replace this source with a different percentile. |

Preserve the complete ALG-9 `source` metadata, per-field `effective_date`/`fetched_at`, original period labels and units, and bundle `effective_date`/`fetched_at`. Select observations according to ALG-9's as-of semantics, not according to a shared fictitious publication date. Schema validation includes finite numbers, allowed domains, required source identity and valid temporal metadata. API error payloads and missing observations are not market values.

Use backend environment secrets for BCCh authentication and existing backend Supabase credential conventions (`SUPABASE_URL`, `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`). The supported REST form is `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?token=<BCCH_API_KEY_TOKEN>&function=GetSeries&timeseries=<series-id>` as documented by [BCCh's API documentation](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/documentacion.html). Never commit secrets, expose them through `VITE_*`, serialize them into `source`, or log credential-bearing requests. BCCh receives series queries, never applicant data.

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | Yes: implement the already updated ALG-1 and ALG-9. Their reference, completeness, snapshot and accepted financial-scope changes are intentional. No further weights, thresholds, caps, classifications or policy numbers change. New runtime versions identify the resulting behavior; historical versions remain intact. |
| 2 | Needs RLS / multi-tenant scoping? | Yes, for the new market table: enable RLS and deny `anon`/`authenticated` access, including writes; only backend service access reads/inserts complete snapshots. Market observations have no tenant or personal data. Preserve existing evaluation/history ownership policies; do not expand staff access or use service credentials to bypass personal-data RLS. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | One new market-cache migration, mirrored in `supabase/schema.sql`, with a matching rollback. No evaluation/history column migration or historical backfill. Per `docs/database.md`, the person merging the PR applies it to hosted Supabase and records evidence in the PR. |
| 4 | Changes the `POST /score` contract? | Minimally: declared term becomes optional while supplied terms retain existing validation; market data comes from infrastructure, not the public request. Keep successful response keys and add the documented capacity fields and full snapshot in assumptions. Keep accepting existing client UF fields for compatibility, but they cannot override the authoritative snapshot. An unavailable usable snapshot returns standard FastAPI HTTP 503 with a `detail` message, no completed score/classification. Existing request validation failures remain validation failures. |
| 5 | Consent / privacy impact? | Preserve existing consent requirements and personal-data handling. Only public market metadata is added to saved results. No applicant data leaves for BCCh; no credentials enter evaluation JSON or browser bundles. AI retry context is limited to the existing narrative purpose, subject to existing consent. |

## Entities and existing contract surfaces

- **New `public.market_snapshots`:** proposed columns `id` (UUID primary key), `snapshot` (JSONB complete ALG-9 bundle), `effective_date` (date) and `fetched_at` (timestamptz). The indexed metadata must agree with the embedded bundle. Basic database checks enforce object/metadata presence; the shared application validator enforces the full contract before insertion and after reading. Rows are immutable in normal operation; refreshes insert, never update old bundles. No client grants or tenant column. No evaluation foreign key is required.
- **Selection:** query persisted candidates in descending `effective_date`, then `fetched_at`, with `id` as a deterministic tie breaker; select the first complete valid bundle. Invalid rows are skipped and reported operationally. The refresh process validates the complete candidate before publishing it; concurrent refreshes cannot make an older as-of bundle supersede a newer one. Repeating a refresh may be deduplicated by exact payload equality without a new business rule.
- **Existing `evaluations`:** continue saving through `createEvaluation`/`buildFinancialDataSnapshot`; the existing JSON retains input, full result and the embedded used snapshot at `financial_indicators.capacidad_supuestos.market_snapshot`. Preserve both existing result aliases. Top-level integer score/classification projections are not the reproduction source; the full JSON is. Do not change their existing constraints as part of this story.
- **Existing `scoring_history`:** preserve the full input/result snapshot and version through `frontend/src/services/getScoringHistory.js`; the existing separate history-write failure behavior is not redesigned.
- **Existing HTTP routes:** adapt `/score` and `/score/explain`; no new refresh endpoint. Use an out-of-band operator command for refresh, suitable for a scheduler. Refresh cadence/hosting must be recorded before Build; it does not define snapshot expiry.
- **Existing historical rows:** no recalculation, synthetic snapshot attachment, or version relabeling. Rows lacking market provenance remain readable as legacy evaluations. Historical numeric reproduction requires the saved algorithm version as well as its inputs/snapshot; the new engine is not an interpreter of every previous version.

## Algorithms

Referenced, never restated:

- [ALG-1](../../algorithms/ALG-1.md) and [cases](../../algorithms/ALG-1-cases.json): implement as documented, including financial-only completeness and the common accepted financial scope.
- [ALG-9](../../algorithms/ALG-9-purchase-capacity.md) and [cases](../../algorithms/ALG-9-cases.json): implement as documented, including annuity, term precedence, validation, output precision and snapshot provenance.

**Local logic:** connector transport, persisted snapshot selection, API error mapping, immutable-result serialization and operational refresh. These do not create another ALG or introduce scoring numbers.

## Scope

**In:** backend market infrastructure; pure scoring integration; additive result metadata; persisted result verification; minimal client request/error wiring; protection against historical recalculation; operational documentation and tests.

**Out:** UI redesign, new matching/benefit policy, new scoring components, bank underwriting, new tenant/authentication models, historical backfills, frontend market connectors, changes to existing consent rules, and unrelated schema drift repairs. Existing dividend previews are not a trusted market snapshot and do not replace the user-declared dividend rule in ALG-1.

## Steps

### 1. Establish executable algorithm contracts and regression baseline

- **Files:** existing `backend/tests/test_purchase_capacity.py`, `backend/tests/test_score_professional.py`, `backend/test_thresholds.py`; new `backend/tests/test_initial_scoring.py`, `backend/tests/golden/` fixtures as required by [golden procedure](../../procedures/golden-payloads.md). Read both ALG case JSON files without changing their decisions.
- **Change:** adapt runners to execute top-level scenarios and nested variants, recursive partial assertions and the documented float tolerances. Dispatch component, financial-scope and infrastructure scenarios at their actual boundaries. Provided component blockers are test inputs, not expectations for blocker detection. Capture current response baselines before implementation, then document each intended difference against ALG-1/ALG-9; never blanket-regenerate expected outputs to make failures disappear.
- **Tests:** enumerate every fixture scenario/variant and report coverage; preserve boundary, blocker, complementary-income and no-AI regressions. Separate stable numeric outputs from nondeterministic narrative text. The golden procedure's old comuna-reference descriptions are legacy baseline descriptions, not authority over the updated ALGs.
- **Dependencies:** none. New target tests are expected to fail until the later implementation steps.

### 2. Define and validate the snapshot; implement the BCCh adapter

- **Files:** new `backend/app/market_data/__init__.py`, `snapshot.py`, `bcch.py`; new `backend/tests/test_market_snapshot.py`, `test_bcch_connector.py`; new `backend/.env.example` with placeholders only.
- **Change:** create a pure normalized snapshot validator and a backend-only adapter for the sources above. Inject HTTP transport and acquisition/as-of time into tests. Validate source response status, unit conversion, observation dates, period labels and the complete bundle. Set finite transport timeouts; record chosen operational settings in the runbook rather than inventing financial thresholds. Do not import connector code into `scoring_engine`.
- **Tests:** recorded public response fixtures for all selected series, fractional term preservation, percentage/ratio conversion, mixed observation frequencies, zero rate, malformed/nonfinite values, invalid LTV/UF/term, missing provenance, unavailable observations, authentication failures and timeouts. Fixtures contain neither credentials nor personal data.
- **Dependencies:** step 1; the verified P50 binding and REST token contract recorded in `OPERATIONS.md`. No substitution if verification fails.

### 3. Persist complete snapshots and provide an out-of-band refresh

- **Files:** new `supabase/migrations/<timestamp>_market_snapshots.sql`, `supabase/rollback/<timestamp>_market_snapshots_rollback.sql`; existing `supabase/schema.sql`, `docs/database.md`; new `backend/app/market_data/repository.py`, `service.py`, `backend/scripts/refresh_market_snapshot.py`, `backend/tests/test_market_snapshot_repository.py`, `test_market_snapshot_service.py`, `docs/stories/SCORING-BCCH/OPERATIONS.md`.
- **Change:** implement the table/RLS described above and the repository using backend Supabase access (the existing backfill script demonstrates its environment conventions; do not import or execute that script). Refresh fetches and validates a complete candidate, inserts it, and reports success only after persistence succeeds. Resolution reads the latest valid persisted bundle without contacting BCCh. Refresh failure preserves the previous bundle and reports the failed refresh; an empty/unusable store yields a typed availability error. A database outage without an accessible validated bundle also fails explicitly.
- **Tests:** successful round trip, first refresh, failed refresh with/without prior data, partial acquisition rejection, corrupt newest row with older valid fallback, ordering/concurrent publication, exact provenance preservation, insert failure and read failure. In an isolated Supabase database verify service access and denial of anonymous/authenticated read/write access. Validate schema/migration parity and rollback.
- **Dependencies:** step 2 and existing Supabase infrastructure. Record refresh owner, execution host, cadence and credentials setup in the runbook; use the documented daily GitHub Actions scheduler and do not add a public refresh route.

### 4. Implement the pure financial dependency chain

- **Files:** `backend/app/scoring_engine/indicators.py`, `purchase_capacity.py`, `components.py`, `property_value.py`, `constants.py`; tests from step 1, plus focused regression tests in `backend/tests/test_initial_scoring.py`.
- **Change:** centralize accepted primary/complementary income and debt normalization in a shared pure helper in `indicators.py`. Calculate that scope first, then call pure ALG-9 with the explicit validated snapshot, then finish the initial savings indicators using ALG-9's unrounded income-supported reference. Apply ALG-1 components afterwards. Preserve declared-term presence for completeness independently of the effective fallback term. Preserve the pre-cap requested term for existing age findings. Keep no-income/zero-capacity handling distinct from invalid-snapshot diagnostics.
- **Change:** make `property_value.py` resolve explicit property objectives with injected UF only; remove comuna/default-average resolution. Keep objective-price indicators separate for existing project-fit/benefit consumers. Remove market defaults and obsolete market dates from `constants.py` and its callers; retain genuine internal policy constants, including the assisted scenario rules. Implement ALG-9's added outputs and precise assumptions without fetching, reading a clock, or rounding intermediate references.
- **Tests:** all pure ALG scenarios/variants; same input plus same snapshot gives the same result; changed snapshot changes only expected derived outputs; comuna and second-comuna changes cannot affect initial scoring. Cover declared/fallback/fractional terms, accepted/rejected complement with its debt, zero debt, missing fields, nonpositive renta capacity, savings/renta limitation and invalid snapshot. Assert financial completeness does not gain points from a comuna or property price.
- **Dependencies:** steps 1–2. No live BCCh or database dependency in these tests.

### 5. Integrate the orchestrator and preserve adjacent consumers

- **Files:** `backend/app/scoring.py`, `backend/app/scoring_engine/improvement_plan.py`; inspect callers in `blockers.py`, `project_fit.py`, `housing_benefits.py`, `explanations.py` and `commercial_priority.py` and edit only adapters if required; `constants.py` for the runtime algorithm version; existing professional-score and benefits tests.
- **Change:** require an explicitly resolved snapshot in the scoring computation; follow the dependency order in ALG-1. Remove `PRECIOS_REFERENCIA_UF`, duplicated UF defaults, and the old fallback-indicator path that could bypass the new chain. All remaining legacy risk, patrimony and recommendation paths must use the shared financial scope and declared amounts; geographic preference cannot manufacture a price or influence the score. Keep the weighted aggregation as the sole numeric authority.
- **Change:** feed initial blockers/components the financial reference; feed objective-dependent fit/benefit logic a separate internal indicator view based on an actual declared property, retaining existing unknown-objective behavior. Do not reinterpret income capacity as a declared property or merge objective findings into initial scoring. Use accepted total debt consistently in the existing improvement-plan calculations. Preserve response fields and AI-independent numerical behavior. Assign new runtime scoring/engine versions, document their mapping to these ALGs, and leave historical version values untouched.
- **Tests:** whole-score comuna independence, complementary-debt consistency across outputs, no declared price influence on initial component points, unchanged objective/benefit policy for explicit properties, unknown property handling, legacy recommendation independence from comuna, blocker caps/classifications, and equality with AI enabled/disabled for numeric outputs. Search confirms no reachable initial-scoring reference to `PRECIOS_REFERENCIA_UF` or hardcoded market defaults remains.
- **Dependencies:** step 4. Stop if preserving an adjacent consumer requires an undocumented policy change.

### 6. Wire `/score` to persisted resolution and controlled failure

- **Files:** `backend/app/main.py`; `backend/tests/test_score_professional.py`; new `backend/tests/test_score_market_snapshot.py`; inspect existing `api/score.py`, `backend/api/index.py` deployment entry points without creating another scoring endpoint.
- **Change:** inject the snapshot resolver at the request boundary, outside pure scoring. Keep synchronous I/O off the async event loop. Relax only required-term presence; retain existing validation for supplied user terms. Client market fields cannot override the server-selected bundle. Map absence of usable persisted data to HTTP 503 using the existing JSON `detail` error shape; stop before calculation, AI generation and successful result delivery. Do not run BCCh fetches or market refreshes on requests.
- **Tests:** normal successful envelope plus new ALG-9 fields; omitted term accepted; supplied invalid term still rejected; server snapshot wins over supplied UF; empty store/unavailable data yields no score/classification; fallback with an unchanged old bundle; request does not call BCCh; consent and existing validation regressions. Assert the exact snapshot passed to the engine is the one returned in assumptions.
- **Dependencies:** steps 3 and 5.

### 7. Preserve evaluation snapshots and prevent historical recalculation

- **Files:** `frontend/src/services/evaluationService.js`, `frontend/src/services/getScoringHistory.js`, `frontend/src/App.jsx`; `frontend/src/components/ScoreForm.jsx` only if needed for existing error display; `backend/app/main.py`; `backend/scripts/backfill_capacity.py`, `backend/tests/test_backfill_capacity.py`; new `frontend/src/services/__tests__/evaluationSnapshot.test.js`, `backend/tests/test_score_explain_snapshot.py`. Inspect `vercel.json` for routing the existing explanation endpoint.
- **Change:** retain the full used bundle in the existing input/result snapshot paths through create, normalize, history and UI result normalization. Add only wiring needed where a path filters fields. A failed `/score` must never trigger evaluation/history creation, replace the prior successful result, or display an invented zero; reuse existing error UI.
- **Change:** adapt existing `/score/explain` and its caller to submit the saved result context for narrative generation. Validate/allowlist that context and preserve existing consent validation. The route must not invoke `calculate_score` or resolve market data; any score/classification returned for compatibility is copied from the supplied saved context and is never persisted as a new authoritative evaluation. This narrative route does not authenticate or certify client-supplied numeric results. Missing historical context receives a controlled validation error rather than a recalculation. Continue saving only the regenerated text fields through existing ownership-protected services.
- **Change:** disable the old capacity backfill's mutation path and make an attempted application fail explicitly; do not run it. Legacy evaluations without a snapshot remain viewable. If a user explicitly requests a new evaluation, create a new result using the then-current persisted snapshot instead of mutating the old one.
- **Tests:** save/load deep equality of snapshot and numeric result; successful evaluation plus history serialization; history-write failure does not lose embedded provenance; legacy row read without synthetic metadata; 503 makes no persistence calls; explanation retry performs no scoring, market lookup or numeric update; backfill refuses mutation. Verify the existing explanation route works through the deployment rewrite without introducing a new business endpoint.
- **Dependencies:** step 6. Frontend work is transport/persistence/error wiring only, with no UI redesign.

### 8. Verify contracts, deploy prerequisites and review evidence

- **Files:** tests and operational documents above; `docs/procedures/golden-payloads.md` only to align obsolete comuna-based descriptions; this PLAN if inspection during Build changes a technical decision.
- **Change:** finish the acceptance evidence below; document refresh execution and recovery, migration application, initial seeding, secret configuration and the runtime version. Apply migration and seed a validated snapshot before enabling the new scoring path. Rollback requires coordinated application rollback; retain embedded evaluation snapshots and export cache data before any table-dropping rollback. No historical result rewrite is part of either direction.
- **Tests:** run backend pytest suites, algorithm fixtures and golden checks; `npm test` and `npm run build` from `frontend`; `node scripts/check-schema-drift.js` from the repository root. Record unrelated pre-existing drift separately. Measure engine coverage instead of claiming fixture coverage proves every branch. Exercise the three handbook browser journeys, including scoring/persistence/retry behavior where applicable. Check the actual availability of eslint, Playwright, commit lint and ALG-path gates: configure missing required gates or explicitly report them as unresolved review blockers; do not claim nonexistent tooling passed.
- **Dependencies:** steps 1–7, isolated database validation, production refresh prerequisites and a reviewer other than the author. Obtain scoring/API review under the handbook before merge.

## Acceptance criteria map

| Criterion | Steps | Evidence required |
| :-------- | :---- | :---------------- |
| ALG-1/ALG-9 implemented without additional numeric policy changes | 1, 4, 5 | Every JSON scenario/variant exercised; documented golden differences and boundary regressions. |
| Exact BCCh sources, units and honest per-field provenance | 2 | Recorded response parser tests and verified P50 binding. |
| Complete persisted cache; no BCCh call per score | 3, 6 | Repository/service tests and endpoint test with a forbidden BCCh mock. |
| Outage uses the last valid bundle; no bundle means controlled failure | 3, 6, 7 | Exact fallback equality; 503 and no engine/AI/persistence calls. |
| Every new saved evaluation keeps its actual market inputs | 6, 7 | Response-to-evaluation/history round trip with deep snapshot equality. |
| Pure capacity and reproducible numeric outputs | 4, 5 | Same input/snapshot/version equality without clock, network or AI. |
| No comuna/second-comuna/average-price influence on initial score | 4, 5 | Preference-variation integration tests and removal of the comuna-price table. |
| Complement scope and declared/fallback term semantics agree | 4–6 | Financial-scope fixtures, term fixtures and completeness assertions. |
| Existing property objectives and benefits retain their rules | 5 | Explicit-property and missing-property regression tests. |
| Historic evaluations are immutable numerically | 7 | Explanation retry, legacy-read and backfill-refusal tests. |
| Secrets stay backend-only; cache does not broaden personal access | 2, 3, 8 | Env/log/bundle review and isolated-database RLS tests. |
| API compatibility and unchanged interface design | 6–8 | Contract tests, existing browser journeys and reviewer evidence. |

## Findings, risks and prerequisites before Build

No unresolved contradiction between the updated ALG-1 and ALG-9 was found. Their documented departures from current product code are intentional implementation work: comuna-based reference prices, financial-completeness bonuses, inconsistent complementary debt, hardcoded market inputs, and the current orchestration order. Two additional current paths conflict with historical immutability: `/score/explain` recalculates, and `backfill_capacity.py` can overwrite old capacity; step 7 addresses both.

Operational decisions now recorded for Build:

- The verified P50 machine identifier is `F022.PZCHV.PER50.Z.Z.Z.D`; the REST API receives an API Key Token in `token` and `GetSeries` receives the code in `timeseries`. The precise evidence and request shape are in `OPERATIONS.md`.
- Development refresh is a manual backend command. Production refresh is a once-daily scheduled GitHub Actions workflow using backend-only secrets, with `workflow_dispatch` for recovery/initial seed. The Build implements the workflow and records the accountable owner, timeout/retry values and monitoring destination; those operational details do not create financial thresholds.
- Assign `ALGORITHM_VERSION = "1.2.0"` and `SCORING_VERSION = "1.2.0"` when the implementation changes behavior. Do not alter historical saved version values; fixture document labels are not runtime versions.
- The actual test-gate inventory is in `OPERATIONS.md`. The absent handbook gates and the current schema-drift failure must be resolved or explicitly accepted as review blockers before the story can claim Tier 1/Definition of Done; they do not authorize a workaround in scoring logic.

No business weights, thresholds, classifications, completeness rule, complementary-debt rule or source statistic remains open. A failed source-binding verification blocks the adapter; absent production credentials or an initial snapshot blocks rollout. Neither condition authorizes defaults.

Other material risks are publication lag across source frequencies, incorrect percent/month conversion, accidental reuse of property-objective indicators for initial scoring, loss of JSON metadata through a client normalization path, and broadening `/score/explain` into an authoritative score-writing API. The steps above include explicit tests for these boundaries. Existing top-level evaluation projections and non-atomic history writes remain existing limitations; the full saved result is authoritative for reproduction.

## Assumptions

| Assumption | Basis and treatment |
| :--------- | :------------------ |
| Existing evaluation JSON can hold the complete snapshot without schema changes | Confirmed by `buildFinancialDataSnapshot`, result normalization and history serialization; verify every creation path in step 7. |
| A separate market table is necessary | No suitable cache exists in the inspected schema/migrations; only this table is proposed, with no new endpoint. |
| Saved result context is sufficient for narrative retry | Existing deterministic/AI explanation helpers consume calculated results; adapt the existing route/caller and forbid recalculation. Treat supplied context as narrative input, not proof of an authoritative score. |
| Market refresh can execute outside the request runtime | Requires an operator/scheduler host decision before Build; do not use a serverless in-process timer or a per-request fetch as a silent substitute. |

This task creates only this PLAN. All source, test, migration, configuration and operational-file changes described above belong to a later authorized Build.
