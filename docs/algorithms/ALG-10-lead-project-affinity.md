# ALG-10 — Afinidad lead–proyecto (lead–project matching)

| Field | Value |
| :---- | :---- |
| **Version** | `e4-matching-v1` — travels with the capacity it consumes (`capacidad_supuestos.version`, `ALG-9`) |
| **Runs on / implemented in** | **frontend** · `frontend/src/lib/matching/leadProjectMatching.js` (pure, no Supabase, no fetch) |
| **Cases** | `docs/algorithms/ALG-10-cases.json` — asserted by `frontend/src/lib/matching/__tests__/leadProjectMatching.test.js` (**vitest**, not pytest) |
| **Open assumptions** | 9 open, 1 confirmed — see the log below |
| **Last changed** | 2026-08-31 · HU 10 · created |

> **Why this one runs on the frontend.** The project catalog lives in Supabase and is reached through
> `frontend/src/services/projectService.js` (HU 7); guardrail #5 forbids new FastAPI endpoints, so
> the backend cannot see `proyectos`. The affinity join therefore has to happen client-side. It sits
> in `lib/` — the handbook's home for pure logic and "the only place an algorithm may be
> implemented" — **not** in `services/` as spike §8.2 and §8.3 say. Those sections are amended in the
> same PR that adds this document. Precedent: `lib/simulation/compatibility.js`.

> **Provisional citations.** `ALG-2` (blockers) and `ALG-5` (project fit) do not exist yet. Blocker
> codes and severities are cited from `backend/app/scoring_engine/blockers.py` by line; the
> `project_fit.status` verdict from `project_fit.py:99-104`. Replace with the ALG numbers when those
> documents are written; do not restate their rules here.

## Purpose

**What it computes.** For one lead and a list of projects, a ranked set of lead–project pairs, each
carrying an affinity score 0–100, a compatibility label, the single most actionable blocker for
*that pair*, the evidence an executive needs to act, and whether the pair is a re-orientation
opportunity.

**When it runs.** In the browser, whenever an ejecutivo comercial selects a project in
`DashboardLeads.jsx`. **That is its only caller.** HU 6's `buildAccessibleAlternatives` deliberately
does **not** call it: the two surfaces share `ALG-9`'s capacity but keep separate orderings, because
they answer different questions — "what can this lead buy?" versus "who do I call about this
project?". Forcing one ranking on both would convert HU 6's preference handling from a tie-break into
25 of 100 points on a shipped screen.

**What it depends on.** `ALG-9` for every capacity number — **capacity is never recomputed here**.
`ALG-8` (`housing_benefits.py`) for the FOGAES rule and its three regulatory caps, which arrive
inside `capacidad_supuestos`. The HU 7 catalog contract for project fields. `blockers.py` for codes
and severities.

**Why it is this way.** Four choices carry the design:

1. **Nothing about preference is a gate.** Comuna, property type and financial classification are
   *scored*, never excluded. The point of HU 10 is to surface the lead an objective-shaped model
   would hide, so a mismatch has to be a cost rather than a wall.
2. **Affordability is a band, not a cliff.** A lead just under a project's cheapest unit is one of
   the most callable people in the database, because `ALG-9`'s capacity is deliberately pessimistic
   (20% pie, 70-year age cap, declared savings only). Excluding them outright discards the segment
   FOGAES exists for. See R1.
3. **Blockers are pair-scoped, not lead-global.** A lead who clears a UF 2.500 project but is
   pie-blocked on a UF 4.000 one has *different* main blockers on the two cards.
4. **Affinity means fit, not maximum capacity.** The curve peaks where the lead buys the project
   *holgado* and falls on both sides — a lead with 4× the price is probably shopping elsewhere. The
   monotone "who can most comfortably buy this" reading is not thrown away: it is the panel's second
   sort, and it is literally `evidencia.capacidad_uf`. See R2 and R6.

## Inputs → outputs

### Inputs

`matchLeadToProjects(evaluacion, proyectos) -> { matches, excluidos }`

**It never fetches.** Each caller decides what subset to feed it — `getAvailableProjects({
inmobiliariaId })` from the dashboard, a filtered list from the HU 6 recommender.

`evaluacion` is the lead row the dashboard already holds, `{ input, onboarding, result }`:

| Read | Path | Type · unit | Notes |
| :--- | :--- | :---------- | :---- |
| capacity | `result.financial_indicators.capacidad_compra_estimada_uf` | float · UF or `null` | From `ALG-9`. **The only value ranking ever uses** |
| binding side | `result.financial_indicators.restriccion_vinculante` | `"renta"` · `"pie"` · `null` | |
| status | `result.financial_indicators.capacidad_status` | `"ok"` · `"sin_capacidad"` · `"requires_info"` | |
| assisted ceiling | `result.financial_indicators.capacidad_asistida_uf` | float · UF or `null` | **Inclusion only, never ranking** (R1) |
| income | `result.financial_indicators.ingreso_total` | float · CLP/month | Only for the `renta` resource gap |
| assumptions | `result.financial_indicators.capacidad_supuestos` | dict | Supplies `pie_ratio`, `ratio_dividendo_max`, `ratio_dividendo_saludable`, `tasa_anual_uf`, `plazo_anios`, `plazo_origen`, `uf_value_clp`, `fogaes_tope_uf`, `fogaes_tope_con_subsidio_uf`, `fogaes_pie_ratio` |
| classification | `result.classification` | str | `"Alto"` · `"Medio"` · `"Bajo"` · `"Requiere antecedentes"` |
| blockers | `result.blockers` | `[{ code, severity, title }]` | `blockers.py` verbatim |
| declared fit | `result.project_fit.status` | `"compatible"` · `"near"` · `"out_of_reach"` · `"requires_info"` | Against the lead's *own* objective |
| savings | `input.ahorro_disponible` | float · CLP | Evidence card, and the per-project FOGAES pie test |
| vivienda nueva | `input.vivienda_nueva` | bool or absent | **Gates the assisted-inclusion path** (R1). Declared intake field, `main.py:105` |
| comuna objetivo | `input.comuna_objetivo` **or** `onboarding.comuna_interes` | str or absent | The dashboard already resolves it in this order (`DashboardLeads.jsx:199`) |
| comuna alternativa | `onboarding.comuna_alternativa` | str or absent | **A second declaration, not a weaker one** — see R2 |
| tipo objetivo | `onboarding.tipo_propiedad` | `"casa"` · `"departamento"` or absent | **Not in the `/score` payload** — it lives on the onboarding objective. `Onboarding.jsx:101-102` emits exactly the two values `proyecto.tipo` uses |

`proyectos` is the HU 7 frozen contract, of which this reads `id`, `nombre`, `comuna`, `tipo`,
`precio_min_uf`, `precio_max_uf`. `estado` travels through untouched — it is **not** a gate
(`en_construccion` is real market, venta en verde).

**No capacity or regulatory constant is declared here.** Every ratio and cap the pair-scoped math
needs arrives inside `capacidad_supuestos`. The only numbers this module declares are the affinity
weights in R2 — exactly the duplication budget spike §8.3 allows.

### Outputs

```js
{
  matches:   [ MatchRow ],   // sorted, afinidad descending
  excluidos: [ MatchRow ]    // gate failures, each with motivo_exclusion
}
```

`MatchRow`:

| Field | Type | Values |
| :---- | :--- | :----- |
| `proyecto_id`, `proyecto_nombre`, `comuna`, `tipo`, `precio_min_uf`, `precio_max_uf` | — | Copied from the catalog |
| `afinidad` | float 0–100, 1 dp | `null` on excluded rows |
| `clasificacion` | str | `"Compatible"` · `"Cercano"` · `"Marginal"` · `null` when excluded |
| `motivo_exclusion` | str or `null` | `null` on matches · `"capacidad_insuficiente"` · `"bloqueador_critico"` · `"capacidad_requiere_antecedentes"` |
| `reorientable` | bool | Always `false` on excluded rows |
| `bloqueador_principal` | object or `null` | `{ codigo, titulo, brecha_valor_uf, brecha_recurso_clp, brecha_recurso_tipo }` |
| `evidencia` | object | `{ capacidad_uf, pie_disponible_uf, clasificacion_financiera, restriccion_vinculante, plazo_anios, plazo_origen, alcanza_precio_min, desbloqueable_con_fogaes }` |

`bloqueador_principal.brecha_recurso_tipo` is `"ahorro"` · `"ingreso"` · `null` (null on resolution
steps 1 and 4, which name a blocker rather than a shortfall).

**Two arrays, not one array with a flag.** A single array returns rows the UI must remember to
filter, which is easy to get wrong. `excluidos` is still returned so the dashboard can offer a "ver
descartados" toggle and so exclusions stay debuggable.

## Rules

### R1 — Gates and the near-miss band

**Only two things exclude a pair outright, and neither is affordability.** Evaluated in order; the
first that fires sets `motivo_exclusion` and stops.

| # | Condition | `motivo_exclusion` | Rationale |
| :- | :-------- | :----------------- | :-------- |
| G0 | `capacidad_status == "requires_info"` (capacity is `null`) | `capacidad_requiere_antecedentes` | **Not a matching gate — a precondition.** A pair cannot be scored without a capacity number. These are leads needing a fresh evaluation, not leads who cannot buy, and the panel renders them as their own group (A2) |
| G1 | any blocker with `severity == "critical"` — `morosidad_vigente` (`blockers.py:63-72`), `carga_total_alta` (`blockers.py:106-115`) | `bloqueador_critico` | `commercial_priority.py` already refuses to route these (`do_not_route`). Matching must not contradict a shipped rule |
| G2 | `capacidad_inclusion_uf < UMBRAL_CERCANIA × precio_min_uf` | `capacidad_insuficiente` | Genuinely out of reach — see below |

```
fogaes_aplicable_al_par =
       input.vivienda_nueva === true
    && proyecto.precio_max_uf <= capacidad_supuestos.fogaes_tope_uf
    && (input.ahorro_disponible / (proyecto.precio_min_uf × uf_value_clp)) >= capacidad_supuestos.fogaes_pie_ratio

capacidad_inclusion_uf = fogaes_aplicable_al_par
    ? max(capacidad_compra_estimada_uf, capacidad_asistida_uf)
    : capacidad_compra_estimada_uf
```

| Constant | Value | Source |
| :------- | :---- | :----- |
| `UMBRAL_CERCANIA` | `0.80` | **Developer judgment**, deliberately mirroring `PIE_RATIO_BASE`'s 80/20 so it reads as "within one pie of qualifying" rather than as a fourth invented number. A5 |

**Why G2 is a band and not a cliff.** `ALG-9`'s capacity is a floor, not a ceiling: it assumes a 20%
pie when the regulatory floor is 10% under FOGAES, a 70-year age cap when banks lend to 76–79 with
seguro, and counts only declared savings — no family help, no co-signer, no pie en cuotas. A lead
one UF under `precio_min` is not unable to buy; they are unable to buy *under three layers of
deliberate pessimism*. Excluding them sends the most callable segment in the database to a
"descartados" panel nobody opens twice.

**Why inclusion tests the assisted ceiling but ranking does not.** `capacidad_asistida_uf` is only
consulted when the lead **declared `vivienda_nueva`** — the condition `ALG-8`'s `_detect_fogaes`
actually checks — and only for a project inside the FOGAES cap whose pie the lead's savings already
cover. That is a declared eligibility signal, not optimism. But nobody has verified *primera
vivienda* (`propiedad_previa` is not yet in the `/score` contract), so the assisted number decides
**whether the lead appears**, never **how high they rank**. Recorded as A6.

**Consequence the UI must carry.** `matches` now contains pairs the lead cannot afford *under the
stated assumptions*. `evidencia.alcanza_precio_min` is `false` on exactly those rows and the panel
**must** distinguish them — a near-miss lead presented as qualified is how an executive gets
embarrassed on a call. This is an obligation, not a nice-to-have.

**Comuna, tipo and financial classification are never gates.**

### R2 — Affinity: starts at 100, penalties subtract

| Component | Max penalty | Rule |
| :-------- | ----------: | :--- |
| Holgura de capacidad | **−60** | See R2.1 |
| Comuna | **−15** | Applied **only** when at least one comuna was declared **and** `proyecto.comuna` falls **outside `comunas_declaradas`** — see R2.2 |
| Tipo | **−10** | Applied **only** on a declared mismatch |
| Clasificación financiera | **−15** | `Alto` → 0 · `Medio` → −8 · `Bajo` → −15 · anything else → −15 (A3) |
| Bloqueadores no críticos | **−15** (cap) | `high` −7 each, `medium` −4 each, `low`/`info` 0, **total capped at −15** |

`afinidad = clamp(100 − Σ penalties, 0, 100)`, rounded to 1 decimal.

| Band | `clasificacion` |
| :--- | :-------------- |
| `afinidad >= 70` | `Compatible` |
| `45 <= afinidad < 70` | `Cercano` |
| `afinidad < 45` | `Marginal` |

**Source of every weight: developer judgment, v1, from domain reasoning, not fitted** (A1).

#### R2.2 — `comunas_declaradas`: the alternative is a second declaration

```
comunas_declaradas = {input.comuna_objetivo ?? onboarding.comuna_interes}
                   ∪ {onboarding.comuna_alternativa}          // both, when present
```

The −15 fires only when `proyecto.comuna` is outside that set. An **empty** set (nothing declared)
never fires it — an undeclared preference is not a mismatch.

**Why the alternative carries no discount.** `DashboardLeads.jsx:225-227` — shipped, HU 2 — filters
leads with `if (main !== filterCommune && alt !== filterCommune) return false`, and
`DashboardLeads.jsx:196-204` builds the comuna dropdown from **both**. The executive's own screen
already treats an alternative as a full match. Penalising it here would mean the *same component*
lists a lead under Macul and then, one click later, docks them for not wanting Macul. Scoring the
alternative at a discount would keep that contradiction alive rather than resolve it.

**The signal this flattens, and where it is recovered.** A lead matched on their alternative now ties
with one matched on their main. That is invisible in the panel — every lead is compared against the
*same* project comuna — but real for HU 6, which ranks projects for one lead and would otherwise tie
their first and second choices. It is recovered in **R6 as a tie-break**, not as a weight: a
deterministic ordering rule costs no invented number and cannot distort the score. If HU 16 later
shows second choices genuinely convert worse, the tie-break is promoted to a weight then, with data.

**Stated consequence:** declaring an alternative is strictly advantageous to the lead — two
penalty-free comunas instead of one. That is correct, because they told us more and meant it, but
nobody has told the lead that, so it must not become a nudge in the form.

#### R2.1 — Holgura de capacidad: an inverted U, not a ramp

Four anchors, piecewise linear, continuous at every seam. `peak_uf = PEAK_RATIO × precio_max_uf`.

| Capacity | Penalty | Means |
| :------- | ------: | :---- |
| `= UMBRAL_CERCANIA × precio_min_uf` | −60 | The edge of reachable; below this the pair is excluded (G2) |
| `= precio_min_uf` | −45 | Reaches only the cheapest unit in the building |
| `= precio_max_uf` | −12 | Reaches the whole project, **zero margin** |
| `= PEAK_RATIO × precio_max_uf` | **0** | Buys it *holgado* — the best fit there is |
| `>= SOBRECALCE_SATURACION × precio_max_uf` | −20 | Over-qualified; probably shopping elsewhere |

| Constant | Value | Source |
| :------- | :---- | :----- |
| `HOLGURA_CERCANIA_MAX` | `60` | Developer judgment · A1 |
| `HOLGURA_MAX` | `45` | Spike §5.2 |
| `HOLGURA_EN_TOPE` | `12` | Developer judgment · A4 |
| `PEAK_RATIO` | **derived** = `ratio_dividendo_max / ratio_dividendo_saludable` = `0.30 / 0.25` = `1.20` | `ALG-9` R1 · A7 |
| `SOBRECALCE_MAX` | `20` | Developer judgment · A1 |
| `SOBRECALCE_SATURACION` | `3.0` | Developer judgment · A8 |

**Why the peak is not at `precio_max`.** Capacity is computed at `RATIO_DIVIDENDO_MAX = 0.30`, and
`ALG-9` R1's own band table calls 30% *"Viable pero exigente"* — only ≤25% is *"Holgado"*. A lead
sitting exactly at their capacity is, in the engine's own language, exigente. Peaking there would
make the panel's top recommendation on every single-price project the lead the engine itself calls
strained. The offset is therefore **derived, not invented**: the ratio between the policy ceiling and
the healthy ratio, `0.30 / 0.25 = 1.20`. It also finally gives `RATIO_DIVIDENDO_SALUDABLE` a job —
spike §3.2 defines it and then says "copy only, never used in calculation", which is a strange thing
for a constant to be. **The derivation is exact only for renta-bound leads** (A7).

**Why `precio_max` still costs −12 rather than 0.** The model ignores gastos operacionales —
escritura, notaría, conservador, tasación, impuesto al mutuo — which run 2–3% of the price. A lead
with zero margin arrives at firma short. −12 is the price of "will need coaching on the extras", and
it is deliberately **below** `SOBRECALCE_MAX`: no margin is a coaching problem, no interest is a dead
call.

**Why the deep penalty at `precio_min` is not about affordability.** A lead at `precio_min` reaches
only the **cheapest unit in the building**, and those sell first. That anchor prices *inventory
reach*, not financial strain — which is why the degenerate single-price case (`precio_min ==
precio_max`) collapses to the `precio_max` anchor of −12 and **not** to −45. A lead who clears a
single-price project reaches 100% of its inventory.

**Why saturation sits at 3,0 and not 2,0.** A lead with 2× a project's price is not a distraction —
that is the standard inversionista profile (buy cheap, arrendar, keep the dividendo low), plus
parents buying for a child and buyers deliberately staying under their maximum. Penalising 2× as
"shopping elsewhere" discards one of the best segments on a cheap project (A8).

**E2 constrains `SOBRECALCE_MAX` mathematically.** A saturated `Medio` lead scores
`100 − SOBRECALCE_MAX − 8`; an `Alto` lead at `precio_min` scores `55,0`. E2 fails at
`SOBRECALCE_MAX >= 37`. At `20` the margin is 72,0 vs 55,0. **This bound is invariant 8** — a future
retune cannot silently cross it.

### R3 — Bloqueador principal (pair-scoped)

**Reference price**, three cases:

| Pair | `precio_ref_uf` | Means |
| :--- | :-------------- | :---- |
| in `matches`, `alcanza_precio_min` | `precio_max_uf` | What it takes to reach the top of this project's range |
| in `matches`, **near-miss** (`!alcanza_precio_min`) | `precio_min_uf` | What it takes to qualify at all |
| in `excluidos` | `precio_min_uf` | Same |

The near-miss row is the case the two-rule version of spike §6.1 did not have: it is in `matches`
while sitting below `precio_min`, so quoting the gap to the *top* of the range would overstate what
the lead needs by the whole width of the project.

```
brecha_valor_uf = max(0, precio_ref_uf − capacidad_compra_estimada_uf)
```

Because `capacidad = min(por_renta, por_pie)`, a positive `brecha_valor_uf` is by construction
attributable to `restriccion_vinculante`.

**Resolution order — first match wins:**

| # | Condition | `codigo` | `brecha_recurso_tipo` |
| :- | :-------- | :------- | :-------------------- |
| 1 | a `critical` blocker is present | that blocker's `code` | `null` |
| 2 | `brecha_valor_uf > 0` **and** `restriccion_vinculante == "pie"` | `pie_insuficiente_para_proyecto` | `"ahorro"` |
| 3 | `brecha_valor_uf > 0` **and** `restriccion_vinculante == "renta"` | `renta_insuficiente_para_proyecto` | `"ingreso"` |
| 4 | any non-critical blocker | highest severity; ties broken by declaration order in `blockers.py` | `null` |
| 5 | none | `bloqueador_principal = null` | — |

**The `brecha_valor_uf > 0` guard on steps 2–3 is load-bearing.** `restriccion_vinculante` is
*always* set whenever capacity computes, so without the guard steps 2–3 fire for every pair and a
lead comfortably above `precio_max_uf` is shown a fabricated `pie_insuficiente_para_proyecto`, with
steps 4–5 unreachable.

Only two new codes are introduced, named so they cannot be confused with the lead-global
`pie_insuficiente` (`blockers.py:88`). Steps 2–3 reuse the `"income"` / `"down_payment"` vocabulary
already emitted by `project_fit.py`'s `main_gap`.

**Resource gap** — what the lead must actually add, in CLP:

```
if restriccion_vinculante == "pie":
    brecha_recurso_clp = brecha_valor_uf × pie_ratio × uf_value_clp

if restriccion_vinculante == "renta":
    principal_req_uf   = precio_ref_uf × (1 − pie_ratio)
    factor             = (1 − (1 + tasa_anual_uf/12)^(−plazo_anios×12)) / (tasa_anual_uf/12)
    dividendo_req_clp  = principal_req_uf / factor × uf_value_clp
    ingreso_req_clp    = dividendo_req_clp / ratio_dividendo_max
    brecha_recurso_clp = max(0, ingreso_req_clp − ingreso_total)
```

Every input comes from `capacidad_supuestos`, so the figure is computed under exactly the
assumptions the capacity was. Rounded to the CLP integer.

### R4 — Re-orientable (E4)

A pair is `reorientable` when **all** hold:

1. it passed both gates (it is in `matches`);
2. `afinidad >= 45` (`Cercano` or better);
3. **at least one divergence:**
   - at least one comuna was declared and `proyecto.comuna` is **outside `comunas_declaradas`** (R2.2), **or**
   - `result.project_fit.status` ∈ `{ "out_of_reach", "near" }` while this pair is `Compatible`.

Branch 3b reuses `project_fit`'s already-computed verdict as the "their own plan doesn't work"
signal, so E4 costs no new computation and no new intake field. `commercial_priority.py` is left
**untouched**.

Branch 3a reads the **same set** as the penalty, deliberately: a project in a comuna the lead
explicitly named is not a re-orientation by any reading — they already pointed there.

**Stated consequence, intended, not a bug.** A lead with no declared comuna cannot trigger branch
3a; if `property_value` is unresolvable their `project_fit.status` is `"requires_info"` — not
`"out_of_reach"` — so branch 3b cannot fire either. Such a lead is **never** re-orientable, only
normally matched. You cannot re-orient someone who never stated a direction.

### R5 — FOGAES annotation

```
desbloqueable_con_fogaes = fogaes_aplicable_al_par                       (R1)
                        && capacidad_compra_estimada_uf < proyecto.precio_min_uf
                        && capacidad_asistida_uf       >= proyecto.precio_min_uf
```

This is `ALG-8`'s `_detect_fogaes` rule re-evaluated **per project** instead of against the lead's
declared objective. `ALG-8`'s own boolean cannot be consumed directly: it tests `property_value_uf`
and `pie_ratio`, both computed against the objective, so it answers "is FOGAES viable for the home
they said they want" — a different question. The **rule and its constants** are reused; only the
subject changes.

Never enters the ranking. By construction it can only be `true` on a row where the lead falls short
of `precio_min`, and only for a pie-bound lead (`ALG-9` R4).

**`fogaes_tope_con_subsidio_uf = 3000` is carried but not yet applied.** If the lead also holds a
subsidio habitacional the cap halves, and most of the demo catalog (2.100–4.200 UF) straddles that
line. Nothing in the `/score` contract says whether a lead has a subsidio, so the stricter cap
cannot be tested today. Recorded as A9 rather than silently ignored.

### R6 — Ordering, and the panel's second sort

`matches` sorted by `afinidad` descending. Ties broken by **main-comuna match first** — a pair whose
`proyecto.comuna` equals the lead's *main* declared comuna outranks one that matched only on their
`comuna_alternativa` — then by `proyecto_id` ascending, which is arbitrary but **deterministic**, as
invariant 5 requires. The first tie-break is where R2.2's flattened preference signal is recovered. `excluidos` sorted by `precio_min_uf` ascending, so
the nearest miss appears first.

**The panel offers a second ordering, and it needs no second score.** E1 asks for leads *"ordenados
por afinidad **y** capacidad de compra"* — two orderings, not one. `afinidad` is the default; the
alternate sort is `evidencia.capacidad_uf` descending, which is the monotone "who can most
comfortably buy this" reading. That is **story-local UI**, deliberately not an algorithm: ranking by
a number the row already carries needs no model, no weights and nothing to calibrate. Emitting a
second score would double the weights table and double what HU 16 has to calibrate, for a value that
is a monotone function of a field already present.

The two orderings genuinely disagree — that is the point — so **the panel must show which sort is
active**, or the list reads as unstable.

## Invariants and edge cases

**Invariants:**

1. `matches` and `excluidos` partition the input: every project appears in exactly one, exactly once.
2. Every row in `matches` has `motivo_exclusion === null`, `afinidad` in `[0, 100]` and a `clasificacion`. Every row in `excluidos` has a non-null `motivo_exclusion`, `afinidad === null` and `reorientable === false`.
3. **No output is ever `NaN`.** In particular a single-price project (`precio_min_uf === precio_max_uf`) produces a real `afinidad`.
4. `bloqueador_principal` is `null` whenever the lead's capacity reaches `precio_ref_uf` and no non-critical blocker remains — never fabricated from `restriccion_vinculante` alone (R3).
5. Same input always yields the same output, including order.
6. This module **never recomputes capacity**: mutating only `proyectos` cannot change any `evidencia.capacidad_uf`, and no capacity or regulatory constant is declared in this file.
7. `matchLeadToProjects` does not mutate its arguments.
8. **E2 holds structurally:** a saturated `Medio` lead outranks an `Alto` lead at `precio_min` on the same project. Equivalent to `SOBRECALCE_MAX < 37`, and asserted as a bound so a retune cannot cross it silently.
9. `afinidad` is non-increasing in `|capacidad − peak_uf|`: the holgura curve is continuous and single-peaked, with no discontinuity at any of its four anchors.

**Edge cases:**

| Condition | Behaviour | Why |
| :-------- | :-------- | :-- |
| `proyectos` empty | `{ matches: [], excluidos: [] }` | Not an error |
| `capacidad_status === "requires_info"` | **every** project goes to `excluidos` with `capacidad_requiere_antecedentes` | Nothing is rankable. After `ALG-9`'s amendment this means genuinely missing data only — never a term problem |
| `capacidad_supuestos.plazo_bajo_minimo === true` | ranked normally on the capacity computed at the short term | The lead's file is complete; `edad_plazo_riesgoso` (medium) carries the message. The panel should surface spike §10.3's "requiere revisión de plazo/seguro" rather than "no viable" |
| `capacidad_status === "sin_capacidad"` (capacity `0`) | falls out through G2 unless the FOGAES path lifts it | Correct: they cannot buy today, and the assisted route can still make them visible |
| `precio_min_uf === precio_max_uf` | R2.1's `precio_max` anchor (−12), never `precio_min`'s −45 | Valid single-price project; a lead who clears it reaches 100% of inventory |
| capacity between `0,80 × precio_min` and `precio_min` | in `matches`, `alcanza_precio_min: false`, `precio_ref_uf = precio_min_uf` | The near-miss band (R1) |
| `vivienda_nueva` absent or `false` | assisted inclusion path is off; G2 tests the conservative capacity alone | FOGAES requires vivienda nueva (`ALG-8`) |
| no comuna and no tipo declared | both penalties 0; never re-orientable via branch 3a | An undeclared preference is not a mismatch |
| `estado === "en_construccion"` | ranked normally, `estado` travels through | Venta en verde is real market (HU 7 E4) |
| classification `"Requiere antecedentes"` | −15, the `Bajo` penalty | A3 |
| `comuna_alternativa` declared | counts as a full match: no penalty, not re-orientable, ranked below an equal main-comuna match on ties | R2.2 · A10 |
| critical blocker **and** the FOGAES condition both hold | excluded as `bloqueador_critico`, but `desbloqueable_con_fogaes` can still be `true` | R5 is capacity-only; a `do_not_route` lead is not a subsidy candidate. The rule is left as specified; **the panel must not offer a FOGAES prompt on a `bloqueador_critico` row** — story-local UI, not an ALG rule |

## Assumptions log

| # | Assumption | Made by | Date | Would be wrong if | Status |
| :- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | The affinity weights and the 70 / 45 bands are v1, from domain reasoning, **not fitted** | Spike 1 · E4 + HU 10 build | 2026-08-31 | Real conversion data showed a different ordering. There is none until HU 16 | open · revisit with HU 16 |
| A2 | `capacidad_status === "requires_info"` excludes the pair rather than scoring it at zero | HU 10 build | 2026-08-31 | A missing capacity should read as "cannot buy". It must not: `ALG-9` invariant 4 keeps `null` and `0` distinct so a lead who never answered is not shown as a lead who cannot buy. **This got safer after `ALG-9` narrowed `requires_info` to genuinely missing data** — a lead with an unviable term now computes and is ranked (`ALG-9` invariant 4b), so G0 no longer swallows leads whose file is complete | open |
| A3 | An unrecognised `classification` takes the full −15 | HU 10 build | 2026-08-31 | Unknown classification deserved a middle penalty. The weights here (R2) inherit the asymmetry argued in `ALG-9` R3: over-recommending burns the executive's trust, under-recommending still surfaces the lead as `Cercano`. `"Requiere antecedentes"` is itself known drift — returned by the engine, documented nowhere, not enumerated by the dashboard filter | open |
| A4 | `HOLGURA_EN_TOPE = 12` — reaching a project with zero margin costs 12, below `SOBRECALCE_MAX` | HU 10 build | 2026-08-31 | Gastos operacionales (2–3%, not modelled) were larger than assumed, or a zero-margin buyer converts as well as a holgado one. If anything this is **light** | open |
| A5 | `UMBRAL_CERCANIA = 0.80` — the near-miss band is one pie wide | HU 10 build | 2026-08-31 | Executives find near-miss leads a waste of time in practice. Cheap to retune; the band, not the cliff, is the load-bearing choice | open |
| A6 | Inclusion may use `capacidad_asistida_uf`; **ranking never may** | HU 10 build | 2026-08-31 | `propiedad_previa` reached the engine, making primera-vivienda verifiable — then capacity could branch on the assisted pie ratio directly and this asymmetry becomes unnecessary. See the `ALG-8` note below | open · blocked on HU 1 |
| A7 | `PEAK_RATIO` is derived as `ratio_dividendo_max / ratio_dividendo_saludable` | HU 10 build | 2026-08-31 | **Known limitation: the derivation is exact only for renta-bound leads.** For a pie-bound lead capacity is `ahorro / pie_ratio / uf` and there is no "pie saludable" constant to divide by, so 1,20 is *sourced for the minority and asserted for the majority* — spike §9 says the pie side binds for most profiles. Better than a fully invented offset, and stated rather than oversold | open |
| A8 | `SOBRECALCE_SATURACION = 3.0`, `SOBRECALCE_MAX = 20` | HU 10 build | 2026-08-31 | 2× capacity were a distracted lead rather than the standard inversionista profile. Bounded above by invariant 8 (`< 37`) | open |
| A9 | `fogaes_tope_con_subsidio_uf` is carried but not applied | HU 10 build | 2026-08-31 | It matters today. It cannot be applied: nothing in the `/score` contract says whether a lead holds a subsidio, and most of the catalog straddles the 3.000 UF line — so this is a real gap, not a dormant one | open |
| A10 | `onboarding.comuna_alternativa` is a **second declaration**, equal to the main comuna for the penalty and for re-orientable, separated only by a tie-break | HU 10 build | 2026-08-31 | Second choices genuinely convert worse than first choices — which HU 16 could show and nothing today does. The alternative is **not** an assumption about the lead: `DashboardLeads.jsx:225-227` already treats it as a full match, so the equal treatment is *matching shipped behaviour*, not inventing one. Discounting it would have needed an invented weight **and** left HU 2 contradicted on the same screen | confirmed · revisit with HU 16 |

## Amendments to the source spike

Applied in the same PR that adds this document:

1. **§8.2 / §8.3 path** — `services/leadProjectMatching.js` → `lib/matching/leadProjectMatching.js`.
2. **§5.1 affordability gate → near-miss band** (R1), with the assisted-inclusion path.
3. **§5.2 holgura ramp → inverted U** (R2.1). The spike's "at/above `precio_max` → 0" was tenable only while nothing above `precio_max` needed distinguishing; against a catalog where 8 of 10 available projects are single-price, that rule made the −45 weight — the one carrying E2 — **inert**.
4. **§6.1 reference price** gains the near-miss case (R3).
5. **§5.2 comuna penalty and §7 branch one** now read `comunas_declaradas` (R2.2). The spike says "`comuna_objetivo` was declared and ≠ `proyecto.comuna`", which ignores `comuna_alternativa` and thereby contradicts the shipped HU 2 filter.
6. **Stale story numbers** — §8's "HU 13" is HU 10 and "HU 17" is HU 7 throughout.

## Note for `ALG-8` (housing benefits)

`housing_benefits.py` reads eleven fields from `data`; nine are **not declared in `ScoreRequest`**,
and `scoring.py:931` is fed `payload.model_dump()`, which drops undeclared fields. Through the live
endpoint only `vivienda_nueva` and `edad` reach the detectors, so DS49, DS1, PADHI and Ley 21.748
cannot be eligible regardless of the lead. `test_benefits_detector.py` passes dicts directly and so
does not catch it. **This is why R1 and R5 rely on `vivienda_nueva` alone** — it is the one declared
signal that actually arrives.

**Status:** to be raised at the next daily (2026-08-31). Not HU 10's to fix, and HU 10 does not need
it fixed — but `ALG-9` A1 and `ALG-10` A6 both become resolvable the moment `propiedad_previa`
reaches the engine, so the two stories should move together.
