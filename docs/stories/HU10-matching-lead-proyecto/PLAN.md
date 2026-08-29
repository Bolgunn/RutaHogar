# PLAN — HU 10: Matching lead-proyecto para ejecutivos comerciales

- **Story:** `Wiki ScoreLeads/UserStories/HU10-matching-lead-proyecto.md` · **Actor:** Ejecutivo comercial
- **Status:** ⚠️ Parcial · Sprint 1 · 5 SP · **Depends on:** HU 7 (`feature/sprint1/HU7`, PR #69, **open**) and [CATALOGO-UNICO](../CATALOGO-UNICO/PLAN.md) (**not started**) · **Required by:** —
- **Branch:** `feature/sprint1/HU10`, off `feature/catalogo-unico-simulacion`

> **Branch-name deviation.** The handbook norm is `feat/hu10-matching-lead-proyecto`. The team chose
> to keep `feature/sprint1/HU10` for consistency with the other in-flight branches. Recorded rather
> than silently ignored.

> **Stack depth.** `develop` → HU 7 (#69) → CATALOGO-UNICO → HU 10. Every ancestor is unmerged. If
> #69 changes in review, both descendants rebase.

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first: `docs/algorithms/ALG-8-purchase-capacity.md` and `ALG-9-lead-project-affinity.md` **in
  full** — they hold every number this story uses · `docs/research/spike1-e4-lead-project-matching-criteria.md`
  §4–§8 (the normative source both ALGs were extracted from) · `backend/app/scoring_engine/indicators.py`
  (the shape `purchase_capacity.py` sits beside) · `backend/app/scoring_engine/blockers.py` (codes and
  severities the affinity penalty and blocker resolution consume verbatim) ·
  `frontend/src/services/projectService.js` header (the frozen catalog contract)
- Stop and report if: a case in `ALG-8-cases.json` or `ALG-9-cases.json` disagrees with the spike ·
  the affinity weights produce a ranking that visibly contradicts E2 ("capacity beats
  classification") · you find yourself needing a capacity number on the frontend that the backend
  does not already send

## Goal

An ejecutivo comercial today sees one list: every lead, sorted by financial classification. That
ranking cannot answer the question the executive actually has, which is *"who should I call about
this project?"* — because nothing in the system knows what a lead can afford independently of what
they said they wanted. This story adds a preference-independent buying capacity to the scoring
engine, joins it against the HU 7 catalog, and gives the executive a project-scoped, affinity-ranked
lead list with the evidence to act on it. It also makes HU 10 E4 computable at all: you cannot detect
"this person can buy something other than what they asked for" from a model that only evaluates what
they asked for.

## Approach & decisions

Capacity is computed once in the backend, travels inside the existing `financial_indicators` dict,
and is persisted with the assumptions that produced it. The catalog join stays on the frontend, pure
and testable, because the catalog lives in Supabase and the backend cannot see it. The executive UI
extends the dashboard that already exists rather than adding a second lead surface.

| Decision | Rationale |
| :------- | :-------- |
| Capacity in `backend/app/scoring_engine/purchase_capacity.py`, additive keys inside `financial_indicators` | Pure financial computation belongs beside `indicators.py`; it is then versioned, persisted per evaluation and auditable (RNF 4 / RNF 5). Additive keys mean no `POST /score` contract break (S2) |
| Matching in `frontend/src/lib/matching/`, **not** `services/` as spike §8.2 says | The handbook reserves `lib/` for pure logic and calls it the only place an algorithm may be implemented. The spike's stated reason for "frontend" was guardrail #5 (no new FastAPI endpoints) — a frontend/backend argument that `lib/` honours equally. Precedent: `lib/simulation/compatibility.js`. **Spike §8.2 and §8.3 are amended in this PR** |
| Two ALG documents — ALG-8 capacity, ALG-9 affinity | Split on the backend/frontend seam, so each points at one module and one test runner. ALG-1…7 stay reserved for the existing engine per `docs/procedures/algorithms.md` |
| ALG-9's cases assert under **vitest**, not pytest | It governs frontend code. The handbook's Tier 1 lists ALG cases under pytest; this story establishes the frontend equivalent. Noted so a reviewer does not read it as a gap |
| `ALGORITHM_VERSION` does **not** move | It moves "when a rule changes"; these keys are additive and change no existing rule. Capacity carries its own `capacidad_supuestos.version = "e4-matching-v1"` (spike §8.1) so matching can be retuned without an engine bump |
| Legacy evaluations get a **backfill script**, not a lazy recompute | Team decision. The `requires_info` path is still built, because §4.5 reaches it by other routes (`plazo_efectivo < 5`, `ingreso_total <= 0`) |
| Project selector **inside `DashboardLeads.jsx`**, not a new page | Team decision. One destination for the executive. The no-project-selected path stays behaviourally identical and is pinned by a test, so HU 2 cannot regress silently |
| Matching input is `getAvailableProjects({ inmobiliariaId })` | The pairing is tenant-scoped even though the lead feed is not — see standing question 2 |
| HU 6's `buildAccessibleAlternatives` delegates ranking to `matchLeadToProjects` | Two recommendation surfaces must not rank on different capacity definitions. Delegating is cheaper and safer than re-deriving HU 6's undocumented constants |
| `matchLeadToProjects` takes a project array, never fetches | Keeps it pure and vitest-coverable, and lets each caller decide what subset to feed it (spike §8.2) |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **Yes — additively.** New module `purchase_capacity.py` under `ALG-8`; new constants in `constants.py`. **No existing number changes**: no weight, threshold, blocker or classification cutoff is touched, and `ALGORITHM_VERSION` stays at `1.1.0-prep`. `commercial_priority.py` and `project_fit.py` are read, never modified |
| 2 | Needs RLS / multi-tenant scoping? | **No new policy, and one inherited gap.** Projects are scoped by `inmobiliaria_id` under HU 7's RLS, so the executive only ranks their own tenant's projects. `public.evaluations` is **not** tenant-scoped — `schema.sql:239-247` lets any `ejecutivo`/`admin` select every evaluation, and the table has no `inmobiliaria_id`. HU 10 does not widen this (the HU 2 dashboard already exposes the same rows) but does not close it either. **Recorded as a defect against S6**; closing it needs a product decision on what a lead's inmobiliaria means for public pre-qualification traffic |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **No migration.** Capacity is persisted inside the existing `financial_data` JSON column, so no schema change. **But there is a one-time backfill script** (`backend/scripts/backfill_capacity.py`) that is *not* auto-applied and *not* CI-enforced: whoever merges this PR runs it against hosted Supabase and posts the dry-run counts in the PR thread |
| 4 | Changes the `POST /score` contract? | **No.** Purely additive keys inside the existing `financial_indicators` dict. No field removed, renamed or retyped; no endpoint added (S2, guardrail #5) |
| 5 | Consent / privacy impact? | **None new.** Capacity is derived from data the lead already submitted under `consentimiento = true`; no new intake field, no external data source (S5). The executive sees no personal data they cannot already see. `capacidad_supuestos` is metadata about the calculation, not about the person |

> 1 and 3 are checked against the diff by CI.

## Entities

No schema change. The surface is the `POST /score` response and one persisted JSON column.

| Surface | Change |
| :------ | :----- |
| `financial_indicators` (response + `financial_data.result`) | **New keys**, all additive, listed verbatim in ALG-8 §contract: `capacidad_compra_estimada_uf`, `capacidad_compra_estimada_clp`, `capacidad_por_renta_uf`, `capacidad_por_pie_uf`, `capacidad_asistida_uf`, `restriccion_vinculante`, `dividendo_maximo_sostenible_clp`, `capacidad_status`, `capacidad_supuestos` |
| `public.evaluations.financial_data` | Same keys, persisted automatically — `buildFinancialDataSnapshot` already stores the whole `result` object, so no service change is needed |
| Rows written before this PR | Have none of these keys. Backfilled by script; rows whose stored input cannot produce a capacity are written `capacidad_status: "requires_info"` with capacity `null` — **never `0`** (ALG-8 invariant) |
| `proyectos` | **Read only**, via `getAvailableProjects({ inmobiliariaId })`. No write, no schema change |

## Algorithms

Referenced, never restated. Every number this story uses lives in one of these two documents.

- **`ALG-8` — purchase capacity** (`docs/algorithms/ALG-8-purchase-capacity.md`). **New**, seeded in
  this PR from spike §3–§4 and §6.1. Implemented by `backend/app/scoring_engine/purchase_capacity.py`;
  every tunable in `constants.py`. Cases in `ALG-8-cases.json`, asserted by pytest. Assumptions log
  carries the developer judgments — chiefly the 0.30 calculation ceiling (spike §3.4) and the 20% pie
  anchor over 10% (spike §4.3).
- **`ALG-9` — lead–project affinity** (`docs/algorithms/ALG-9-lead-project-affinity.md`). **New**,
  seeded in this PR from spike §5–§7. Implemented by
  `frontend/src/lib/matching/leadProjectMatching.js`. Cases in `ALG-9-cases.json`, asserted by
  vitest. Assumptions log records that the weights are **v1, asserted from domain reasoning and not
  fitted** — there is no conversion history to calibrate against until HU 16.

Both are read-only consumers of `ALG-2` (blockers) and `ALG-5` (project fit), **neither of which has
been written yet**. See Assumptions.

**Local logic** (no ALG number, story-local): the dashboard's sort, the "ver descartados" toggle, and
the empty-state copy.

## Scope

**In:** `purchase_capacity.py` and its constants · the additive `financial_indicators` keys · ALG-8
and ALG-9 with their case files and test wiring · `lib/matching/leadProjectMatching.js` · the project
selector, ranked list and evidence card inside `DashboardLeads.jsx` · the re-orientable annotation ·
the backfill script · delegating `buildAccessibleAlternatives`'s ranking to `matchLeadToProjects` ·
amending spike §8.2/§8.3.

**Out:**

- **`commercial_priority.py` stays untouched** (spike §7). Its lead-global `reorient` action keeps its
  current behaviour; HU 10 adds a pair-scoped annotation beside it. No shipped `/score` path needs
  re-verification.
- **`PRECIOS_REFERENCIA_UF` and `property_value.py`** — the capacity model is preference-independent
  and does not read them (guardrail #7).
- **`project_fit.py`** — its verdict is consumed for the re-orientable rule, never modified.
- **Closing the `evaluations` tenant-scoping gap** — needs a product decision, recorded as an S6
  defect.
- **HU 6's capacity constants.** `compatibility.js` computes `maxByMinDownPayment = savings / 0.10`
  with no income gate, and uses `PRUDENT_DIVIDEND_RATE = 0.25` in calculation where the spike resolved
  0.30. For an income-bound lead its figure and ALG-8's differ by an order of magnitude. **Recorded as
  a defect against HU 6**, naming commit `fd09826` ("Cambios para el Rebranding RutaHogar"), which
  introduced `SimulationPage.jsx`, `mockProjects.js` and `compatibility.js` in one commit and left no
  rationale for any of those numbers. Only the *recommender's ranking* is corrected here; the two
  labelled display tiles are honest about being down-payment stretch and stay.
- **`primera_vivienda` intake field** — would let capacity branch on `PIE_RATIO_ASISTIDO` directly
  (spike §10.5, flagged as the highest-value follow-up). Belongs to HU 1.
- **Rate / term / UF scenarios** — one base case only; owned by HU 18 and HU 29.
- **Subsidy eligibility rules** — HU 10 emits only the FOGAES flag; HU 26 owns the rules.
- **The `mockProjects` → catalog migration** — [CATALOGO-UNICO](../CATALOGO-UNICO/PLAN.md).

## Steps

Ordered. Each names the exact files and functions and the concrete change.

1. **Write `ALG-8` and `ALG-9` first**, from `docs/templates/ALG-N.md`, extracting from the spike.
   Create `docs/algorithms/`. Fill the rules tables before any code exists; every number carries its
   provenance row from spike §3.1 (market-sourced) or §3.2 (policy). **No code in this step.**

2. **`backend/app/scoring_engine/constants.py`** — add every capacity tunable: rate, both pie ratios,
   both burden ratios, reference and minimum term, age cap, the FOGAES price cap, and
   `MATCHING_VERSION = "e4-matching-v1"`. No literal may appear inside a function (handbook).

3. **`backend/app/scoring_engine/purchase_capacity.py`** — new module implementing ALG-8:
   `calculate_purchase_capacity(data, indicators) -> dict` returning exactly the keys listed under
   Entities. Flat functions mirroring `indicators.py`; no classes. Honour §4.5's edge-case table
   exactly, especially `null` ≠ `0`.

4. **`backend/app/scoring.py`** — call it after `calculate_financial_indicators` and merge its keys
   into `financial_indicators`. One call site, no reordering of existing logic.

5. **`backend/tests/test_purchase_capacity.py`** — load `ALG-8-cases.json` and assert each case, plus
   the invariants as invariants: capacity is `None` or `>= 0`; `capacidad_compra_estimada_uf ==
   min(por_renta, por_pie)` whenever status is `ok`; `restriccion_vinculante` is set whenever capacity
   computes; the same input always yields the same output. Add a golden-fixture case proving existing
   `POST /score` keys are byte-identical (S2).

6. **`frontend/src/lib/matching/leadProjectMatching.js`** — new pure module implementing ALG-9:
   `matchLeadToProjects(evaluacion, proyectos) -> { matches, excluidos }`, `MatchRow` exactly as spike
   §8.2. Evaluate "at/above `precio_max` → no penalty" **before** interpolating, or a single-price
   project divides by zero and `NaN` corrupts the ranking (contract note 2). Re-declare only the
   affinity weights; never a capacity constant — capacity arrives pre-computed.

7. **`frontend/src/lib/matching/__tests__/leadProjectMatching.test.js`** — load `ALG-9-cases.json`
   and assert each case, plus: a `Medio` lead above `precio_max` outranks an `Alto` lead at
   `precio_min` (this is E2, expressed as a test); a single-price project produces no `NaN`; a lead
   who clears `precio_ref_uf` gets `bloqueador_principal: null` rather than a fabricated
   `pie_insuficiente_para_proyecto` (spike §6.2, the load-bearing guard).

8. **`DashboardLeads.jsx` — project selector.** Add a `selectedProject` state and a project dropdown
   fed by `getAvailableProjects({ inmobiliariaId })`. **When nothing is selected the component
   behaves exactly as today** — same filters, same classification sort, same columns. When a project
   is selected, rank by `afinidad` and render the evidence columns.

9. **`DashboardLeads.jsx` — evidence card (E3).** Per selected project, show `capacidad_uf`,
   `pie_disponible_uf`, `clasificacion_financiera`, `restriccion_vinculante`, `plazo_anios`,
   `plazo_origen` and `bloqueador_principal`. `plazo_anios` and `plazo_origen` are **not optional** —
   leads are ranked under different term assumptions and the executive must never compare invisibly
   different numbers (spike §4.2).

10. **`DashboardLeads.jsx` — re-orientable (E4) and descartados.** Annotate rows where `reorientable`
    is true; add a "ver descartados" toggle rendering `excluidos` with their `motivo_exclusion`.
    Render the `requires_info` group distinctly — these are leads needing a fresh evaluation, not
    leads with no capacity.

11. **`frontend/src/lib/simulation/compatibility.js`** — `buildAccessibleAlternatives` delegates its
    ranking to `matchLeadToProjects`. Its two display tiles and `getMaxValueRange` are untouched.

12. **`backend/scripts/backfill_capacity.py`** — recompute capacity from each stored `input_snapshot`
    and write it back into `financial_data.result.financial_indicators`. **Requirements:** `--dry-run`
    default; prints counts of computed / skipped / already-present; rows it cannot compute are written
    `requires_info` explicitly, never `0`; idempotent, so a second run is a no-op. It must fail loudly
    on a row it does not understand rather than writing a wrong number.

13. **Amend `docs/research/spike1-e4-lead-project-matching-criteria.md` §8.2 and §8.3** to the
    `lib/matching/` path, with a line saying what changed and why (handbook: "the document leads").
    Also correct the stale "HU 13"/"HU 17" prose in those sections to HU 10 / HU 7.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — executive selects a project and sees compatible leads ordered by affinity and capacity | 6, 8 | `ALG-9-cases.json` ordering cases (vitest) + reviewer steps: select a project at `/ejecutivo/leads`, confirm the list re-ranks and the order matches the affinity shown |
| `E2` — a lead with sufficient capacity can be recommended even when their classification is not Alta | 6, 7 | `leadProjectMatching.test.js` — the explicit `Medio`-above-`precio_max` outranks `Alto`-at-`precio_min` test |
| `E3` — the card shows capacity, pie, classification and main blocker | 3, 9 | `ALG-8-cases.json` (the numbers) + reviewer steps: open a ranked lead and confirm all six evidence fields render, including `plazo_origen` |
| `E4` — a lead who can buy a project other than their declared objective shows as re-orientable | 6, 10 | `ALG-9-cases.json` re-orientable cases, including the negative: a lead with no declared `comuna_objetivo` and unresolvable `project_fit` is **never** re-orientable (spike §7) |
| Legacy rows do not appear as capacity-zero | 12 | Reviewer steps: run the backfill dry-run, confirm the skipped count matches the `requires_info` group size in the panel |
| HU 2's dashboard is unchanged when no project is selected | 8 | A test pinning the default render, plus reviewer steps comparing against `develop` |

## Assumptions

- **`ALG-2` (blockers) and `ALG-5` (project fit) do not exist.** ALG-8 and ALG-9 must reference them
  by number for codes, severities and the `project_fit.status` verdict. Until they are written, both
  documents cite `blockers.py` and `project_fit.py` **by file and line** and carry a note that the
  citation is provisional. Do not restate their rules — that is what the reference exists to prevent.
- **Affinity weights are uncalibrated v1** (spike §5.2, open item 3). They ship as domain reasoning,
  not fitted values, and are revisited when HU 16 supplies conversion data. Logged in ALG-9's
  assumptions log so the reviewer confirms it was *logged*, not that the values are right.
- **Complementary debt is dropped by `indicators.py`** (spike §10.1): validated complementary income
  is added to `ingreso_total` but `deuda` stays `deuda_mensual` alone, so every ratio for a lead with
  a complemento is overstated — and ALG-8 inherits that inflation. §4.1 specifies `deuda_total`
  including the complementary side. **The build session must implement §4.1 as specified and note the
  divergence**, not silently follow the existing code. Fixing `indicators.py` is HU 3 / HU 15's.
- **`VALOR_UF_CLP = 40695` is hardcoded and stale** (0,39% on 2026-08-16). Matching is computed
  entirely in UF, so this is display precision only (spike §3.3). Not this story's to fix.
- **`edad` and `plazo_credito_hipotecario` are required** in the Pydantic contract
  (`main.py:65,72`), so §4.2's "edad missing → `age_term_verified = false`" branch is unreachable
  through the API. Implement it anyway for the backfill script, which reads stored snapshots that may
  predate those fields.
- **Both ancestor branches are unmerged.** If PR #69 or CATALOGO-UNICO changes the catalog contract,
  step 6 must be re-checked against the revised shape.
