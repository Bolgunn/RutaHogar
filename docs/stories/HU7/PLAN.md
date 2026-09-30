# PLAN — HU 7: Real Estate Project Catalog Management

- **Story:** `Wiki ScoreLeads/UserStories/HU7-ProjectCatalog.md` · **Actor:** Real Estate Admin (`admin`, scoped by `inmobiliaria_id`)
- **Status:** 🔜 Sprint 1 · Essential · 5 SP · **Required by:** HU 13 (Lead–Project Matching) — co-Sprint-1, **not implemented**
- **Branch:** `feature/sprint1/HU7`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first: `docs/project-catalog-contract.md` (the frozen contract HU 13 codes against) ·
  `Wiki ScoreLeads/research/spike1-e4-lead-project-matching-criteria.md` (normative for matching) ·
  `frontend/src/components/AdminArcoRequests.jsx` and `DashboardLeads.jsx` (the list + modal + confirm
  patterns and CSS classes to reuse) · `supabase/migrations/20260605_fix_rls_infinite_recursion.sql`
  (why a `profiles` policy may never subquery `profiles`).
- Stop and report if: a matching rule would have to be decided here — matching is HU 13's, this story
  exposes raw project facts only; or a `profiles` policy cannot be written without subquerying
  `profiles` (42P17 recursion).

## Goal

Let a real estate admin register and maintain a catalog of real estate projects (name, inmobiliaria,
comuna, type, UF price range, status) and link executives to them, so the future matching engine
(HU 13) recommends leads only against projects that are actually available. The catalog is
multi-tenant: each project and each executive belongs to an inmobiliaria, and a scoped admin manages
only their own. The schema and a documented contract keep the catalog CRM-adaptable so a client's CRM
can later supply projects and assignments — the wiring itself is owned by HU 4 / Spike 2.

## Approach & decisions

The catalog ships as a frontend service plus Supabase tables with RLS, mirroring `arcoService.js` —
no FastAPI endpoint and no change to `POST /score`. Pure logic is extracted into
`projectValidation.js` so the acceptance criteria can be asserted without a database, and the shape
both providers return is frozen up front because HU 13 must code against it before this story merges.

| Decision | Rationale |
| :------- | :-------- |
| Frontend service + Supabase, no new backend endpoint | S2 keeps `POST /score` frozen; the catalog is not scoring, and `arcoService` already proves this seam |
| Contract frozen and published before HU 13 starts | HU 13 is co-Sprint-1; a shape that moves after they start costs both stories |
| Tenant assignment via `SECURITY DEFINER` RPCs, not client writes | a client-side write cannot enforce "this executive belongs to one inmobiliaria"; the rule has to live where RLS can see it |
| Executives assignable by email before they have an account | an admin builds the catalog before the team signs up; the join row carries `estado='pendiente'` and resolves on signup |
| `precio_min_uf == precio_max_uf` allowed | a single-price project is legitimate; HU 13 owns the divide-by-zero this creates in its holgura scorer |
| Prices in UF, independent of `PRECIOS_REFERENCIA_UF` | guardrail #7; matching is preference-independent and never reads that table (Spike 1 E4 §1, §2) |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No.** No ALG document exists or changes. Nothing under `backend/app/scoring_engine/` is touched; no scoring number is read or written |
| 2 | Needs RLS / multi-tenant scoping? | **Yes — this is the story's core.** RLS on all three new tables; `profiles` policies tightened from blanket-admin to inmobiliaria-scoped (S6) |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes** — `20260729_project_catalog.sql`, `20260731_executive_accounts.sql`, `20260801_arco_global_admin_only.sql`, `20260802_fix_demo_seed.sql`, mirrored into `schema.sql`, with a rollback in `supabase/rollback/`. Applied by the author against the linked project before review |
| 4 | Changes the `POST /score` contract? | **No** (S2) |
| 5 | Consent / privacy impact? | Indirect and tightening: the same PR closes an ARCO tenant hole so a scoped admin can no longer read another inmobiliaria's lead ARCO requests (S5, S6). No new personal data is collected |

## Entities

**New tables.** `inmobiliarias` (id, nombre unique, created_at) · `proyectos` (id, inmobiliaria_id FK
cascade, nombre, comuna, `tipo ∈ {departamento, casa}`, `precio_min_uf`/`precio_max_uf` with
`> 0 AND min <= max`, `estado ∈ {disponible, en_construccion, agotado}`, timestamps; unique on
`(inmobiliaria_id, lower(nombre))`) · `proyecto_ejecutivos` (PK `(proyecto_id, ejecutivo_email)`,
`ejecutivo_id` nullable FK, `source ∈ {manual, crm}`, `estado ∈ {pendiente, vinculado}`).

**New column.** `profiles.inmobiliaria_id` — nullable; **NULL means global admin**, which is why
existing rows need no backfill and why the seed can ship before any tenant exists.

**RPCs** (`SECURITY DEFINER`, `set search_path = public`): `get_my_inmobiliaria`, `assign_executive`,
`assign_admin` (global-admin only).

**Contract.** `getProjects` / `getAvailableProjects` return the shape frozen in
`docs/project-catalog-contract.md` — referenced here, not restated, so the two cannot drift.

**Existing rows.** The seed inserts two demo inmobiliarias and sample projects only; it must converge
on environments where an earlier version already ran. Migrations cannot seed `profiles` (they FK to
`auth.users`), so admin and executive test accounts are created by hand or through `create-executive`.

## Algorithms

No ALG document is referenced, added or changed. `docs/algorithms/` does not exist yet, and nothing
here qualifies: the catalog has no tunable number and implements no scoring rule.

**Local logic** (no ALG number, story-local): `validateProject` (field and price-range validation),
`filterAvailable` (the E4 exclusion), `decideExecutiveBinding` (the tenant-bind decision the RPC
mirrors). All three live in `frontend/src/services/projectValidation.js` as pure functions and are
unit-tested. If HU 13 grows a second consumer of any of them, promote it then.

## Scope

**In:** the three tables plus `profiles.inmobiliaria_id`; multi-tenant RLS and the three RPCs; the
admin catalog UI and its route; `projectService.js` (local + supabase providers) over the frozen
contract; the CRM contract document; the first vitest harness; executive account provisioning; and
the ARCO tenant fix the RLS tightening exposed.

**Out:**
- Matching itself — **HU 13**. This story exposes project facts; it computes no capacity, affinity or ranking.
- The real CRM connection — **HU 4 / Spike 2**. `source='crm'` exists on the join; no adapter code ships.
- Ejecutivo-facing project UI — **HU 13**. HU 7 grants only DB read access for it to build on.
- Unit/typology-level prices — **catalog v2**, recorded in the story's Notes.
- Any `POST /score` or `PRECIOS_REFERENCIA_UF` change — S2, guardrail #7.

## Steps

1. **Migration `supabase/migrations/20260729_project_catalog.sql`** — the three tables with their
   CHECK constraints and unique index; `profiles.inmobiliaria_id`; the `set_updated_at` trigger reused;
   `get_my_inmobiliaria` / `assign_executive` / `assign_admin`; RLS on all three tables plus
   inmobiliaria-scoped replacements for the blanket `profiles` admin policies. Mirror the DDL into
   `supabase/schema.sql` and write `supabase/rollback/20260729_project_catalog_rollback.sql`. Seed two demo
   inmobiliarias with a mix of `disponible` / `en_construccion` / `agotado`; do **not** seed the real
   client.
2. **`frontend/src/constants/proyectos.js`** — `tipoProyectoLabels`, `estadoProyectoLabels`; reuse
   `comunasMvp` for the comuna dropdown.
3. **`frontend/src/services/projectValidation.js`** — `validateProject`, `filterAvailable`,
   `decideExecutiveBinding`, `hasComunaReferencePrice`. Pure, no Supabase import.
4. **`frontend/src/services/projectService.js`** — branch on `isSupabaseDataConfigured`; the contract
   copy lives in the file header. `getProjects, getAvailableProjects, createProject, updateProject,
   setProjectStatus, deleteProject, getProjectExecutives, assignExecutive, unassignExecutive`.
   `deleteProject` rejects while assignments exist (retire via `setProjectStatus('agotado')`).
   Mark the seam where a future `crm` provider attaches.
5. **`frontend/src/components/AdminProjectCatalog.jsx`** — list-primary + shared create/edit modal
   (executives section in edit mode only), tenant context bar, toolbar filters, status pills, delete
   confirm. Reuse the classes named in `AdminArcoRequests` / `DashboardLeads`; no new CSS patterns.
   All copy in Spanish.
6. **Routing** — `App.jsx`: `page === "admin-projects"` guarded by `profile.role === roles.admin`,
   `/admin/proyectos` in `resolveRouteForPath` and the page↔path maps. No React Router.
7. **Navbar** — `{ id: "admin-projects", label: "Proyectos" }` under `navByRole[roles.admin]`.
8. **`docs/crm-integration.md`** — the proposed inbound contract and field mapping, documentation only,
   stating that HU 4 / Spike 2 owns the real connection.
9. **vitest** — add the devDependency and `test` script; spec at
   `frontend/src/services/__tests__/projectCatalog.test.js` covering all three pure functions.
10. **`docs/project-catalog-contract.md`** — publish the frozen contract at a tracked path so HU 13
    can code against it without reading this plan.
11. **Executive account provisioning** — `supabase/functions/create-executive/` (Edge Function),
    `executiveService.js`, `SetPassword.jsx` and the `/definir-password` route, with every variable
    documented in `supabase/functions/.env.example`. See amendment A2.
12. **ARCO tenant isolation** — `20260801_arco_global_admin_only.sql`. See amendment A3.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — creation persists name, inmobiliaria, comuna, tipo, price range, estado | 1, 4, 5 | Reviewer, running app: create a project as a scoped admin, reload, confirm it lists with every field intact |
| `E2` — incomplete or inconsistent data blocks saving | 1, 3, 5 | `projectCatalog.test.js` → `validateProject` cases (required fields, `min > max` rejected, `min == max` accepted, zero/negative rejected); reviewer: submit an empty form and `min > max`, confirm the save button stays disabled; duplicate name rejected by the DB |
| `E3` — assigned executives stay linked | 1, 4, 5 | `projectCatalog.test.js` → `decideExecutiveBinding` (bind / ok_same / reject_conflict); reviewer, hosted Supabase: assign by email → `vinculado` and survives reload; an executive already bound elsewhere → rejected; unknown email → `pendiente` |
| `E4` — sold-out generates no new recommendations | 1, 3, 4 | `projectCatalog.test.js` → `filterAvailable` (drops `agotado`, keeps `en_construccion`, keeps only `vinculado` execs); reviewer: mark a project `agotado`, confirm it leaves `getAvailableProjects` while staying visible in the admin view. **End-to-end matching exclusion is HU 13's to verify** — matching does not exist yet |

## Assumptions

- **HU 13 does not exist.** E4 asserts behavior inside matching. This story delivers the data source
  and verifies the exclusion at the service level; HU 13 verifies it end to end and codes against
  `docs/project-catalog-contract.md`.
- **HU 4 / Spike 2 owns the CRM connection.** The contract written here is a proposal Spike 2 may revise.
- **Migrations cannot seed `profiles`.** Test accounts are created by hand; the manual checklist below
  is how the multi-tenant criteria get evidence.

## Reviewer checklist — two-tenant isolation

Tier 2 evidence for E1, E3 and E4 requires a hosted Supabase run:

1. Apply the migrations; confirm the two demo inmobiliarias and their sample projects.
2. As a global admin, `assign_admin` admin A → demo 1, admin B → demo 2.
3. Sign in as admin A: only demo 1's projects are visible or selectable.
4. As admin A: assign an executive by email → `vinculado`; assign one already bound to demo 2 →
   rejected; assign an unknown email → `pendiente`.
5. Mark a demo 1 project `agotado` → absent from `getAvailableProjects`, still listed as sold out for the admin.
6. Admin A cannot read demo 2's profiles or ARCO requests; a scoped admin cannot call `assign_admin`.

## Amendments

Recorded per `docs/HANDBOOK.md` ("When the build gets it wrong" / "When reality diverges"). Each is a
place the plan's design did not survive contact with reality and was corrected here rather than left
undescribed.

| # | What changed | Why |
| :- | :----------- | :-- |
| A1 | `filterAvailable` excludes only `agotado`; the original plan said "keep only `disponible`" | Spike 1 E4 §5.1 authorizes exactly two excluding filters, and `estado` is not one of them. `en_construccion` is real sellable inventory (*venta en verde*); dropping it here would hide it from HU 13 silently. Story Notes and `docs/project-catalog-contract.md` updated to match |
| A2 | Executive account provisioning added (step 11) — the original plan assumed accounts were created by hand | The manual checklist needs executives that exist, and hand-creating them through the Supabase console is not something an admin can do, so E3 had no usable path in a real environment. `EJECUTIVO_TEST_PASSWORD_MODE` is a test-only escape hatch, off unless set to exactly `"true"`, and documented as such |
| A3 | ARCO tenant isolation added (step 12) | Tightening the `profiles` policies exposed that ARCO requests were still readable across tenants. Same defect class, same RLS surface, discovered by this story's own change — fixed on the branch rather than deferred, per S5/S6 |
| A4 | The frozen contract moved out of this plan into `docs/project-catalog-contract.md` (step 10) | HU 13 needs it without reading a plan for a story they are not building. The plan references it and does not restate it |
