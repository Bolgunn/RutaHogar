# PLAN — HU 26: Métricas de interés por proyecto

- **Story:** `Wiki RutaHogar/UserStories/HU26-metricas-interes-proyecto.md` · **Actor:**
  Administrador inmobiliario (`admin_inmobiliario`, or `admin` with an inmobiliaria)
- **Status:** Built · Deseable · SP not given in the story · **Depends on:** HU 15 (Métricas page
  and `/metricas` route, merged) · `ALG-10` (built) · HU 9 favorites (`proyecto_favoritos`) · HU 17
  saved scenarios (`mortgage_scenarios`). **Required by:** none.
- **Number collision:** the wiki already has `HU26-simulacion-subsidios.md` (WIKI-RENUMBER backlog).
  This story was handed over as "HU26 - Métricas de interés por proyecto"; the backlog owner must
  decide which one keeps the number before merge. Renaming is a docs-only change (story page,
  this folder, `ALG-19` "Last changed").
- **Branch:** `feat/hu26-metricas-interes-proyecto` (from `develop`)

## Start here

- Read first: `docs/algorithms/ALG-19-project-interest-metrics.md` and `ALG-19-cases.json` — every
  number on the tab. This plan never restates its rules.
- Read first: `docs/algorithms/ALG-10-lead-project-affinity.md` — the verdicts ALG-19 consumes.
- Read first: `supabase/migrations/20261005150000_hu15_commercial_funnel_facts.sql` — the RPC style
  (tenant scope, `row_number()` lead ids, `clock_timestamp()`) mirrored here.
- Stop and report if: a metric seems to need a weight or threshold ALG-19 does not give; the RPC
  seems to need a profile id, email or interaction timestamp; anything would change `POST /score`,
  `scoring_engine/`, `ALG-10` or an existing RLS policy.

## Goal

The tenant admin can see which projects attract leads (visualizaciones, simulaciones, favoritos),
how many of the interested leads cannot actually buy each project, and why — so the offer can be
compared with real demand and real purchase capacity. Until now views were only a GA4 event,
invisible to the inmobiliaria, and favorites/simulations were owner-only rows nobody aggregated.

## Approach & decisions

Same shape as HU 15: one `SECURITY DEFINER` read RPC returns anonymized facts for the caller's
tenant, a pure `lib/` function (ALG-19) turns them into every metric, and the page only renders.
The one new piece of data is a per-day view log, written through a function rather than a table
grant.

| Decision | Rationale |
| :------- | :-------- |
| A third tab, "Interés por proyecto", on the existing Métricas page, **admins only** | E1 says "accede al dashboard de métricas, cuando seleccione la vista por proyectos". The story's actor is the admin; ejecutivos keep the two HU 15 tabs |
| The HU 15 filter bar is hidden on this tab | Its filters (afinidad, capacidad, prioridad) apply to HU 15's facts, not to ALG-19's. Showing them would imply they filter this tab |
| Views live in a new table `proyecto_visualizaciones (usuario_id, proyecto_id, dia)`, PK on the three | One row per lead × project × Santiago day (ALG-19 A2): idempotent insert, immune to refreshes and React double mounts, and it stores no more than a day |
| Views are written only by `registrar_visualizacion_proyecto(p_proyecto)`, `SECURITY DEFINER`; the table has RLS on, no policies and no grants to browser roles | A lead cannot read, forge another user's or delete views. The function ignores staff (A7) and ids that are not a `proyectos` row (portal listings from `proyectos_rag` are not a tenant's projects) |
| The view is recorded where the catalog already fires the GA4 `project_compatibility_viewed` event (`ProjectEvaluationModal`), fire-and-forget | Same moment, same once-per-open guard; a failed write never blocks the lead |
| Simulación = saved financing scenario (`mortgage_scenarios.project_id`) | ALG-19 A3: the HU 6 page pre-selects the first project, so selections are not a signal |
| Read RPC `project_interest_facts()` returns `{ now, proyectos, leads }`; a lead row is `{ lead_id, evaluacion_actual, interacciones }` with **counts only** | ALG-10 must run in the browser (ALG-10 header), so the latest evaluation travels, as in HU 15. Ids are `row_number()`, no interaction timestamp leaves the database |
| Only `admin_inmobiliario` / `admin` with an inmobiliaria; everyone else gets `forbidden` (`42501`) | Story actor. Global admin is already redirected away from `/metricas` (`App.jsx`) |
| Incompatible = ALG-10 exclusion; reasons = ALG-10's pair-scoped blocker | ALG-19 A1, R3–R4. The executive's lead panel (HU 10) and this tab cannot disagree on a pair |
| No chart library | Guardrail 1. Count bars reuse HU 15's `cm-hbar` styles |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No scoring change. **New `ALG-19`** (no tunable numbers). `ALG-10` consumed unchanged |
| 2 | Needs RLS / multi-tenant scoping? | Yes. New table with RLS on and no browser grants; the read RPC scopes to `get_my_inmobiliaria()` and admin roles. No existing policy changes |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes: `20261026120000_hu26_project_interest.sql` + rollback + `schema.sql` sync. Applied by the CTO with `supabase db push` after merge — never pasted into the SQL editor |
| 4 | Changes the `POST /score` contract? | No |
| 5 | Consent / privacy impact? | Views are new behavioral data about the lead, stored only as (lead, project, day). Staff never see them per lead: the RPC returns counts per anonymous row. Favorites become visible to the admin **only as counts**, which `proyecto_favoritos`'s migration names as the condition for exposing them. `on delete cascade` on `profiles` keeps ARCO cancelación working. No new consent needed: the lead already consented to the precalificación, and nothing identifies them on the admin side |

> 1 and 3 are checked against the diff by CI.

## Entities

**New — `public.proyecto_visualizaciones`**: `usuario_id uuid → profiles(id) on delete cascade`,
`proyecto_id uuid → proyectos(id) on delete cascade`, `dia date`, `primera_at timestamptz default
now()`, PK `(usuario_id, proyecto_id, dia)`, index on `proyecto_id`. RLS enabled, no policies,
`revoke all` from `anon, authenticated`.

**New — `public.registrar_visualizacion_proyecto(p_proyecto uuid) returns boolean`**, `volatile
security definer set search_path = public`. Returns `false` (and writes nothing) unless
`auth.uid()` is a profile with `role = 'usuario'` and `p_proyecto` is a `proyectos` row. Otherwise
inserts `(auth.uid(), p_proyecto, (now() at time zone 'America/Santiago')::date)` `on conflict do
nothing` and returns whether a row was added. Granted to `authenticated` only.

**New — `public.project_interest_facts() returns jsonb`**, `stable security definer`. Raises
`forbidden` unless `get_my_inmobiliaria()` is set and `get_my_role()` ∈ {`admin_inmobiliario`,
`admin`}. Returns:

```json
{ "now": "<clock_timestamp()>",
  "proyectos": [ { "id", "nombre", "comuna", "tipo", "precio_min_uf", "precio_max_uf", "estado" } ],
  "leads": [ { "lead_id": "1",
               "evaluacion_actual": { "input", "onboarding", "result" } | null,
               "interacciones": [ { "proyecto_id", "visualizaciones", "favorito", "simulaciones" } ] } ] }
```

`proyectos` = every project of the tenant, ordered `nombre, id`. A lead is a `role = 'usuario'`
profile with at least one view, favorite or saved scenario on one of them. Granted to
`authenticated` only.

**Read, unchanged:** `profiles`, `evaluations`, `proyectos`, `proyecto_favoritos`,
`mortgage_scenarios`. No existing rows change.

## Algorithms

- **`ALG-19`** — project interest metrics. **New**, written before the code:
  `docs/algorithms/ALG-19-project-interest-metrics.md`, cases `ALG-19-cases.json`. Implemented in
  `frontend/src/lib/commercial/projectInterestMetrics.js`; asserted by
  `frontend/src/lib/commercial/__tests__/projectInterestMetrics.test.js`. 9 open assumptions.
- **`ALG-10`** — implemented as-is, no changes. Called once per interested lead.

**Local logic** (story-local): the Spanish labels of each `motivo`; the tab's alternative sorts by
column; per-day view dedup (in SQL, ALG-19 A2).

## Scope

**In:** the migration (table, two functions), rollback, `schema.sql` sync, SQL tests; ALG-19 and
its tests; `services/projectInterestService.js`; the view hook in `ProjectEvaluationModal`; the
"Interés por proyecto" tab; the wiki story page.

**Out:**

- A period filter ("este mes") → follow-up (ALG-19 A9).
- A per-project minimum score set by the inmobiliaria → its own story (ALG-19 A1).
- Favorite history ("alguna vez favorito") → needs an event log on `proyecto_favoritos` (A4).
- Interest on portal listings (`proyectos_rag`, HU 19) → they belong to no tenant.
- Anonymous visitors' views → a lead must be signed in to be a lead; GA4 already covers traffic.
- CSV export, alerts → not asked by E1–E3.

## Steps

1. **ALG-19** document and cases (done before code).
2. **Migration** `supabase/migrations/20261026120000_hu26_project_interest.sql` per **Entities**,
   in `begin; … commit;`, idempotent. Rollback in `supabase/rollback/` dropping only what it
   created. Append the same DDL to `supabase/schema.sql`.
3. **SQL tests** `supabase/tests/project_interest_facts.sql` (style of `commercial_funnel_facts.sql`):
   1. A lead's first view of the day returns `true`, the second `false`; one row.
   2. An ejecutivo's or admin's view, and a view of an unknown id, return `false` and write nothing.
   3. `anon` cannot execute either function; `authenticated` cannot select or insert the table.
   4. `admin_inmobiliario` of A: `proyectos` = all of A's projects, including one with no interest;
      counts per lead and project are correct (two days → 2 views; favorite; two scenarios → 2).
   5. A lead interacting only with B's project is absent for A; B's project never appears.
   6. Ejecutivo, global admin, lead → `forbidden`.
   7. No profile id or email in the result; `lead_id`s are `"1" … "n"`; a lead without evaluation
      has `evaluacion_actual = null`.
   8. Deleting a profile deletes its views (ARCO).
4. **ALG-19** `frontend/src/lib/commercial/projectInterestMetrics.js`:
   `computeProjectInterestMetrics({ proyectos, leads }, { match })`, `ALG19_VERSION`.
5. **ALG-19 tests**: every case in `ALG-19-cases.json` with invariants 1–9 asserted on each output,
   frozen inputs, determinism; plus one case through the **real** `matchLeadToProjects` so the
   wiring to ALG-10's row shape is pinned.
6. **Service** `frontend/src/services/projectInterestService.js`: `getProjectInterestFacts()`
   (`null` without Supabase; `forbidden` → a Spanish message) and `registerProjectView(id)`
   (no-op without Supabase; errors logged, never thrown).
7. **View hook**: `ProjectEvaluationModal` calls `registerProjectView` next to
   `trackProjectCompatibilityViewed`.
8. **Tab** `frontend/src/components/ProjectInterestMetrics.jsx`, rendered by `CommercialMetrics`
   when the admin picks "Interés por proyecto": KPI tiles (leads interesados, visualizaciones,
   simulaciones, favoritos); the ranking table (position, project, interesados, the three counts,
   incompatibles with their rate, motivo principal) with a sort selector whose default is ALG-19
   R2; a detail panel for the selected project with the compatibility split and the grouped
   reasons. Help tooltips explain each term in words, never with ALG-10's numbers. `null` rate → "—".
9. **Wiki** story page `Wiki RutaHogar/UserStories/HU26-metricas-interes-proyecto.md` (Spanish,
   criteria verbatim, implementation notes linking ALG-19).

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — ranking by traction with visualizaciones, simulaciones, favoritos | 2–8 | `ranking_por_interesados_no_por_volumen`, `desempate_*`, `proyecto_sin_interes_aparece_al_final`; SQL cases 1, 4; reviewer: as a lead open two projects and favorite one, then as the tenant admin open Métricas → "Interés por proyecto" |
| `E2` — interested leads incompatible with each project | 4, 5, 8 | `buckets_de_compatibilidad`, `lead_en_dos_proyectos_cuenta_una_vez`, `solo_sin_datos_tasa_nula`; reviewer: the "Incompatibles" column and the detail split |
| `E3` — grouped main reasons per project | 4, 5, 8 | `motivos_agrupados_y_ordenados`, `motivo_de_capacidad_no_toma_un_bloqueador_no_critico`; reviewer: select a project with incompatible leads, read its reasons |
| Scope and privacy | 2, 3 | SQL cases 2, 3, 5, 6, 7, 8 |
