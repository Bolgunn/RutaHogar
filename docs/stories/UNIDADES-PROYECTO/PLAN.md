# PLAN — UNIDADES-PROYECTO: per-unit pricing for the project catalog

- **Story:** none yet — **this likely deserves a wiki HU**, see Open questions · **Actor:** Administrador inmobiliario (owner) · Ejecutivo comercial (consumer)
- **Status:** 📝 **draft spec — not grilled** · not sized · **Depends on:** HU 7 (PR #69) and [CATALOGO-UNICO](../CATALOGO-UNICO/PLAN.md) · **Required by:** nothing yet; would sharpen HU 10
- **Branch:** `feature/unidades-proyecto`, off whatever has merged by then

> **This plan has not been through phase 1.** It was written to make option C concrete enough to
> argue with, not to hand to a build session. The handbook's pipeline is grill → plan → build;
> this skipped the grill. **Grill it before building it** — the Open questions section is the
> agenda. Sections below marked *(unresolved)* are the ones most likely to change.

## Start here

- Read first: `frontend/src/services/projectService.js` (frozen contract + note 3, which anticipated
  this work), `supabase/migrations/20260729_project_catalog.sql` (the RLS and trigger patterns to
  mirror), `frontend/src/components/AdminProjectCatalog.jsx`, `docs/project-catalog-contract.md`
- Stop and report if: deriving `precio_min_uf`/`precio_max_uf` cannot be made to leave the frozen
  contract byte-identical for consumers

## Goal

The catalog models a project as a name, a comuna, a type and a **price range typed by hand**. Real
estate does not work that way: a project is a set of unit types — 1D, 2D, 3D — each with its own
price, area and bedroom count, and the "range" is just the min and max of those. Because the schema
has no unit, three things are currently impossible or dishonest:

1. **The simulation evaluates a project at its entry price** (`valor_uf := precio_min_uf`), so a lead
   is told they are compatible with a project when they can only afford its cheapest unit.
2. **`dormitorios` has nowhere to live.** It was dropped from the mock in CATALOGO-UNICO precisely
   because a project does not have *a* bedroom count.
3. **HU 10's evidence card can only say "this project"** — never *"alcanza el 2D de 2.400, no el 3D
   de 3.100"*, which is the sentence an executive actually needs.

HU 7 left the door open for exactly this. `projectService.js`, contract note 3:

> *"Hoy los digita el admin; si más adelante se agrega un modelo de unidades pasan a derivarse
> (MIN/MAX) sin cambiar este contrato."*

This work walks through that door **without changing the contract**, which is what makes it safe to
do after HU 10 rather than before.

## Approach & decisions *(unresolved — this is the grill agenda)*

Add a `proyecto_unidades` child table, derive the project's price range from it, and leave every
existing consumer reading the same fields it reads today.

| Decision | Rationale | Confidence |
| :------- | :-------- | :--------- |
| A child table, not JSON on `proyectos` | Units are queried, aggregated and eventually filtered on. A JSON column makes MIN/MAX a scan and RLS a nuisance | High |
| `precio_min_uf`/`precio_max_uf` stay physical columns on `proyectos`, **maintained by trigger** | Keeps the frozen contract, every existing query and all 26 catalog tests untouched. A view would change the read path; a computed-on-read in `projectService` would leave the DB inconsistent for anything not going through the frontend | Medium — see Open questions |
| A project with **no** units keeps its hand-entered range | Migration path: every existing project stays valid, and small inmobiliarias that do not want unit-level detail are not forced into it | Medium |
| Units carry `tipologia`, `dormitorios`, `banos`, `superficie_m2`, `precio_uf`, `disponible` | The minimum that makes a unit a unit and matching useful. Deliberately excludes floor, orientation, parking, bodega — add them when something reads them | Medium |
| Matching stays at **project** granularity in HU 10; unit granularity is a follow-up | Changing ALG-9's holgura component from "interpolate within the range" to "find the best affordable unit" is a real algorithm change to weights that are already uncalibrated | Low — arguably the whole point is unit matching |

## Standing questions *(provisional)*

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **Not as scoped here.** No `scoring_engine/` file changes. If unit-level matching is pulled in, ALG-9's holgura component changes and this answer becomes "yes" |
| 2 | Needs RLS / multi-tenant scoping? | **Yes.** `proyecto_unidades` holds no personal data but is tenant inventory; it needs policies mirroring `proyectos`, resolved through `proyecto_id → inmobiliaria_id`. **A new table without RLS does not ship (S6)** |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes** — new table, indexes, RLS, trigger, rollback. Not auto-applied; whoever merges runs it and says so in the PR |
| 4 | Changes the `POST /score` contract? | **No** |
| 5 | Consent / privacy impact? | **None.** Commercial inventory only |

## Entities

| Entity | Change |
| :----- | :----- |
| `public.proyecto_unidades` *(new)* | `id uuid pk` · `proyecto_id uuid not null references proyectos(id) on delete cascade` · `tipologia text not null` (e.g. `"2D2B"`) · `dormitorios int not null check (>= 0)` · `banos int not null check (>= 0)` · `superficie_m2 numeric` · `precio_uf numeric not null check (> 0)` · `disponible boolean not null default true` · `created_at` / `updated_at` |
| Indexes | `(proyecto_id, precio_uf)` for the MIN/MAX aggregate; `(proyecto_id, dormitorios)` for future filtering |
| RLS | Select for any authenticated member of the owning inmobiliaria; insert/update/delete for that tenant's admin. Resolved via `proyecto_id`, mirroring `can_admin_inmobiliaria` |
| Trigger | On insert/update/delete of a unit, recompute the parent's `precio_min_uf`/`precio_max_uf` from `min(precio_uf)`/`max(precio_uf)` **over available units**. When the last unit is deleted, leave the last derived values rather than nulling — the columns are `not null` |
| `public.proyectos` | **No column added or removed.** `precio_min_uf`/`precio_max_uf` change from hand-entered to derived *when units exist* |
| Frozen contract | **Additive only** — `unidades: [...]` on the returned project. Existing fields keep their names, types and meaning, exactly as note 3 promised |

**Existing rows:** untouched. Every project without units behaves precisely as it does today, which
is what makes this incrementally adoptable.

## Algorithms

None created as scoped. **If unit-level matching is pulled in**, `ALG-9`'s holgura component is
amended — replacing interpolation within `[precio_min_uf, precio_max_uf]` with a selection over
units — and that is an ALG change in this PR, not a refactor.

## Scope

**In:** the table, indexes, RLS, trigger and rollback · `unidades` on the read contract · nested
unit CRUD in the admin catalog · displaying the unit breakdown in the simulation page ·
`docs/project-catalog-contract.md` amendment.

**Out:**

- **Unit-level matching in HU 10** *(unresolved — see Open questions)*.
- **A bedroom preference in the intake.** Without one, `dormitorios` is display-only again — the same
  objection that kept it out of CATALOGO-UNICO. **This is the single biggest open question**; adding
  the field belongs to HU 1.
- **Unit inventory management** — counts, reservations, sold status beyond the `disponible` flag.
  That is a CRM's job (HU 4 / Spike 2), not a pre-qualification tool's.
- **Floor, orientation, parking, bodega, m² terraza.**

## Steps *(sketch — do not build from this without a grill)*

1. Migration: table, indexes, RLS policies, `set_updated_at` trigger, and the MIN/MAX recompute
   trigger. Rollback alongside.
2. `projectService.js`: fetch `unidades` with the project; extend the frozen-contract header.
3. `projectValidation.js`: validate a unit — `precio_uf > 0`, `dormitorios >= 0`, `tipologia`
   non-empty.
4. `AdminProjectCatalog.jsx`: nested unit CRUD. **`AdminProjectCatalog.jsx` is already 1.226 lines —
   extract a `ProjectUnitsEditor` subcomponent rather than growing it.** This is the largest piece of
   work here, not the schema.
5. `SimulationPage`: show the unit breakdown; the `"desde X UF"` label from CATALOGO-UNICO becomes
   derived from real units rather than a hand-typed minimum.
6. Amend `docs/project-catalog-contract.md`.

## Acceptance criteria map *(provisional)*

| Criterion | Verified by |
| :-------- | :---------- |
| `U1` — A project with units derives its range from them | pytest/SQL test: insert three units, assert `precio_min_uf`/`precio_max_uf` on the parent |
| `U2` — A project without units keeps its hand-entered range | The 26 existing `projectCatalog.test.js` tests stay green unmodified |
| `U3` — Deleting a unit recomputes the range | SQL test around the trigger |
| `U4` — A unit is invisible across tenants | RLS test: an executive of inmobiliaria B cannot select A's units |
| `U5` — The frozen contract is unchanged for existing consumers | `matchLeadToProjects` and its ALG-9 cases pass without modification |

## Open questions — the grill agenda

1. **Should matching move to unit granularity?** It is the strongest argument for this work and the
   biggest scope risk. Matching a lead to *"the 2D at 2.400"* rather than *"the project, somewhere
   between 2.400 and 3.100"* changes HU 10's E1, E3 and E4 for the better — and changes ALG-9.
2. **Does the intake gain a bedroom preference?** Without it, `dormitorios` is decoration. With it,
   HU 1's form changes and every stored evaluation predates the field.
3. **Trigger, view, or application-side derivation?** The trigger keeps the contract but duplicates
   state. Worth pressure-testing against a generated column or a `proyectos_con_rango` view.
4. **What happens when the last available unit is marked unavailable?** Does the project become
   `agotado` automatically — and does that interact with `getAvailableProjects()` excluding
   `agotado` (HU 7 E4)?
5. **Does this deserve a wiki HU?** It is product-visible and admin-facing, unlike CATALOGO-UNICO or
   REFACTOR. `HU20-TBD.md` and `HU30-TBD.md` are unallocated slots. A product decision, not a
   technical one.
6. **Is per-unit pricing what Echeverría Izquierdo actually keeps?** Spike open item 1 already asks
   Commercial for the UF price range of the client's real projects. The same conversation should ask
   whether they track unit types — if they publish a single "desde" price per project, this whole
   model is speculative.

## Assumptions

- **Inmobiliarias maintain unit-level data.** If they do not, the admin UI is burden without benefit
  and the hand-entered range stays the norm — which the design tolerates but which would make this
  work low-value. Open question 6 settles it.
- **CATALOGO-UNICO has landed**, so `mockProjects` is gone and the simulation already reads the
  catalog.
