# ALG-20 — Métricas de interés por proyecto (project interest metrics)

| Field | Value |
| :---- | :---- |
| **Version** | `hu26-project-interest-v2` (`ALG20_VERSION`) |
| **Runs on / implemented in** | **Edge Function** `project-interest-metrics` · code in `frontend/src/lib/commercial/projectInterestMetrics.js` (pure, no Supabase, no fetch, no clock) |
| **Cases** | `docs/algorithms/ALG-20-cases.json` — asserted by `frontend/src/lib/commercial/__tests__/projectInterestMetrics.test.js` (**vitest**) |
| **Open assumptions** | 10 open — see the log below |
| **Last changed** | 2026-11-03 · HU 26 review · runs server-side; R3 C0 (scope); renumbered from ALG-19, which HU 21 uses |

> **Where it runs.** Like `ALG-18` since HU 30, in a Supabase Edge Function
> (`supabase/functions/project-interest-metrics`) that imports this module and `ALG-10` unchanged.
> The private source `hu26_project_interest_source(p_actor)` (service_role only) decides **which
> facts may be used**; the browser receives only this algorithm's output, never an evaluation.

## Purpose

**What it computes.** For one inmobiliaria, a ranking of its projects by **traction** — how many
leads showed interest in each, and how (visualizaciones, simulaciones, favoritos) — and, for the
leads interested in each project, how many are **incompatible** with it and **why**.

**Who reads it.** The administrador inmobiliario (`admin_inmobiliario`, or `admin` with an
inmobiliaria), in the "Interés por proyecto" tab of the Métricas page (HU 26). The question it
answers is *"is our offer aligned with the demand and the real purchase capacity of our leads?"*:
a project with many interested leads who mostly cannot buy it is mis-priced for its audience; a
project nobody looks at has a demand problem.

**What it depends on.** `ALG-10` for every compatibility verdict and every reason — **compatibility
is never recomputed here and no `ALG-10` number is restated**. `ALG-9` reaches it only through
`ALG-10`.

**Why it is this way.**

1. **No weights.** "Traction" could be a weighted index (a favorite worth three views…). Any
   weight would be an invented number with nothing to calibrate it against. The ranking is instead
   a deterministic ordering over counts the admin can read in the same row (R2).
2. **"Rejected" means `ALG-10` excluded the pair.** The catalog has no per-project minimum score,
   so the only shipped definition of "this lead does not qualify for this project" is `ALG-10`'s
   gates. Reusing it keeps the metrics page and the executive's lead panel from disagreeing about
   the same pair (A1).
3. **Missing data is not a rejection.** A lead without a usable evaluation is counted apart, never
   as incompatible — the same distinction `ALG-9` invariant 4 and `ALG-10` G0 keep (R3).

## Inputs → outputs

### Inputs

`computeProjectInterestMetrics({ proyectos, leads }, { match = matchLeadToProjects } = {})`

The second argument is the test seam only.

`proyectos` — the tenant's projects, in the order the RPC returns them (`nombre`, `id`):
`[{ id, nombre, comuna, tipo, precio_min_uf, precio_max_uf, estado }]`, the HU 7 contract fields
`ALG-10` reads.

`leads` — one row per lead with at least one interaction on one of those projects:

| Field | Type | Notes |
| :---- | :--- | :---- |
| `lead_id` | string | Stable within one call only (`row_number()`); never a profile id |
| `evaluacion_actual` | `{ input, onboarding, result }` or `null` | The lead's latest evaluation, the shape `ALG-10` reads. `null` when the lead has none, when no interaction is `en_alcance`, or when HU 30 hides it (co-debtor not confirmed or past its window) |
| `interacciones` | `[{ proyecto_id, en_alcance, visualizaciones, favorito, simulaciones }]` | One entry per project the lead interacted with. `en_alcance` is `lead_belongs_to_proyecto(lead, project)` (favorite or declared commune); `false` keeps the evaluation away from that project (R3 C0). Absent means `true` |

Interaction units, as the database records them:

| Field | Unit | Source |
| :---- | :--- | :----- |
| `visualizaciones` | integer ≥ 0 — **days** on which the lead opened the project's detail (America/Santiago calendar day) | `proyecto_visualizaciones` (A2) |
| `favorito` | boolean — the project is **currently** a favorite of the lead | `proyecto_favoritos` (A4) |
| `simulaciones` | integer ≥ 0 — saved financing scenarios on the project | `mortgage_scenarios.project_id` (A3) |

### Outputs

```js
{
  version: "hu26-project-interest-v2",
  n_leads,                                  // leads interested in at least one project
  totales: { visualizaciones, favoritos, simulaciones },
  ranking: [ ProyectoRow ]                  // every project in `proyectos`, R2 order
}
```

`ProyectoRow`:

| Field | Type | Meaning |
| :---- | :--- | :------ |
| `proyecto_id` | string | |
| `posicion` | integer | 1-based position in the ranking |
| `interesados` | integer | Leads with any interaction on the project (R1) |
| `visualizaciones`, `favoritos`, `simulaciones` | integer | Sums over those leads (R1) |
| `compatibilidad` | `{ compatibles, incompatibles, sin_datos, evaluables, tasa_incompatibles }` | R3 |
| `motivos` | `[{ motivo, n, proporcion }]` | R4, sorted |

## Rules

### R1 — Interest per project

For each project `p` and each lead `l`, take `l`'s interaction entry for `p` (if any):

- `l` is **interesado** in `p` when `visualizaciones > 0` **or** `favorito` **or** `simulaciones > 0`.
  An entry with all three empty does not count.
- `visualizaciones(p)` = Σ `visualizaciones`; `simulaciones(p)` = Σ `simulaciones`;
  `favoritos(p)` = number of leads with `favorito`; `interesados(p)` = number of interested leads.
- `totales` are the sums of the three counts over all projects. `n_leads` counts each lead once,
  however many projects they are interested in — so Σ `interesados(p)` can exceed `n_leads`.

Entries whose `proyecto_id` is not in `proyectos` are ignored.

### R2 — Ranking by traction

Every project in `proyectos` appears, **including those with no interest** (a project nobody looks
at is itself the finding). Ordered by, first difference wins:

1. `interesados` descending;
2. `favoritos` descending;
3. `simulaciones` descending;
4. `visualizaciones` descending;
5. the input order of `proyectos` (the RPC sorts by `nombre`, `id`) — arbitrary but deterministic.

**Why this order.** Distinct leads first, because a project one lead opened forty times is not more
in demand than one forty leads opened once. Then the interactions by how deliberate they are: a
favorite is a statement, a saved simulation is work, a view is a click. This is an ordering, not a
score: it needs no weight, and every key is a column the admin sees (A6). The page may offer other
sorts on the same columns; that is presentation, not this rule.

### R3 — Compatibility of the interested leads

For each lead, call `match(evaluacion_actual, projectsOfInterest)` once, where `projectsOfInterest`
are the `proyectos` rows the lead is interested in (R1) **and** whose entry is not
`en_alcance: false`. `ALG-10` is pair-scoped, so the verdict
of a pair does not depend on which other projects are passed. Each interested pair `(l, p)` falls
in exactly one bucket:

| # | Condition | Bucket |
| :- | :-------- | :----- |
| C0 | the entry is `en_alcance: false` (`match` is not called for it) | `sin_datos` |
| C1 | `evaluacion_actual` is `null` (`match` is not called) | `sin_datos` |
| C2 | the pair is in `excluidos` with `motivo_exclusion == "capacidad_requiere_antecedentes"` (`ALG-10` G0) | `sin_datos` |
| C3 | the pair is in `excluidos` with `motivo_exclusion` ∈ {`"bloqueador_critico"`, `"capacidad_insuficiente"`} (`ALG-10` G1, G2) | `incompatibles` |
| C4 | the pair is in `matches` — any `clasificacion`, including a near-miss (`alcanza_precio_min: false`) | `compatibles` |

```
evaluables         = compatibles + incompatibles
tasa_incompatibles = evaluables > 0 ? incompatibles / evaluables : null
```

`sin_datos` is outside the rate's denominator: an unevaluable lead is neither a rejection nor a fit.
A rate with `evaluables == 0` is `null`, never `0`. The rate is not rounded here.

### R4 — Reasons for incompatibility (E3)

Each `incompatibles` pair gets one `motivo`, from its `ALG-10` row:

| # | `motivo_exclusion` | `bloqueador_principal.codigo` | `motivo` |
| :- | :----------------- | :---------------------------- | :------- |
| M1 | `bloqueador_critico` | present | that `codigo` (today `morosidad_vigente` or `carga_total_alta`, `ALG-10` R3 step 1) |
| M2 | `bloqueador_critico` | absent | `bloqueador_critico` |
| M3 | `capacidad_insuficiente` | `pie_insuficiente_para_proyecto` or `renta_insuficiente_para_proyecto` | that `codigo` (`ALG-10` R3 steps 2–3) |
| M4 | `capacidad_insuficiente` | anything else, or absent | `capacidad_insuficiente` |

**Why M4 does not take a non-critical blocker's code.** For a pair excluded by capacity, `ALG-10`
R3 step 4 can name a non-critical blocker (say `edad_plazo_riesgoso`) when the binding restriction
is unknown. That blocker did not exclude the pair — capacity did — so reporting it as "the reason"
would be false.

`motivos(p)` groups the pairs of `p` by `motivo`: `{ motivo, n, proporcion = n / incompatibles }`,
sorted by `n` descending, then `motivo` ascending. Empty when `incompatibles == 0`. The first
element is the project's **motivo principal**.

## Invariants and edge cases

**Invariants** (asserted on every case output):

1. `ranking` contains every project of `proyectos` exactly once; `posicion` runs `1 … n`.
2. For every row: `compatibles + incompatibles + sin_datos == interesados` and
   `evaluables == compatibles + incompatibles`.
3. For every row: Σ `motivos.n == incompatibles`, and every `proporcion` is in `(0, 1]`.
4. `tasa_incompatibles` is `null` exactly when `evaluables == 0`; otherwise in `[0, 1]`.
5. `interesados <= n_leads` for every row; `favoritos <= interesados`.
6. `totales` equal the column sums of `ranking`.
7. The ranking is non-increasing in `interesados`.
8. Same input → deep-equal output; the inputs are not mutated.
9. No clock, no randomness, no AI: the module never reads `Date.now()` or `Math.random()`.

**Edge cases:**

| Condition | Behaviour | Why |
| :-------- | :-------- | :-- |
| `proyectos` empty | `ranking: []`, totals 0 | Not an error |
| `leads` empty | every project with zeros and `tasa_incompatibles: null` | No interest yet |
| lead interested in a project, no evaluation | `sin_datos` for every one of its pairs (C1) | A lead can browse before precalificarse |
| lead interested in two projects | counted in both rows, once in `n_leads` | R1 |
| lead only viewed or simulated a project outside its scope | counted as interest; `sin_datos` for that pair (C0) | A view must not pull a lead's finances into a tenant it does not belong to (A10) |
| project `estado == "agotado"` | ranked like any other | Past interest is still the finding; `ALG-10` does not gate on `estado` either |
| near-miss pair (`ALG-10` R1 band) | `compatibles` | `ALG-10` deliberately keeps it in `matches` (A8) |

## Assumptions log

| # | Assumption | Made by | Date | Would be wrong if | Status |
| :- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | E2's "no alcanzar el score financiero requerido para ese proyecto" is read as **`ALG-10` excluded the pair** (G1 critical blocker, G2 capacity). The catalog has no per-project minimum score | HU 26 build | 2026-10-26 | The inmobiliaria wants a per-project minimum score it sets itself. Then `proyectos` needs a column and this rule a new branch — a story of its own | open · ask the client |
| A2 | A **visualización** is a lead opening a project's detail in the catalog, counted **at most once per lead, project and Santiago calendar day** | HU 26 build | 2026-10-26 | The admin wants raw opens. Per-day dedup was chosen so a refresh, a double mount or an impatient lead cannot inflate the ranking | open |
| A3 | A **simulación** is a **saved** financing scenario on the project (HU 17, `mortgage_scenarios.project_id`), not each project selected in the compatibility simulator (HU 6) | HU 26 build | 2026-10-26 | The client counts any use of the simulator. The HU 6 page pre-selects the first project of the catalog, so counting selections would put that project on top of the ranking for no reason | open |
| A4 | **Favoritos** are current favorites. A removed favorite stops counting | HU 26 build | 2026-10-26 | The admin wants "ever favorited". `proyecto_favoritos` keeps no removal history (its own migration says so), so that needs an event log first | open |
| A5 | Compatibility uses the lead's **latest** evaluation — today's verdict, not the one at the time of the interaction | HU 26 build | 2026-10-26 | Same caveat as `ALG-18` A3: a lead who improved since is shown as compatible today | open |
| A6 | Traction is the R2 ordering (distinct leads, then favorites, simulations, views), **no weights** | HU 26 build | 2026-10-26 | The client wants a weighted index. Its weights are then new numbers for this log | open |
| A7 | Only interactions of profiles with `role = 'usuario'` are recorded or counted; staff previews never are | HU 26 build | 2026-10-26 | — (staff browsing the catalog is not demand) | open |
| A8 | A near-miss pair counts as `compatibles` | HU 26 build | 2026-10-26 | The admin reads "compatible" as "can buy today". `ALG-10` R1 argues these leads are the most callable segment; the page's help text says so | open |
| A9 | No time window: all interactions since the counters exist (views start at the HU 26 deploy) | HU 26 build | 2026-10-26 | The admin needs "this month". A period filter is a follow-up, not a rule change | open |
| A10 | A lead's evaluation is compared only with projects it belongs to under `lead_belongs_to_proyecto` (favorite or declared commune), the rule every other staff view uses. A view or a saved simulation alone counts as interest but not for compatibility | HU 26 review | 2026-11-03 | The client wants every interested lead evaluated. That widens which leads' finances an inmobiliaria may use and needs an explicit consent decision first | open |
