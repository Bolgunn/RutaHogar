# PLAN — CATALOGO-UNICO-HU9: the last hardcoded catalog, and one compatibility algorithm

- **Story:** HU 9 (cotización orientativa por proyecto) · **Actor:** el lead (`usuario`)
- **Status:** 🔜 not sized · **Depends on / Required by:** depends on HU 7 (catálogo) and HU 6 (`compatibility.js`) · continues [CATALOGO-UNICO](../CATALOGO-UNICO/PLAN.md)
- **Branch:** `feat/hu9-continuacion`, off `origin/feauture/sprint/HU9`

> **Branch-name deviation.** The upstream HU 9 branch is `feauture/sprint/HU9` — a typo that is
> already published and referenced. This branch follows the handbook's `feat/<slug>` norm rather
> than propagating it. Recorded rather than silently ignored.

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build
session"); only what is specific to this work goes here.

- Read first: `docs/stories/HU6-simulacion-compatibilidad/REGLAS_HU6.md` (the normative algorithm — this plan references it and must never restate it), `frontend/src/lib/simulation/compatibility.js`, `frontend/src/lib/simulation/projectAdapter.js`, `frontend/src/services/projectService.js` (frozen contract in its header), `frontend/src/components/ProjectsCatalog.jsx`, `frontend/src/components/ProjectEvaluationModal.jsx`
- Stop and report if: `evaluateScenario` turns out to need a field the catalog does not carry, or the favorites RLS cannot be expressed without a `SECURITY DEFINER` helper (see standing question 2 — this repo has two corrective migrations for exactly that)

## Goal

[CATALOGO-UNICO](../CATALOGO-UNICO/PLAN.md) removed the hardcoded project array from the simulation
page and declared the HU 7 catalog the single source of projects. It missed a consumer. The
`/proyectos` tab (HU 9) reads `GET /projects` from FastAPI, which returns `MOCK_PROYECTOS` — five
dicts hardcoded in `backend/app/main.py`. So a second project source is still live, in a second
language (Python), invisible to the admin who maintains the catalog.

HU 9 also grew its own compatibility verdict: it re-POSTs `/score` per project with
`property_value = precio_min_uf` and reads back the lead `classification`, plus a local
`getGapMessage()`. HU 6 answers the same question — *is this price compatible with this profile* —
through `evaluateScenario()`. Two algorithms, two vocabularies, one question.

This work deletes the second source and the second algorithm.

## Approach & decisions

Point HU 9's existing components at the same two modules HU 6 already uses, converting vocabulary
once at the boundary. `compatibility.js` takes projects as a parameter and is pure, so no logic is
rewritten — only call sites and the data flowing into them.

| Decision | Rationale |
| :------- | :-------- |
| Read via `getAvailableProjects()`, not a Supabase-backed `GET /projects` | The frozen contract, the local-provider fallback and `filterAvailable`'s `agotado` rule all already exist there, and HU 6 + `AdminProjectCatalog` already use it. Teaching FastAPI to talk to Supabase would give HU 9 a data path no other screen has, for a table the backend otherwise never touches |
| Delete `GET /projects`, `MOCK_PROYECTOS` and `MOCK_INMOBILIARIAS` | Dead code that looks live is worse than no code: the next reader of `main.py` sees a projects API and reasonably concludes it is the source of truth. That is the exact confusion being removed |
| **Leave `POST /interest` alone** | Still wired to "Contactar a un Ejecutivo". It is a stub, and that is a real defect — recorded under Out, not fixed here |
| The modal makes **zero** network calls | `evaluateScenario` is pure and synchronous. The modal renders instantly instead of showing "Evaluando Proyecto…", works with the backend down, and becomes trivially testable — props in, verdict out |
| The single `/score` call moves to `App.jsx`, inside `onSetGoal` | That is where `createEvaluation` and the existing `/score` plumbing (`App.jsx:1121`) already live. It also fixes a latent bug: `onSetGoal` currently persists whatever `/score` returned when the modal *opened* |
| **"Fijar como mi Meta" keeps writing a real evaluation row** | HU 6's "proyecto objetivo" is only `localStorage`. HU 9's is heavier on purpose — it feeds `tracking` and the housing plan. Downgrading it to localStorage would be a regression |
| Verdicts become **Compatible / Cercano / Requiere ajuste** | They answer a different question than Alto/Medio/Bajo. Alto is a *lead score* over the whole profile; Compatible is a *scenario verdict* against one price. `SimulationPage.jsx:21` already maps these three to existing CSS classes (`compatible` / `near` / `adjust`), so the badge is reuse, not new styling |
| Accept that a `Bajo` lead can now read "Compatible" | `evaluateScenario` consults `classification` only inside `hasMediumHighScore()`, and only to decide whether a failing scenario may soften to "Cercano". Morosidad, contract type and tenure never enter. If that gate is wrong it is wrong for HU 6 too, so it belongs in `compatibility.js` as a deliberate change both screens inherit — not a fork here. See Out |
| Convert the whole list once via `catalogProjectsToSimulation` | `projectAdapter.js` says it outright: *"la frontera se cruza aquí; este módulo es lo único que conoce ambos vocabularios."* One conversion means `buildAccessibleAlternatives` can be fed directly with no second mapping |
| **Export** `projectToScenario` from `compatibility.js` rather than duplicate it | It is currently private, and `SimulationPage.jsx:465` builds the shape inline. Both screens need the identical object; duplicating it is how the two algorithms drifted apart in the first place |
| Alternatives shown for **both** non-Compatible states | REGLAS_HU6: alternatives appear *"cuando un escenario no sea Compatible"*. Today they render only for the `Medio` case, so the user who most needs a cheaper option — "Requiere ajuste" — gets nothing |
| Alternatives ranked financially, **not filtered** by comuna | REGLAS_HU6: *"El ordenamiento no debe ocultar alternativas de mayor compatibilidad solo porque no coincidan con una preferencia."* Comuna and tipo become tiebreakers. A *Compatible* option at the same price is a better answer than a *Cercano* one that is cheaper |
| Favorites move to `public.proyecto_favoritos` | Mock ids were `"proj-1"`…`"proj-5"`; catalog ids are UUIDs, so every stored favorite is already an orphan. Given the data has to break anyway, breaking it once into a real table beats breaking it into a new localStorage key |
| Composite PK `(usuario_id, proyecto_id)`, no `activo` flag | Makes the toggle idempotent (`upsert` / `delete`) with no read-modify-write race. A soft-delete history of "considered and abandoned" is a real commercial signal, but it is analytics — see Out |
| Owner-only RLS on `auth.uid()`, no helper functions, no `SECURITY DEFINER` | A lead belongs to no `inmobiliaria` (`profiles.inmobiliaria_id` is NULL for `usuario`), so tenant-scoping does not apply — but `auth.uid()` always does. `20260604_corrective_audit.sql` and `20260605_fix_rls_infinite_recursion.sql` are in this repo as evidence of what clever RLS costs |
| The favorites service mirrors `projectService`'s dual-provider pattern | CLAUDE.md guardrail 3: *"No asumir que Supabase está disponible — el flujo debe funcionar sin ella localmente."* |
| Optimistic toggle with rollback | Favoriting must feel instant. Today it is a synchronous `setState` that cannot fail; a round-trip in front of it would be a felt regression |
| **Drop `inmobiliaria_nombre` from the card**; show `estado` + delivery month instead | `"Inmobiliarias select staff"` (`20260729`, line 313) restricts `inmobiliarias` to `admin`/`ejecutivo`, so `inmobiliariaNameMap()` returns `{}` for a lead and the card would render `"Ñuñoa \| "` with a dangling pipe. Opening that table to leads is defensible but is a second migration for a field nobody asked for. `estado` is the more useful occupant: `filterAvailable` deliberately keeps `en_construccion` projects because *"la venta en verde es mercado real"*, and today nothing on screen distinguishes them |
| Browsing stays open without a preevaluación | The catalog is a storefront; browsing inventory has value on its own. HU 6 gates its whole page because that page *is* the comparison. Today HU 9 does the worst of both — it invites the click, then dead-ends inside the modal |
| No component-test infrastructure | There is none (`package.json` has vitest, no jsdom, no testing-library) and all the logic worth asserting is pure by design. CLAUDE.md guardrail 1 |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | **No.** No file under `backend/app/scoring_engine/` is touched and no constant in `compatibility.js` changes. The *displayed* verdict changes source (from `/score`'s `classification` to `evaluateScenario`'s `status`), which is a call-site change, not a rule change. No ALG document is created |
| 2 | Needs RLS / multi-tenant scoping? | **Yes — one new table, three new policies.** `proyecto_favoritos` gets owner-only SELECT / INSERT / DELETE keyed on `usuario_id = auth.uid()`. No UPDATE policy: the toggle is insert-or-delete. No tenant scoping — a lead has no `inmobiliaria_id`, the same limitation `20260827090200_proyectos_lectura_lead.sql` already documents and defers to HU 13. **No policy is added to `inmobiliarias`** — see the card decision above |
| 3 | Needs a migration? Who applies it to hosted Supabase? | **Yes — one.** `20260901090000_proyecto_favoritos.sql`, plus its rollback. **Not auto-applied and not applied by the build session.** The author writes it; the person with dashboard access runs it and confirms in the PR thread. Nothing in CI enforces this |
| 4 | Changes the `POST /score` contract? | **No.** The endpoint is untouched. It is called once per "Fijar como mi Meta" instead of once per modal open, with the identical payload |
| 5 | Consent / privacy impact? | **New personal data.** `proyecto_favoritos` links a `profiles.id` to properties a person is interested in — that is lead-behaviour data, not commercial inventory. It is owner-only at the database level and is not surfaced to `ejecutivo` or `admin` by this work. **If it is ever exposed to the commercial side, that is a consent question and needs the ARCO flow** (`AdminArcoRequests.jsx`, `20260608_arco_requests.sql`) to account for the table |

> 1 and 3 are checked against the diff by CI.

### Migration filename

`20260901090000_proyecto_favoritos.sql` — 14-digit stamp, per the trap documented at length in
[CATALOGO-UNICO](../CATALOGO-UNICO/PLAN.md#migration-filenames--a-trap-this-work-walked-into).
It sorts after `20260827090200`, the current latest. Do not use an 8-digit name.

## Entities

| Entity | Change |
| :----- | :----- |
| `public.proyecto_favoritos` | **New.** `usuario_id uuid not null references public.profiles(id) on delete cascade`, `proyecto_id uuid not null references public.proyectos(id) on delete cascade`, `created_at timestamptz not null default now()`, `primary key (usuario_id, proyecto_id)`. Cascade on both sides so a deleted project or profile cannot leave orphan rows — the exact problem being worked around on the localStorage side |
| `localStorage["scoreleads_favorites"]` | **Abandoned, not migrated.** Its contents are `"proj-N"` mock ids that reference nothing. The local provider writes under its own key via the new service |
| `backend/app/main.py` | `MOCK_PROYECTOS` (:357), `MOCK_INMOBILIARIAS` (:352) and `GET /projects` (:435) **deleted**, ~90 lines. `InterestRequest` and `POST /interest` (:445) untouched |
| Frozen contract (`projectService.js` header, `docs/project-catalog-contract.md`) | **Not touched.** This work consumes the contract; it does not change it |
| `REGLAS_HU6.md` | **Not touched.** It stays the single normative source for the algorithm. This plan references it; restating any rule here would guarantee drift |

No existing table gains or loses a column.

## Algorithms

No ALG document is created or changed. The algorithm is HU 6's, already specified in
`docs/stories/HU6-simulacion-compatibilidad/REGLAS_HU6.md`, and this work adds nothing to it — the
entire point is that HU 9 stops having one of its own.

`getGapMessage()` in `ProjectEvaluationModal.jsx` is **deleted**, along with its dependency on
`/score`'s `financial_indicators`.

## Scope

**In:** rewiring `ProjectsCatalog` to `getAvailableProjects()` · deleting the backend mock and its
endpoint · swapping the verdict to `evaluateScenario` · moving the `/score` call into
`App.jsx`'s `onSetGoal` · exporting `projectToScenario` · `buildAccessibleAlternatives` for the
alternatives block · the `proyecto_favoritos` table, its rollback and a dual-provider favorites
service · the card's `estado` + delivery month · three distinct empty states · REGLAS_HU6's
referential disclaimer in the modal · vitest coverage for the favorites local provider and the HU 9
evaluation path.

**Out:**

- **Making `POST /interest` real.** It returns `{"status": "success"}` and persists nothing, and the
  modal posts a hardcoded `email: "usuario@ejemplo.com"`. So "Contactar a un Ejecutivo" silently
  does nothing. A genuine defect; it is lead capture / executive notification, its own story.
- **Gating `Bajo` leads out of "Compatible".** Arguable under REGLAS_HU6's *"se puede explicar sin
  contradecir la clasificacion financiera actual"*. If it is right it is right for HU 6 too, so it
  is a change to `compatibility.js` that both screens inherit — a deliberate decision, not a side
  effect of a data migration.
- **HU 6's stale "proyectos fake" disclaimer.** `SimulationPage.jsx:661` still warns that projects
  *"pueden no representar disponibilidad real"* even though it has read the real catalog since
  CATALOGO-UNICO. That line must **not** be copied into HU 9 — after this change it would tell users
  that real inventory is fake. Fixing it in HU 6 belongs to HU 6.
- **Favorites as a commercial signal.** Surfacing "projects this lead saved" to the `ejecutivo`
  panel, or an `activo` flag recording what was considered and dropped. Both are analytics, both
  change the RLS posture, and both are a consent question (standing question 5).
- **Opening `inmobiliarias` to the `usuario` role.**
- **Component-test infrastructure** (jsdom, testing-library).
- **Any scoring-engine change.**

## Steps

Ordered. Each names the exact files and the concrete change.

1. **Migration — `supabase/migrations/20260901090000_proyecto_favoritos.sql`.** `create table if not
   exists` with the shape in Entities. `alter table … enable row level security`. Three policies,
   drop-then-create like the rest of the repo: `"Proyecto favoritos select propio"`,
   `"… insert propio"`, `"… delete propio"`, each `using` / `with check` on
   `usuario_id = auth.uid()`. No UPDATE policy. No helper function. Add the matching rollback in
   `supabase/rollback/20260901090000_proyecto_favoritos_rollback.sql`, following
   `20260729_project_catalog_rollback.sql`.

2. **New service — `frontend/src/services/favoritesService.js`.** Mirrors `projectService`'s
   provider split: `getFavorites(usuarioId)`, `addFavorite(usuarioId, proyectoId)`,
   `removeFavorite(usuarioId, proyectoId)`. `PROVIDER === "local"` reads and writes localStorage;
   otherwise `supabase.from("proyecto_favoritos")` with `upsert` / `delete`. Returns an array of
   `proyecto_id` strings so the calling component's shape does not change. Errors surface as thrown
   `Error`s the caller can roll back on — do not swallow them.

3. **Export `projectToScenario`** from `frontend/src/lib/simulation/compatibility.js`. No signature
   change. Have `SimulationPage.jsx:465` use it instead of its inline literal, so the two screens
   provably share one shape.

4. **`backend/app/main.py` — delete** `MOCK_INMOBILIARIAS`, `MOCK_PROYECTOS` and `GET /projects`.
   Leave `InterestRequest` and `POST /interest`. Confirm no Python import breaks and the `datetime`
   import is still used elsewhere before removing it.

5. **`ProjectsCatalog.jsx` — fetch from the catalog.** Replace the `fetch("/projects")` effect with
   `getAvailableProjects()` mapped through `catalogProjectsToSimulation`, following the pattern at
   `SimulationPage.jsx:420-441` (including the `active` guard on unmount). Build the evaluation
   context once with `buildSimulationContext(evaluationBase, onboarding)`. Load favorites via the
   new service on mount.

6. **`ProjectsCatalog.jsx` — the card.** Secondary line becomes `{comuna} · {estadosProyecto[estado]}`
   plus `formatDeliveryMonth(entrega_estimada)` when it returns a non-empty string. Price via
   `formatProjectPrice(project)`. Type chip via `propertyLabels[tipo_vivienda]` — the frozen contract
   stores lowercase `'departamento'`, so rendering it raw would now show a lowercase chip. Both label
   maps already exist in `constants/`.

7. **`ProjectsCatalog.jsx` — three states.** (a) catalog empty: *"Aún no hay proyectos disponibles en
   el catálogo"*, reusing the existing `.empty-state` block; (b) `showFavoritesOnly` on with no
   matches: a distinct "no tienes favoritos guardados" — the catalog is not empty and saying so is
   confusing; (c) no `evaluationBase`: cards render and browse normally, but the button reads
   "Evaluar" and calls `onStartEvaluation` instead of opening a modal that cannot evaluate.
   Derive the favorites counter in the header from favorites **present in the loaded catalog**, so
   orphan ids cannot show "(3)" above an empty grid.

8. **`ProjectEvaluationModal.jsx` — the verdict.** Delete the `/score` effect, its loading state and
   `getGapMessage`. Compute `evaluateScenario(context, projectToScenario(project, ufValueClp))` in a
   `useMemo`. Render `status` with `SimulationPage`'s `statusClass` mapping, plus `message` and
   `recommendation` — all three come from the algorithm; do not write new copy for them.

9. **`ProjectEvaluationModal.jsx` — alternatives.** Replace the ad-hoc same-comuna filter (:126-131)
   with `buildAccessibleAlternatives(projects, context, onboarding, 4)`, excluding the current
   project, rendering the top 3. Each card shows name, comuna, `formatProjectPrice` and its own
   status, so an off-target comuna is never a surprise. Render for **both** `Cercano` and
   `Requiere ajuste`.

10. **`ProjectEvaluationModal.jsx` — favorite and disclaimer.** `handleInterest` keeps posting
    `/interest` only for "Contactar a un Ejecutivo"; the favorite branch calls `onToggleFavorite`
    alone. Add REGLAS_HU6's referential warning below the verdict block, verbatim: *"Esta simulación
    es referencial y se basa en datos declarados. No corresponde a aprobación bancaria,
    preaprobación, tasación ni cotización formal."* The modal is titled **"Cotización"** — a
    cotización is precisely what this is not.

11. **`App.jsx` — props and `onSetGoal`.** Pass `onboarding={userOnboarding}` and
    `onStartEvaluation` to `ProjectsCatalog`. Change `onSetGoal` to take `(project)` only: build the
    payload it already builds, call `/score` reusing the existing helper, then `createEvaluation`
    with the real result. The "Fijar como mi Meta" button needs a disabled/pending state, since the
    click now awaits a network call. Keep the existing `alert()` — swapping in `NotificationToast`
    is scope creep.

12. **Tests.** `frontend/src/services/__tests__/favorites.test.js`: local-provider toggle
    idempotency, orphan ids ignored, remove-then-add. `frontend/src/lib/simulation/__tests__/`:
    `catalogProjectToSimulation` → `projectToScenario` → `evaluateScenario` produces the status
    REGLAS_HU6's "Casos de prueba manuales" table specifies, and `buildAccessibleAlternatives`
    excludes the current project and orders by status before gap.

## Acceptance criteria map

HU 9's own E1–E4 are preserved; these criteria cover what this work changes.

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `C1` — No hardcoded project list remains anywhere | 4, 5 | `grep -rn "MOCK_PROYECTOS\|MOCK_INMOBILIARIAS" backend/` returns nothing; `grep -rn '"/projects"' frontend/src backend/` returns nothing |
| `C2` — The tab renders admin-maintained projects | 5, 6 | Reviewer steps: as `admin`, create a project at `/admin/proyectos`; as `usuario`, confirm it appears at `/proyectos` with its comuna, estado and price |
| `C3` — One compatibility algorithm | 8 | `grep -rn "getGapMessage\|financial_indicators" frontend/src/components/ProjectEvaluationModal.jsx` returns nothing; the modal issues no request on open (devtools Network empty) |
| `C4` — The verdict matches HU 6 for the same price | 8, 12 | vitest against REGLAS_HU6's "Casos de prueba manuales" table; reviewer steps: same project value in `/simulacion` and `/proyectos` yields the same status |
| `C5` — Alternatives appear for Cercano **and** Requiere ajuste, ranked financially | 9, 12 | vitest on ordering; reviewer steps: a profile that fails a expensive project sees cheaper/other-comuna options, each labelled with its comuna |
| `C6` — Favorites survive a logout and a different browser | 1, 2 | Reviewer steps: favorite two projects, log out, log in elsewhere, confirm both are still marked. **Requires the migration applied** |
| `C7` — A user cannot read another user's favorites | 1 | Reviewer steps, against Supabase: two `usuario` accounts, each favorites a different project, neither sees the other's. This is the one thing the local provider cannot prove |
| `C8` — A failed favorite toggle rolls back visibly | 2, 10 | Reviewer steps: block the request in devtools, click the star, confirm it reverts and a message appears. **Knowingly not unit-tested** — no component-test infrastructure |
| `C9` — Three empty states, each distinguishable | 7 | Reviewer steps: empty catalog; favorites-only with none; a fresh account with no preevaluación — each renders its own copy and the third routes to precalificación |
| `C10` — The referential disclaimer is present on every verdict | 10 | Reviewer steps: open any project, confirm the warning renders for all three statuses |
| `C11` — "Fijar como mi Meta" still writes an evaluation and updates tracking | 11 | Reviewer steps: set a goal, confirm a new row with `channel: "project_selection"` and that `/tracking` reflects the new property value |
| `C12` — The migration is idempotent | 1 | Reviewer steps: apply twice; the second run changes nothing and raises no error |
| `C13` — HU 6 is unchanged | 3 | `frontend/src/lib/simulation/__tests__/projectAdapter.test.js` and `frontend/src/services/__tests__/projectCatalog.test.js` stay green without modification; `/simulacion` behaves identically |

## Assumptions

- **The build session does not apply the migration.** It writes the migration and the rollback; a
  person with dashboard access to the project in `frontend/.env` applies it and says so in the PR.
  Until then `C6`, `C7` and `C12` cannot be checked and the branch is not done.
- **Test accounts exist** on that instance: a `usuario` with a saved evaluation, and an `admin` able
  to create catalog projects. If the instance has no `inmobiliarias` row or no global admin,
  bootstrapping a tenant is a prerequisite task, not part of this one — `Inmobiliarias insert global
  admin` requires an existing admin with `inmobiliaria_id IS NULL`.
- **`/proyectos` is reachable only by an authenticated `usuario`.** Favorites become
  per-authenticated-user, so anonymous favoriting — possible today because localStorage does not
  care — stops working. Believed already true via `App.jsx` role routing; confirm before merge.
- **The local catalog starts empty.** With no Supabase configured, `PROVIDER === "local"` reads
  `scoreleads_project_catalog`, which nothing seeds. Local manual verification therefore begins by
  creating projects through `/admin/proyectos`. This is the same trade CATALOGO-UNICO accepted, and
  the reason `C9`'s empty state is a criterion rather than an afterthought.
- **`resolve_pending_executives` and the `proyecto_ejecutivos` read fail harmlessly for a lead.**
  `getProjects()` calls both; both log and continue, and `filterAvailable` trims the `ejecutivos`
  array without dropping projects. HU 6 has relied on this since CATALOGO-UNICO. If either ever
  starts throwing, both screens break together.
