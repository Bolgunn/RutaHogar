# PLAN — HU 17: Configurable referential mortgage financing simulation

- **Story:** `Wiki RutaHogar/UserStories/HU17-simulacion-financiamiento.md` · **Actor:** Lead
- **Status:** Planned · Sprint 2 · 3 SP · **Depends on:** existing evaluation, project catalog,
  project goal, persisted BCCh snapshots and ALG-9 reference limits · **Required by:** none
- **Branch:** `feat/hu17-simulacion-financiamiento`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` (“Starting a build
session”); only what is specific to this story goes here.

- Read first: `docs/algorithms/ALG-11-referential-financing-simulation.md`,
  `docs/algorithms/ALG-9-purchase-capacity.md`, `frontend/src/components/SimulationPage.jsx`,
  `frontend/src/lib/mortgage.js`, `frontend/src/lib/simulation/compatibility.js`,
  `backend/app/main.py`, `backend/app/market_data/repository.py`, and `docs/database.md`.
- Re-read `backend/app/scoring_engine/housing_benefits.py` only as the current eligibility-display
  baseline. Do not alter it, its constants, ALG-8, scoring inputs, score output, or `POST /score`.
- Stop and report if: a required official DS1/DS49 amount cannot be represented by a reviewed,
  source-versioned catalogue entry; the existing persisted BCCh history cannot expose dated UF
  observations without calling BCCh live; a migration would need to weaken RLS; or a change would
  modify an existing HU6 compatibility outcome.

## Goal

A lead with a completed, consented evaluation can open the existing simulation area and explore a
referential financing configuration for their project goal, another catalog project, or a manually
priced property. They can vary scenario-only pie, credit, term, rate, income, complementary income,
and official-benefit assumptions; an advanced voluntary UF projection may additionally ask for a
scenario date without presenting it as a purchase promise; see a transparent result; and save,
duplicate, delete or compare historical snapshots without changing their score, project goal or
financial plan.

## Approach & decisions

HU17 is a separate financing tab inside the existing `SimulationPage`, not a replacement for HU6.
The existing comparison journey remains in its own tab. Its
calculation is pure frontend logic documented by ALG-11; I/O is limited to read-only backend market
and catalogue endpoints plus an owner-scoped scenario table. Existing mortgage payment arithmetic is
extracted/reused rather than copied. The selected project price remains in UF, so only the CLP
conversion can vary with a current or bounded projected UF.

| Decision | Rationale |
| :------- | :-------- |
| Project goal is the default; any catalog project or manual UF price can replace it for this draft | A scenario must be exploratory without changing `project_goal`. |
| The base flow never requests or infers a purchase date; a date appears only after voluntarily enabling advanced UF projection | Avoids presenting a financial reference as a promise that the lead will purchase on that date. |
| Future pie, own income and complementary income are freely scenario-editable | This is a what-if tool, not a savings-plan or score update. Complementary income has no codebtor debt/profile intake in HU17. |
| Pie and credit are synchronized around `price = pie + primary subsidy + credit` | Prevents mathematically invalid scenarios. |
| Terms are 10/15/20/25/30 years and age-gated at 70 | These are the existing loan-term choices and ALG-9 age reference, not a new financial rule. |
| Current UF or a 12-month, 90-date-minimum, 24-month-horizon linear projection | Product-confirmed lightweight projection. If history is insufficient, projected UF is absent silently; no custom UF, hidden fallback or explanation. |
| DS1/DS49 are the single selected monetary primary benefit; a reviewed fixed catalogue amount is applied first, while a reviewed baseline may show a DS49 base or a DS1 range when its amount remains variable; Ley 21.748 is rate-only if its official catalogue entry defines it; FOGAES/PADHI/Leasing are information-only | The lead sees the capacity impact while the UI distinguishes a fixed amount, base amount and range; it never turns a guarantee/route into a cash subsidy. |
| An inapplicable selected benefit still applies its official amount hypothetically, with red `No aplicable actualmente` taking visual precedence | Preserves user control while preventing a hypothetical from looking like an approval. |
| E3 is one light, pie-based reference adjustment | It honors the immutable criterion without ranked advice, automatic edits or multiple recommendations. |
| Saved scenarios are immutable snapshots; edit and duplicate load a draft that saves as a new row | Historical values cannot silently change after BCCh or MINVU data changes. |
| Official benefit catalogue is promoted by a human after review; a monthly GitHub Action only detects source changes and opens an issue | MINVU publications are pages/PDFs rather than a discovered stable machine-readable feed. No fragile amount extractor is trusted. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No scoring change.** `POST /score`, `scoring_engine`, ALG-8 and ALG-9 stay behaviorally unchanged. New **ALG-11** governs only the HU17 client-side scenario; it reuses ALG-9's 25%/30%/45% references and the existing age-70 rule without changing them. |
| 2 | Needs RLS / multi-tenant scoping? | **Yes.** `mortgage_scenarios` has RLS for its owner only: own select/insert/delete, no update. Insert additionally requires the row's own consented evaluation. Catalogue tables are denied to `anon`/`authenticated` and read only through a non-personal backend projection. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes.** One timestamped migration creates `mortgage_scenarios` and immutable official-catalog versions; its rollback and matching `schema.sql` update ship in the same commit. **The product owner applies and verifies it in hosted Supabase before frontend release.** |
| 4 | Changes the `POST /score` contract? | **No.** New read-only endpoints are separate. `/score` keeps resolving persisted BCCh data and never receives scenario inputs or calls BCCh live. |
| 5 | Consent / privacy impact? | **Yes, contained.** Only authenticated users with the active consent of their own evaluation can initialize/save a scenario. Scenario income and complementary income are personal financial data, frozen under owner-only RLS. The monthly monitor retrieves only public MINVU material and sends it no user data. |

## Entities

| Surface | New / change | Ownership and history |
| :------ | :----------- | :-------------------- |
| `public.mortgage_scenarios` | New: `id`, `user_id`, `evaluation_id`, nullable `project_id`, nullable `parent_scenario_id`, `name`, `project_snapshot`, `input_snapshot`, `result_snapshot`, `market_reference_snapshot`, `benefit_catalogue_snapshot`, `created_at` | `evaluation_id` references the consented evaluation and cascades on its deletion; project deletion sets only `project_id` null while the project snapshot remains. Rows are insert/select/delete-only for `auth.uid() = user_id`; no update policy exists. |
| `public.housing_benefit_catalog_versions` | New append-only reviewed versions: identifier, status, official source metadata/checksum, effective dates, published timestamp, declarative eligibility/value/rate parameters | No browser grants. Backend service credential reads the current published version; operator promotion inserts a new version rather than altering prior data. |
| `GET /market-reference-history` | New backend projection of dated persisted `market_snapshots` UF observations | Reads storage only; deduplicates same-date observations deterministically and makes no BCCh request. |
| `GET /housing-benefit-catalog` | New backend projection of the current reviewed catalogue version | Non-personal public reference data only. No evaluation input crosses this endpoint. |
| `frontend/src/services/mortgageScenarioService.js` | New provider service for list/insert/delete; local-provider fallback follows existing app behavior | It gets the authenticated user itself; never trusts a caller-supplied owner id. |
| saved scenario snapshots | New historical contract | Persist the exact values/result, selected project/manual descriptor, date, UF value + projection provenance, rate, primary benefit amount/effect and reviewed catalogue version used at save time. |

## Algorithms

Referenced, never restated:

- **ALG-11 — referential financing simulation** (`docs/algorithms/ALG-11-referential-financing-simulation.md`),
  new and asserted by `frontend/src/lib/financing/__tests__/`. It owns scenario composition, current/
  projected UF availability, classification, hypothetical benefit presentation, the light E3 card and
  immutable saved-snapshot inputs.
- **ALG-9 — purchase capacity** is read only for `RATIO_DIVIDENDO_SALUDABLE`,
  `RATIO_DIVIDENDO_MAX`, `RATIO_CARGA_TOTAL_MAX` and `EDAD_MAX_FIN_CREDITO`; it is not called,
  amended or reimplemented as scoring.
- **ALG-8 — housing benefits detector** remains unchanged. HU17 uses reviewed, source-versioned
  catalogue data for scenario-specific official amounts and eligibility messages, not its hardcoded
  detection output as a cash-value source.

## Scope

**In:** two clear tabs inside the existing simulation route: comparison and financing · project-goal
default, catalog choice and manual price · scenario-only financing controls and result · current and
bounded projected UF from persisted snapshots · official reviewed subsidy catalogue and read models ·
one hypothetical primary subsidy plus ancillary benefit display · owner-only immutable saved scenarios
with duplicate/delete/derived edits and comparison inside the simulator · monthly source-change GitHub
Action that opens an issue · migration, rollback, `schema.sql`, tests and hosted verification steps.

**Out:**

- Any change to score, ALG-1 through ALG-10, `/score`, market snapshot refresh, BCCh live calls or
  HU17 inputs persisted back into the evaluation.
- Price, mortgage-rate or benefit-future prediction; custom UF; new reference prices; bank quotes,
  CAE, insurance, fees, taxes, approval or preapproval.
- Codebtor underwriting data, consent flow for a real codebtor, or a new financial-plan calculation.
- Multiple/ranked recommendations or automatic edits to the user's scenario.
- A top-level `Mis simulaciones` navigation item; saved scenarios live only in the simulator.
- Automatic extraction or publication of financial amounts from MINVU PDFs; it belongs to reviewed
  catalogue promotion, not the monitor.
- HU29 design or a total-credit-cost comparison.

## Steps

1. **Keep the documentation authoritative before code.** Commit this `PLAN.md`,
   `ALG-11-referential-financing-simulation.md` and `ALG-11-cases.json`. Add a Vitest loader for the
   cases before implementing the calculation. If a rule changes during implementation, amend ALG-11
   and its cases first; do not add an inline number.

2. **Expose only persisted market history.** Extend `backend/app/market_data/repository.py` and the
   market-data service with a deterministic dated-UF reader over `market_snapshots`; add
   `GET /market-reference-history` in `backend/app/main.py`. It must return the persisted effective
   dates/value/provenance needed by ALG-11 and fail controlledly when unavailable. Add backend tests
   proving the route never instantiates `BCChClient` and `/score` remains untouched. Extend
   `frontend/src/services/marketReferenceService.js` with the typed history reader and tests.

3. **Add reviewed catalogue storage and read boundary.** Add a timestamped
   `supabase/migrations/<timestamp>_hu17_financing_scenarios.sql`, matching rollback and matching
   `supabase/schema.sql` definitions. Create `housing_benefit_catalog_versions` with no browser
   grants, then a repository/service and `GET /housing-benefit-catalog` that returns only a complete,
   reviewed published version. Add versioned, checked-in catalogue fixtures and a validation/publish
   script under `backend/` that refuses missing official source metadata, checksum, amount matrix or
   incompatible status. It must create a version rather than mutate an old one. Do not modify
   `housing_benefits.py`, `constants.py`, ALG-8 or historical evaluations.

4. **Add scenario persistence with owner-only RLS.** In the same migration create
   `mortgage_scenarios`, grants and its select/insert/delete policies. Insert must bind `user_id` to
   `auth.uid()` and require a matching own `evaluations` row whose stored input has
   `consentimiento=true`; updates are intentionally not granted. Add the rollback, mirror every new
   table/policy in `schema.sql`, run `node scripts/check-schema-drift.js`, and create
   `frontend/src/services/mortgageScenarioService.js` with Supabase and existing local-provider
   behaviors. Unit-test owner filters, immutable edit-as-copy behavior and service failures.

5. **Build pure HU17 financial modules.** Add `frontend/src/lib/financing/ufProjection.js`,
   `benefitScenario.js`, `scenarioDraft.js` and `scenarioResult.js`. Reuse/refactor
   `frontend/src/lib/mortgage.js` so the old `calculateMortgageDividend` keeps its exact contract
   while a principal-based helper serves HU17; no formula is copied. Implement ALG-11 only in these
   modules: price composition, allowed terms/age gate, current/projected UF availability, rate/income
   edits, status/reasons, selected-benefit eligibility presentation and the single non-mutating E3
   reference adjustment. Load and assert all ALG-11 cases plus invariants.

6. **Implement the official-catalogue operations path.** Add a source-monitor script that performs
   no monetary extraction: it checks the explicitly listed official MINVU URLs and hashes/link
   targets against the active reviewed source metadata. Add
   `.github/workflows/check-housing-benefit-catalog.yml` scheduled monthly on day 1, with
   `contents: read` and narrowly scoped `issues: write`; a detected source change opens/de-duplicates
   a GitHub issue containing the source URL and observed change. Network failure opens/fails loudly
   but never updates Supabase. The product owner reviews the issue, prepares a new source-versioned
   catalogue entry and runs the publish process manually.

7. **Add the HU17 panel without regressing HU6.** Create focused components under
   `frontend/src/components/financing/` and compose them from `SimulationPage.jsx`; keep existing
   `evaluateScenario`, catalog alternatives and comparisons behaviorally unchanged. Default the new
   panel to `getCurrentProjectGoal(evaluation)`, resolve it to the catalog when available, and fall
   back to its stored snapshot. Allow another catalog project or a manual UF property without writing
   the goal. Render concrete date, UF mode, pie/credit synchronized fields, term/rate/income/
   complementary-income controls, primary benefit selector, ancillary benefit information and the
   required result metrics. Give inapplicable selected benefits the dominant red status/reason while
   retaining the hypothetical financial values. Keep all approval language referential.

8. **Add in-panel saved scenario management and comparison.** Gate the panel on an authenticated,
   consented evaluation; read saved scenarios only through `mortgageScenarioService`. Add save/name,
   load, delete, duplicate and edit-as-new-snapshot flows. The saved area sits in the simulator, not
   navigation, and permits selection of two or three frozen rows for side-by-side comparison. A
   manual scenario stores no project id; a project scenario stores both its id and display snapshot.
   Refresh/list failure must preserve the editable current result and present a controlled reload
   path rather than falsely claiming it was saved.

9. **Test and verify the whole boundary.** Add Vitest coverage for project-goal default/non-mutation,
   catalog/manual selection, pie-credit closure, age gate, each ALG-11 status, insufficient UF history
   silence, projected UF provenance, official benefit selection/inapplicability, E3 non-mutating
   card, saved copy/duplicate/delete and comparison. Add pytest coverage for history/catalogue
   endpoints and monitor script transports. Run `npm test`, `npm run build`, backend `pytest`,
   `node scripts/check-schema-drift.js` and `git diff --check`.

10. **Perform deployment-only verification after review.** Before releasing the frontend, the product
    owner applies the migration and verifies its rollback readiness on hosted Supabase. With two
    authenticated accounts, prove one cannot list/read/delete/insert a scenario belonging to the
    other, an unconsented evaluation cannot insert, and no `UPDATE` is allowed. Seed/publish one
    reviewed official catalogue version, verify the public read model exposes only that version, and
    exercise a saved scenario against persisted BCCh history. Record migration, catalogue-version and
    RLS evidence in the PR; do not merge until it exists.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — suggested configuration from evaluation, target project, price, savings, term, rate and complementary income | 2, 5, 7 | ALG-11 fixtures; Vitest project-goal default and catalog/manual draft tests; reviewer walkthrough with a consented evaluation. |
| `E2` — customizable pie, credit, term, rate and complementary income with explained status | 5, 7 | ALG-11 composition/status/invariant tests; UI walkthrough changes every control without calling `/score`. |
| `E3` — alternative configuration when close or adjustment is needed | 5, 7 | ALG-11 near/adjustment fixtures assert exactly one non-mutating reference card; reviewer confirms it does not auto-edit or rank advice. |
| `E4` — save scenarios associated to the objective and compare later | 4, 8 | service tests, immutable derived-row test, two/three-scenario comparison test, and hosted RLS walkthrough. |
| User-selected inapplicable official benefit remains clearly non-applicable | 3, 5, 7 | catalogue fixture and Vitest display-status test; reviewer sees red reason plus hypothetical values. |
| Projected UF is snapshot-based and never live BCCh | 2, 5, 9 | backend route test proves persisted-only access; 90-date/12-month/24-month ALG cases; no BCCh client in `/score` or projection path. |

## Assumptions

- A reviewed published catalogue version takes precedence before any DS1/DS49 amount is applied.
  Until then, the simulator may display only the checked-in reviewed estimation baseline: a DS49
  base amount and a clearly labelled DS1 range. It must not represent either as an award or make a
  DS1 range look like one applied amount.
- `market_snapshots` has enough distinct dated UF rows to enable projection in a hosted environment.
  If not, the current-UF path remains the only visible path and no explanation is shown.
- The current branch's local/provider fallback remains necessary for development, but it is not RLS
  evidence and cannot be presented as hosted persistence verification.
