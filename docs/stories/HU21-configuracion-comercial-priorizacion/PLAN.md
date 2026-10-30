# PLAN — HU 21: Configuración comercial y priorización por inmobiliaria

- **Story:** HU 21 — Configuración comercial y priorización por inmobiliaria
- **Actor:** Administrador inmobiliario (`admin_inmobiliario`, or `admin` with `inmobiliaria_id`)
- **Source story:** `Wiki RutaHogar/UserStories/HU21-configuracion-comercial-priorizacion.md`
- **Status / Sprint:** 🗓 Planificada · Sprint 3 · 5 SP · Responsable: Benjamín
- **Depends on / Required by:** no hard dependency. Shares the audit concern with HU 28 (not implemented) — HU 21 does **not** build the generic audit log (see Resolved decisions). Builds on HU 10 (`ALG-10`), HU 14 (`ALG-14`), HU 15 (`ALG-18`), HU 16 (tenant scoping).
- **Branch:** `feat/hu21-configuracion-comercial-priorizacion` (cut from PR #164's head, which is `develop` + one docs commit; rebase if #164 changes before merging)

---

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **Yes.** `backend/app/scoring_engine/commercial_priority.py` gains a `criterios` parameter; new `scoring_engine/commercial_criteria.py`; new constants. **`ALG-19`** (new). Under defaults **no number changes** — invariant 1 asserts it. New ranges are assumptions A1–A7 in `ALG-19`. The financial score, classification, blockers and `SCORING_VERSION` do not change |
| 2 | Needs RLS / multi-tenant scoping? | **Yes.** New table `configuracion_comercial` with RLS **enabled and no policy for `anon`/`authenticated`** (deny-all); only `service_role` (the backend) reads and writes. Tenant always taken from the actor's profile (`staff_actor`), never from the request (S6) |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes**, one file: `supabase/migrations/20261029120000_hu21_configuracion_comercial.sql`. **The author applies it**, as a single file — `supabase db query --linked -f <file>` then `supabase migration repair --status applied 20261029120000` — **never `supabase db push`** (prod migration history has ~19 unrecorded migrations). Apply **before** the code reaches `main`. The table starts empty and empty means defaults, so the new code is safe on an empty table. Steps go in the PR body |
| 4 | Changes the `POST /score` contract? | **No** (S2). `calculate_commercial_priority` keeps its exact output shape; `POST /score` calls it with `criterios=None`. Only staff endpoints change: `GET /tracking/staff/evaluations` gains fields, and three staff endpoints are added |
| 5 | Consent / privacy impact? | **None for the lead**: no lead-facing view, endpoint or stored field changes, asserted by test. The preview returns **counts only**, never a list of leads. The configuration holds no personal data beyond `created_by` (a staff profile id); history shows staff names to the admin of the same inmobiliaria only |

> CI checks these against the diff. An answer contradicted by the files touched fails the build.

## Goal

Let each inmobiliaria's admin decide how **their** staff prioritizes leads — which commercial action a
lead gets (`Contactar ahora`, `Contactar con revisión`, …) and the order of the executive's tray —
without touching the financial score, the classification, or any stored evaluation. Today the action
is computed once inside `POST /score` and is identical for every inmobiliaria, although one lead is
visible to several of them; the "opportunity signals" (purchase term, property seen) change only the
reason text, never the action.

## Approach

The engine's stored `commercial_priority_detail` stays as the reference. On every staff read the
backend recomputes the action from the evaluation's stored fields with the actor's inmobiliaria
criteria (`ALG-19` R0–R8) and returns it next to the stored one — never written back. The
configuration is closed parameters over the fixed rule chain; R1–R3 (incomplete complement, critical
blocker, missing objective data) are locked. It is stored as insert-only versions, so the history is
the data. The tray orders by tiers (`ALG-19` R9), not weights.

## Entities

| Entity | New / existing | Change |
| :----- | :------------- | :----- |
| `public.configuracion_comercial` | **new** (migration) | `id uuid pk default gen_random_uuid()` · `inmobiliaria_id uuid not null references inmobiliarias(id)` · `version int not null check (version >= 1)` · `criterios jsonb not null` · `alg_version text not null` · `created_by uuid not null references profiles(id)` · `created_at timestamptz not null default now()` · `unique (inmobiliaria_id, version)` · index `(inmobiliaria_id, version desc)` · RLS enabled, **no policies** for `anon`/`authenticated`, `revoke all` from them; `grant select, insert` to `service_role` only — no update, no delete for anyone |
| `GET /tracking/staff/evaluations` | existing | each item gains `commercial_priority_configured` + `differs_from_engine` **only when the actor has an `inmobiliaria_id`**; the response gains a top-level `commercial_config: { version, proyectos_prioritarios, orden_desempate }` (what the executive's tray needs; no other criteria are exposed to executives) |
| `GET /tracking/staff/commercial-config` | **new** | admin with inmobiliaria only. Returns `{ vigente: { version, criterios, created_at, created_by_name } \| null, defaults, opciones, historial: [{ version, created_at, created_by_name, cambios: [{ key, before, after }] }] }`. `opciones` lists every allowed value from R0 so the UI renders controls from it and never re-implements validation |
| `POST /tracking/staff/commercial-config/preview` | **new** | body `{ base_version: int \| null, criterios }`. Validates (R0, `422` per key), returns `{ cambios, conteos: { vigente: {action_key: n}, borrador: {action_key: n} }, leads_que_cambian: n }`. Writes nothing |
| `POST /tracking/staff/commercial-config` | **new** | same body. Validates, then inserts `version = (base_version or 0) + 1`. If `base_version` is not the latest → `409 {code: "config_version_conflict"}`; the unique constraint backs this against races. Returns the new `vigente` |
| `StaffLeadService` (`backend/app/tracking/staff.py`) | existing | `evaluations()` enriches rows; new methods or a sibling service for the three config endpoints |
| `TrackingRepository` (`backend/app/tracking/repository.py`) | existing | `latest_commercial_config(inmobiliaria_id)`, `commercial_config_history(inmobiliaria_id)`, `insert_commercial_config(row)`, `tenant_project_states(inmobiliaria_id, ids)` |

`staff_actor` already returns `id, role, inmobiliaria_id` (`repository.py:103`).

## Algorithms

- **`ALG-19` — new**, `docs/algorithms/ALG-19-configurable-commercial-priority.md` +
  `ALG-19-cases.json` (pytest) + `ALG-19-ranking-cases.json` (vitest). Drafted during the grill;
  **must be reviewed and signed by the author before the build starts**. Numbers: none changed under
  defaults; new ranges are assumptions A1–A7.
- **`ALG-10`** — consumed as-is (affinity, `Compatible` band, best match across projects). No change.
- **`ALG-14`, `ALG-18`** — implemented as-is. `ALG-18` R1b reads the priority through
  `priorityKeyFromDetail`; it now receives the configured priority when present (same keys).

## In scope

- `ALG-19` R0–R8 in the backend, R9 in `leadRanking.js`.
- Table, repository, service and the three staff endpoints; enrichment of `/staff/evaluations`.
- Admin page `/admin/priorizacion` (view, edit, preview, apply, history, restore defaults).
- Tray: action rail, separate financial-classification filter, R9 ordering with and without a project,
  sort selector enabled without a project, default sort from the configuration.
- `LeadDetailModal`: configured action, plus "el motor sugiere: …" when it differs.
- `crmService` and `funnelMetrics` read the configured priority when present.

## Out of scope

- **The financial score, classification, blockers, `POST /score`** — untouched (S1, S2, S4).
- **Rewriting or adding to `evaluations`** — the configured priority is never persisted (E2).
- **A generic audit log** — HU 28 owns it; it may later reference `configuracion_comercial.id`.
- **A free rule editor or new criteria** (e.g. "income above X") — new levers are an `ALG-19` amendment.
- **A per-lead list in the preview** — counts only.
- **CRM integration** (old HdU 5) — `crmService` only changes which field it reads.
- **Global admin** editing or viewing any inmobiliaria's configuration.
- **The lead's views** (`ProfilePage`, `Result`, `Recommendations`, tracking) — must not change.

## Steps

Order matters: the algorithm and the backend come first so the frontend consumes a real contract.

0. **Prerequisite (human).** Review and sign `ALG-19` and both case files. The build session does not
   start until this is done; if the build finds `ALG-19` wrong or ambiguous it **stops and reports**.

1. **Constants** — `backend/app/scoring_engine/constants.py`: `COMMERCIAL_PRIORITY_ALG_VERSION =
   "hu21-commercial-priority-v1"`, `DEFAULT_COMMERCIAL_CRITERIOS`, the allowed values of R0
   (`COMMERCIAL_CRITERIA_OPTIONS`), `COMMERCIAL_ACTION_TIERS` (A6), `MAX_PRIORITY_PROJECTS = 5`,
   `PURCHASE_TERM_ALIASES` (`0_3_meses`→`inmediato`, `3_6_meses`→`3_a_6_meses`, `6_12_meses`→`6_a_12_meses`).
   Every literal in R0–R8 lives here, once. In a **separate `refactor` commit**, point the alias map in
   `backend/app/main.py:159` at `PURCHASE_TERM_ALIASES` (moves a value, changes no behaviour).

2. **Criteria module** — new `backend/app/scoring_engine/commercial_criteria.py`, pure:
   `normalize_criterios(raw) -> dict` (fills defaults per `alg_version`, sorts sets),
   `validate_criterios(raw, tenant_project_states) -> list[{key, code}]` (R0, including the
   `subir_con_senales = 2` rule and project checks), `diff_criterios(before, after) -> list[{key, before, after}]`.

3. **Priority function** — `backend/app/scoring_engine/commercial_priority.py`: add
   `explain_commercial_priority(classification, project_fit, blockers, score, data, criterios=None)`
   implementing R1–R8 + signals + R5b and returning the full ALG-19 output (`action_key`, `promoted`,
   `fixed_rule`, `alg_version`, …). `calculate_commercial_priority` keeps its **exact current signature
   and 4-key output** (`level`, `action`, `reason`, `send_to_crm`) by delegating with `criterios=None`
   and dropping the extra keys — `POST /score` stays byte-identical. Add
   `configured_priority_for_evaluation(row, criterios, config_version)` that reads the stored fields
   listed in `ALG-19` Inputs (handling legacy `null`s) and adds `differs_from_engine`.

4. **Migration** — `supabase/migrations/20261029120000_hu21_configuracion_comercial.sql` as described in
   Entities, wrapped in `begin; … commit;`, with a header comment naming HU 21 and stating that the table
   is backend-only. Add a row to `docs/database.md` for the table and its deny-all RLS.

5. **Repository** — `backend/app/tracking/repository.py`: the four methods in Entities, via the existing
   `self.request` REST helper (service role). `insert_commercial_config` maps a unique-violation
   response to `TrackingError("config_version_conflict")`.

6. **Service** — `backend/app/tracking/staff.py`:
   - `evaluations(token)`: when `actor.inmobiliaria_id`, load the latest configuration once, compute
     `commercial_priority_configured` per row with step 3, add `differs_from_engine`, and add the
     top-level `commercial_config`. Rows of a global admin are returned exactly as today.
   - Config methods `config(token)`, `preview_config(token, body)`, `save_config(token, body)`, allowed
     only for `admin_inmobiliario`, or `admin` with `inmobiliaria_id` (else `owner_mismatch` → 403/404 as
     the module already does). Preview counts use the **latest evaluation per lead** of
     `staff_evaluations(actor)`, excluding `reliability_status == "descartado"` (same universe as the tray).
     `created_by` and `inmobiliaria_id` come from the actor, never from the body.

7. **Routes** — `backend/app/tracking/routes.py`: `GET /staff/commercial-config`,
   `POST /staff/commercial-config/preview`, `POST /staff/commercial-config`, using `staff_context` and
   Pydantic bodies with `extra="forbid"`; `422` carries the per-key errors from step 2; `409` for
   `config_version_conflict`.

8. **Backend tests** — `backend/tests/test_alg19_cases.py` (every case + every `invalid_criterios` entry
   in `ALG-19-cases.json`; invariant 1 over cases tagged `default` and over the existing scoring test
   payloads; invariant 3 by enumerating all 7 392 valid configurations against the `locked` cases;
   invariant 5). `backend/tests/tracking/test_commercial_config.py`: permissions per role (executive and
   global admin cannot read or write config; lead token rejected), tenant taken from the actor even if the
   body carries another, `409` on stale `base_version`, preview writes nothing, `/staff/evaluations`
   enrichment present for tenant actors and absent for the global admin, **lead endpoints return
   identical responses with and without a saved configuration**. A static test over the migration SQL
   asserting RLS is enabled and no `authenticated` policy/grant exists (precedent:
   `test_market_snapshot_rls.py`).

9. **Frontend service** — new `frontend/src/services/commercialConfigService.js` (`getCommercialConfig`,
   `previewCommercialConfig`, `saveCommercialConfig`) following `trackingService.js`'s request helper.
   In `frontend/src/services/evaluationService.js`, pass through `commercial_priority_configured`,
   `differs_from_engine` and expose the response-level `commercial_config` to `DashboardLeads`.

10. **Ranking (R9)** — `frontend/src/lib/matching/leadRanking.js`: add the R9 comparator and
    `annotateCommercialPriority(leads, projects, commercialConfig)` that resolves per lead `action_key`
    (configured, else `priorityKeyFromDetail` of the stored detail), `prioritario_compatible` and best
    `afinidad` across non-`agotado` tenant projects using `matchLeadToProjects` (`ALG-10`, unchanged).
    `rankLeadsForProject` sorts `ranked` with R9 when a project is selected and **sorts all rows with R9
    when none is**. Amend the HU 2 pinning test in `__tests__/leadRanking.test.js` with a comment citing
    HU 21 / `ALG-19` R9, and add a test reading every case of `ALG-19-ranking-cases.json`.

11. **Tray** — `frontend/src/components/DashboardLeads.jsx`:
    - The rail (`:826`) becomes "Prioridad comercial": Total + the six actions with counts by resolved
      `action_key`; default filter `contact_now` (replaces `defaultClassification = "Alto"`).
    - A separate "Clasificación financiera" select (Todas / Alto / Medio / Bajo) keeps today's filter.
    - The sort select (`:824`) is enabled without a project; initial value = `commercial_config.orden_desempate`.
    - A short note under the tray when a configuration is active: "Orden según los criterios comerciales de tu inmobiliaria."

12. **Lead detail** — `frontend/src/components/LeadDetailModal.jsx` (`:421`) and the selected-lead panel
    in `DashboardLeads.jsx` (`:398`): show the configured action; when `differs_from_engine`, add
    "Prioridad según criterios de tu inmobiliaria · el motor sugiere: {acción guardada}".

13. **Other consumers** — `frontend/src/services/crmService.js:52` and
    `frontend/src/lib/commercial/funnelMetrics.js:331`: read `commercial_priority_configured` when present,
    else the stored detail. `ProfilePage.jsx` is **not** touched.

14. **Admin view helpers** — new `frontend/src/lib/commercial/commercialConfigView.js`, pure: labels for
    each criterion key and value, formatting of `cambios` for the preview and the history, and
    `priorityProjectsImpact(leads, projects, draftIds)` → "N leads compatibles con {proyecto} subirán
    dentro de su nivel" (uses `ALG-10`). Unit-tested in `lib/commercial/__tests__/`.

15. **Admin page** — new `frontend/src/components/AdminCommercialPriority.jsx`: header with the current
    version / date / author and the notice "Estos criterios ordenan la bandeja de tu equipo. No cambian el
    score ni la clasificación financiera de los leads."; 🔒 block with R1–R3; editable block rendered from
    `opciones`; "Restaurar valores por defecto" (loads defaults into the draft); "Previsualizar" →
    preview block (criteria diff, counts table with Δ and 🔒 on `do_not_route`, priority-projects line);
    "Aplicar configuración" enabled only after a successful preview of the current draft (any edit
    invalidates it); `409` shows "Otro administrador cambió la configuración; revisa los cambios" and
    reloads; history block (version · fecha · autor · cambios). Wire it per CLAUDE.md "Cómo agregar una
    página nueva": page `admin-priorizacion` in `App.jsx` (path `/admin/priorizacion`), route in
    `frontend/src/lib/staffRoutes.js`, guard = admin role **and** `inmobiliaria_id`, menu item
    "Priorización" in `Navbar.jsx` for `admin_inmobiliario` (and `admin` with inmobiliaria). No React Router.

16. **Docs** — update `ALG-19`'s header (`Last changed`, PR number). `docs/database.md` row (step 4).
    No wiki or `index.md` edits from the build session.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — Consulta de la configuración vigente | 6, 7, 15 | `test_commercial_config.py::test_get_returns_defaults_when_never_configured` and `::test_get_returns_latest_version`. **Reviewer:** log in as `admin_inmobiliario` → Priorización: sees the version (or "valores por defecto"), the 🔒 R1–R3 block, and the current values of capacity/affinity tie-break, priority projects and opportunity signals |
| `E2` — Modificación sin afectar el score | 2, 3, 6, 7, 8 | `test_alg19_cases.py` (invalid configurations rejected per key; invariant 1; invariant 3; invariant 4). `test_commercial_config.py::test_save_does_not_touch_evaluations` and `::test_lead_endpoints_identical_with_config`. **Reviewer:** note a lead's score/classification, apply a configuration that changes its action, confirm the score and classification are unchanged in the tray, in the lead detail and logged in as that lead |
| `E3` — Previsualización antes de confirmar | 6, 7, 14, 15 | `test_commercial_config.py::test_preview_writes_nothing` and `::test_preview_counts`. `commercialConfigView` unit tests. **Reviewer:** change a criterion → "Aplicar" disabled until "Previsualizar"; preview shows the diff and Δ counts; edit again → preview invalidated; "Descartar" leaves version unchanged |
| `E4` — Aplicación e historial | 3, 5, 6, 9–13, 15 | `test_commercial_config.py::test_save_creates_next_version`, `::test_stale_base_version_conflicts`, `::test_evaluations_use_latest_config`; `leadRanking.test.js` (`ALG-19-ranking-cases.json`). **Reviewer:** apply as admin A; log in as an executive of the same inmobiliaria → tray order and actions follow the new version; history shows what changed, when and by whom; an executive of **another** inmobiliaria sees no change |

## Safeguards

- **S1 — AI never decides.** `ALG-19` has no AI in its path; Groq narration still receives the stored
  engine detail through `POST /score`, unchanged.
- **S2 — `POST /score` frozen.** `calculate_commercial_priority` keeps its signature and 4-key output;
  invariant 1 + existing scoring tests prove it.
- **S3 — rules, not ML.** Closed parameters over a fixed rule chain.
- **S4 — score clamped and classified.** Not touched; invariant 4.
- **S5 — consent.** No new data is collected from the lead; nothing external is queried.
- **S6 — tenant scoping.** New table has RLS deny-all; tenant from `staff_actor`; cross-tenant test.
- **S7 — no credit approval.** The admin page states the criteria do not change the score; no copy
  implies approval.
- **S8 — no credentials.** None involved.

## Definition of done

- Tier 1 green: pytest (incl. `test_alg19_cases.py` and every existing scoring test) · eslint · vitest
  (incl. `ALG-19-ranking-cases.json`) · Playwright journeys.
- `ALG-19` signed by the author before the build; this plan and `ALG-19` committed in the same PR as the code.
- Migration applied to hosted Supabase by the author as a single file + `migration repair`, recorded in the PR.
- Tier 2 confirmed by a reviewer who is not the author, with evidence per criterion `E1…E4`.
- CTO code review (PR touches `scoring_engine/` and an `ALG-*`).
- No criterion silently dropped.

## Resolved decisions

| Decision | Rationale |
| :------- | :-------- |
| The admin configures the **commercial action** (and the tray order), not the financial score | The story says "sin modificar el score financiero"; S1–S3. "Score para su staff" in the team's wording means commercial priority |
| Configured priority is **computed at read time and never persisted** | One evaluation is shared by several inmobiliarias (`staff_evaluations_for_inmobiliaria`), so a per-tenant value cannot live in it; E2 forbids rewriting history; E4 needs the current config to apply to every lead |
| Computed in the **backend** on `/staff/evaluations`, consumed by the frontend | The rule already exists in Python — a JS copy would be the duplicated-rule failure the handbook exists to prevent; tenant resolved server-side; every staff surface reads that one path |
| R1–R3 **locked**, visible to the admin | `do_not_route` protects leads with morosidad or critical debt load (S7); R1/R3 are missing data, not commercial criteria |
| **Closed parameters** over the fixed chain, defaults = today | Every configuration is validatable and enumerable; preview diffs are one line; no regression until an admin acts; a rule editor is a story of its own |
| Tray ordered by **tiers**, not weights | No invented weights to calibrate; explainable in one line; the configured action always dominates |
| Lead and global admin see the **engine's** priority; tenant surfaces see the **configured** one | A lead belongs to several tenants and must not see one's strategy; the global admin has no tenant |
| Rail filters by **configured action**; financial classification becomes a separate filter | Today the rail labels `Alto` as "Alta prioridad"; with configurable priority that conflation misleads |
| **Insert-only versioned** table; priority projects inside `criterios` | History is the data and cannot drift from it; projects stay versioned and HU 25's bulk import cannot overwrite them |
| **No generic audit log** in HU 21 | Designing it with one consumer would fit HU 28/22/27 badly; HU 28 (same owner) decides and may reference the version id |
| Writes **only through the backend**, with `base_version` and `409` | One validation, in Python; no browser insert can bypass it; `created_by` cannot be forged; no silent lost update between two admins |
| RLS **deny-all** for `authenticated` (refined after the grill from "staff may read") | Every read already goes through the backend; a read policy would only add an unused surface |
| Frontend renders controls from `opciones` and does **not** re-validate (refined after the grill) | Keeps R0 in one place; the preview is the validation round-trip |
| Executives receive only `version`, `proyectos_prioritarios`, `orden_desempate` (refined after the grill) | That is all R9 needs; executives do not see the configuration page |
| Preview = criteria diff + **counts**, no lead list; priority-projects impact computed in the browser | Lets the admin judge the effect without exposing personal data; affinity is a frontend algorithm |
| `plazo_compra` uses the **score vocabulary** with onboarding aliases | `ScoreForm.jsx:136` and `main.py:159` already normalize; the "drift" raised in the grill was not real |
| Edit rights: `admin_inmobiliario` and `admin` with inmobiliaria | They own the tenant; executives consume; the global admin has no tenant |
| Migration applied by the author as a single file + `migration repair`, never `db push` | Prod migration history has unrecorded migrations; an empty table means defaults, so order of deploy is safe |
