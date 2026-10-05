# ALG-17 — Métricas del embudo comercial (commercial funnel metrics)

| Field | Value |
| :---- | :---- |
| **Version** | `hu15-commercial-funnel-v1` |
| **Runs on / implemented in** | **frontend** · `frontend/src/lib/commercial/funnelMetrics.js` (pure: no Supabase, no fetch, no `Date.now()` — `now` is an input) |
| **Cases** | `docs/algorithms/ALG-17-cases.json` — asserted by `frontend/src/lib/commercial/__tests__/funnelMetrics.test.js` (**vitest**) |
| **Open assumptions** | 9 open — see the log below |
| **Last changed** | 2026-10-04 · HU 15 · draft, revised after the second grill (G1–G18) |

> **Status: draft.** Written from the HU 15 grill (D1–D12) and revised with the second grill
> (G1–G18, 2026-10-04), which resolved every open question of the first draft. The author owns every
> rule here; this document is ready for review before phase 3 (PLAN.md).

> **Specified against two branches that are not built yet.** This document does not stub them; the
> implementation waits for both.
>
> 1. `fix/admin-inmobiliario-role` — frontend support for the `admin_inmobiliario` role (the tenant
>    admin of D2).
> 2. `feat/commercial-stage-project-tracks` — commercial stages keyed by lead **and** project (D9).
>    The grill turned several of ALG-17's needs into requirements on that branch; they are listed in
>    **Requirements on other work** below. ALG-17 relies on them and does not re-check them.

## Purpose

**What it computes.** From one *fact row per lead* in the caller's scope, the in-scope project list,
the dashboard filters and a `now` instant, every number on the HU 15 dashboard: capture rate
(E1), the stage funnel and its conversions (E1), plan → venta (E1), the sales-cycle and in-stage
times (E2), engagement (E1), the affinity / capacity breakdown (E3), and the same metrics bucketed
by week, month or year (E4).

**When it runs.** In the browser, after the dashboard calls the `security definer` RPC
`commercial_funnel_facts()` (D1, specified in PLAN.md) and whenever a filter, the granularity or
`now` changes. The RPC is the boundary: it decides scope (D2), drops deleted accounts, and strips
`reason`, `actor_id` and `user_id` from stage events (D9). ALG-17 trusts what it receives.

**What it depends on.**

- `ALG-10` (`matchLeadToProjects`) for **every** affinity and capacity band. ALG-17 reads ALG-10's
  outputs; it never restates a threshold, never re-scores a pair, never recomputes capacity.
- The commercial-stage model (`docs/stories/commercial-stage/PLAN.md`, migration
  `20260930120000_commercial_stage.sql`) for the stage list and ranks, as extended by the
  project-tracks branch (D9, G1–G7).
- The stored scoring result for priority (`commercial_priority_detail`), mapped to the six
  `COMMERCIAL_ACTIONS` keys of `backend/app/scoring_engine/constants.py` (G18). Nothing is
  recomputed (D12).

**Why it is this way** — and what was rejected:

1. **Pure function over fact rows (D1).** Every metric is a fold over per-lead facts, so one RPC
   returns the minimum the page needs and the arithmetic lives where vitest can pin it. Rejected:
   one RPC per metric (each re-deriving scope and stage semantics in SQL, out of reach of the ALG
   cases), and pulling raw tables into the browser (exposes stage `reason` text, which is staff free
   text that may identify the lead).
2. **Capture = postulación, not "interesados → precalificados" (D3).** Signup requires a
   prequalification, so every lead in the universe is already prequalified; that ratio would be
   100 % by construction. The meaningful act of interest is setting a project as the goal.
3. **Ever-reached funnel (D4), except the top step (G9).** Counting leads by their *current* stage
   makes the funnel shrink every time someone is marked `perdido`, and makes it non-monotone.
   Counting what each lead ever reached keeps every step ≤ the one before. The exception is
   `venta_cerrada`, which counts only while the sale stands, so that "venta" means the same thing in
   the funnel, plan → venta and the sales cycle. Rejected: counting undone sales in the funnel but
   not in the cycle (two populations under one word).
4. **Plan impact from `tracking_plans.baseline_at`, not from the `en_plan_mejora` stage (D5).** The
   stage is a manual click an executive may never make; the plan baseline is a recorded fact.
5. **Time *in* a stage, not time "from stage N to N+1" (D6).** Stages may be skipped and moves may
   go backwards; "N → N+1" is undefined for a lead who skipped N+1 and double-counts a lead who went
   back. Time in a stage is always defined. The HU 15 wiki note ("diferencias de `occurred_at` entre
   eventos consecutivos") is superseded by this.
6. **Unweighted engagement (D7).** Any weight per action would be an invented number with nothing to
   calibrate it against. An unweighted "did anything" plus a per-action breakdown is honest.
7. **One lead, one band (D8), across every in-scope project (G16).** A per-project breakdown would
   count a lead once per project and the buckets would not sum to the universe. Matching against all
   in-scope projects, not only the ones the lead named, follows ALG-10's first principle — preference
   is never a gate.
8. **Stages keyed by lead *and* project (D9).** A lead-only key cannot say *which* project a
   negotiation or sale belongs to, so a project view of the funnel would credit project A with a
   sale on project B. Rejected: per-project funnels keyed only by lead.
9. **`perdido` at two levels (G5).** On a project record it means "this lead's opportunity on this
   project is closed" — by an executive, or by the system when the project sells out (G6). As a
   lead's overall stage it means "the inmobiliaria lost this lead". The cause is kept (G8) so a
   sell-out is never read as bad selling.
10. **Cohorts by first evaluation (D10).** A funnel bucketed by *event* date mixes leads at different
    ages and can show conversion above 100 % in a period. A cohort is a fixed set of leads.
11. **No minimum-n cutoff, no "last N days" default, no age cutoff for maturing cohorts (D6, D10,
    G14).** Each would need a number nobody has. Instead every figure carries its `n`, `n = 0` is an
    explicit empty result, and a cohort says how many of its leads are still open.

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
| `proyectos` | string[] | `lead_belongs_to_proyecto` (D2) | In-scope projects the lead belongs to. Non-empty by D2. Carried for the UI; no rule below narrows by it (G16) |
| `postulaciones` | `[{ proyecto_id, first_at }]` | project-goal evaluations | **First** time the lead set each project as its meta (D3), even if later changed. One entry per project |
| `stage_events` | `[{ proyecto_id, stage_after, occurred_at, por_sistema }]` | `commercial_stage_events` | `proyecto_id: null` = lead-level move (D9). `por_sistema` = `actor_role = 'sistema'` (G8). Sorted by `(occurred_at, id)` by the RPC. Never `reason`, `actor_id`, `user_id` |
| `plan_baseline_at` | instant or `null` | `tracking_plans.baseline_at` | One plan per lead (`tracking_plans.user_id` is unique) |
| `favoritos` | `[{ proyecto_id, created_at }]` | `proyecto_favoritos` | |
| `progress_update_ats` | instant[] | `tracking_events.recorded_at`, `event_kind` ∈ {`data_update`, `evaluation`} | |
| `confirmed_goal_ats` | instant[] | `improvement_goal_events.recorded_at`, `confirmed = true` | |

**`proyectos`** — the caller's in-scope projects (D2): every project of the tenant for a tenant
admin, the assigned (`vinculado`) projects for an ejecutivo. HU 7 contract; ALG-17 reads `id` and
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
  prioridad_no_reconocida,  // leads in n whose stored priority matched no known action (G18)
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
| `embudo` | `{ n, etapas: [{ etapa, alcanzaron, conversion }], abiertos, perdido_actual: { total, por_agotamiento, por_gestion } }` — `etapas` in ladder order, all six always present |
| `plan_a_venta` | `{ con_plan, con_plan_y_venta, tasa }` |
| `tiempos` | `{ ciclo_venta: Stat, dias_hasta_postular: Stat, en_etapa: { [etapa]: StageStat } }` — `en_etapa` has all seven stages |
| `engagement` | `{ n, activos, tasa, por_accion: { [accion]: { leads, eventos } } }` — all six actions always present |
| `bandas` | `{ n, sin_catalogo: false, afinidad: { Compatible, Cercano, Marginal, fuera_de_alcance, requiere_antecedentes }, capacidad: { alcanza, cercano_por_capacidad, insuficiente, requiere_antecedentes } }` — every key always present; **or** `{ n, sin_catalogo: true, afinidad: null, capacidad: null }` (G11) |
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

**UI obligations** (story-local, not rules): show `por_accion[].leads`, with `eventos` at most as
detail (G13); round days to one decimal (G17); disable the affinity and capacity filters while
`bandas.sin_catalogo` is true (G11); show a cohort's `abiertos` next to its conversion (G14); label
`perdido` as "perdido en este proyecto" in a project view and "lead perdido" in the tenant view (G5).

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
records and project-bound engagement to that project (G15).

### R1 — Affinity and capacity buckets (D8, G10, G11, G16)

Computed once per lead, from `evaluacion_actual` only (history is not re-banded, D11):

```
catalogo = filtros.proyecto_id ? [ the selected project ]          // agotado allowed
                               : proyectos.filter(p => p.estado !== "agotado")
{ matches, excluidos } = matchLeadToProjects(evaluacion_actual, catalogo)      // ALG-10
```

The catalog is every in-scope project, not only the ones in the lead's `proyectos[]` (G16).

**Empty catalog (G11).** When `catalogo` is empty — no project filter and every in-scope project
`agotado`, or no projects at all — no lead is banded: `bandas` is
`{ n, sin_catalogo: true, afinidad: null, capacidad: null }`, and the affinity and capacity filters
are **ignored** (R8). Every other metric still runs. Reporting "100 % fuera de alcance" would say
nobody can buy when the truth is that there is nothing to sell.

Otherwise, affinity — first row that applies:

| # | Condition on ALG-10's output | Bucket |
| :- | :--------------------------- | :----- |
| A0 | the lead hits ALG-10 **G0** (`motivo_exclusion = capacidad_requiere_antecedentes`) | `requiere_antecedentes` |
| A1 | some row in `matches` has `clasificacion = Compatible` | `Compatible` |
| A2 | some row in `matches` has `clasificacion = Cercano` | `Cercano` |
| A3 | some row in `matches` has `clasificacion = Marginal` | `Marginal` |
| A4 | `matches` is empty (excluded from every project) | `fuera_de_alcance` |

Capacity — first row that applies:

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

**A lead with a critical blocker is never `cercano_por_capacidad` (G10).** ALG-10 excludes it before
the capacity test, so it never appears in `matches`; it is `alcanza` if its capacity still reaches
some project's `precio_min_uf`, else `insuficiente`. Intended: the near-miss band exists to find
callable leads, and these are `do_not_route` (`commercial_priority.py`). Its affinity is
`fuera_de_alcance`, so the dashboard does not hide it.

**Best affinity and best capacity may come from different projects.** Intended (D8): the two
dimensions answer different questions.

### R1b — Priority (D11, G18)

The engine stores the **Spanish label** in `commercial_priority_detail.action`, not the key
(`commercial_priority.py:11-14` writes `COMMERCIAL_ACTIONS[action_key]` into both `level` and
`action`). So:

| # | Stored result | Priority |
| :- | :------------ | :------- |
| P1 | `commercial_priority_detail.action_key` is one of the six keys | that key (future field, see Requirements) |
| P2 | `commercial_priority_detail.action` equals one of the six `COMMERCIAL_ACTIONS` labels | that label's key |
| P3 | no `commercial_priority_detail`, or no `action` | `sin_prioridad` |
| P4 | an `action` that matches no label | `sin_prioridad`, **and** the lead counts in `prioridad_no_reconocida` |

The label → key map mirrors `COMMERCIAL_ACTIONS` on the frontend, the way `stageRules.js` mirrors the
SQL transition check. P4 makes label drift visible instead of silent: rewording a label in
`constants.py` leaves old evaluations with the old text.

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

### R3 — Stage records, overall stage and the funnel (D4, D9, G1, G4, G5, G8, G9)

**Records.** Replaying a lead's considered events (R0) in order, each `proyecto_id` value — `null`
for the **lead-level record**, or a project id for a **project record** — has a current stage: the
`stage_after` of its latest event. A record exists once it has at least one considered event.

**Overall stage** at any moment — first row that applies:

| # | Condition | Overall stage |
| :- | :-------- | :------------ |
| O1 | no record exists | `nuevo` (a lead with no stage row counts as `nuevo`, D4) |
| O2 | only the lead-level record exists | its current stage — lead-level `perdido` is possible here |
| O3 | every project record is `perdido`, the lead-level record exists, its latest event is **strictly later** than the latest of the events that made the project records `perdido`, and its current stage is not `perdido` | the lead-level current stage — the lead was **revived** (G4) |
| O4 | every project record is `perdido` | `perdido` |
| O5 | otherwise | the highest-ranked current stage among records that are not `perdido`, lead-level included |

Ranks are the commercial-stage plan's: `nuevo` 1 … `venta_cerrada` 6; `perdido` has no rank. Once
any project record exists, a lead-level `perdido` never makes the lead `perdido` by itself: in O3 it
fails the "not `perdido`" test, and in O5 it is skipped as a non-ranked stage.

**Cause of a loss (G8).** When the overall stage is `perdido`, it is **`por_agotamiento`** if every
event that currently holds a record at `perdido` (the project records' in O4, the lead-level
record's in O2) has `por_sistema = true`; otherwise **`por_gestion`**. A sell-out closure is the
only system-made `perdido` (G6), so `por_agotamiento` means "lost only because the projects sold
out".

**Overall timeline.** Starts at `t0 = min(first_evaluation_at, first considered event)` in `nuevo`.
After each considered event the overall stage is recomputed; a new **spell** begins only when it
changes. Consecutive equal overall stages are one spell. System events (sell-out closures and their
reopenings, G6–G7) are events like any other: they open and close spells.

**Standing sale (G9).** A sale **stands** while a project record's current stage is
`venta_cerrada`. Its date is the `occurred_at` of the event that put that record there. A lead's
**standing sale date** is the earliest among its standing sales. The overall stage is `venta_cerrada`
exactly when the lead has a standing sale (O5, rank 6).

**Reached.**

```
max_rank        = max(1, rank of every ranked stage_after among considered events)
reached(etapa)  = rank(etapa) <= max_rank             for nuevo … reserva
reached(venta_cerrada) = the lead has a standing sale
```

A lead that skipped stages counts as having reached every stage below the highest it reached — that
is what keeps the funnel monotone. A lead later `perdido` keeps every stage it reached. An **undone
sale** (`venta_cerrada → perdido`, admin) does not count at the top step, but still counts for every
stage below it: a promesa was signed.

| Field | Value |
| :---- | :---- |
| `embudo.n` | `n` |
| `etapas[k].alcanzaron` | leads with `reached(etapa_k)`; `alcanzaron(nuevo) = n` |
| `etapas[k].conversion` | `alcanzaron(k) ÷ alcanzaron(k−1)`; `null` for `nuevo` and whenever the denominator is 0 |
| `embudo.abiertos` | leads whose current overall stage is neither `venta_cerrada` nor `perdido` (G14) |
| `embudo.perdido_actual` | `{ total, por_agotamiento, por_gestion }`: leads whose current overall stage is `perdido`, split by cause |

### R4 — Plan → venta (D5, G9)

| Field | Value |
| :---- | :---- |
| `con_plan` | leads with `plan_baseline_at` not null and `<= now` |
| `con_plan_y_venta` | of those, leads with a **standing sale date strictly after** `plan_baseline_at` |
| `tasa` | `con_plan_y_venta ÷ con_plan`, `null` when `con_plan = 0` |

Independent of whether `en_plan_mejora` was ever recorded. A plan accepted **after** the sale counts
in `con_plan` and not in `con_plan_y_venta`. An undone sale does not count (G9).

### R5 — Times (D6, G9, G17)

All durations are **elapsed time** in days: `(t_end − t_start) in ms ÷ 86 400 000`, unrounded. A
daylight-saving change in America/Santiago therefore never stretches or shrinks a duration (G17).
Every metric reports `Stat = { n, promedio, mediana }`; the median of an even `n` is the mean of the
two middle values. **No minimum-n cutoff.**

| Metric | Included leads | Start | End |
| :----- | :------------- | :---- | :-- |
| `ciclo_venta` | leads with a standing sale | `first_evaluation_at` | the standing sale date |
| `dias_hasta_postular` | leads that postula (R2) | `first_evaluation_at` | first application on `S` |
| `en_etapa[s]` | leads whose overall timeline has at least one **closed** spell in `s` **and** whose current overall stage is not `s` | each spell's start | each spell's end; spells in `s` are **summed** per lead |

- **A lead still in stage `s`** is excluded from `en_etapa[s]` entirely — even if it also has an
  earlier, closed visit — and is counted in `en_etapa[s].en_curso`.
- **An undone sale** is not in `ciclo_venta`: it no longer stands.
- **`en_etapa.perdido`** measures how long leads stayed lost before being revived or reopened; leads
  still lost are its `en_curso`.
- **"Time from stage N to N+1" is not computed** (Purpose, point 5).
- In tenant view the spells are those of the **overall** stage (assumption A6), not of any one
  project record.

### R6 — Engagement (D7, G12, G13, G15)

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
Favorites and applications are project-bound and follow `S`, so with a project filter they count
only on that project (G15); the other four are not tied to a project.

| Field | Value |
| :---- | :---- |
| `engagement.n` | the denominator: `n` for the full history; in a `Periodo`, the leads after filters whose `first_evaluation_at` is **before the period's `hasta`** (G12) |
| `engagement.activos` | leads with ≥ 1 action in the interval |
| `engagement.tasa` | `activos ÷ engagement.n`, `null` when `engagement.n = 0` |
| `por_accion[a].leads` | leads with ≥ 1 action of type `a` in the interval — **what the dashboard shows** (G13) |
| `por_accion[a].eventos` | number of actions of type `a` in the interval — kept for detail |

A lead cannot be active before it exists, so a period's denominator counts only leads that already
had their first evaluation. Otherwise early periods would be depressed by later signups and the
series would mostly measure growth.

### R7 — Periods and buckets (D10, G14)

**Calendar.** Every date is read in **America/Santiago**, using the zone's offset *on that instant*
(it is UTC−4 in winter and UTC−3 in summer — a fixed offset is a defect). `semana` is the ISO week,
Monday 00:00 to the next Monday 00:00, labelled with its ISO **week-year** (so 2027-01-01 is
`2026-W53`); `mes` is the calendar month; `año` the calendar year. A period is the half-open
interval `[desde, hasta)` between local midnights, and `desde` / `hasta` are emitted as instants.

**Range.** Periods are contiguous, from the one containing the earliest `first_evaluation_at`
**among the leads after filters** to the one containing `now`, empty periods included. No leads
after filters → `periodos: []`. There is no "last N days" default: the default view is the full
history.

**Two maturity signals, neither with a threshold (G14):**

- `en_curso` is `true` for exactly the period containing `now`: the period is still running.
- `embudo.abiertos` of a cohort period is how many of its leads are still neither sold nor lost: how
  far the cohort's conversion still is from final.

**Which period a metric belongs to:**

| Metric | Belongs to the period containing | Notes |
| :----- | :------------------------------- | :---- |
| `captura`, `embudo`, `plan_a_venta` | the lead's `first_evaluation_at` (**cohort**) | The cohort's stages, applications and sales are evaluated at `now`, not at the period's end. `n` of the period = its cohort size |
| `ciclo_venta`, `dias_hasta_postular` | the interval's **end** | |
| `en_etapa[s]` | the end of the lead's **last** closed spell in `s` | The lead's whole summed time lands in that one period |
| `engagement` | each action's timestamp | A lead is activo in every period where it has an action. Denominator per R6 (G12) |

### R8 — Filters (D11, G11)

```
bandFiltersApply = !bandas.sin_catalogo
leads = facts.filter(lead =>
     (!bandFiltersApply || filtros.afinidad.length  === 0 || filtros.afinidad.includes(afinidad(lead)))   // R1
  && (!bandFiltersApply || filtros.capacidad.length === 0 || filtros.capacidad.includes(capacidad(lead))) // R1
  && (filtros.prioridad.length === 0 || filtros.prioridad.includes(prioridad(lead))))                       // R1b
n = leads.length
```

- **Multi-value within a filter (OR), AND across filters.**
- The filtered set is computed **once**; R1–R7, totals and every period, run on it.
- The project filter does not appear above: it acts through `S` (R0) and through the band catalog
  (R1), so with a project selected the affinity and capacity filters test the bands **against that
  project**.
- Bands and priority come from the current evaluation only.
- With an empty band catalog the band filters are ignored (G11); the UI disables them.
- Every output carries its `n`; `n = 0` is an explicit empty result (rates `null`, `Stat` with
  `n = 0` and `null` averages, every count 0, `periodos: []`).

## Invariants and edge cases

**Invariants** — asserted by tests on every case, not by fixture values:

1. **Buckets partition the universe:** unless `bandas.sin_catalogo`,
   `Σ bandas.afinidad = Σ bandas.capacidad = bandas.n = n`. With `sin_catalogo`, both are `null`.
2. Every rate is in `[0, 1]` or `null`, and it is `null` **exactly** when its denominator is 0.
3. **Reached is monotone down the ladder:** `alcanzaron(k) <= alcanzaron(k−1)` for every `k`, and
   `alcanzaron(nuevo) = n`.
4. **Current stages partition the universe:**
   `embudo.abiertos + alcanzaron(venta_cerrada) + perdido_actual.total = n`, and
   `perdido_actual.total = por_agotamiento + por_gestion`. Each also holds per cohort period.
5. `captura.postulan <= n`; `plan_a_venta.con_plan_y_venta <= con_plan`;
   `engagement.activos <= engagement.n`;
   `por_accion[a].leads <= activos <= Σ por_accion[a].leads`; `por_accion[a].leads <= eventos`.
6. Every `Stat.n` and `en_curso` is a non-negative integer; `promedio` and `mediana` are `null` iff
   `n = 0`; every duration is `>= 0`.
7. **Deterministic given `now`:** the same `facts`, `proyectos`, `filtros`, `now` and
   `granularidad` always produce the same output, including order. No `Date.now()`, no randomness, no
   AI in the path (D12, S1).
8. Nothing dated after `now` affects any output.
9. **Nothing is recomputed:** score, classification, priority and capacity are read from
   `evaluacion_actual.result`; bands come from ALG-10 alone. No band threshold is declared in this
   module.
10. Cohort periods partition the cohort: `Σ periodos[i].embudo.n = n` and
    `Σ periodos[i].captura.postulan = captura.postulan`. Engagement denominators are
    non-decreasing across periods and the last one equals `n`.
11. Filters only remove leads: adding a value to an already non-empty filter never decreases `n`;
    turning on a filter that was empty never increases it.
12. `computeFunnelMetrics` does not mutate its arguments.

**Edge cases:**

| Condition | Behaviour | Why |
| :-------- | :-------- | :-- |
| lead with no stage events | overall stage `nuevo` throughout; reaches only `nuevo`; `abiertos` | D4, O1. Leads that became eligible after the backfill have no row (commercial-stage plan, Q5) |
| skipped stages (`nuevo → reserva`) | counts as having reached `contactado`, `en_plan_mejora`, `en_negociacion` | Keeps invariant 3. No spell exists in the skipped stages, so they get no time |
| backward move and repeated visit | each visit is its own spell; time in the stage is the **sum** | D6 |
| lead still in a stage | excluded from that stage's `Stat`; counted in `en_curso` | D6 |
| lost on its only project, lead-level record older | overall `perdido`, `por_gestion` | O4, G1 |
| lost on every project, then a lead-level move (same stage allowed, with reason) | revived at the lead-level stage; the gap is a `perdido` spell | O3, G4 |
| lost on every project, then lead-level `perdido` | stays `perdido` | O3 fails, O4 applies — a lead-level `perdido` cannot revive |
| lead-level event at the **same** instant as the last project loss | not revived (O3 needs strictly later) | Deterministic tie rule |
| project sells out | its records at `nuevo` … `en_negociacion` gain a system `perdido`; a lead lost only that way is `por_agotamiento` | G6, G8 |
| lost by sell-out on P and by an executive on Q | `por_gestion` | G8: not *every* holding loss is a system one |
| project restocked | records whose latest event is the system closure get a system event back to the previous stage; that stage's time is summed across both visits | G7, D6 |
| undone sale (`venta_cerrada → perdido`, admin) | not a sale anywhere: not in the top funnel step, plan → venta or `ciclo_venta`; still reached `reserva` and below | G9 |
| late stage on a project outside `S` | ignored in every metric | R0, D9 |
| lead whose current evaluation has no capacity (old result shape, `requires_info`) | `requiere_antecedentes` in both dimensions | ALG-10 G0 |
| lead compatible only with an `agotado` project | default view ignores that project; with that project selected, it counts | D8 |
| every in-scope project `agotado` | `bandas.sin_catalogo = true`, no buckets, band filters ignored | G11 |
| `bloqueador_critico` lead below `precio_min` everywhere | `fuera_de_alcance` / `insuficiente`, never `cercano_por_capacidad` | G10 |
| stored priority label matches nothing | `sin_prioridad`, counted in `prioridad_no_reconocida` | G18 |
| application before the first evaluation | impossible: an application *is* an evaluation; `dias_hasta_postular` can be 0, never negative | |
| plan accepted after the sale | in `con_plan`, not in `con_plan_y_venta` | D5 |
| DST changes in America/Santiago (first Saturday→Sunday of April and of September, at local midnight) | durations unaffected (elapsed time); buckets use the offset of each instant, so `2026-07-01T03:30Z` is **30 June** 23:30 local | R5, R7 |
| ISO week across a year boundary | `2027-01-01` is `2026-W53` for `semana` but `2027-01` / `2027` for `mes` / `año` | R7 |
| Sunday 23:30 in Santiago | still that ISO week, although it is already Monday in UTC | R7 |
| deleted account | absent from `facts`; its history no longer counts anywhere, including past periods | Assumption A5. Stage history survives erasure in the database, but the RPC does not return it |
| `n = 0` (no lead in scope, or filters match none) | explicit empty result | R8 |
| timestamps after `now` | ignored | Invariant 8 |

## Decisions log

Settled in the second grill (Bolgunn, 2026-10-04). They replace the first draft's open questions
OQ1–OQ11. G1–G7 are also requirements on other work (below).

| # | Decision | Was |
| :- | :------- | :-- |
| G1 | Overall stage: no records → `nuevo`; only a lead-level record → its stage (lead-level `perdido` allowed); any project record → `perdido` iff every project record is `perdido`, lead-level left out of that test; otherwise the most advanced non-`perdido` record. A lead-level `perdido` is ignored once a project record exists | OQ1 |
| G2 | Project records follow the existing transition table independently; a project record with no events reads as `nuevo` | OQ1 |
| G3 | Writers on a project record: an ejecutivo only on projects assigned to them with `proyecto_ejecutivos.estado = vinculado` (lead-level: any lead of their inmobiliaria); tenant admins on any project of their inmobiliaria; undoing a sale stays admin-only | OQ1 |
| G4 | Revival: when every project record is `perdido`, a lead-level event strictly later than the latest project loss revives the lead at the lead-level stage. A same-stage lead-level event is allowed, with a required reason, only while every project record is `perdido` | OQ1 |
| G5 | `perdido` means both "this lead's opportunity on this project is closed" (project record) and "the lead is lost" (overall stage), and a project selling out closes its opportunities (G6) | OQ1 |
| G6 | The only automatic transition: when a project becomes `agotado`, the system moves its records at `nuevo`, `contactado`, `en_plan_mejora`, `en_negociacion` to `perdido`. `reserva`, `venta_cerrada`, `perdido` untouched; no record is created for leads without one | OQ1 |
| G7 | When a project leaves `agotado`, the system reopens, to their previous stage, only the records whose latest event is its own sell-out closure | OQ1 |
| G8 | Fact events carry `por_sistema`; `perdido_actual` splits into `por_agotamiento` / `por_gestion` | OQ1 |
| G9 | A sale counts only while it stands — funnel top step, plan → venta, `ciclo_venta`. An undone sale still counts for the stages below | OQ2 |
| G10 | A critical-blocker lead is never `cercano_por_capacidad` | OQ3 |
| G11 | Empty band catalog → `sin_catalogo`, no buckets, band filters ignored | OQ4 |
| G12 | Per-period engagement denominator = leads whose first evaluation precedes the period's end | OQ5 |
| G13 | `por_accion` shows `leads`; `eventos` kept as detail | OQ6 |
| G14 | `en_curso` = period containing `now`; each cohort also reports `abiertos` | OQ7 |
| G15 | With a project filter, favorites and applications count only on that project | OQ8 |
| G16 | Bands across every in-scope project, not only the lead's `proyectos[]` | OQ9 |
| G17 | Durations are elapsed time; the UI rounds to one decimal | OQ10 |
| G18 | Priority via label → key (stored `action` is the label); unmatched → `sin_prioridad` plus `prioridad_no_reconocida`; engine follow-up adds `action_key` | OQ11 |

## Requirements on other work

ALG-17 depends on these and does not re-check them. They come from G1–G8 and G18.

**`feat/commercial-stage-project-tracks`** (amends the commercial-stage plan's Q3 "no automatic
transitions" and D9's "no lead-level `perdido`"):

1. Events carry a nullable `proyecto_id`; `en_negociacion`, `reserva` and `venta_cerrada` always
   name a project. `perdido` may be lead-level only while the lead has no project record (G1).
2. Each project record follows the existing transition table on its own; a missing record reads as
   `nuevo` (G2).
3. Write scope (G3): ejecutivo → project records of projects where they are assigned with
   `proyecto_ejecutivos.estado = 'vinculado'` (note `is_ejecutivo_asignado` ignores `estado` today),
   and lead-level moves for any lead of their inmobiliaria; `admin_inmobiliario` / `admin` with an
   inmobiliaria → any project of it; `venta_cerrada → perdido` admin only.
4. Same-stage lead-level event allowed, reason required, only while every project record of the lead
   is `perdido` (G4) — an exception to `same_stage` and to the events table's
   `stage_before is distinct from stage_after` check.
5. Sell-out job (G6): on `proyectos.estado` → `agotado`, insert `actor_role = 'sistema'`,
   `actor_id = null`, `source = 'job'` `perdido` events for that project's records at `nuevo` …
   `en_negociacion`.
6. Restock job (G7): on `proyectos.estado` leaving `agotado`, for each record whose latest event is
   that system closure, insert a system event back to its `stage_before`.
7. A `reason` for system events that does not identify the lead (e.g. a fixed code), since `reason`
   is never exported but is kept in the history.

**`commercial_funnel_facts()` RPC** (PLAN.md): emit `por_sistema` per stage event (G8); order
`stage_events` by `(occurred_at, id)`; recognise project-goal evaluations written before
`project_goal.id` existed (`ProjectsCatalog.jsx` recovers those only when the UF value identifies
one project), or document that they are not applications.

**Engine follow-up, outside HU 15** (G18): add `action_key` to `commercial_priority_detail`, next to
the label. Additive, so the `POST /score` contract is not broken.

## Assumptions log

| # | Assumption | Made by | Date | Would be wrong if | Status |
| :- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | **Captura = postulación a proyecto**: a lead is captured when it sets an in-scope project as its meta at least once, even if it later changes it | Bolgunn (grill) | 2026-10-04 | The client means "interesados → precalificados" by *postulan*. It cannot: signup requires a prequalification, so that ratio is 100 % by construction | open |
| A2 | **Engagement is unweighted, over exactly these six signals** (favorito, re-prequalification, postulación, plan aceptado, actualización de progreso, meta confirmada) | Bolgunn (grill) | 2026-10-04 | Some action proves to predict a sale far better than the others, or a signal the client cares about (e.g. contacting the executive) is missing | open |
| A3 | **Bands and priority come from the current evaluation only**; history is not re-banded | Bolgunn (grill) | 2026-10-04 | The question is "how did leads that *were* Compatible convert". Today's band is a survivor's band: a lead who improved shows its improved band against its whole history | open |
| A4 | **`agotado` projects are excluded from the default rollup** (allowed when that project is selected) | Bolgunn (grill) | 2026-10-04 | Sold-out projects are re-opened or re-stocked in practice, so their compatible leads are still sellable | open |
| A5 | **Deleted accounts leave the universe and their history no longer counts**, including in past periods | Bolgunn (grill) | 2026-10-04 | Historical series must be stable across deletions (they will shift when an account is erased). The erasure design keeps pseudonymised stage history precisely so counts *could* survive (commercial-stage plan, Erasure) | open |
| A6 | **In tenant view, stage times are computed on the overall stage**, not per project record | Bolgunn (grill) | 2026-10-04 | Executives read "tiempo en negociación" as per-project. Tenant-level time hides a lead negotiating two projects in parallel | open |
| A7 | **A sell-out closes every open opportunity on the project up to `en_negociacion`, and a restock reopens only what the system closed** (G6, G7) | Bolgunn (grill 2) | 2026-10-04 | Executives keep selling a sold-out project from a waiting list or from cancelled reservas, so those leads were never really lost; or `en_negociacion` usually means a unit is already held | open |
| A8 | **A sale counts only while it stands** (G9) | Bolgunn (grill 2) | 2026-10-04 | Management wants gross sales (including those that fell through) as the conversion figure, with fall-throughs reported separately | open |
| A9 | **A critical-blocker lead is never "cercano por capacidad"** (G10) | Bolgunn (grill 2) | 2026-10-04 | The capacity filter is used as a pure affordability view, independent of routability | open |

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
| 2026-10-04 | Revised with the second grill (G1–G18): overall-stage rule with revival and sell-out causes, standing-sale rule, empty catalog, per-period engagement denominator, cohort `abiertos`, priority label mapping, requirements on the project-tracks branch. Open questions closed. |
