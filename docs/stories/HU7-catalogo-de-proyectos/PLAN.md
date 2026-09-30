# PLAN — HU 7: Gestion del catalogo de proyectos inmobiliarios

- **Story:** HU 7 — Gestion del catalogo de proyectos inmobiliarios
- **Actor:** Real Estate Admin (role `admin`, scoped by `inmobiliaria_id`)
- **Source story:** `Wiki ScoreLeads/UserStories/HU7-catalogo-de-proyectos.md`
- **Status / Sprint:** 🔜 Sprint 1 · Category Essential · 5 SP
- **Required by:** HU 10 (matching lead-proyecto) — co-Sprint-1, **not implemented**

---

## Goal

Let a real estate admin register and maintain a catalog of real estate projects (name, inmobiliaria, comuna, type, UF price range, status) and link executives to those projects, so the future matching engine (HU 13) recommends leads only against projects that are actually available. The catalog is **multi-tenant**: each project and each executive belongs to an **inmobiliaria**, and a real-estate admin manages only their own inmobiliaria's catalog. The schema and a documented API contract keep the catalog and its executive assignments **CRM-adaptable** so a client's CRM can later supply projects and assignments (actual wiring is owned by HU 4 / Spike 2).

## Suggested branch

`feat/hu17-project-catalog` (a branch named `HU17` already exists locally; either is fine — **never commit to `main`/`master`**).

---

## In scope

- New tables: `inmobiliarias`, `proyectos`, `proyecto_ejecutivos`; new column `profiles.inmobiliaria_id`.
- Multi-tenant RLS + SECURITY DEFINER helpers/RPCs (`get_my_inmobiliaria`, `assign_executive`, `assign_admin`).
- Frontend admin page + service (`projectService.js`) with local + Supabase providers.
- `docs/crm-integration.md` — proposed CRM API contract + field mapping (documentation only).
- First `vitest` test harness for the pure logic.

## Out of scope (guardrails & story limits)

- **No `POST /score` contract change**, no new FastAPI endpoints (guardrail #5). The catalog is a frontend service + Supabase, exactly like `arcoService`.
- **No changes to `PRECIOS_REFERENCIA_UF`** (guardrail #7). We depend on `comunasMvp` for the comuna list and tolerate comunas the price table doesn't cover.
- **No CRM adapter code** and no pluggable adapter interface. Only `local` + `supabase` providers ship; the `crm` path is documented, not built. Actual CRM connection = HU 4 / Spike 2 (Sprint 2).
- **No ML** (guardrail #2); the catalog does not compute capacity/affinity — HU 13 owns that.
- **No React Router** — extend the `page`-state routing in `App.jsx` (project convention).
- Ejecutivo-facing project UI is **HU 13's**, not HU 17's. HU 17 only grants ejecutivos DB read access to their inmobiliaria's projects so HU 13 can build on it.

## Scope note (numbering)

`CLAUDE.md` guardrail #6 ("no features outside HdU 1–4") uses the **old HdU numbering** and predates the E4 renumbering. HU 17 is a new E4 story with **Status 🔜 Sprint 1** (the primary in-scope signal per the wiki); `index.md`'s Rosetta map has no old-scheme equivalent for it. Confirmed in scope with the user.

---

## Assumptions / unmet dependencies

- **HU 13 (matching) is not implemented.** E4 ("sold-out project generates no new recommendations") asserts behavior *inside* matching, which does not exist yet. HU 17 delivers the **data source** (`getAvailableProjects()` returning only `estado='disponible'` + `vinculado` executives) and verifies the exclusion at the service/DB level. The end-to-end matching exclusion is HU 13's to verify. HU 13 must code against the **frozen contract** below.
- **HU 4 / Spike 2 owns the real CRM connection.** The API contract HU 17 writes is a *proposed* shape Spike 2 may revise. HU 17 keeps the schema CRM-ready (`source='crm'` on the join) but wires nothing.
- **Migrations cannot seed `profiles`** (they FK to `auth.users`, which only exist after signup). The seed creates inmobiliaria rows + sample projects only; admin/executive test accounts are created by hand per the verification checklist.

---

## Frozen contract for HU 13 (put verbatim; HU 13 codes to this)

`getProjects()` and `getAvailableProjects()` return an array of:

```js
{
  id, inmobiliaria_id, inmobiliaria_nombre,
  nombre, comuna,
  tipo,                         // 'departamento' | 'casa'
  precio_min_uf, precio_max_uf,
  estado,                       // 'disponible' | 'en_construccion' | 'agotado'
  ejecutivos: [                 // getAvailableProjects: only estado='vinculado'
    { ejecutivo_id, email, nombre }   // admin view also includes estado='pendiente'
  ],
  created_at, updated_at
}
```

`getAvailableProjects()` = same shape filtered to `estado === 'disponible'` **and** only `vinculado` executives. HU 17 exposes **raw project facts only**; HU 13 combines these with the lead's `financial_indicators` to compute estimated capacity, down payment, and affinity (compared against `precio_min_uf`/`precio_max_uf`).

---

## Ordered implementation steps

### 1. Database migration — `supabase/migrations/2026XXXX_project_catalog.sql`
(Choose a date-prefixed name consistent with the existing `2026MMDD_*.sql` migrations. Also mirror the final DDL into `supabase/schema.sql` to keep it canonical.)

1. `create table public.inmobiliarias (id uuid pk default gen_random_uuid(), nombre text unique not null, created_at timestamptz not null default now());`
2. `alter table public.profiles add column if not exists inmobiliaria_id uuid references public.inmobiliarias(id) on delete set null;`
3. `create table public.proyectos (...)` with columns per the resolved schema and CHECK constraints:
   - `tipo text not null check (tipo in ('departamento','casa'))`
   - `estado text not null default 'disponible' check (estado in ('disponible','en_construccion','agotado'))`
   - `precio_min_uf numeric not null`, `precio_max_uf numeric not null`
   - `constraint proyectos_precio_check check (precio_min_uf > 0 and precio_max_uf > 0 and precio_min_uf <= precio_max_uf)`
   - `inmobiliaria_id uuid not null references public.inmobiliarias(id) on delete cascade`
   - `created_at`, `updated_at` + `set_updated_at` trigger (reuse existing function).
   - `create unique index proyectos_nombre_por_inmobiliaria_idx on public.proyectos (inmobiliaria_id, lower(nombre));`
4. `create table public.proyecto_ejecutivos (proyecto_id uuid not null references public.proyectos(id) on delete cascade, ejecutivo_id uuid references public.profiles(id) on delete set null, ejecutivo_email text not null, source text not null default 'manual' check (source in ('manual','crm')), estado text not null default 'pendiente' check (estado in ('pendiente','vinculado')), created_at timestamptz not null default now(), primary key (proyecto_id, ejecutivo_email));`
5. **Helpers (SECURITY DEFINER, `set search_path = public`) — never subquery `profiles` inside a `profiles` policy:**
   - `get_my_inmobiliaria()` → `select inmobiliaria_id from public.profiles where id = auth.uid()`.
   - `assign_executive(p_project_id uuid, p_email text)` → resolves `profiles` by email + `role='ejecutivo'`; if found and `inmobiliaria_id` is NULL, set it to the project's inmobiliaria; if set to a **different** inmobiliaria, `raise exception`; upsert the join row (`ejecutivo_id`, `estado='vinculado'`, `source='manual'`). If no profile exists, insert the join row with `ejecutivo_id=NULL`, `estado='pendiente'`. Enforce the caller is an admin of the project's inmobiliaria (or global).
   - `assign_admin(p_inmobiliaria_id uuid, p_email text)` → **global admin only** (`get_my_role()='admin' AND get_my_inmobiliaria() IS NULL`); sets target profile `role='admin'`, `inmobiliaria_id=p_inmobiliaria_id`.
   - (Optional) a resolver run on signup/login that flips matching `pendiente` rows to `vinculado` and applies the bind rule — or do it lazily inside `getProjectExecutives`. Keep it server-side.
6. **RLS:** enable on all three new tables.
   - `inmobiliarias`: select for any authenticated admin; insert/update restricted to global admin (`get_my_inmobiliaria() IS NULL AND get_my_role()='admin'`).
   - `proyectos`: admin CRUD where `inmobiliaria_id = get_my_inmobiliaria()` OR global admin (NULL); ejecutivo **select** where `inmobiliaria_id = get_my_inmobiliaria()` (feeds HU 13).
   - `proyecto_ejecutivos`: same tenant rule via the parent project's inmobiliaria; mutations go through the RPCs.
   - **Tighten `profiles` (fixes the tenant hole):** replace the blanket `Profiles select admin` / `admins update any profile` policies with inmobiliaria-scoped versions using `get_my_inmobiliaria()`/`get_my_role()` — a scoped admin may select/update only `role='ejecutivo'` rows where `inmobiliaria_id IN (get_my_inmobiliaria(), NULL)`; global admin (NULL) keeps full access. Do **not** reintroduce `profiles`-subquerying policies (42P17 recursion — see `20260604_fix_rls_infinite_recursion.sql`).
7. **Seed:** insert **only** the 2 imaginary test inmobiliarias (e.g. `Inmobiliaria Andes (demo)`, `Inmobiliaria Pacífico (demo)`), each with 2–3 sample `proyectos` (mix of `disponible` / `en_construccion` / `agotado`) so cross-tenant isolation and the sold-out filter are demonstrable. **Do not seed the real client (`Echeverría Izquierdo`)** — it will be onboarded later via `assign_admin` + the inmobiliarias UI.

### 2. Constants — `frontend/src/constants/proyectos.js` (new)
Export `tipoProyectoLabels` (`departamento`, `casa`), `estadoProyectoLabels` (`disponible`, `en_construccion`, `agotado`), and reuse `comunasMvp` from `constants/comunas.js` for the comuna dropdown.

### 3. Pure logic module — `frontend/src/services/projectValidation.js` (new)
Export **provider-agnostic pure functions** (so vitest can cover them without Supabase):
- `validateProject(input)` → `{ ok, errors }`: required fields non-empty; `comuna ∈ comunasMvp`; `tipo`/`estado ∈ enums`; `precio_min_uf > 0`, `precio_max_uf > 0`, `precio_min_uf <= precio_max_uf` (`==` allowed, no upper cap).
- `filterAvailable(projects)` → keeps `estado==='disponible'`, maps `ejecutivos` to `vinculado` only.
- `decideExecutiveBinding({ execInmobiliariaId, projectInmobiliariaId })` → `'bind' | 'ok_same' | 'reject_conflict'` (the pure decision the RPC mirrors).
- `hasComunaReferencePrice(comuna)` — for the soft warning (list the `PRECIOS_REFERENCIA_UF` comuna keys as a frontend constant, or accept the set as an arg to stay decoupled from the backend).

### 4. Data service — `frontend/src/services/projectService.js` (new)
Mirror `arcoService.js`: branch on `isSupabaseDataConfigured`; `PROVIDER = 'local' | 'supabase'` (leave a comment marking where a future `'crm'` branch attaches — see `docs/crm-integration.md`). Functions: `getProjects, getAvailableProjects, createProject, updateProject, setProjectStatus, deleteProject, getProjectExecutives, assignExecutive, unassignExecutive`.
- **Supabase:** table reads/writes for `proyectos`/`proyecto_ejecutivos` (join to `inmobiliarias` for `inmobiliaria_nombre`); `assignExecutive`/`assign_admin` via `supabase.rpc(...)`. Reuse `logSupabaseError`.
- **Local (single-tenant collapse):** on first use seed one local demo inmobiliaria (e.g. `Inmobiliaria Andes (demo)` — **not** the real client) in `localStorage`; treat the local admin as scoped to it; store projects + assignments under that key. Bind rule is a no-op (one tenant); a manual assignment is stored **email-only and immediately `vinculado`** so E3/E4 are demoable. `deleteProject` allowed only when the project has zero assignments.
- Both providers return the **frozen contract** shape above. `deleteProject` rejects when assignments exist (retire via `setProjectStatus('agotado')`).
- `getProjects({ inmobiliariaId })`: a scoped admin always gets their own tenant (RLS enforces it). A **global admin** may pass a specific `inmobiliariaId` **or** omit it / pass `'all'` to fetch across every tenant (for the "Todas las inmobiliarias" view) — the returned rows carry `inmobiliaria_nombre` so the UI can show the inmobiliaria column.

### 5. Admin UI — `frontend/src/components/AdminProjectCatalog.jsx` (new)

**This is the authoritative UI spec — build it as described; reuse the existing classes named below, do not invent new patterns or CSS.** Model it on `AdminArcoRequests.jsx` (list + modal + confirm) and `DashboardLeads.jsx` (toolbar-filters + table-wrap + status-pill + detail modal). All strings in Spanish.

**5.0 — Page shell & structure.** Structure = **list-primary + modal** (create and edit share ONE modal; the executives section only appears in edit mode). Root: `<section className="section-block">` → `<div className="section-heading">` with `<span className="eyebrow">Administración</span>`, `<h1>Catálogo de proyectos</h1>`, and a one-line `<p>`.

**5.1 — Tenant context bar** (directly under `section-heading`, rendered by role via `get_my_inmobiliaria()`/profile):
- **Scoped admin** (`inmobiliaria_id` set): read-only chip — `Inmobiliaria: <nombre>`. No selector. Page operates on their tenant only.
- **Global admin** (`inmobiliaria_id` NULL): a `toolbar` row with:
  - an inmobiliaria `<select>` including a **"Todas las inmobiliarias"** option (drives the table; `'all'` fetches across tenants),
  - a "＋ Nueva inmobiliaria" `secondary-button compact-button` → tiny modal (`nombre` input → create inmobiliaria),
  - an "Asignar administrador" `secondary-button compact-button` → modal (inmobiliaria `<select>` + email input → `assign_admin` RPC).
  - These three render ONLY for a global admin.

**5.2 — Toolbar filters** (`<div className="toolbar-filters">`, mirror `DashboardLeads`): text search by `nombre` (full-width `<label>`+`<input>`); `Estado` `<select>` (`Todos / Disponible / En construcción / Agotado`); `Comuna` `<select>` built from the loaded projects' comunas. Show a "Limpiar filtros" `secondary-button compact-button` only when a filter is active (reuse the `hasActiveFilters`/`clearFilters` pattern). Below it, a row-count line (`small-text`): `"N proyectos"` or `"N de M proyectos"`.

**5.3 — Projects table** (`<div className="table-wrap"><table>`):
- Columns: **[Inmobiliaria — global admin only]** · `Nombre` · `Comuna` · `Tipo` · `Rango UF` (`3.000 – 4.500 UF`, es-CL thousands) · `Estado` · `Ejecutivos` · actions.
- **Estado** cell: `<span className="status-pill {cls}">` with `disponible→alto`, `en_construccion→medio`, `agotado→bajo` (reuse existing pill classes, no new CSS). Labels from `estadoProyectoLabels`.
- **Ejecutivos** cell: count of `vinculado`; if any `pendiente`, append `" · N pend."`.
- **Actions** cell (`secondary-button compact-button` each): `Editar`; a status quick-action — `Marcar agotado` when `estado !== 'agotado'`, else `Reactivar` (→ `setProjectStatus` to `agotado`/`disponible`, one-click, reversible); and `Eliminar` **only rendered when the project has zero executives** (styled with the destructive/`bajo` accent). When executives exist, omit `Eliminar` and show a muted `inline-note`: *"Retira este proyecto marcándolo como agotado."*
- Empty `<tbody>`: filters active → `"No hay proyectos que coincidan con los filtros aplicados."`; true-empty → `"Aún no hay proyectos en este catálogo."` + a "Crear primer proyecto" primary button.
- Above the table, a "Nuevo proyecto" primary button opens the create modal.

**5.4 — Create/Edit modal** (reuse the `DashboardLeads`/`AdminArcoRequests` inline-styled overlay+card; header row with `<h2>` title + "Cerrar" `compact-button`). Title `Nuevo proyecto` / `Editar proyecto`. Body = `<div className="form-grid">` of `field-wrap` blocks:
- **Nombre** — text input, required.
- **Inmobiliaria** — `<select>`, rendered ONLY for a global admin (default to the context-bar selection if a specific tenant is chosen; required when context = "Todas").
- **Comuna** — `<select>` from `comunasMvp`; `field-label-row` with a `FieldTooltip` ("La comuna define el precio referencial usado por el matching."). When `!hasComunaReferencePrice(comuna)`, show `<span className="field-warning">Sin precio referencial — el matching usará solo el rango de precio del proyecto.</span>`.
- **Tipo** — `<select>`: Departamento / Casa (from `tipoProyectoLabels`).
- **Estado** — `<select>`: Disponible / En construcción / Agotado (default `disponible` on create); `FieldTooltip` ("«Agotado» excluye el proyecto de las recomendaciones del matching.").
- **Rango de precio (UF)** — one `field-wrap` with two number inputs side by side (`Mínimo` / `Máximo`) and a static "UF" label (**no** `unit-toggle` — UF only). Inline `field-warning` when `precio_min_uf <= 0`, `precio_max_uf <= 0`, or `precio_min_uf > precio_max_uf` (`==` is valid).
- Client-side validation mirrors `validateProject` exactly; the "Guardar proyecto" button is `disabled` while invalid; per-field `field-warning` messages. `form-actions`: "Cancelar" (`secondary-button`) + "Guardar proyecto" (primary, shows `"Guardando…"` while awaiting).
- **Executives section** — rendered only in **edit** mode (existing `id`), below the form, titled "Ejecutivos asignados":
  - Add-by-email row: email `input` + "Asignar" `compact-button` (→ `assignExecutive(projectId, email)`, shows `"Asignando…"`). Cross-tenant RPC rejection → `error-message` inside the modal ("Este ejecutivo ya pertenece a otra inmobiliaria."). Unknown email → appears in the list as `pendiente` with a helper line ("Se vinculará cuando el ejecutivo cree su cuenta.").
  - List: each row = name (or email if no profile yet) · `status-pill` badge (`vinculado→alto`, `pendiente→medio`) · "Quitar" `compact-button` (→ `unassignExecutive`).
  - Empty (saved, no execs) → `empty-state`: "Aún no hay ejecutivos asignados."
  - In **create** mode, replace the whole section with `<p className="inline-note">Guarda el proyecto para asignar ejecutivos.</p>`.

**5.5 — Delete confirm modal** (reuse the `AdminArcoRequests` confirm pattern: overlay + card + "Cancelar"/"Confirmar y eliminar"): body *"¿Eliminar el proyecto «<nombre>»? Esta acción no se puede deshacer."* On confirm → `deleteProject` (shows `"Eliminando…"`), then `success-message` + list refresh. (`deleteProject` still rejects server-side if assignments exist — backstop against races.)

**5.6 — Loading / feedback / refresh states.**
- Initial fetch → `<p className="small-text">Cargando proyectos…</p>`.
- After every mutation → a top-of-panel `success-message` / `error-message`, auto-cleared on the next action (mirror ARCO). RPC rejections also surface as `error-message` within the relevant modal.
- Mutation buttons show busy labels (`Guardando… / Asignando… / Eliminando…`) and are `disabled` while awaiting.
- Update local state optimistically, then reconcile with the service response (as `App.jsx`/ARCO do) — **no** full page reload.
- Empty states per 5.1/5.3/5.4 above.

### 6. Routing — `frontend/src/App.jsx`
- Import `AdminProjectCatalog`.
- Add `page === "admin-projects"` render branch guarded by `profile.role === roles.admin`.
- Add `/admin/proyectos` to `resolveRouteForPath` (admin branch) and `getPrivatePathForPage` / `getRouteForPage`.

### 7. Navbar — `frontend/src/components/Navbar.jsx`
Add `{ id: "admin-projects", label: "Proyectos" }` to `navByRole[roles.admin]`.

### 8. CRM contract doc — `docs/crm-integration.md` (new)
Document the **proposed** inbound API contract (revisable by Spike 2): `syncProjectsFromCrm(payload)` / `syncAssignmentsFromCrm(payload)` signatures + payload shapes; field mapping (CRM project → `proyectos` columns; CRM executive id/email → `proyecto_ejecutivos.ejecutivo_email` + `source='crm'`, flowing through the pending-tolerant join); the ingest endpoint we would expose; sync direction (read-only pull, phase 1); and the exact seam in `projectService.js` where a `crm` provider attaches. State clearly that HU 4 / Spike 2 owns the real connection.

### 9. Test harness — first `vitest`
- Add `vitest` devDependency and `"test": "vitest run"` (+ optional `"test:watch"`) to `frontend/package.json`.
- Spec (e.g. `frontend/src/services/__tests__/projectCatalog.test.js`) covering `validateProject` (all rules incl. `==` allowed, negative/zero rejected, per-field required), `filterAvailable` (drops non-`disponible`; keeps only `vinculado` execs), and `decideExecutiveBinding` (bind / same / reject_conflict).

---

## Acceptance-criteria map

| Criterion | Satisfied by (steps) | Verification |
| :-- | :-- | :-- |
| **E1** — Project creation (name, inmobiliaria, comuna, type, price range, status → saved) | 1 (`proyectos`), 4 (`createProject`), 5 (form) | Manual UI (local + Supabase): create a project, confirm it persists and lists. |
| **E2** — Validation (incomplete/inconsistent prices block save) | 1 (CHECKs + unique index), 3 (`validateProject`), 5 (client form) | **vitest** on `validateProject`; manual: try empty fields, `precio_min>precio_max`, duplicate name → save blocked at client + DB rejects. |
| **E3** — Linking executives (assigned executives stay linked) | 1 (`proyecto_ejecutivos`, `assign_executive` RPC), 4 (`assignExecutive`), 5 (assign UI) | **vitest** on `decideExecutiveBinding`; manual Supabase: assign by email → persists; cross-tenant email → rejected; unknown email → `pendiente`. |
| **E4** — Sold-out excluded from matching | 1 (seed w/ `agotado`), 3 (`filterAvailable`), 4 (`getAvailableProjects`) | **vitest** on `filterAvailable`; manual: mark project `agotado` → absent from `getAvailableProjects` (ejecutivo path). End-to-end matching exclusion deferred to HU 13. |

---

## Manual Supabase verification checklist (two-tenant isolation)

1. Apply the migration to the linked Supabase project; confirm seed rows (the 2 demo inmobiliarias + sample projects; the real client `Echeverría Izquierdo` is intentionally **not** seeded).
2. Create **two** test admin accounts (sign up), then as a **global** admin call `assign_admin` to bind admin A → demo inmobiliaria 1, admin B → demo inmobiliaria 2.
3. Sign in as admin A: sees only inmobiliaria 1's projects; cannot see/select inmobiliaria 2's executives or projects.
4. As admin A, assign an executive by email → row `vinculado`; assign an email that is an executive **already bound to inmobiliaria 2** → **rejected**; assign an unknown email → `pendiente`.
5. Mark an inmobiliaria-1 project `agotado`; sign in as an ejecutivo of inmobiliaria 1 → the project is absent from `getAvailableProjects`, present (as sold out) in the admin view.
6. Confirm admin A cannot read profiles/emails of inmobiliaria 2 (RLS), and a scoped admin cannot call `assign_admin` (global-only).

---

## Definition of done

- E1–E4 all satisfied and verified (vitest green + manual checklist passed).
- Guardrails honored: no `/score` change, no `PRECIOS_REFERENCIA_UF` edit, no CRM adapter code, no React Router, works locally without Supabase.
- Migration applies cleanly and is mirrored into `schema.sql`; no 42P17 recursion; RLS enforces tenant isolation.
- `frontend/npm run build` succeeds and `npm run test` passes.
- `docs/crm-integration.md` present and consistent with the shipped schema.
