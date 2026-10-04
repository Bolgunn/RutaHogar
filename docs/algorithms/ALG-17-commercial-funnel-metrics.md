# ALG-17 — Métricas del embudo comercial (commercial funnel metrics)

| Field | Value |
| :---- | :---- |
| **Version** | `hu15-commercial-funnel-v1` |
| **Runs on / implemented in** | **frontend** · `frontend/src/lib/commercial/funnelMetrics.js` (pure: no Supabase, no fetch, no `Date.now()` — `now` is an input) |
| **Cases** | `docs/algorithms/ALG-17-cases.json` — asserted by `frontend/src/lib/commercial/__tests__/funnelMetrics.test.js` (**vitest**) |
| **Open assumptions** | 6 open — see the log below · plus 11 open questions for the author (OQ1 blocks PLAN) |
| **Last changed** | 2026-10-04 · HU 15 · **draft** for Bolgunn to review and own |

> **Status: draft.** Written from the HU 15 grill (decisions D1–D12, 2026-10-04). The author owns
> every rule here and resolves the open questions before phase 3 (PLAN.md). Where a decision did
> not settle a point, this document says so in **Open questions** instead of picking an answer
> silently.

> **Specified against two branches that are not built yet.** This document does not stub them; the
> implementation waits for both.
>
> 1. `fix/admin-inmobiliario-role` — frontend support for the `admin_inmobiliario` role (the tenant
>    admin of D2).
> 2. `feat/commercial-stage-project-tracks` — "both keying" of commercial stages (D9): events gain a
>    nullable `proyecto_id`. ALG-17 relies on that branch's precondition that `en_negociacion`,
>    `reserva`, `venta_cerrada` and `perdido` events always name a project, and does **not**
>    re-check it.

## Purpose

**What it computes.** From one *fact row per lead* in the caller's scope, the in-scope project list,
the dashboard filters and a `now` instant, every number on the HU 15 dashboard: capture rate
(E1), the stage funnel and its conversions (E1), plan → venta (E1), the sales-cycle and in-stage
times (E2), engagement (E1), the affinity / capacity breakdown (E3), and the same metrics bucketed
by week, month or year (E4).

**When it runs.** In the browser, after the dashboard calls the `security definer` RPC
`commercial_funnel_facts()` (D1, specified in PLAN.md) and whenever a filter, the granularity or
`now` changes. The RPC is the boundary: it decides scope (D2), drops deleted accounts, and strips
`reason`, `actor` and `user_id` from stage events (D9). ALG-17 trusts what it receives.

**What it depends on.**

- `ALG-10` (`matchLeadToProjects`) for **every** affinity and capacity band. ALG-17 reads ALG-10's
  outputs; it never restates a threshold, never re-scores a pair, never recomputes capacity.
- The commercial-stage model (`docs/stories/commercial-stage/PLAN.md`, migration
  `20260930120000_commercial_stage.sql`) for the stage list and ranks, as extended by the
  project-tracks branch (D9).
- The stored scoring result for priority (`commercial_priority_detail.action`, one of the six
  `COMMERCIAL_ACTIONS` keys in `backend/app/scoring_engine/constants.py`). Nothing is recomputed (D12).

**Why it is this way** — and what was rejected:

1. **Pure function over fact rows (D1).** Every metric is a fold over per-lead facts, so one RPC
   returns the minimum the page needs and the arithmetic lives where vitest can pin it. Rejected:
   one RPC per metric (each one re-deriving scope and stage semantics in SQL, out of reach of the
   ALG cases), and pulling raw tables into the browser (exposes stage `reason` text, which is staff
   free text that may identify the lead).
2. **Capture = postulación, not "interesados → precalificados" (D3).** Signup requires a
   prequalification, so every lead in the universe is already prequalified; that ratio would be
   100 % by construction. The meaningful act of interest is setting a project as the goal.
3. **Ever-reached funnel (D4).** Counting leads by their *current* stage makes the funnel shrink
   every time someone is marked `perdido`, and makes it non-monotone. Counting what each lead ever
   reached keeps every step ≤ the one before and keeps lost leads in the stages they did reach.
4. **Plan impact from `tracking_plans.baseline_at`, not from the `en_plan_mejora` stage (D5).** The
   stage is a manual click an executive may never make; the plan baseline is a recorded fact.
5. **Time *in* a stage, not time "from stage N to N+1" (D6).** Stages may be skipped and moves may
   go backwards; "N → N+1" is undefined for a lead who skipped N+1 and double-counts a lead who went
   back. Time in a stage is always defined. The HU 15 wiki note ("diferencias de `occurred_at` entre
   eventos consecutivos") is superseded by this.
6. **Unweighted engagement (D7).** Any weight per action would be an invented number with nothing to
   calibrate it against. An unweighted "did anything" plus a per-action breakdown is honest.
7. **One lead, one band (D8).** A per-project breakdown would count a lead once per project and the
   buckets would not sum to the universe. The best band across projects answers "how reachable is
   this lead for us at all".
8. **Stages keyed by lead *and* project (D9).** A lead-only key cannot say *which* project a
   negotiation or sale belongs to, so a project view of the funnel would credit project A with a
   sale on project B. Rejected: per-project funnels keyed only by lead.
9. **Cohorts by first evaluation (D10).** A funnel bucketed by *event* date mixes leads at different
   ages and can show conversion above 100 % in a period. A cohort is a fixed set of leads.
10. **No minimum-n cutoff and no "last N days" default (D6, D10).** Both would need a number nobody
    has. Instead every figure carries its `n`, and `n = 0` is an explicit empty result.

## Inputs → outputs

### Inputs

`computeFunnelMetrics({ facts, proyectos, filtros, now, granularidad }) -> FunnelMetrics`

**`facts`** — one row per lead in scope, as returned by `commercial_funnel_facts()`. Timestamps are
ISO-8601 instants (UTC offsets allowed). Arrays may be empty, never absent.

| Field | Type | Source | Notes |
| :---- | :--- | :----- | :---- |
| `lead_id` | string | — | Opaque and stable within one call. Only used for determinism, never shown |
| `first_evaluation_at` | instant | min `evaluations.created_at` | The preevaluación. Cohort key (R7) and start of every lead timeline |
| `evaluation_ats` | instant[] | all `evaluations.created_at`, ascending | Includes the first. Every later one is a re-prequalification (R6) |
| `evaluacion_actual` | `{ input, onboarding, result }` | latest evaluation | Exactly what `matchLeadToProjects` reads (`ALG-10` Inputs). Also carries `result.commercial_priority_detail` |
| `proyectos` | string[] | `lead_belongs_to_proyecto` (D2) | In-scope projects the lead belongs to. Non-empty by D2. Carried for the UI; no rule below narrows by it |
| `postulaciones` | `[{ proyecto_id, first_at }]` | project-goal evaluations | **First** time the lead set each project as its meta (D3), even if later changed. One entry per project |
| `stage_events` | `[{ proyecto_id, stage_after, occurred_at }]` | `commercial_stage_events` | `proyecto_id: null` = lead-level move (D9). Sorted by `(occurred_at, id)` by the RPC. Never `reason`, `actor`, `user_id` |
| `plan_baseline_at` | instant or `null` | `tracking_plans.baseline_at` | One plan per lead (`tracking_plans.user_id` is unique) |
| `favoritos` | `[{ proyecto_id, created_at }]` | `proyecto_favoritos` | |
| `progress_update_ats` | instant[] | `tracking_events.recorded_at`, `event_kind` ∈ {`data_update`, `evaluation`} | |
| `confirmed_goal_ats` | instant[] | `improvement_goal_events.recorded_at`, `confirmed = true` | |

**`proyectos`** — the caller's in-scope projects (D2): every project of the tenant for a tenant
admin, the assigned projects for an ejecutivo. HU 7 contract; ALG-17 reads `id` and
`estado` ∈ {`disponible`, `en_construccion`, `agotado`} and passes the rows to ALG-10 untouched.

**`filtros`** (D11) — an empty array means "no filter on this dimension".

| Field | Type | Values |
| :---- | :--- | :----- |
| `proyecto_id` | string or `null` | One of `proyectos[].id` (precondition) |
| `afinidad` | string[] | `Compatible` · `Cercano` · `Marginal` · `fuera_de_alcance` · `requiere_antecedentes` |
| `capacidad` | string[] | `alcanza` · `cercano_por_capacidad` · `insuficiente` · `requiere_antecedentes` |
| `prioridad` | string[] | `contact_now` · `contact_with_review` · `nurture` · `reorient` · `request_info` · `do_not_route` · `sin_prioridad` |

**`now`** — instant. The horizon of every metric: any input timestamp after `now` is ignored.

**`granularidad`** — `semana` · `mes` · `año` (R7).

### Outputs

```js
FunnelMetrics = {
  version: "hu15-commercial-funnel-v1",
  n,                        // leads after filters (R8) — the universe of every metric below
  captura,                  // R2
  embudo,                   // R3
  plan_a_venta,             // R4
  tiempos,                  // R5
  engagement,               // R6
  bandas,                   // R1 — current snapshot only, not bucketed
  serie: { granularidad, periodos: [Periodo] }   // R7
}
```

| Object | Shape |
| :----- | :---- |
| `captura` | `{ n, postulan, tasa }` |
| `embudo` | `{ n, etapas: [{ etapa, alcanzaron, conversion }], perdido_actual }` — `etapas` in ladder order, all six always present |
| `plan_a_venta` | `{ con_plan, con_plan_y_venta, tasa }` |
| `tiempos` | `{ ciclo_venta: Stat, dias_hasta_postular: Stat, en_etapa: { [etapa]: StageStat } }` — `en_etapa` has all seven stages |
| `engagement` | `{ n, activos, tasa, por_accion: { [accion]: { leads, eventos } } }` — all six actions always present |
| `bandas` | `{ n, afinidad: { Compatible, Cercano, Marginal, fuera_de_alcance, requiere_antecedentes }, capacidad: { alcanza, cercano_por_capacidad, insuficiente, requiere_antecedentes } }` — every key always present |
| `Stat` | `{ n, promedio, mediana }` — days, unrounded; `promedio` and `mediana` are `null` when `n = 0` |
| `StageStat` | `Stat` plus `en_curso`: leads currently in that stage, excluded from `n` |
| `Periodo` | `{ clave, desde, hasta, en_curso, captura, embudo, plan_a_venta, tiempos, engagement }` |

Enumerations:

- `etapa`: `nuevo` · `contactado` · `en_plan_mejora` · `en_negociacion` · `reserva` ·
  `venta_cerrada` (ladder); `en_etapa` adds `perdido`.
- `accion`: `favorito` · `reprecalificacion` · `postulacion` · `plan_aceptado` ·
  `actualizacion_progreso` · `meta_confirmada`.
- `clave`: `2026-W40` (ISO week-year and week) · `2026-10` · `2026`.

**Rates** (`tasa`, `conversion`) are `numerator ÷ denominator` in [0, 1], unrounded, and **`null`
when the denominator is 0** — never 0. Rounding and the `%` sign are the UI's job.

## Rules

### R0 — The active project set and the considered events

Everything project-dependent in R1–R6 reads one set:

```
S = filtros.proyecto_id ? { filtros.proyecto_id } : { p.id for p in proyectos }
```

- **Tenant view** (no project filter, tenant admin): `S` = every tenant project.
- **Project view** (a project filter, or an ejecutivo's scope): `S` = that project, or the assigned
  projects (D9).

A lead's **considered stage events** are those with `proyecto_id === null` **or** `proyecto_id ∈ S`,
and `occurred_at <= now`, in input order. Events on any other project are ignored — this is how a
late stage on a project outside an ejecutivo's scope, or outside the selected project, stops
counting (D9).

**The project filter is a lens, not a lead filter.** It does not remove leads from the universe
(D3: "the universe does **not** narrow to that project"). It re-targets capture, bands, stage
tracks and project-bound engagement to that project.

### R1 — Affinity and capacity buckets (D8)

Computed once per lead, from `evaluacion_actual` only (history is not re-banded, D11):

```
catalogo = filtros.proyecto_id ? [ the selected project ]          // agotado allowed
                               : proyectos.filter(p => p.estado !== "agotado")
{ matches, excluidos } = matchLeadToProjects(evaluacion_actual, catalogo)      // ALG-10
```

Affinity, first row that applies:

| # | Condition on ALG-10's output | Bucket |
| :- | :--------------------------- | :----- |
| A0 | the lead hits ALG-10 **G0** (`motivo_exclusion = capacidad_requiere_antecedentes`) | `requiere_antecedentes` |
| A1 | some row in `matches` has `clasificacion = Compatible` | `Compatible` |
| A2 | some row in `matches` has `clasificacion = Cercano` | `Cercano` |
| A3 | some row in `matches` has `clasificacion = Marginal` | `Marginal` |
| A4 | `matches` is empty (excluded from every project) | `fuera_de_alcance` |

Capacity, first row that applies:

| # | Condition on ALG-10's output | Bucket |
| :- | :--------------------------- | :----- |
| C0 | the lead hits ALG-10 **G0** | `requiere_antecedentes` |
| C1 | some row (in `matches` **or** `excluidos`) has `evidencia.alcanza_precio_min = true` | `alcanza` |
| C2 | some row in `matches` has `alcanza_precio_min = false` — ALG-10 R1's near-miss band | `cercano_por_capacidad` |
| C3 | otherwise | `insuficiente` |

**Every threshold is ALG-10's.** The `Compatible` / `Cercano` / `Marginal` cut-offs are ALG-10 R2's
bands; the near-miss band is ALG-10 R1 (G2 and `UMBRAL_CERCANIA`), including its assisted-inclusion
path; G0 is ALG-10 R1. None of those numbers appears in this module.

G0 is lead-global in ALG-10 (it reads only the lead's capacity status), so a lead is in G0 for every
project or for none, and A0 / C0 fire together. `requiere_antecedentes` is its own bucket in both
dimensions, **never** "worst band": these are leads needing a fresh evaluation, not leads who cannot
buy (ALG-10 A2).

**Best affinity and best capacity may come from different projects.** Intended (D8): the two
dimensions answer different questions.

**Priority** is `evaluacion_actual.result.commercial_priority_detail.action` when it is one of the
six `COMMERCIAL_ACTIONS` keys, else `sin_prioridad` (D11; see OQ11 for unknown values).

### R2 — Capture (D3)

A lead **postula** when it has at least one `postulaciones` entry with `proyecto_id ∈ S` and
`first_at <= now`. Its **first application** is the earliest such `first_at`.

| Field | Value |
| :---- | :---- |
| `captura.n` | `n` (leads after filters) |
| `captura.postulan` | leads that postula |
| `captura.tasa` | `postulan ÷ n`, `null` when `n = 0` |

With a project filter, `S` is that one project, so *postula* means "applied to that project" — but
`captura.n` is still every lead after filters.

### R3 — Stage tracks, derived stage and the funnel (D4, D9)

**Tracks.** Replaying a lead's considered events (R0) in order, each `proyecto_id` value — `null`
for the lead-level track, or a project id — is a **track** whose current stage is the `stage_after`
of its latest event. A track exists once it has at least one considered event.

**Derived stage** at any moment (D9):

| Condition | Derived stage |
| :-------- | :------------ |
| no track exists | `nuevo` (a lead with no stage row counts as `nuevo`, D4) |
| every existing track is `perdido` | `perdido` |
| otherwise | the highest-ranked stage among tracks that are not `perdido` — so `venta_cerrada` whenever any project is sold |

Ranks are the commercial-stage plan's: `nuevo` 1 … `venta_cerrada` 6; `perdido` has no rank. **See
OQ1** — as literally specified, this rule interacts badly with D9's ban on lead-level `perdido`.

**Derived timeline.** Starts at `t0 = min(first_evaluation_at, first considered event)` in
`nuevo`. After each considered event the derived stage is recomputed; a new **spell** begins only
when it changes. Consecutive equal derived stages are one spell.

**Ever reached (D4).**

```
max_rank        = max(1, rank of every ranked stage_after among considered events)
reached(etapa)  = rank(etapa) <= max_rank
```

A lead that skipped stages counts as having reached every stage below the highest it reached — that
is what keeps the funnel monotone. A lead later `perdido` keeps every stage it reached.

| Field | Value |
| :---- | :---- |
| `embudo.n` | `n` |
| `etapas[k].alcanzaron` | leads with `reached(etapa_k)`; `alcanzaron(nuevo) = n` |
| `etapas[k].conversion` | `alcanzaron(k) ÷ alcanzaron(k−1)`; `null` for `nuevo` and whenever the denominator is 0 |
| `embudo.perdido_actual` | leads whose **current** derived stage is `perdido` (off the ladder; depends on OQ1) |

### R4 — Plan → venta (D5)

| Field | Value |
| :---- | :---- |
| `con_plan` | leads with `plan_baseline_at` not null and `<= now` |
| `con_plan_y_venta` | of those, leads with a considered `venta_cerrada` event whose `occurred_at` is **strictly after** `plan_baseline_at` (the earliest such event is used) |
| `tasa` | `con_plan_y_venta ÷ con_plan`, `null` when `con_plan = 0` |

Independent of whether `en_plan_mejora` was ever recorded. A plan accepted **after** the sale counts
in `con_plan` and not in `con_plan_y_venta`. A sale later reverted still has its `venta_cerrada`
event and counts here — **see OQ2**.

### R5 — Times (D6)

All durations are **elapsed time** in days: `(t_end − t_start) in ms ÷ 86 400 000`, unrounded. A
daylight-saving change in America/Santiago therefore never stretches or shrinks a duration (see
OQ10). Every metric reports `Stat = { n, promedio, mediana }`; the median of an even `n` is the mean
of the two middle values. **No minimum-n cutoff.**

| Metric | Included leads | Start | End |
| :----- | :------------- | :---- | :-- |
| `ciclo_venta` | leads whose **current** derived stage is `venta_cerrada` | `first_evaluation_at` | start of the current derived `venta_cerrada` spell |
| `dias_hasta_postular` | leads that postula (R2) | `first_evaluation_at` | first application on `S` |
| `en_etapa[s]` | leads whose derived timeline has at least one **closed** spell in `s` **and** whose current derived stage is not `s` | each spell's start | each spell's end; spells in `s` are **summed** per lead |

- **A lead still in stage `s`** is excluded from `en_etapa[s]` entirely — even if it also has an
  earlier, closed visit — and is counted in `en_etapa[s].en_curso`.
- **A reverted sale** (`venta_cerrada → perdido`) is not in `ciclo_venta`, because its current
  derived stage is no longer `venta_cerrada`.
- **"Time from stage N to N+1" is not computed** (Purpose, point 5).
- In tenant view the spells are those of the **derived tenant stage** (assumption A6), not of any one
  project track.

### R6 — Engagement (D7)

A lead is **activo** in an interval if at least one of its actions falls in it:

| `accion` | Timestamps |
| :------- | :--------- |
| `favorito` | `favoritos[].created_at` with `proyecto_id ∈ S` |
| `reprecalificacion` | `evaluation_ats` except the first |
| `postulacion` | `postulaciones[].first_at` with `proyecto_id ∈ S` |
| `plan_aceptado` | `plan_baseline_at` |
| `actualizacion_progreso` | `progress_update_ats` |
| `meta_confirmada` | `confirmed_goal_ats` |

Only timestamps `<= now` count. **Unweighted**: one action or twenty, the lead is activo once.

| Field | Value |
| :---- | :---- |
| `engagement.n` | `n` (leads after filters — see OQ5 for the per-period reading) |
| `engagement.activos` | leads with ≥ 1 action in the interval |
| `engagement.tasa` | `activos ÷ n`, `null` when `n = 0` |
| `por_accion[a].leads` | leads with ≥ 1 action of type `a` in the interval |
| `por_accion[a].eventos` | number of actions of type `a` in the interval (see OQ6) |

In the top-level output the interval is the full history up to `now`; in a `Periodo` it is the
period (R7).

### R7 — Periods and buckets (D10)

**Calendar.** Every date is read in **America/Santiago**, using the zone's offset *on that instant*
(it is UTC−4 in winter and UTC−3 in summer — a fixed offset is a defect). `semana` is the ISO week,
Monday 00:00 to the next Monday 00:00, labelled with its ISO **week-year** (so 2027-01-01 is
`2026-W53`); `mes` is the calendar month; `año` the calendar year. A period is the half-open
interval `[desde, hasta)` between local midnights, and `desde` / `hasta` are emitted as instants.

**Range.** Periods are contiguous, from the one containing the earliest `first_evaluation_at`
**among the leads after filters** to the one containing `now`, empty periods included. No leads
after filters → `periodos: []`. There is no "last N days" default: the default view is the full
history.

**`en_curso`** is `true` for exactly the period containing `now` (see OQ7).

**Which period a metric belongs to:**

| Metric | Belongs to the period containing | Notes |
| :----- | :------------------------------- | :---- |
| `captura`, `embudo`, `plan_a_venta` | the lead's `first_evaluation_at` (**cohort**) | The cohort's stages, applications and sales are counted up to `now`, not up to the period's end. `n` of the period = its cohort size |
| `ciclo_venta`, `dias_hasta_postular` | the interval's **end** | |
| `en_etapa[s]` | the end of the lead's **last** closed spell in `s` | The lead's whole summed time lands in that one period |
| `engagement` | each action's timestamp | A lead is activo in every period where it has an action. `n` of the period = `n` (see OQ5) |

### R8 — Filters (D11)

```
leads = facts.filter(lead =>
     (filtros.afinidad.length  === 0 || filtros.afinidad.includes(afinidad(lead)))     // R1
  && (filtros.capacidad.length === 0 || filtros.capacidad.includes(capacidad(lead)))   // R1
  && (filtros.prioridad.length === 0 || filtros.prioridad.includes(prioridad(lead))))  // R1
n = leads.length
```

- **Multi-value within a filter (OR), AND across filters.**
- The filtered set is computed **once**; R1–R7, totals and every period, run on it.
- The project filter does not appear above: it acts through `S` (R0) and through the band catalog
  (R1), so with a project selected the affinity and capacity filters test the bands **against that
  project**.
- Bands and priority come from the current evaluation only.
- Every output carries its `n`; `n = 0` is an explicit empty result (rates `null`, `Stat` with
  `n = 0` and `null` averages, every count 0, `periodos: []`).

## Invariants and edge cases

**Invariants** — asserted by tests on every case, not by fixture values:

1. **Buckets partition the universe:** `Σ bandas.afinidad = Σ bandas.capacidad = bandas.n = n`.
2. Every rate is in `[0, 1]` or `null`, and it is `null` **exactly** when its denominator is 0.
3. **Ever-reached is monotone down the ladder:** `alcanzaron(k) <= alcanzaron(k−1)` for every `k`,
   and `alcanzaron(nuevo) = n`.
4. `captura.postulan <= n`; `plan_a_venta.con_plan_y_venta <= con_plan`; `engagement.activos <= n`;
   `por_accion[a].leads <= activos <= Σ por_accion[a].leads`.
5. Every `Stat.n` and `en_curso` is a non-negative integer; `promedio` and `mediana` are `null` iff
   `n = 0`; every duration is `>= 0`.
6. **Deterministic given `now`:** the same `facts`, `proyectos`, `filtros`, `now` and
   `granularidad` always produce the same output, including order. No `Date.now()`, no randomness, no
   AI in the path (D12, S1).
7. Nothing dated after `now` affects any output.
8. **Nothing is recomputed:** score, classification, priority and capacity are read from
   `evaluacion_actual.result`; bands come from ALG-10 alone. No band threshold is declared in this
   module.
9. Cohort periods partition the cohort: `Σ periodos[i].embudo.n = n` and
   `Σ periodos[i].captura.postulan = captura.postulan`.
10. Filters only remove leads: adding a value to an already non-empty filter never decreases `n`;
    turning on a filter that was empty never increases it.
11. `computeFunnelMetrics` does not mutate its arguments.

**Edge cases:**

| Condition | Behaviour | Why |
| :-------- | :-------- | :-- |
| lead with no stage events | derived stage `nuevo` throughout; reaches only `nuevo` | D4. Leads that became eligible after the backfill have no row (commercial-stage plan, Q5) |
| skipped stages (`nuevo → reserva`) | counts as having reached `contactado`, `en_plan_mejora`, `en_negociacion` | Keeps invariant 3. No spell exists in the skipped stages, so they get no time |
| backward move and repeated visit | each visit is its own spell; time in the stage is the **sum** | D6 |
| lead still in a stage | excluded from that stage's `Stat`; counted in `en_curso` | D6 |
| reverted sale (`venta_cerrada → perdido`, admin) | out of `ciclo_venta`; still reached `venta_cerrada` in the funnel; still counts in plan → venta | D6, D4, D5 literally — **see OQ2** |
| late stage on a project outside `S` | ignored in every metric | R0, D9 |
| lead whose current evaluation has no capacity (old result shape, `requires_info`) | `requiere_antecedentes` in both dimensions | ALG-10 G0 |
| lead compatible only with an `agotado` project | default view ignores that project; with that project selected, it counts | D8 |
| every in-scope project `agotado` (empty default catalog) | non-G0 leads land in `fuera_de_alcance` / `insuficiente` | Vacuous "excluded from every project" — **see OQ4** |
| `bloqueador_critico` lead below `precio_min` everywhere | `insuficiente`, never `cercano_por_capacidad` | ALG-10 never puts it in `matches` — **see OQ3** |
| application before the first evaluation | impossible: an application *is* an evaluation; `dias_hasta_postular` can be 0, never negative | |
| plan accepted after the sale | in `con_plan`, not in `con_plan_y_venta` | D5: baseline must precede the sale |
| DST changes in America/Santiago (first Saturday→Sunday of April and of September, at local midnight) | durations unaffected (elapsed time); buckets use the offset of each instant, so `2026-07-01T03:30Z` is **30 June** 23:30 local | R5, R7 |
| ISO week across a year boundary | `2027-01-01` is `2026-W53` for `semana` but `2027-01` / `2027` for `mes` / `año` | R7 |
| Sunday 23:30 in Santiago | still that ISO week, although it is already Monday in UTC | R7 |
| deleted account | absent from `facts`; its history no longer counts anywhere, including past periods | Assumption A5. Stage history survives erasure in the database, but the RPC does not return it |
| `n = 0` (no lead in scope, or filters match none) | explicit empty result | R8 |
| timestamps after `now` | ignored | Invariant 7 |

## Assumptions log

| # | Assumption | Made by | Date | Would be wrong if | Status |
| :- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | **Captura = postulación a proyecto**: a lead is captured when it sets an in-scope project as its meta at least once, even if it later changes it | Bolgunn (grill) | 2026-10-04 | The client means "interesados → precalificados" by *postulan*. It cannot: signup requires a prequalification, so that ratio is 100 % by construction | open |
| A2 | **Engagement is unweighted, over exactly these six signals** (favorito, re-prequalification, postulación, plan aceptado, actualización de progreso, meta confirmada) | Bolgunn (grill) | 2026-10-04 | Some action proves to predict a sale far better than the others, or a signal the client cares about (e.g. contacting the executive) is missing | open |
| A3 | **Bands and priority come from the current evaluation only**; history is not re-banded | Bolgunn (grill) | 2026-10-04 | The question is "how did leads that *were* Compatible convert". Today's band is a survivor's band: a lead who improved shows its improved band against its whole history | open |
| A4 | **`agotado` projects are excluded from the default rollup** (allowed when that project is selected) | Bolgunn (grill) | 2026-10-04 | Sold-out projects are re-opened or re-stocked in practice, so their compatible leads are still sellable | open |
| A5 | **Deleted accounts leave the universe and their history no longer counts**, including in past periods | Bolgunn (grill) | 2026-10-04 | Historical series must be stable across deletions (they will shift when an account is erased). The erasure design keeps pseudonymised stage history precisely so counts *could* survive (commercial-stage plan, Erasure) | open |
| A6 | **In tenant view, stage times are computed on the derived tenant stage**, not per project track | Bolgunn (grill) | 2026-10-04 | Executives read "tiempo en negociación" as per-project. Tenant-level time hides a lead negotiating two projects in parallel | open |

## Open questions for the author

Points D1–D12 did not settle, or where two decisions pull apart. Each has the reading this draft
specifies so the rules are complete — **that reading is a placeholder, not a decision**.

| # | Question | Draft reading | Affects |
| :- | :------- | :------------ | :------ |
| **OQ1 (blocks PLAN)** | D9 says lead-level (`proyecto_id: null`) events are allowed only for `nuevo`, `contactado`, `en_plan_mejora`, and that the derived stage is `perdido` "only if every track is `perdido`". The lead-level track therefore **can never be `perdido`**, and the commercial-stage backfill gives every existing lead a lead-level `nuevo` event. Taken together, almost no lead can ever be derived `perdido`; a lead lost on its only project falls back to its lead-level stage (a reverted sale reads as `nuevo`). Either lead-level `perdido` must be allowed, or the lead-level track must stop counting once a project track exists, or `perdido` must be defined over project tracks only. This belongs to `feat/commercial-stage-project-tracks`, not to ALG-17 | literal D9, with "a track exists once it has an event" | `perdido_actual`; `en_etapa` and `en_curso` for lost leads. **Not** the funnel, capture, plan → venta or `ciclo_venta` |
| OQ2 | A reverted sale counts as reaching `venta_cerrada` (D4, ever-reached) and as a sale in plan → venta (D5, "their `venta_cerrada` event"), but not in `ciclo_venta` (D6). Intended asymmetry? | as stated (D4/D5/D6 literally) | `embudo`, `plan_a_venta` |
| OQ3 | A lead with a critical blocker never enters ALG-10's `matches`, so it can never be `cercano_por_capacidad`, even if its capacity sits in the near-miss band. Should capacity be read independently of blockers? Doing so would need ALG-10 to expose its G2 verdict for excluded rows — ALG-17 must not restate `UMBRAL_CERCANIA` | `insuficiente` unless `alcanza` | `bandas.capacidad`, capacity filter |
| OQ4 | When the default catalog is empty (every in-scope project `agotado`), what bucket does a non-G0 lead get? | `fuera_de_alcance` / `insuficiente` (vacuously excluded); G0 still `requiere_antecedentes` | `bandas` |
| OQ5 | Engagement per period divides by **all** leads after filters (D7 literally), including leads whose first evaluation is after that period, which depresses early periods. Alternative: leads with `first_evaluation_at` before the period's end | literal D7 | `serie.periodos[].engagement.tasa` |
| OQ6 | D7's "count per action type": leads, or actions? | both (`leads`, `eventos`) | `engagement.por_accion` |
| OQ7 | D10: "recent cohorts are flagged as in progress (no cutoff)". Without a cutoff the only number-free definition is "the period containing `now`" — which flags one period, not "recent cohorts". Anything wider needs a threshold D10 forbids | `en_curso` = period contains `now` | `serie.periodos[].en_curso` |
| OQ8 | With a project filter, are favorites on *other* projects still engagement? D7 says "favorite on an in-scope project"; D3 narrows *postula* to the selected project | narrowed to `S`, like D3 | `engagement` under a project filter |
| OQ9 | D8 "best band across in-scope projects": all in-scope projects, or only those the lead belongs to (`proyectos[]`)? ALG-10 matches against a catalog regardless of declared preference | all in-scope (non-`agotado`) projects, literally | `bandas` |
| OQ10 | "Days" are elapsed time, so a stay from Saturday 12:00 to Sunday 12:00 across the September DST change is 23 h = 0.958 days, not 1 | elapsed time | every `Stat` |
| OQ11 | A `commercial_priority_detail.action` outside the six `COMMERCIAL_ACTIONS` keys | `sin_prioridad` | priority filter |

Also for PLAN (not ALG-17): the RPC must decide how to recognise a project-goal evaluation written
before `project_goal.id` existed (`ProjectsCatalog.jsx` recovers those only when the UF value
identifies one project), and must order `stage_events` by `(occurred_at, id)`.

## Proposed note for ALG-10

Not applied — ALG-10 is not edited by this story. Suggested text for ALG-10's A1 row (`Would be
wrong if` column), to add when the author agrees:

> HU 15 (`ALG-17` R1, R8) is the first surface that shows real conversion split by ALG-10 band: the
> funnel filtered by `Compatible` / `Cercano` / `Marginal` and by capacity bucket. That is the first
> evidence for or against this assumption. Read it with three caveats before retuning anything:
> bands are the lead's **current** band, not the band it had when it was contacted (`ALG-17` A3);
> each lead is counted once, in its **best** band across the tenant's non-`agotado` projects
> (`ALG-17` A4); and no sample-size floor is applied. It is a signal to revisit A1, not a fit.

## Change log

| Date | Change |
| :--- | :----- |
| 2026-10-04 | Drafted for HU 15 from the grill decisions D1–D12. |
