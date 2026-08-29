# PLAN — CATALOGO-UNICO: one project source

- **Story:** none — a data-source consolidation, run through the pipeline as its own work · **Actor:** the team
- **Status:** 🔜 Sprint 1 · not sized · **Depends on / Required by:** depends on HU 7 (`feature/sprint1/HU7`, PR #69, **open and unreviewed**) · required by [HU 10](../HU10-matching-lead-proyecto/PLAN.md) · superseded in part by [UNIDADES-PROYECTO](../UNIDADES-PROYECTO/PLAN.md)
- **Branch:** `feature/catalogo-unico-simulacion`, off `feature/sprint1/HU7`

> **Branch-name deviation.** The handbook norm is `feat/<slug>`. This repository's in-flight
> branches all use `feature/…`, and the team chose to stay consistent with them for now. Recorded
> rather than silently ignored.

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this work goes here.

- Read first: `frontend/src/services/projectService.js` (the frozen contract lives in its header), `frontend/src/data/mockProjects.js`, `frontend/src/components/SimulationPage.jsx`, `frontend/src/lib/simulation/compatibility.js`, `docs/project-catalog-contract.md`
- Stop and report if: a `mockProjects` field turns out to be load-bearing somewhere this plan does not list, or a project's price can no longer be rendered honestly as a range

## Goal

`SimulationPage` renders projects from a hardcoded array in the bundle
(`frontend/src/data/mockProjects.js`, 8 entries) while HU 7 ships a real, multi-tenant,
admin-maintained catalog in Supabase. Two project sources now exist, with different field names and
different price semantics. This work deletes the hardcoded one so the product has a single answer to
"what projects exist", and so HU 10 does not have to reconcile two catalogs on top of everything
else it is doing.

## Approach & decisions

Point the existing simulation code at the catalog rather than rewrite it: `compatibility.js` already
takes projects as a parameter, so the change is an adapter at the boundary plus the call sites in
`SimulationPage`. The catalog gains two nullable columns so nothing currently on screen is lost.

| Decision | Rationale |
| :------- | :-------- |
| Its own PR, before HU 10 | HU 10 already spans capacity, affinity, an executive panel and a backfill script. Folding a shipped page's rewrite into it produces a diff no single approver can review honestly |
| **Keep `precio_min_uf` as the scenario value, but label it `"desde"` in the UI** | The catalog stores a range; the simulation wants a point. Rather than guess which point is representative, stop implying there is one. `"desde 2.400 UF"` is true; `"2.400 UF"` is not. This removes the judgment instead of relocating it — there is no assumption left to log |
| The adapter carries `precio_min_uf` and `precio_max_uf` through **alongside** `valor_uf` | So the UI can render the real range and no information is lost at the boundary. `valor_uf` exists only because the scenario math needs one number |
| Add `descripcion` **and** `entrega_estimada` | Both are cheap nullable columns. `entrega_estimada` closes a hole HU 7 knowingly left: the contract deliberately keeps `en_construccion` in the feed because *"la venta en verde es mercado real"*, but gives the executive no way to say **when** |
| **Do not** add `dormitorios` | Nothing in the intake captures a bedroom preference, so it would be display-only — and a project does not have *a* bedroom count. It belongs to a unit. Owned by [UNIDADES-PROYECTO](../UNIDADES-PROYECTO/PLAN.md) |
| `entrega_estimada` ships as **data and display only**, not as an affinity signal | Making it match against `plazo_compra` means a new penalty row in ALG-9 and redistributing the 100-point budget across weights already flagged as uncalibrated. That is a deliberate design decision, not a side effect of a data migration |
| A separate idempotent migration, not an edit to `20260729_project_catalog.sql` | That file uses `create table if not exists`, so editing it is a no-op anywhere `proyectos` already exists — and PR #69 has been building Vercel previews, so it may already exist in hosted Supabase. `add column if not exists` is correct either way. Mirrors how that same file adds `profiles.inmobiliaria_id` |
| Drop `dormitorios` and `entrega_estimada` **from the mock** without carrying the former | Both are rendered nowhere today. `entrega_estimada` returns as a real column; `dormitorios` does not |
| Seed demo projects via SQL, not by hand | Reproducible across environments and CI. Hand-entry through `/admin/proyectos` works but leaves dev and preview environments inconsistent |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No.** No file under `backend/app/scoring_engine/` is touched. No ALG document exists yet for anything here, and none is created |
| 2 | Needs RLS / multi-tenant scoping? | ~~**No new policy.**~~ **Corrected during the build — one new policy.** The premise below was wrong: `getAvailableProjects()` does *not* inherit a scoping the lead can use. `"Proyectos select tenant"` requires `get_my_role() = any (array['admin','ejecutivo'])`, and `/simulacion` renders only for `usuario`, so a lead read 0 rows and the page was permanently empty against Supabase — C4 could not pass. `20260827090200_proyectos_lectura_lead.sql` adds `"Proyectos select lead"`: SELECT only, `estado <> 'agotado'` only. The columns themselves remain non-sensitive on an already-protected table. **Known limitation:** a lead has no `inmobiliaria_id`, so it sees every tenant's non-agotado catalog; scoping the lead to a tenant requires first giving it one, which belongs to HU 13 |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes — three.** `20260827090000_proyectos_campos_comerciales.sql` (both columns), `20260827090100_demo_projects_seed.sql` (the 8 ex-mock projects) and `20260827090200_proyectos_lectura_lead.sql` (the policy from row 2). **Not auto-applied.** Whoever merges this PR runs `supabase db push` against the hosted project and confirms in the PR thread. Nothing in CI enforces this |
| 4 | Changes the `POST /score` contract? | **No.** Frontend and schema only; no backend file is touched (S2) |
| 5 | Consent / privacy impact? | **None.** Project catalog data is commercial inventory, not personal data. No lead or profile row is read or written |

> 1 and 3 are checked against the diff by CI.

### Migration filenames — a trap this work walked into

Applied on 2026-08-27 with `supabase db push`. It failed the first time, for a reason that has
nothing to do with this work but blocks anyone who pushes next:

**Supabase takes the migration version from the leading digits of the filename.** This repo names
migrations `YYYYMMDD_name.sql`, so the version is just the date — and `schema_migrations.version`
is a primary key. Two migrations dated the same day cannot both be recorded.
`20260806_housing_plan.sql` and `20260806_scoring_events.sql` both claimed `20260806`; the first was
already applied, so the second failed with `duplicate key value violates unique constraint
"schema_migrations_pkey"`. This work's three files all claimed `20260827` and would have collided
the same way.

Two further details, both learned the hard way:

- **The CLI orders migrations by filename, not by parsed version.** `20260827_demo_projects_seed.sql`
  sorts before `20260827_proyectos_campos_comerciales.sql` (`d` < `p`), so the seed would have run
  before the columns it inserts into existed.
- **A 14-digit stamp does not always sort after an 8-digit one for the same day.** `20260806120000_…`
  sorts *before* `20260806_…` because `1` < `_`, which desynchronised the CLI's walk over local vs
  remote history (`Remote migration versions not found in local migrations directory`).

**Resolution.** Only the *pending* migrations were renamed to full 14-digit versions — renaming an
already-applied one would make the CLI treat it as new and try to re-apply it. `scoring_events` had
to move to `20260807000000` (the next day) because no same-day numeric prefix can sort after
`20260806_housing_plan.sql`.

**For the next author:** name new migrations `YYYYMMDDHHMMSS_name.sql` and pick the time so the
filename sorts in dependency order. The nine legacy 8-digit files are left alone on purpose — the
remote history table records those exact versions.

## Entities

| Entity | Change |
| :----- | :----- |
| `public.proyectos` | **Two new nullable columns:** `descripcion text` and `entrega_estimada text` (`YYYY-MM`; text not date because delivery is quoted by month, and a `date` would invent a day). Existing rows get `NULL`; the UI renders nothing when absent, so no backfill is required |
| `projectColumns` in `projectService.js` | Add both columns to the select list so they travel through `getProjects()` / `getAvailableProjects()` |
| Frozen contract (header of `projectService.js`, `docs/project-catalog-contract.md`) | **Additive amendment** — both documented as optional. No existing field renamed or retyped, so HU 10 codes against the same shape either way |
| Local provider (`CATALOG_KEY` in localStorage) | Seeded demo projects gain both fields; the shape stays in step with the Supabase provider |
| `frontend/src/data/mockProjects.js` | **Deleted.** `dormitorios` is dropped with it |

Rows already stored in hosted Supabase are unaffected beyond gaining two `NULL` columns.

## Algorithms

No ALG document is created or changed. Nothing here has a tunable number with business
consequences — the catalog is data, and the adapter is a field rename.

**Local logic** (no ALG number, story-local): the `"desde X UF"` / `"X – Y UF"` price label rule —
when `precio_min_uf == precio_max_uf` the project is single-price and the label must show the bare
figure, not `"desde"`.

## Scope

**In:** the `descripcion` and `entrega_estimada` columns and their migration · the demo seed · the
catalog→simulation adapter · rewiring the seven `mockProjects` call sites in `SimulationPage` ·
honest `"desde"` price labelling · deleting `mockProjects.js` · extending `projectValidation.js` and
the `AdminProjectCatalog.jsx` form · amending the frozen-contract header and
`docs/project-catalog-contract.md`.

**Out:**

- **A unit model.** `proyecto_unidades`, `dormitorios`, per-unit pricing and deriving
  `precio_min/max_uf` as MIN/MAX — [UNIDADES-PROYECTO](../UNIDADES-PROYECTO/PLAN.md).
- **`entrega_estimada` as an affinity signal** — belongs to HU 10 or a later story, deliberately.
- **The ranking logic inside `buildAccessibleAlternatives`** — it keeps its current pie-only
  behaviour here and is replaced by `matchLeadToProjects` in HU 10. Changing the data source and the
  ranking in one PR would make it impossible to tell which change moved a recommendation.
- **HU 6's capacity constants** (`PRUDENT_DIVIDEND_RATE = 0.25`, `MIN_DOWN_PAYMENT_RATE = 0.10`) —
  recorded as a defect, owned by HU 6. See HU 10's plan.
- **Any `POST /score` or scoring-engine change.**

## Steps

Ordered. Each names the exact files and the concrete change.

1. **Migration — `supabase/migrations/20260827090000_proyectos_campos_comerciales.sql`.**
   (Named `20260827_…` in the original plan; renamed to a 14-digit version — see the note above.)
   `alter table public.proyectos add column if not exists descripcion text;` and the same for
   `entrega_estimada text`. Add a `check` constraint accepting `NULL` or the `YYYY-MM` shape. Add the
   matching rollback in `supabase/rollback/` following `20260729_project_catalog_rollback.sql`.

2. **Seed — `supabase/migrations/20260827090100_demo_projects_seed.sql`.** Insert the 8 projects currently
   in `mockProjects.js`, mapped: `tipo_vivienda`→`tipo`, `valor_uf`→ both `precio_min_uf` and
   `precio_max_uf` (single-price projects are valid per the contract), `estado: "referencial"`→
   `'disponible'`, `descripcion_corta`→`descripcion`, `entrega_estimada` carried across.
   `dormitorios` is **not** migrated. Attach them to the demo inmobiliaria created by
   `20260802_fix_demo_seed.sql`. Guard with `on conflict do nothing` against the
   `proyectos_nombre_por_inmobiliaria_idx` unique index so re-running is safe.

3. **`projectService.js` — carry the columns.** Add both to `projectColumns`; include them in the
   local provider's project shape, in `createProject` and in `updateProject`. Amend the frozen
   contract block in the file header to list them as optional, noting this plan.

4. **`projectValidation.js` — accept them.** Both optional. Trim `descripcion`, cap at 500 chars.
   Validate `entrega_estimada` as `YYYY-MM` or empty; reject a month outside `01`–`12`. Never make
   either required — existing rows are `NULL`.

5. **`AdminProjectCatalog.jsx` — expose them.** One textarea and one month input in the create/edit
   form. No new component.

6. **New adapter — `frontend/src/lib/simulation/projectAdapter.js`.** A pure
   `catalogProjectToSimulation(project)` returning
   `{ id, nombre, comuna, tipo_vivienda: tipo, valor_uf: precio_min_uf, precio_min_uf, precio_max_uf,
   descripcion_corta: descripcion, entrega_estimada, inmobiliaria: inmobiliaria_nombre, estado }` —
   the range travels alongside the point value so the UI can label honestly. Pure, no Supabase,
   unit-tested.

7. **Price labelling.** A small pure helper (`formatProjectPrice(project)`) returning `"desde X UF"`
   when `precio_min_uf < precio_max_uf` and the bare figure when they are equal. Use it at the four
   places `SimulationPage` renders a project price (`compatibility.js:64`, `SimulationPage.jsx:746`,
   `:810`, `:826`). The scenario math is unchanged — it still consumes `valor_uf`.

8. **`SimulationPage.jsx` — fetch instead of import.** Replace the `mockProjects` import with a
   `getAvailableProjects()` call in an effect, mapped through the adapter into the same local
   variable the seven existing call sites already read (lines 337, 352, 356, 385, 432, 537, 566), so
   those sites do not change shape. Handle the empty-catalog case explicitly: the page must render a
   "no hay proyectos disponibles" state rather than crashing on `projects[0]`.

9. **Delete `frontend/src/data/mockProjects.js`** and its import.

10. **`docs/project-catalog-contract.md` — amend** with both fields, in the same PR (handbook: "the
    document leads").

## Acceptance criteria map

This work has no user story, so the criteria are its own.

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `C1` — No import of `mockProjects` remains, and the file is gone | 8, 9 | `grep -r mockProjects frontend/src` returns nothing; eslint passes with no unresolved import |
| `C2` — `catalogProjectToSimulation` maps every field the simulation reads | 6 | vitest in `frontend/src/lib/simulation/__tests__/projectAdapter.test.js`, one case per field plus a single-price project (`precio_min_uf == precio_max_uf`) |
| `C3` — A price range renders as `"desde X UF"`; a single price renders bare | 7 | vitest on `formatProjectPrice`, both branches |
| `C4` — The simulation page renders catalog projects, with description and delivery month | 3, 5, 8 | Reviewer steps: seed applied, open `/simulacion`, confirm the selector lists seeded projects and a card shows `descripcion` and `entrega_estimada` |
| `C5` — An empty catalog does not break the page | 8 | Reviewer steps: with a tenant that has no projects, `/simulacion` shows the empty state and does not throw. **Verify this against a genuinely empty catalog, not against the RLS hole from standing question 2** — before `20260827090200_proyectos_lectura_lead.sql`, every lead hit the empty state and the criterion passed for the wrong reason |
| `C6` — Both fields round-trip through the admin form, and a bad month is rejected | 3, 4, 5 | vitest on `projectValidation` for the `YYYY-MM` rule; reviewer steps: create a project with both fields, reload, confirm persistence |
| `C7` — Both migrations are idempotent | 1, 2 | Reviewer steps: run `supabase db push` twice; the second run changes nothing and raises no error |
| `C8` — HU 7's admin catalog behaviour is unchanged otherwise | 3, 4, 5 | `frontend/src/services/__tests__/projectCatalog.test.js` (26 existing tests) stays green without modification |

## Assumptions

- **The demo seed's 8 projects belong to the demo inmobiliaria** created by
  `20260802_fix_demo_seed.sql`. If that seed is ever removed, this one breaks — it is guarded by a
  subquery on the inmobiliaria name, not a hardcoded UUID.
- **PR #69 merges before this PR.** If the reviewer forces changes to HU 7's catalog contract, steps
  3 and 6 must be re-checked against the revised shape.
- **`valor_uf` remains a lossy convenience** for the scenario math until UNIDADES-PROYECTO lands.
  It is no longer an unlogged judgment because the UI no longer claims it is *the* price — but the
  simulation still evaluates the cheapest unit, and an executive should read a scenario as
  "at entry price", not "at this project".
