# PLAN — HU 15: Dashboard de conversión y tiempos del proceso comercial

- **Story:** `Wiki RutaHogar/UserStories/HU15-dashboard-conversion-tiempos.md` · **Actor:**
  Administrador inmobiliario (`admin_inmobiliario`, or `admin` with an inmobiliaria) · Ejecutivo
  comercial
- **Status:** Planned · Sprint 2 · 8 SP · **Depends on:**
  `fix/admin-inmobiliario-role` (built, not merged) ·
  `feat/commercial-stage-base` (merged; migration `20260930120000` live since 2026-10-04) ·
  `feat/commercial-stage-project-tracks` (PR #112: built, reviewed, verified by hand; migration
  `20261005120000` **live in prod since 2026-10-05**, ahead of merge; meets ALG-18 "Requirements on
  other work" 1–7) · `ALG-10` (built). **Required by:** none.
- **Algorithm number:** renumbered **ALG-17 → ALG-18** on 2026-10-05. HU 18 (PR #111) published
  `ALG-17-co-debtor-consent-resolution.md` and `ALG-17-cases.json` first. The files on this branch are
  `ALG-18-commercial-funnel-metrics.md` and `ALG-18-cases.json`; the version constant is
  `ALG18_VERSION`. See *Changes from the project-tracks PR* below.
- **Branch:** `feat/hu15-dashboard-conversion-tiempos` (from `origin/develop`)

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this story goes here.

- Read first: `docs/algorithms/ALG-18-commercial-funnel-metrics.md` and `ALG-18-cases.json` —
  **the specification of every number on the page.** This plan never restates its rules.
- Read first: `docs/algorithms/ALG-10-lead-project-affinity.md` and
  `frontend/src/lib/matching/leadProjectMatching.js` — the bands ALG-18 consumes, unchanged.
- Read first: `supabase/migrations/20260930120000_commercial_stage.sql` and
  `docs/stories/commercial-stage/PLAN.md` — the stage tables, the `SECURITY DEFINER` + tenant
  helper style, and the SQL test style (`supabase/tests/commercial_stage.sql`) to mirror.
- Read first: `frontend/src/services/projectService.js` (`getProjects`, the `vinculado` filter in
  `getAvailableProjects`) and `frontend/src/lib/roles.js` on `fix/admin-inmobiliario-role`.
- **The build has two parts.** Part A (steps 1–4) is pure frontend logic and can be built now.
  Part B (steps 5–12) needs both prerequisite branches merged into `develop`; step 5 checks that.
- Stop and report if:
  - `feat/commercial-stage-project-tracks` is not merged, or does not meet one of ALG-18's
    "Requirements on other work" (nullable `proyecto_id`, the sell-out and restock jobs, the
    same-stage revival exception). Do **not** build those here — they belong to that branch.
  - A metric seems to need a threshold, cutoff or weight that ALG-18 does not give.
  - The page seems to need a chart library. It doesn't: inline SVG/CSS bars only (guardrail 1).
  - The RPC seems to need a field ALG-18's fact row doesn't list, or to return stage `reason`,
    `actor_id`, a lead email or name.
  - Anything would change `POST /score`, `scoring_engine/`, ALG-10's numbers, or an existing RLS
    policy.

## Goal

Give the tenant admin and each ejecutivo a management dashboard of the commercial process: how many
leads apply to a project, how they move through the commercial stages, what the improvement plan
contributes to sales, how long each step takes, how engaged leads are — broken down by project,
purchase capacity, priority and affinity, and followed over time week by week, month by month or
year by year. Commercial stages now exist (`feat/commercial-stage-base`), so for the first time
these numbers can be computed from recorded facts instead of estimated.

## Approach & decisions

One `SECURITY DEFINER` RPC returns one fact row per lead in the caller's scope, plus the in-scope
project list. A pure frontend function, `ALG-18`, turns them into every metric; the page only
renders. All metric logic is therefore vitest-pinned by `ALG-18-cases.json`, and the database side
only answers "which facts may this caller see". The two grills' decisions (D1–D12, G1–G18) are
recorded in ALG-18; the table below holds only the decisions this plan adds.

| Decision | Rationale |
| :------- | :-------- |
| The RPC returns `{ proyectos, facts }` in one call | Scope is decided once, in SQL; the project list and the leads can never disagree about who is in scope |
| `lead_id` in a fact row is `row_number()` over the lead's profile id, not the id | ALG-18 only needs a stable key within one call (ALG-18 Inputs). The dashboard is aggregate; it must not hand out joinable lead ids |
| Ejecutivo scope = projects of their inmobiliaria where they are assigned with `proyecto_ejecutivos.estado = 'vinculado'` | Same rule as `getAvailableProjects` (drops pending links) and as ALG-18 G3 for writes |
| Global admin (no inmobiliaria) and ejecutivos without an inmobiliaria get `forbidden` | D2 defines scope only for a tenant. Prod has 20 ejecutivos without a tenant (2026-10-04); the page shows an explanation, not an empty dashboard |
| A project-goal evaluation counts as an application only when `financial_data → input → project_goal → id` is set | Pre-`project_goal.id` goals can be recovered only by matching a UF value (`ProjectsCatalog.jsx`), which is a guess. Under-counting old applications is stated; inventing them is not |
| `now` is the **database's** time, returned by the RPC with the facts, taken once per data load and passed to ALG-18 (ALG-18 G27) | ALG-18 is deterministic in `now`; filtering or changing granularity must not shift the horizon. The browser's clock may run behind the server's, which would put a lead that just signed up after `now` |
| One new page, `metricas` (`/metricas`), with two tabs: "Embudo y tiempos" and "Evolución histórica" | E4 asks for a tab of historical evaluations; E1–E3 are one view with filters. A separate page keeps `DashboardLeads.jsx` (already large) untouched |
| Charts are inline SVG / CSS, no dependency | Guardrail 1; the page needs a funnel, bars and line series, nothing a library is required for |
| The priority label → key map lives in `lib/commercial/priorityActions.js`, with a vitest that parses `COMMERCIAL_ACTIONS` from `backend/app/scoring_engine/constants.py` | ALG-18 R1b: the stored value is the Spanish label. The parity test turns label drift into a red build instead of a silent `sin_prioridad` |
| Counts are the headline, rates secondary with `n`; no minimum-n cutoff | Persona review (admin and ejecutivo): at real scale rates are low and read as failure; a cutoff would be an invented number |
| No per-ejecutivo breakdown for admins; ejecutivos see only their own contacts via `por_mi` | Per-ejecutivo needs actor ids (reverses D9) plus an HR/privacy review, and both personas warned a ranking invites stage-gaming. The per-project table (ALG-18 R10) carries most of the signal |
| The "llamar hoy" queue, reservas at risk and pending promesas stay out | They are lists of leads — the leads dashboard's job (HU 2 / HU 14) — not metrics |
| **Reuse** `lead_belongs_to_proyecto(p_lead, p_proyecto)` and `is_ejecutivo_vinculado(p_proyecto)`, both created by the project-tracks migration `20261005120000`. Do not redefine either | D2 names the first. One definition each: project-tracks also redefined `lead_belongs_to_inmobiliaria` on top of `lead_belongs_to_proyecto`, so the rule exists once. Both are `stable security definer`, not granted to browser roles |
| The overall stage and the cause of a loss (ALG-18 R3 O1–O5, G8) come from **`overallStage()`** in `frontend/src/lib/commercial/overallStage.js`, landed by project-tracks. `funnelMetrics.js` calls it at each replay step and does not re-implement R3 | Project-tracks Q6: the lead-card badge is its first consumer, so it is a shared `lib/` function. Its input `[{ proyecto_id, stage, at, por_sistema }]` is each record's current stage plus the instant and `por_sistema` of its latest event, which the replay has at every step. Its tests are named by ALG-18 id (O1…O5, G8) |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No scoring change. **New `ALG-18`** (frontend, no tunable numbers of its own). `ALG-10` consumed unchanged; its proposed A1 note is applied only if the author approves at review (step 12) |
| 2 | Needs RLS / multi-tenant scoping? | Yes — scoping is the RPC's whole job: role + `get_my_inmobiliaria()` + `vinculado` assignments, `SECURITY DEFINER`, granted to `authenticated` only. No table policy changes |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes: `<timestamp>_hu15_commercial_funnel_facts.sql` + rollback + `schema.sql` sync, `<timestamp>` later than every migration in prod (≥ `20261005150000`; prod has `20261005120000` and `20261005130000`, and PR #114 takes `20261005140000`). Applied by the CTO with `supabase db push` after merge — **never pasted into the SQL editor** (see the 10-01 / 10-03 / 10-05 outages caused by hand-edited SQL) |
| 4 | Changes the `POST /score` contract? | No. (ALG-18's `action_key` engine follow-up is additive and outside HU 15) |
| 5 | Consent / privacy impact? | Staff already read evaluations (policy `Evaluations select own`, migration `20261001120000`, re-declared by `20261005130000` after a hand edit on 2026-10-05 hid every lead from staff, PR #113); the RPC exposes no more than that, scoped tighter. It returns no lead id, name or email, and no stage `reason` or actor. No new consent needed |

> 1 and 3 are checked against the diff by CI.

## Entities

**Read, unchanged:** `profiles` (`role`, `inmobiliaria_id`, `onboarding_data`), `evaluations`
(`created_at`, `financial_data → input / result`), `proyectos`, `proyecto_ejecutivos`,
`proyecto_favoritos`, `evaluation_events` (kind `plan_accepted`), `tracking_events` (`recorded_at`, `event_kind`),
`improvement_goal_events` (`recorded_at`, `confirmed`), `commercial_stage_events` (with the
project-tracks branch's `proyecto_id`; its index `(subject_user_id, inmobiliaria_id, proyecto_id,
occurred_at, id)` serves the `(occurred_at, id)` ordering).

**Read, from project-tracks (do not redefine):** `lead_belongs_to_proyecto(p_lead, p_proyecto)`,
`is_ejecutivo_vinculado(p_proyecto)`. Project tracks also added `lead_project_commercial_stage`,
`commercial_stage_scope()` and the sell-out / restock trigger; HU 15 reads none of them, only
events.

**New — `public.commercial_funnel_facts() returns jsonb`**, `stable security definer set
search_path = public`, revoked from `public, anon`, granted to `authenticated`.

1. `v_role := get_my_role()`, `v_tenant := get_my_inmobiliaria()`. Raise `forbidden` (errcode
   `42501`) unless `v_tenant` is not null **and** `v_role` ∈ {`admin_inmobiliario`, `admin`,
   `ejecutivo`}.
2. In-scope projects: `proyectos` of `v_tenant`; for `ejecutivo`, only those where
   `is_ejecutivo_vinculado(p.id)` (a `proyecto_ejecutivos` row `estado = 'vinculado'` matching
   `auth.uid()` or `get_my_email()`).
3. Leads: profiles with `role = 'usuario'`, at least one evaluation, and, for at least one in-scope
   project `p`, `lead_belongs_to_proyecto(lead, p)` **or** a `commercial_stage_events` row of
   (lead, `v_tenant`) with `proyecto_id = p` (ALG-18 G28). Deleted accounts have no
   profile and are absent by construction (ALG-18 A5).
4. Return

   ```json
   { "now": "<instant>",
     "proyectos": [ { "id", "nombre", "comuna", "tipo", "precio_min_uf", "precio_max_uf", "estado" } ],
     "facts": [ FactRow ] }
   ```

   `now` is `clock_timestamp()` taken after the facts are read, not `now()` (the transaction start):
   it is never earlier than any timestamp the call can see (ALG-18 G27).

   where `FactRow` is **exactly** ALG-18's Inputs table, with these sources:

   | Field | SQL |
   | :---- | :-- |
   | `lead_id` | `row_number() over (order by profile id)` as text |
   | `first_evaluation_at` | `min(evaluations.created_at)` |
   | `evaluaciones` | every evaluation ordered by `created_at`, as `{ at, project_goal_id }`; `project_goal_id` = `financial_data->'input'->'project_goal'->>'id'` **only if that id is an in-scope project**, else `null` |
   | `evaluacion_actual` | latest evaluation: `{ input: financial_data->'input', onboarding: profiles.onboarding_data, result: financial_data->'result' }` — the shape `DashboardLeads` already feeds to `matchLeadToProjects` |
   | `proyectos` | in-scope project ids for which `lead_belongs_to_proyecto` holds **or** the lead has a stage event with that `proyecto_id` in `v_tenant` (G28) |
   | `postulaciones` | per in-scope project id in `financial_data->'input'->'project_goal'->>'id'`, the `min(created_at)` |
   | `stage_events` | `commercial_stage_events` of (lead, `v_tenant`) with `proyecto_id` null or in scope, ordered `(occurred_at, id)`, as `{ proyecto_id, stage_after, occurred_at, por_sistema: actor_role = 'sistema', por_mi: actor_id = auth.uid() }` — `por_mi` is computed in SQL; `actor_id` itself never leaves the database |
   | `plan` | `null` if the lead never accepted a plan; else `{ baseline_at, target_proyecto_id }` from the **earliest** acceptance: an `evaluation_events` row with `kind = 'plan_accepted'` (`effective_at`) or the legacy `evaluations.plan_accepted_at`, with `target_proyecto_id` = that evaluation's `financial_data->'input'->'project_goal'->>'id'` **only if it is an in-scope project**, else `null` (ALG-18 G32; migration `20261005160000`). Not `tracking_plans`: HU 13 creates one on every lead's first evaluation |
   | `favoritos` | `proyecto_favoritos` on in-scope projects |
   | `progress_update_ats` | `tracking_events.recorded_at` with `event_kind in ('data_update', 'evaluation')` |
   | `confirmed_goal_ats` | `improvement_goal_events.recorded_at` with `confirmed` |

**Existing — `public.lead_belongs_to_proyecto(p_lead uuid, p_proyecto uuid) returns boolean`**,
created by `20261005120000` (project tracks), `stable security definer`, not granted to browser
roles: true when the lead's profile has `role = 'usuario'` and either has a `proyecto_favoritos` row
for `p_proyecto`, or one of its declared comunas (evaluations' `target_commune`,
`alternative_commune`, `financial_data.input.comuna_objetivo`, and onboarding's `comuna_interes` /
`comuna_alternativa`, compared with `lower(trim(...))`) equals that project's comuna. HU 15 calls
it; it does not create it.

No existing rows change. No table, column or policy is added or altered.

## Algorithms

- **`ALG-18`** (was ALG-17 until 2026-10-05) — commercial funnel metrics. **New**, written before
  this plan: `docs/algorithms/ALG-18-commercial-funnel-metrics.md`, cases `ALG-18-cases.json`.
  Implemented in `frontend/src/lib/commercial/funnelMetrics.js`, except R3's overall stage and
  cause, which are `frontend/src/lib/commercial/overallStage.js` (project tracks); asserted by
  `frontend/src/lib/commercial/__tests__/funnelMetrics.test.js` and `overallStage.test.js`. 9 open
  assumptions logged. **Amendment owed by this PR:** ALG-18's "Runs on / implemented in" row names
  `overallStage.js` for R3 (step 3).
- **`ALG-10`** — implemented as-is, no changes. Called by ALG-18 for every band.

**Local logic** (no ALG number, story-local): the Santiago calendar helpers (period key and bounds
for an instant) used only by ALG-18's R7; the priority label → key map; the page's presentation.

## Scope

**In:**

- The `commercial_funnel_facts()` RPC (reusing project tracks' helpers), rollback,
  `schema.sql` sync, SQL tests.
- `ALG-18` implementation and tests; the priority map and its parity test.
- `services/commercialMetricsService.js`.
- The `metricas` page with both tabs, the filters, routing and nav entries for ejecutivo,
  `admin_inmobiliario` and tenant `admin`.
- Wiki note on the HU 15 story page.

**Out:**

- Stage keying by project, revival, the sell-out / restock jobs, `overallStage()` →
  `feat/commercial-stage-project-tracks` (PR #112, done).
- `admin_inmobiliario` role support → `fix/admin-inmobiliario-role`.
- `action_key` in `commercial_priority_detail` → separate engine follow-up (ALG-18 G18).
- Global-admin cross-tenant dashboard → not in D2; a future story if wanted.
- CSV export, alerts, saved filter presets, comparisons between two periods side by side → not
  asked for by E1–E4.
- CRM (HdU 5), stress simulation (HdU 6) → out of scope per `CLAUDE.md`.

## Steps

### Part A — pure logic (buildable now)

1. **Priority map.** `frontend/src/lib/commercial/priorityActions.js`: export
   `PRIORITY_ACTIONS` (key → label, mirroring `COMMERCIAL_ACTIONS`) and
   `priorityKeyFromDetail(detail)` implementing ALG-18 R1b P1–P4 (returns
   `{ key, reconocida }`). Test `__tests__/priorityActions.test.js`: each P-row, plus a parity test
   that reads `../../backend/app/scoring_engine/constants.py`, extracts the `COMMERCIAL_ACTIONS`
   dict and asserts the same six keys and labels.
2. **Santiago calendar.** `frontend/src/lib/commercial/santiagoCalendar.js`, pure, using
   `Intl.DateTimeFormat` with `timeZone: "America/Santiago"` (no dependency):
   `periodOf(instant, granularidad) -> { clave, desde, hasta }` and
   `periodsBetween(fromInstant, toInstant, granularidad) -> Periodo-bounds[]`, per ALG-18 R7 (ISO
   week-year for `semana`, local-midnight bounds converted to instants, half-open). Test
   `__tests__/santiagoCalendar.test.js`: the R7 edge cases — Sunday 23:30 → same ISO week,
   2027-01-01 → `2026-W53`, `2026-07-01T03:30Z` → June, both 2026/2027 DST transitions, bounds of
   `2026-09` (`2026-09-01T04:00Z` → `2026-10-01T03:00Z`).
3. **ALG-18.** `frontend/src/lib/commercial/funnelMetrics.js`: export
   `computeFunnelMetrics({ facts, proyectos, filtros, now, granularidad }, { match = matchLeadToProjects } = {})`
   implementing R0–R8 exactly. The second argument is the test seam only. Export
   `ALG18_VERSION = "hu15-commercial-funnel-v1"`. No `Date.now()`, no input mutation.
   **R3's overall stage and cause come from `overallStage(records)`** (`./overallStage`): at each
   replay step, build one entry per existing record (`proyecto_id`, current `stage_after`, `at` =
   that record's latest `occurred_at`, `por_sistema` of that event) and call it. Do not
   re-implement O1–O5 or G8 here. In the same commit, amend ALG-18's "Runs on / implemented in" row
   to name `overallStage.js` for R3.
4. **ALG-18 tests.** `frontend/src/lib/commercial/__tests__/funnelMetrics.test.js`: load
   `docs/algorithms/ALG-18-cases.json`; expand the shorthand described in its `nota` (defaults,
   `proyectos_comunes`, `prioridad_label` / `prioridad_key`, `alg10` → a fake `match` that returns
   the given rows for the projects it is passed and G0 rows for leads without `alg10`); deep-partial
   match `expect`, with `serie_claves` / `serie_por_clave`. On **every** case output, assert
   invariants 1–12. Plus: same input twice → deep-equal output; frozen (`Object.freeze`, deep)
   inputs do not throw.

### Part B — data and page (needs both prerequisite branches in `develop`)

5. **Gate.** Sync with the base branch. Confirm: `commercial_stage_events.proyecto_id` exists;
   `lead_belongs_to_proyecto`, `is_ejecutivo_vinculado` and `frontend/src/lib/commercial/overallStage.js`
   exist; `frontend/src/lib/roles.js` exports `roles.admin_inmo` and `isAdminRole`; the
   project-tracks branch shipped the sell-out / restock jobs and the revival exception. If any is
   missing, stop and report. (All of project tracks' parts are in PR #112 and its migration is
   already live in prod; only the merge into `develop` is pending.)
6. **Migration.** `supabase/migrations/<timestamp>_hu15_commercial_funnel_facts.sql` (timestamp
   later than every migration in prod and than PR #114's `20261005140000`, so ≥ `20261005150000`), wrapped in `begin; … commit;`,
   idempotent: create `commercial_funnel_facts()` per **Entities**, reusing
   `lead_belongs_to_proyecto` and `is_ejecutivo_vinculado` (never redefine them); `revoke all … from public, anon, authenticated`; `grant execute on
   commercial_funnel_facts() to authenticated`. Rollback in `supabase/rollback/` dropping only what
   this migration created. Append the same DDL to `supabase/schema.sql`.
7. **SQL tests.** `supabase/tests/commercial_funnel_facts.sql`, style of `commercial_stage.sql`
   (`begin; … rollback;`, fixture users, `set local role authenticated` + `request.jwt.claims`).
   Two inmobiliarias A and B; A has projects P1 and P2. Cases:
   1. `admin_inmobiliario` of A: `proyectos` = {P1, P2}; facts = A's eligible leads only.
   2. Ejecutivo of A, `vinculado` on P1 only: `proyectos` = {P1}; a lead belonging only to P2 is
      absent; a P2 stage event of a P1 lead is absent.
   3. Ejecutivo with a `pendiente` assignment on P2: P2 not in scope.
   4. Lead, global admin (no tenant), ejecutivo without tenant → `forbidden`.
   5. No fact row or stage event contains `reason`, `actor_id`, `subject_user_id`, an email or a
      profile id; `lead_id` values are `"1" … "n"`.
   6. `por_sistema` is true exactly for `actor_role = 'sistema'` events; `por_mi` is true exactly for
      events whose `actor_id` is the caller — the same event reads `por_mi = true` for its author
      and `false` for a colleague.
   7. A legacy project goal without `project_goal.id` produces no `postulaciones` entry.
   8. A lead with no evaluation is absent; a lead whose profile was deleted is absent.
   9. A lead of A whose evaluation goal or plan target is a project of B gets `project_goal_id` /
      `target_proyecto_id` = `null`: no project id of another inmobiliaria leaves the database
      (ALG-18 G19–G20).
   10. `now` is present and not earlier than any `first_evaluation_at`, evaluation `at`, stage
       `occurred_at` or other timestamp in the result, including a lead inserted in the same
       transaction just before the call (ALG-18 G27).
   11. A lead of A with a `venta_cerrada` record on P1 whose favorite on P1 was removed and whose
       comunas no longer match P1 is still a fact row, with P1 in `proyectos` and its P1 events
       (ALG-18 G28).
8. **Service.** `frontend/src/services/commercialMetricsService.js`:
   `getCommercialFunnelFacts()` → `supabase.rpc("commercial_funnel_facts")`, returning
   `{ now, proyectos, facts }`; maps `forbidden` to "Tu cuenta no tiene una inmobiliaria asignada para ver
   métricas comerciales."; logs other errors with `logSupabaseError`. Without Supabase
   (`!isSupabaseDataConfigured`) returns `null` — the legacy local path is not extended.
9. **Page.** `frontend/src/components/CommercialMetrics.jsx` (+ styles in `styles.css`):
   - Loads facts once and passes the RPC's `now` to ALG-18 (never `new Date()`, G27); holds `filtros`
     and `granularidad` in state; recomputes with `useMemo(() => computeFunnelMetrics(...))`.
   - **Filters bar:** project (single select from `proyectos`, "Todos" = none), affinity, capacity,
     priority (multi-select chips; priority chips labelled from `PRIORITY_ACTIONS` plus "Sin
     prioridad"). Affinity and capacity disabled with an explanation while `bandas.sin_catalogo`.
   - **Counts first, everywhere** (ALG-18 UI obligations): the big number is a count, the rate sits
     small beside it with its `n`; medians are the big time figure, averages small. No minimum-n
     cutoff.
   - **Tab "Embudo y tiempos"** (E1–E3), top to bottom:
     1. KPI tiles: "Postularon a un proyecto" (`captura.postulan`, rate small), "Ventas con plan de
        mejora" (`plan_a_venta.con_plan_y_venta`, "de N con plan" small), "Leads activos este mes"
        (`engagement.mes_actual.activos`, rate small), "Ciclo de venta" (mediana big, promedio and
        `n` small).
     2. **Seguimiento de contacto** (ALG-18 R9): "Sin contactar" (`sin_contactar.n`, with median and
        oldest age); "Contactados este mes"; for an ejecutivo "Contactados por ti" (total and this
        month); "Primer contacto a leads Compatible + Alcanza" (mediana, `n`, and "x aún sin
        contactar"). The "Sin contactar" tile links to the leads dashboard (`setPage("leads")`);
        filtering it by stage needs RNF 7 E2's stage filter, a follow-up — until then it opens the
        unfiltered list. Help text notes that times measure when the stage was recorded.
     3. The funnel: `alcanzaron` in the bars, `conversion` small; `abiertos`, ventas vigentes and
        `perdido_actual` (por gestión / por agotamiento) beside it. A "Todos / Mejores leads"
        switch (ALG-18 R11) swaps in `mejores.embudo`, with a line "Solo leads Compatible + Alcanza
        (x de n)"; hidden while `mejores` is `null`.
     4. **Comparación por proyecto** (R10): a table, one row per project — leads, postularon,
        ventas, sin contactar.
     5. Time in each stage: mediana, `n`, en curso (no average column), with its own "Todos / Mejores
        leads" switch swapping in `mejores.en_etapa`; días hasta postular.
     6. Engagement per action (`leads`) and affinity / capacity (counts, rate small).
   - **Tab "Evolución histórica"** (E4): granularity switch semana / mes / año; **count bars** per
     period (cohort leads, postularon, ventas; contacts; active leads) with rates as a secondary line;
     times as medians; the period containing `now`
     marked "en curso"; each cohort shows "x de n aún abiertos".
   - **Help buttons:** every KPI and contact tile, every funnel stage (its definition) and status
     tile, the funnel's "alguna vez" rule, every stage row and column of the times table, every row
     of "Engagement por acción" and every bucket of "Afinidad y capacidad" carries the form's
     `FieldTooltip` (`components/FieldTooltip.jsx`, reused as is)
     with a one-sentence Spanish explanation. The copy is settled in the UI mock iteration
     (`frontend/mockups/hu15-metricas.html`) and must not restate a threshold — bands are explained
     in words ("alcanza el precio de la unidad más barata del proyecto"), never with ALG-10's numbers.
   - **UI obligations from ALG-18:** `null` rates render as "—" with "sin datos (n = 0)", never
     "0 %"; days rounded to one decimal; `perdido` labelled "perdido en este proyecto" with a project
     filter or ejecutivo scope and "lead perdido" in the tenant view; a footer line: "Orientativo:
     no aprueba créditos ni reemplaza una evaluación bancaria."
   - States: loading; `null` service result → "Las métricas requieren conexión a Supabase."; the
     `forbidden` message; zero leads → explicit empty state.
10. **Routing and nav.** `App.jsx`: page `metricas` ↔ path `/metricas`, reachable for
    `roles.sales` and for `isAdminRole(role)` with an inmobiliaria; global admin is redirected to its
    home. `Navbar.jsx`: a "Métricas" entry in the ejecutivo and admin groups. Follow the existing
    `page` pattern — no React Router.
11. **Wiki.** `Wiki RutaHogar/UserStories/HU15-dashboard-conversion-tiempos.md` notes: E2's
    "diferencias entre eventos consecutivos" is replaced by time in each stage (ALG-18 R5); metrics
    are computed per inmobiliaria and, inside it, per project record; link ALG-18. Also replace the
    E1 note "el embudo cuenta `lead_commercial_stage` por etapa", stale since project tracks: the
    funnel replays `commercial_stage_events` per record. Project tracks already added the notes on
    the per-project data layer and the two levels of `perdido`; keep them. Spanish, per the handbook.
12. **ALG-10 note (only with the author's approval at review).** Apply ALG-18's "Proposed note for
    ALG-10" to ALG-10's A1 row. Text only, no number. Otherwise leave ALG-10 untouched.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — conversión general y "pasaron de En plan de mejora a Venta cerrada" (G29) | 3, 4, 9 | `conversion_general_y_plan_mejora_a_venta`; invariants 18–19; reviewer: the KPI "De En plan de mejora a Venta cerrada" and the "Conversión general" line over the funnel |
| `E1` — tasa de captura, conversión entre etapas, plan de mejora → venta | 3, 4, 9 | `funnelMetrics.test.js`: `captura_*`, `embudo_ever_reached_*`, `etapas_saltadas_*`, `venta_revertida_no_es_venta`, `plan_a_venta_baseline_antes_y_despues`, `perdido_por_agotamiento_vs_gestion`, `revivir_con_evento_de_lead`; reviewer: tab "Embudo y tiempos" against a seeded tenant |
| `E1` — engagement | 3, 4, 9 | `engagement_solo_acciones_sobre_tus_proyectos`, `engagement_borde_de_mes_y_denominador_por_periodo`, `ejecutivo_etapa_tardia_*`; reviewer: KPI and per-action list |
| `E1` — contact follow-up (persona review, G22–G23) | 3, 4, 6, 7, 9 | `seguimiento_de_contacto`; `commercial_funnel_facts.sql` case 6; reviewer: an ejecutivo sees "Contactados por ti", a colleague's contact does not count there |
| `E1` / `E2` — best leads' funnel and stage times (G25) | 3, 4, 9 | `mejores_leads_embudo_y_tiempos`; reviewer: the switch changes both sections and shows "x de n" |
| `E3` — comparison by project (G24) | 3, 4, 9 | `comparacion_por_proyecto`; reviewer: the table lists every in-scope project |
| `E2` — tiempos intermedios entre estados (G30) | 3, 4, 9 | `tiempo_entre_etapas`; invariant 20; reviewer: the "Tiempo entre etapas" table (promedio, mediana, n, skipped, waiting) under both "Todos" and "Mejores leads" |
| `E2` — días desde la preevaluación hasta venta cerrada, y tiempos intermedios | 3, 4, 9 | `venta_revertida_no_es_venta`, `retroceso_y_visita_repetida_suman`, `lead_aun_en_etapa_fuera_del_promedio`, `reapertura_tras_reposicion_suma_visitas`, `duracion_cruza_cambio_horario_*`; reviewer: times panel shows promedio, mediana, n and en curso |
| `E3` — desglose de engagement y conversión, lado a lado (G31) | 3, 4, 9 | `desglose_por_dimension`; invariant 21; reviewer: the "Desglose de engagement y conversión" section with each of its four dimensions |
| `E3` — desglose por proyecto, capacidad, prioridad y afinidad | 1, 3, 4, 9 | `rollup_*`, `bandas_en_todo_el_alcance_*`, `agotado_*`, `catalogo_vacio_sin_buckets`, `requiere_antecedentes_*`, `bloqueador_critico_*`, `filtros_and_*`, `prioridad_*`, `captura_con_filtro_*`, `n_cero_*`; `priorityActions.test.js`; reviewer: apply each filter and a combination |
| `E4` — evolución semana / mes / año | 2, 3, 4, 9 | `semana_iso_*`, `anio_calendario_no_es_anio_iso`, `offset_estacional_no_fijo`; `santiagoCalendar.test.js`; reviewer: switch granularity on the "Evoluciones históricas" tab; its charts show engagement (counts and the active-lead rate), conversion rates per cohort, and times (sales cycle, days to apply, each stage pair) |
| Scope: tenant admin vs ejecutivo, `vinculado` only, no cross-tenant | 6, 7, 10 | `commercial_funnel_facts.sql` cases 1–4; reviewer: log in as each role |
| Privacy: no ids, reasons or actors leave the database, nor another inmobiliaria's project ids | 6, 7 | `commercial_funnel_facts.sql` cases 5 and 9 |
| No AI, deterministic in `now`, nothing recomputed | 3, 4 | ALG-18 invariants 7–9 asserted on every case |

## Assumptions

- **`feat/commercial-stage-project-tracks` meets ALG-18's "Requirements on other work".** Verified:
  its SQL tests T1–T16 map to requirements 1–7, and 16 smoke checks passed against prod on
  2026-10-05, plus a manual walkthrough. Part B is written against it and must not stub it: if
  PR #112 is not merged, build Part A, open the PR as draft, and stop at step 5.
- **`fix/admin-inmobiliario-role` is merged** and provides `frontend/src/lib/roles.js`
  (`roles.admin_inmo`, `isAdminRole`). Until then, `roles` from `services/auth.js` has no
  `admin_inmobiliario` key; do not add one here.
- **Data volume fits in one RPC call** (prod on 2026-10-04: 163 leads, 434 evaluations). If a tenant
  grows past what one JSON payload handles comfortably, paging is a follow-up, not a reason to move
  ALG-18 into SQL.

## Changes from the AC wording review (2026-10-05)

"The HU is the rule" (Bolgunn): wherever the page differed from the story's wording, the missing
figure is **added** next to what already existed. Nothing was removed or reinterpreted. ALG-18
records the rules as G29–G31; no database change was needed.

| # | AC wording | Added |
| :- | :--------- | :---- |
| W1 | E1 "la conversión general entre etapas" | `embudo.conversion_general`, shown as "Conversión general: x de n leads llegaron a venta cerrada" over the funnel |
| W2 | E1 "específicamente cuántos leads pasaron de 'En plan de mejora' a 'Venta Cerrada'" | ALG-18 R12 and the KPI "De En plan de mejora a Venta cerrada". The plan-based KPI (R4) stays |
| W3 | E2 "los tiempos intermedios entre estados comerciales" | ALG-18 R13 and the "Tiempo entre etapas" table; skipped stages are counted, never given a time. The time-in-stage table stays and gains an average column |
| W4 | E3 "desglosar las métricas de engagement y conversión por …" | ALG-18 R14 and the "Desglose de engagement y conversión" section. Filters stay |
| W5 | E4 "la pestaña de evaluaciones históricas" | Tab named "Evoluciones históricas": it shows how the metrics evolve, which is what E4 asks; renamed in the PR #115 AC review (2026-10-06) |
| W6 | E4 "cómo han cambiado el interés (engagement), las tasas de conversión y los tiempos" | Conversion-rate chart per cohort, the active-lead rate on the activity chart, and a times chart (sales cycle, days to apply, each stage pair) |
| W7 | E1 "cuando el usuario revise el gráfico de embudo"; E2 "cuando reviso el KPI de tiempo ... el promedio ... además de los tiempos intermedios" (PR #115 review) | The funnel card shows the capture rate and en plan de mejora → venta next to the overall conversion ("Todos" view). The "Ciclo de venta" KPI leads with the average, median beside it, and links to "Tiempo entre etapas" |

## Changes from the build review (2026-10-05)

Part A's build raised two gaps in ALG-18 and the plan carried one open question; Bolgunn decided all
three. ALG-18 records them as G26–G28.

| # | Change | Effect on HU 15 |
| :- | :----- | :-------------- |
| B1 | **G26.** In the series, a stage's `en_curso` counts in the period containing `now` only | Done in Part A: `funnelMetrics.js`, invariant 17, case `en_curso_en_el_periodo_actual`. The "Evolución histórica" times show "en curso" on the running period |
| B3 | **G28.** A stage record on an in-scope project keeps the lead in the universe and in that project's R10 row | RPC universe and `proyectos` (Entities, step 6), SQL test case 11 (step 7). No change to `funnelMetrics.js`: it already reads `proyectos` |
| B2 | **G27.** `now` is the database's time, returned by the RPC | RPC returns `now` (Entities, step 6), SQL test case 10 (step 7), service returns it (step 8), the page uses it instead of `new Date()` (step 9) |

## Changes from the project-tracks PR (2026-10-05)

`feat/commercial-stage-project-tracks` (PR #112) landed the prerequisites this plan assumed, and
changed some details. This section records what HU 15 must take into account; the steps above are
already updated.

| # | Change | Effect on HU 15 |
| :- | :----- | :-------------- |
| C1 | **ALG-17 renumbered to ALG-18.** HU 18 (PR #111) published ALG-17 first; IsaiasACF flagged the collision in PR #112's review | Files, references and `ALG18_VERSION` renamed on this branch. Project tracks' plan amendment A4 and its code use ALG-18 |
| C2 | `lead_belongs_to_proyecto` and `is_ejecutivo_vinculado` are created by migration `20261005120000`; `lead_belongs_to_inmobiliaria` is redefined on top of the first (behaviour-preserving) | HU 15 reuses both and creates neither (decisions, Entities, step 6) |
| C3 | `overallStage()` implements ALG-18 R3 O1–O5 and G8 once, in `lib/commercial/overallStage.js` | `funnelMetrics.js` calls it at each replay step; ALG-18's "implemented in" row is amended by this PR (step 3) |
| C4 | Migration `20261005120000` is **already applied in prod** (2026-10-05, ahead of merge), and `20261005130000` (PR #113, evaluations policy fix) too | HU 15's migration timestamp must be ≥ `20261005150000` (`20261005140000` is PR #114's role migration). Until PRs #112 and #113 merge, `supabase db push` from `develop` stops on "remote migration versions not found"; do not `migration repair` them away |
| C5 | QA data in prod: inmobiliaria "QA Project Tracks" with projects QA PT Uno / Dos / Tres / Smoke, accounts `qa-pt-*@example.com`, and permanent stage history (including sell-out / restock job events) | HU 15's reviewer can use this tenant to see the funnel with real project records. It is real data in prod: it appears in that tenant's metrics only, since HU 15 is scoped per inmobiliaria |

**Decided (ALG-18 G28, Bolgunn, 2026-10-05): include them.** The universe and `proyectos` also take
leads with a stage record on an in-scope project; SQL test case 11 pins it. Original question, from
PR #112: project tracks makes a project record
"sticky": once created, it stays writable after the lead stops belonging to the project (removed
favorite, changed comuna), so a standing sale on P can outlive `lead_belongs_to_proyecto(lead, P)`.
Step 2–3 of the RPC take the fact universe from leads that belong to an in-scope project **today**,
and ALG-18 R10 uses `p ∈ lead.proyectos`. Both would drop that sale from the dashboard. Adding "or has
a record on an in-scope project" to the universe and to `proyectos` would fix it, but that is an
ALG-18 change: decide it before Part B.
