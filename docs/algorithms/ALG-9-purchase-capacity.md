# ALG-9 — Capacidad de compra (preference-independent purchase capacity)

| Field | Value |
| :---- | :---- |
| **Version** | `capacidad_supuestos.version = "e4-matching-v1"` — **deliberately not** `ALGORITHM_VERSION` (see Purpose) |
| **Runs on / implemented in** | backend · `scoring_engine/purchase_capacity.py` |
| **Cases** | `docs/algorithms/ALG-9-cases.json` — asserted by `backend/tests/test_purchase_capacity.py` (pytest) |
| **Open assumptions** | 7 — see the log below |
| **Last changed** | 2026-08-31 · HU 10 · created |

> **Provisional citations.** `ALG-2` (blockers) and `ALG-5` (project fit) do not exist yet. Where
> this document needs their codes or verdicts it cites `backend/app/scoring_engine/blockers.py` and
> `project_fit.py` **by file and line**. Replace the citation with the ALG number when those
> documents are written; do not restate their rules here.

## Purpose

**What it computes.** The maximum property price a lead could buy, in UF, derived only from their
finances — income, existing debt, savings, age and term. It is the answer to *"what can this person
afford?"*, deliberately **independent of what they said they wanted**.

**When it runs.** Once per evaluation, inside the `/score` orchestrator, immediately after
`calculate_financial_indicators`. Its keys are merged additively into `financial_indicators` and
therefore persist inside `public.evaluations.financial_data` with no schema change.

**What depends on it.** `ALG-10` (lead–project affinity) consumes every key it emits; the executive
dashboard's evidence card renders six of them; the HU 6 recommender ranks on them.

**Why it is this way.** The engine already had a compatibility model — `project_fit.py` — but that
model scores the lead *against their declared objective*. It cannot answer "could this person buy
something else?", because a model that only evaluates the stated target has no opinion about
anything else. HU 10 E4 ("show a lead who can buy a project other than their declared objective as
a re-orientable opportunity") is not implementable on top of it. ALG-9 exists to supply the missing
preference-free number.

Two things were rejected and should stay rejected:

- **Reusing `PRECIOS_REFERENCIA_UF` / `property_value.py`.** Those resolve *the objective's* price.
  Feeding them into capacity would reintroduce the preference dependency this algorithm exists to
  remove (and is forbidden by guardrail #7).
- **Emitting a capacity *band* instead of a point.** Spike §9.3 measured it: across the plausible
  rate/term grid the renta side moves ±6% while the choice of down-payment ratio moves the answer
  **2×**. A band would imply precision that self-declared inputs do not support, and a ranked list
  needs a total order anyway — a band just relocates the collapse into the UI, undocumented.

**Why its version is separate from `ALGORITHM_VERSION`.** These keys are additive: no weight,
threshold, blocker or classification cutoff changes, so no existing rule moved and the engine
version does not advance (handbook: "`ALGORITHM_VERSION` moves when a rule changes"). Matching
criteria will be retuned once HU 16 supplies conversion data; `capacidad_supuestos.version` lets
that happen without forcing a scoring-engine bump.

## Inputs → outputs

### Inputs

Read from the request `data` dict and from the `indicators` dict produced by `indicators.py`.

| Field | Source | Type · unit | Notes |
| :---- | :----- | :---------- | :---- |
| `ingreso_total` | `indicators` | float · CLP/month | Principal + validated complementary income (`_valid_complement_income`) |
| `deuda_mensual` | `data` | float · CLP/month | |
| `deuda_mensual_complementario` (alias `complemento_deuda_mensual`) | `data` | float · CLP/month | **Read here, not from `indicators`** — see Assumption A3 |
| `ahorro_disponible` | `data` | float · CLP | |
| `edad` | `data` | int · years | May be absent in stored snapshots read by the backfill script |
| `plazo_credito_hipotecario` | `data` | int · years | May be absent in stored snapshots |
| `uf_value_clp` | `indicators` | float · CLP per UF | Falls back to `VALOR_UF_CLP` |

**Not read:** `comuna_objetivo`, `property_value*`, `dividendo_estimado`, `tipo_contrato`,
`morosidad_actual`. Capacity is preference-independent and blocker-independent by construction; the
blockers are applied later, by `ALG-10`'s gates.

### Outputs

Nine additive keys inside `financial_indicators`. No existing key is removed, renamed or retyped.

| Key | Type · unit | Values |
| :-- | :---------- | :----- |
| `capacidad_compra_estimada_uf` | float · UF, 1 dp · **or `null`** | `min(por_renta, por_pie)` |
| `capacidad_compra_estimada_clp` | int · CLP · **or `null`** | Display conversion at `uf_value_clp` |
| `capacidad_por_renta_uf` | float · UF, 1 dp · or `null` | The income-side ceiling |
| `capacidad_por_pie_uf` | float · UF, 1 dp · or `null` | The savings-side ceiling |
| `capacidad_asistida_uf` | float · UF, 1 dp · or `null` | FOGAES annotation only — **never ranked** |
| `restriccion_vinculante` | str · or `null` | `"renta"` · `"pie"` |
| `dividendo_maximo_sostenible_clp` | int · CLP/month · or `null` | |
| `capacidad_status` | str | `"ok"` · `"sin_capacidad"` · `"requires_info"` |
| `capacidad_supuestos` | dict | Always emitted, even when status is `requires_info` |

`capacidad_supuestos`:

| Key | Type · unit | Values |
| :-- | :---------- | :----- |
| `tasa_anual_uf` | float · ratio | `TASA_REFERENCIA_UF_ANUAL` |
| `plazo_anios` | int · years | The effective term actually used |
| `plazo_origen` | str | `"declarado"` · `"default"` · `"capado_por_edad"` |
| `pie_ratio` | float · ratio | `PIE_RATIO_BASE` |
| `ratio_dividendo_max` | float · ratio | `RATIO_DIVIDENDO_MAX` — **added beyond spike §8.1**, see below |
| `ratio_dividendo_saludable` | float · ratio | `RATIO_DIVIDENDO_SALUDABLE` — **added beyond spike §8.1**; `ALG-10`'s holgura peak is derived from `ratio_dividendo_max / ratio_dividendo_saludable` |
| `fogaes_tope_uf` | int · UF | `FOGAES_MAX_PROPERTY_UF` (`ALG-8`) — **added beyond spike §8.1** |
| `fogaes_tope_con_subsidio_uf` | int · UF | `FOGAES_MAX_UF_CON_SUBSIDIO` (`ALG-8`) — **added beyond spike §8.1** |
| `fogaes_pie_ratio` | float · ratio | `FOGAES_MIN_PIE_RATIO` (`ALG-8`) — **added beyond spike §8.1**; `ALG-10` re-tests this condition per project |
| `uf_value_clp` | float · CLP | The value actually used |
| `uf_fecha` | str · `YYYY-MM-DD` | Date the UF value was sourced |
| `age_term_verified` | bool | `false` when `edad` was absent |
| `plazo_bajo_minimo` | bool | `true` when `plazo_efectivo < PLAZO_MINIMO_VIABLE_ANIOS` — a **flag, not a refusal**; see R2 |
| `version` | str | `MATCHING_VERSION` |

**`capacidad_supuestos` travels with the number, by design.** A capacity persisted in June and read
in December is uninterpretable without it — you cannot tell whether it is low because the lead is
weak or because the rate moved. One dict is what makes RNF 4 / RNF 5 auditability real.

**Five keys are added beyond spike §8.1**, all for one reason. Spike §8.3 forbids the frontend from
re-declaring any capacity constant, yet `ALG-10` needs several of them: §6.1's pair-scoped
`brecha_recurso_clp` needs `RATIO_DIVIDENDO_MAX`; its holgura peak is derived from
`RATIO_DIVIDENDO_SALUDABLE`; and its per-project FOGAES test needs all three `ALG-8` caps plus the
assisted pie ratio. Shipping them inside `capacidad_supuestos` means `ALG-10` re-declares **only the
affinity weights**, exactly as §8.3 requires, and every value is audited alongside the number it
produced. Recorded as Assumption A6.

**`ALG-10` also reads `vivienda_nueva` directly off the request snapshot**, not from here — it is a
declared intake field, not a calculation assumption, and it does not belong in a dict describing how
a number was computed.

## Rules

Every number below lives in `backend/app/scoring_engine/constants.py`. No literal may appear inside
a function.

### R1 — Maximum sustainable dividend

| Condition | Effect | Source |
| :-------- | :----- | :----- |
| always | `deuda_total = deuda_mensual + deuda_mensual_complementario` | spike §4.1 |
| always | `dividendo_maximo_sostenible_clp = max(0, min(RATIO_DIVIDENDO_MAX × ingreso_total, RATIO_CARGA_TOTAL_MAX × ingreso_total − deuda_total))` | spike §4.1 |
| `RATIO_DIVIDENDO_MAX` | `0.30` | **RutaHogar policy.** Internal consistency with `blockers.py:95` (`dividendo_exigente` fires *above* 0.30) + Bci published FAQ |
| `RATIO_CARGA_TOTAL_MAX` | `0.45` | **Regulator.** [CMF Educa](https://www.cmfchile.cl/educa/621/w3-article-27502.html) + `blockers.py:106` (`carga_total_alta`) |
| `RATIO_DIVIDENDO_SALUDABLE` | `0.25` | **Regulator / bank published criteria.** CMF Educa, BancoEstado, Scotiabank. **UX copy only — never used in calculation** (see the band table below) |

`deuda_actual_alta` (deuda/ingreso > 0.40, `blockers.py:117`) is deliberately **not** a third
`min()`. Between 40% and 45% a small residual capacity genuinely exists under the total-burden rule;
that condition surfaces as a commercial warning, not as a capacity cut.

**The 25% / 30% question, resolved** (spike §3.4). 25% is the published prudential norm and is what
`project_fit.py:80`'s `required_income = dividendo_estimado * 4` implies; 30% is what `blockers.py`
actually enforces. A ceiling built at 25% would declare leads unable to afford projects the engine's
own blockers consider unproblematic — two thresholds inside one engine disagreeing about the same
ratio. **Resolution: `0.30` calculates, `0.25` speaks.**

| Band on `dividendo / ingreso_total` | Label shown |
| :---------------------------------- | :---------- |
| ≤ 0.25 | Holgado |
| 0.25 – 0.30 | Viable pero exigente |
| > 0.30 | Fuera de política RutaHogar |
| `(deuda + dividendo) / ingreso_total` > 0.45 | No avanzar sin revisión |

### R2 — Effective term

| Condition | Effect | `plazo_origen` | Source |
| :-------- | :----- | :------------- | :----- |
| `plazo_credito_hipotecario` declared | `base = plazo_credito_hipotecario` | `"declarado"` | spike §4.2 |
| not declared | `base = PLAZO_REFERENCIA_ANIOS` = `30` | `"default"` | **Bank published criteria.** Most commonly offered term (Bci, Scotiabank, BancoEstado 8–30) |
| `EDAD_MAX_FIN_CREDITO − edad < base` | `base = EDAD_MAX_FIN_CREDITO − edad` | `"capado_por_edad"` | spike §4.2 |
| `EDAD_MAX_FIN_CREDITO` | `70` | — | **RutaHogar policy.** `blockers.py:173` + HU 29 E2. More conservative than the market (Scotiabank up to 79 with insurance) — deliberately kept (spike §10.3) |
| `0 < plazo_efectivo < PLAZO_MINIMO_VIABLE_ANIOS` = `5` | compute normally at that term; set `plazo_bajo_minimo = true` | unchanged | **Developer judgment.** A warning threshold, **not a gate** — see below |
| `plazo_efectivo <= 0` (edad ≥ `EDAD_MAX_FIN_CREDITO`) | `capacidad_por_renta_uf = 0`, so capacity is `0` and status is `sin_capacidad` | `"capado_por_edad"` | You cannot hold a zero-year mortgage. The pie side is still reported |
| `edad` absent | term is not capped; `age_term_verified = false` | unchanged | spike §4.2 — degrade data quality, do not block |

A declared term wins over the default because it reflects what the lead is actually asking for. The
age cap already supplies the conservatism, so the default is not additionally discounted.

**`PLAZO_MINIMO_VIABLE_ANIOS` is a flag, not a gate — and this is a deliberate change from spike
§4.5**, which routes `plazo_efectivo < 5` to `requires_info` with a null capacity. Three reasons:

1. **It is not a data gap.** Every field is present; we computed a term and disliked it.
   `requires_info` tells the executive to go collect information that already exists.
2. **The spike contradicts itself.** §10.3 says the copy for the age/term overrun should read
   *"requiere revisión de plazo/seguro"* rather than *"no viable"* — soft and actionable. §4.5 makes
   the same fact a hard null.
3. **It creates a one-year cliff the engine does not share.** `blockers.py:173` raises
   `edad_plazo_riesgoso` at severity **medium** for this exact condition. A lead of 65 asking 30
   years is capped to 5, computes, and ranks normally; a lead of 66 is capped to 4 and, under §4.5,
   becomes invisible on every project. Same medium blocker, opposite outcomes, one birthday apart.

The number stays honest rather than flattering: a 66-year-old with $3,0M income and $30M saved
computes **1.224 UF** at a 4-year term, against 3.686 UF if the term were not capped. They will
usually still fall out at `ALG-10`'s G2 — but as `capacidad_insuficiente`, **with a number on the
card**, instead of in a bucket that asks the executive to chase data that is already there.

Note also that `capacidad_por_pie_uf` is entirely term-independent (`ahorro / PIE_RATIO_BASE / uf`),
so for a savings-bound lead a short term changes nothing about their binding constraint. Refusing to
compute discards a number the term never touched.

**Consequence the UI must carry:** leads are ranked under different term assumptions. The lead card
**must** display `plazo_anios` and `plazo_origen` so an executive never compares invisibly different
numbers. This is not an optional field.

### R3 — Capacity ceiling

| Step | Formula | Source |
| :--- | :------ | :----- |
| Monthly rate | `tasa_mensual = TASA_REFERENCIA_UF_ANUAL / 12` (nominal convention, matching Chilean public calculators) | spike §4.3 |
| `TASA_REFERENCIA_UF_ANUAL` | `0.040` | **Market.** [Banco Central serie F022.VIV.TIP.MA03.UF.Z.M](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M) — jul-2026 = 4,00%. Consulted 2026-08-16 · **review quarterly** |
| Periods | `n = plazo_efectivo × 12` | — |
| Annuity factor | `(1 − (1 + tasa_mensual)^(−n)) / tasa_mensual`; if `tasa_mensual == 0`, fall back to `n` | spike §4.3 |
| Max principal | `principal_maximo_uf = (dividendo_maximo_sostenible_clp / uf_value_clp) × annuity_factor` | spike §4.3 |
| Income ceiling | `capacidad_por_renta_uf = principal_maximo_uf / (1 − PIE_RATIO_BASE)` | spike §4.3 |
| Savings ceiling | `capacidad_por_pie_uf = (ahorro_disponible / PIE_RATIO_BASE) / uf_value_clp` | spike §4.3 |
| `PIE_RATIO_BASE` | `0.20` | **Bank published criteria.** LTV 80% is the standard, unconditional path across Chilean banks · review annually |
| Capacity | `capacidad_compra_estimada_uf = min(capacidad_por_renta_uf, capacidad_por_pie_uf)` | spike §4.3 |
| Binding side | `restriccion_vinculante = "renta" if capacidad_por_renta_uf <= capacidad_por_pie_uf else "pie"` | spike §4.3 |

**Why 20% and not 10% as the base anchor.** 20% is unconditional — it does not depend on the
property being new, on a subsidy, on FOGAES, on a first-home profile, or on a bank campaign. 10% is
real but conditional, and **the intake form captures no `primera_vivienda` field**, so eligibility is
unverifiable from current data. A matching engine's cost function is asymmetric: recommending a lead
who cannot actually buy burns an executive's time and the client's trust, while under-recommending
still surfaces the lead as `Cercano` or re-orientable. Encoding an unverified 2× multiplier into a
ranked list is the failure mode that discredits the whole feature. Logged as A1.

### R4 — Assisted route (FOGAES flag, not capacity)

**These constants are not ours — they belong to `ALG-8` (HU 8, `housing_benefits.py`). Reuse them;
do not redeclare.** An earlier draft of this document specified `PIE_RATIO_ASISTIDO` and
`FOGAES_PRECIO_MAX_UF`, which would have been exact duplicates of `FOGAES_MIN_PIE_RATIO` and
`FOGAES_MAX_PROPERTY_UF`. Two constants for one regulatory number is how they drift apart when the
law changes.

> ⚠️ **Prerequisite — they are not on this branch yet.** `feature/sprint1/HU10` is cut from a
> `develop` that predates PR #80, so `backend/app/scoring_engine/constants.py` here contains **no
> FOGAES constants at all**. R4 and `ALG-10`'s R1/R5 do not compile against this branch as it
> stands. **`develop` must be merged into `feature/sprint1/HU10` before step 2 of the plan**, and
> the build session must confirm the three names exist before writing `purchase_capacity.py`. Do
> **not** resolve this by declaring local copies — that is exactly the duplication A7 exists to
> prevent.

| Step | Formula | Source |
| :--- | :------ | :----- |
| Assisted ceiling | `capacidad_asistida_uf = min(principal_maximo_uf / 0.90, (ahorro_disponible / FOGAES_MIN_PIE_RATIO) / uf_value_clp)` | spike §4.4 |
| `FOGAES_MIN_PIE_RATIO` | `0.10` | **Regulator**, owned by `ALG-8`. [FOGAES — requisitos](https://fogaes.cl/sitio/requisitos/): 90% LTV, primera vivienda · review on legal change |
| `FOGAES_MAX_PROPERTY_UF` | `6000` | **Regulator**, owned by `ALG-8`. Bill approved ago-2026 raises the cap from UF 4.500 to UF 6.000, +30.000 cupos, valid to 31-may-2028 |
| `FOGAES_MAX_UF_CON_SUBSIDIO` | `3000` | **Regulator**, owned by `ALG-8`. **The cap halves when FOGAES is combined with a subsidio habitacional** — load-bearing here, because most of the demo catalog (2.100–4.200 UF) straddles that line |

`capacidad_asistida_uf` **never enters the ranking.** The pair-scoped flag
`desbloqueable_con_fogaes` is computed by `ALG-10`, which reads all three caps and the assisted pie
ratio out of `capacidad_supuestos` — see the contract note below on why they travel.

Note the shape: because `principal / 0.90 < principal / 0.80`, the assisted route **lowers** the
income-side ceiling and **doubles** the savings-side one. That is correct — FOGAES relieves the down
payment, not the income test — and it means the flag only ever fires for pie-bound leads. This is
load-bearing rather than an edge case: at 20% pie the savings side binds for most realistic profiles
(spike §9), so the flag is often the difference between an empty panel and a usable one.

## Invariants and edge cases

**Invariants** — asserted as invariants by the test suite, not as fixture values:

1. `capacidad_compra_estimada_uf` is `null` or `>= 0`. **It is never negative.**
2. When `capacidad_status == "ok"`, `capacidad_compra_estimada_uf == min(capacidad_por_renta_uf, capacidad_por_pie_uf)` exactly.
3. When capacity computes at all (status `ok` or `sin_capacidad`), `restriccion_vinculante` is set to `"renta"` or `"pie"`. It is `null` only under `requires_info`.
4. `capacidad_status == "requires_info"` ⟺ **every** capacity value is `null`. A `requires_info` row never carries a number.
4b. `capacidad_supuestos.plazo_bajo_minimo == true` ⟹ status is `ok` or `sin_capacidad`, **never** `requires_info`. A term problem is a finding, not a data gap.
5. `capacidad_supuestos` is emitted on every path, including `requires_info`.
6. Capacity does not depend on `comuna_objetivo`, `property_value*` or `dividendo_estimado`: changing only those fields leaves every output byte-identical. (This is what "preference-independent" means, expressed as a test.)
7. Same input always yields the same output — no clock, no randomness, no AI in the path.
8. The existing `POST /score` keys are unchanged. A golden-fixture case asserts byte-identity against the pre-HU-10 response.

**Edge cases:**

| Condition | `capacidad_status` | Values | Why that is right |
| :-------- | :----------------- | :----- | :---------------- |
| `ingreso_total <= 0` or missing | `requires_info` | all `null` | **Never `0`.** `0` must mean "enough data, no residual capacity"; conflating the two would show a lead who never answered as a lead who cannot buy |
| `0 < plazo_efectivo < 5` | `ok` or `sin_capacidad` — **never `requires_info`** | computed at that term, `plazo_bajo_minimo = true` | We have every field; this is a **finding**, not a missing input. The commercial message is `edad_plazo_riesgoso` (`blockers.py:173`, medium) plus spike §10.3's "requiere revisión de plazo/seguro" |
| `plazo_efectivo <= 0` | `sin_capacidad` | capacity `0`, `capacidad_por_pie_uf` still reported | No zero-year mortgage exists |
| `deuda_total >= 0.45 × ingreso_total` | `sin_capacidad` | capacity `0` | R1 yields `0` naturally. Route to the improvement plan, not to projects |
| `deuda_total > ingreso_total` | `sin_capacidad` | capacity `0` | Subsumed by the row above; also raises `deuda_actual_alta` + `carga_total_alta` |
| `ahorro_disponible == 0` | `sin_capacidad` | capacity `0`, **`capacidad_por_renta_uf` still computed** | Correct for an *immediate* purchase, and the income ceiling is what shows the lead their future potential once they save |
| `edad` absent | `ok` | computed, `age_term_verified = false` | Unreachable through the API (`edad` is required at `main.py:65`); reachable from stored snapshots the backfill script reads |
| `plazo_credito_hipotecario` absent | `ok` | computed, `plazo_origen = "default"` | Same — required at `main.py:72`, reachable only from old snapshots |
| Complemento declared but incomplete | per `indicators.py` | computed without the complement | `_valid_complement_income()` already returns `0.0` unless fully validated |

**Ordering of the status checks matters and is fixed:** data-quality (`requires_info`) is evaluated
before capacity (`sin_capacidad`). After this change `requires_info` has exactly **two** causes —
`ingreso_total <= 0`, and a stored snapshot the backfill cannot complete. Term problems are never
among them.

## Assumptions log

| # | Assumption | Made by | Date | Would be wrong if | Status |
| :- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | `PIE_RATIO_BASE = 0.20` is the base anchor; the 10% assisted route is a flag, not a multiplier | Spike 1 · E4 | 2026-08-16 | The client's catalog sits mostly under UF 6.000, making FOGAES the norm rather than the exception. Then adding a `primera_vivienda` field to HU 1's form (spike §10.5) and branching capacity on `FOGAES_MIN_PIE_RATIO` (`ALG-8`) is the correct fix — not raising the base ratio | open · blocked on team open item 1 (commercial: real UF range of Echeverría Izquierdo's projects) |
| A2 | `0.30` is the calculation ceiling and `0.25` is UX copy only | Spike 1 · E4 | 2026-08-16 | The client's underwriting partner enforces 25% as a hard gate. Then `blockers.py:95` must move with it — the two cannot disagree | confirmed (spike §3.4) |
| A3 | `deuda_total` includes the complementary side, **diverging from `indicators.py`** | Spike 1 · E4 | 2026-08-16 | Complementary debt should genuinely be excluded from the burden test. `indicators.py` adds validated complementary *income* to `ingreso_total` but leaves `deuda` as `deuda_mensual` alone, even though `_valid_complement_income()` requires the complementary debt to be declared and then discards it — so every ratio for a lead with a complemento is currently **overstated**. ALG-9 implements spike §4.1 as specified rather than inheriting the inflation; `indicators.py` is HU 3 / HU 15's to fix (spike §10.1) | open · **divergence is intentional and must not be "corrected" to match `indicators.py`** |
| A4 | `PLAZO_MINIMO_VIABLE_ANIOS = 5` is a **warning threshold**, not a gate: below it capacity is still computed and flagged `plazo_bajo_minimo` | HU 10 build (amending Spike 1 · E4) | 2026-08-31 | No Chilean bank sells a 4-year mortgage, making the annuity correct for a product nobody offers — the real case for the spike's `requires_info`. Answered: the arithmetic is right regardless, whether a bank sells it is a product question owned by `edad_plazo_riesgoso` and spike §10.3's copy, and refusing to compute does not make the lead more callable — it makes them invisible. **The spike's own §10.3 already says this condition is soft** | open · **amends spike §4.5** |
| A5 | `VALOR_UF_CLP = 40695` is hardcoded and stale (0,39% low on 2026-08-16) | inherited (`constants.py:8`) | 2026-08-16 | Matching were computed in CLP. It is computed entirely in UF, so this is display precision only (spike §3.3). It still drifts and should eventually be injected daily with its date | open · not HU 10's to fix |
| A6 | Five constants are added to `capacidad_supuestos` beyond spike §8.1 (`ratio_dividendo_max`, `ratio_dividendo_saludable`, `fogaes_tope_uf`, `fogaes_tope_con_subsidio_uf`, `fogaes_pie_ratio`) | HU 10 build | 2026-08-31 | The frontend were allowed to re-declare capacity constants. Spike §8.3 forbids exactly that, and `ALG-10`'s pair-scoped math needs all five — shipping them with the number is the only route that keeps `ALG-10` free of capacity constants | open · additive, breaks no consumer |
| A7 | The FOGAES constants are **`ALG-8`'s**, reused rather than redeclared | HU 10 build | 2026-08-31 | `ALG-8`'s values were wrong or scoped differently from what capacity needs. They are the same regulatory numbers, already sourced and already in `constants.py`; duplicating them is how two copies of one law drift apart. If `ALG-8` retunes them, capacity must move with it — that coupling is intentional | confirmed |

## Known discrepancies in the source spike

Recorded rather than silently reconciled. Neither changes a rule.

1. **§8.1's example block mixes two UF values.** Its numbers (`capacidad_por_pie_uf = 3059.6`,
   `capacidad_asistida_uf = 4272.0`) are computed at UF = 40.854, while the same block records
   `uf_value_clp: 40695`. `ALG-9-cases.json` resolves this by passing `uf_value_clp` explicitly in
   every case input, so each case is reproducible from its own fixture.
2. **§8.1 shows `capacidad_compra_estimada_uf = 3060.4` beside `capacidad_por_pie_uf = 3059.6`.**
   Invariant 2 requires them to be equal when the pie side binds; the 0,8 UF gap is a rounding
   artifact in the illustrative block, not a rule. The invariant governs.
