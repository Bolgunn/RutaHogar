# Spike 1 · E4 — Lead–Project Matching Criteria

Reviewed: 2026-08-16
Scope: definition of the criteria, variables, thresholds and frozen contract for matching a lead against the real estate project catalog. Chilean mortgage underwriting norms as of August 2026.
<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
Deliverable status: **criteria definition + frozen contract. No production code written.** Implementation is owned by [[UserStories/HU10-LeadProjectMatching|HU 10]].
========
Deliverable status: **criteria definition + frozen contract. No production code written.** Implementation is owned by [[UserStories/HU10-matching-lead-proyecto\|HU 10]].
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md

Research tracks: independent desk research (Banco Central, CMF Educa, FOGAES, bank published terms) plus a parallel agent review of the existing `scoring_engine` against those norms. Where the two tracks disagreed, the divergence and its resolution are recorded in §11.

---

## 1. What this document decides

**Source criterion** — Spike 1, E4, from [[informes_entregas/E4 - GPI Plan de Proyecto 2026|E4 — Plan de Proyecto 2026]]:

> **E4 – Definición de criterios para matching lead-proyecto.** Dado que el sistema debe recomendar leads compatibles con proyectos inmobiliarios, cuando el equipo investigue los criterios de compatibilidad comercial, entonces debe definir variables como capacidad estimada, comuna de interés, rango de precio, pie disponible, clasificación del lead y bloqueador principal.

| E4 variable | Resolved as | Section |
| :---------- | :---------- | :------ |
| Capacidad estimada | `capacidad_compra_estimada_uf` — preference-independent ceiling | §3, §4 |
| Comuna de interés | Soft affinity signal, never a gate | §5.2 |
| Rango de precio | `precio_min_uf` gate + holgura scorer against `precio_max_uf` | §5.1, §5.2 |
| Pie disponible | Savings anchor of the capacity ceiling at 20%; 10% as assisted-route flag | §4.3 |
| Clasificación del lead | Minority scorer (15 pts), deliberately outweighed by capacity | §5.2 |
| Bloqueador principal | Pair-specific, with a fixed resolution order | §6 |

### What this document does **not** decide

- **Scoring engine changes.** The financial score, its weights, and `classification` are untouched. E4 consumes them.
- **The `/score` contract.** Capacity is added as *new keys inside the existing* `financial_indicators` dict — additive only. No field removed, no type changed, no endpoint added (guardrail #5).
- **`PRECIOS_REFERENCIA_UF`.** Untouched (guardrail #7). The capacity model is preference-independent and does not read it.
<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
- **Rate / UF / term scenarios.** Owned by [[UserStories/HU18-MortgageScenarioSimulator|HU 18]] and [[UserStories/HU29-CreditTotalCostComparator|HU 29]]. Matching uses one base scenario (§8.2).
- **Subsidy eligibility rules.** Owned by Spike 1 E2 / [[UserStories/HU26-SubsidySimulation|HU 26]]. E4 only emits a flag (§4.4).
- **UI.** The lead card layout is HU 10's.

### What this document claims for reuse

`capacidad_compra_estimada_uf` is defined here but is **also the primitive Spike 1 E2 needs** for [[UserStories/HU6-CompatibilitySimulation|HU 6]] ("comparar capacidad de compra, valor de vivienda, ahorro, deuda y ajustes mínimos"). Whoever writes E2 must consume this definition rather than introduce a second capacity formula.
========
- **Rate / UF / term scenarios.** Owned by [[UserStories/HU18-simulador-escenarios-hipotecarios\|HU 18]] and [[UserStories/HU29-comparador-costo-credito\|HU 29]]. Matching uses one base scenario (§8.2).
- **Subsidy eligibility rules.** Owned by Spike 1 E2 / [[UserStories/HU26-simulacion-subsidios\|HU 26]]. E4 only emits a flag (§4.4).
- **UI.** The lead card layout is HU 13's.

### What this document claims for reuse

`capacidad_compra_estimada_uf` is defined here but is **also the primitive Spike 1 E2 needs** for [[UserStories/HU6-simulacion-compatibilidad\|HU 6]] ("comparar capacidad de compra, valor de vivienda, ahorro, deuda y ajustes mínimos"). Whoever writes E2 must consume this definition rather than introduce a second capacity formula.
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md

---

## 2. The reframing

The existing engine is **preference-anchored**. `property_value.py` resolves a single target property value from the lead's declared `comuna_objetivo` (or a declared value), and `project_fit.py` then asks *"can they afford this one thing?"*

That primitive cannot rank a catalog, and it cannot answer E4. Matching needs the inverse:

```
preference-anchored (today):   lead + declared objective  ->  fit verdict
preference-independent (E4):   lead                       ->  capacity ceiling  ->  ranked against N projects
```

**Consequence:** comuna and tipo are demoted from *inputs to the target* to *soft affinity signals*. A lead is matched on what they can afford first, and on what they said they wanted second. This is also what makes HU 10 E4 (re-orientable lead) computable at all — you cannot detect "they can buy something other than what they asked for" from a model that only evaluates what they asked for.

Both models coexist. `project_fit.py` keeps answering "does their own plan work", and its verdict is reused as an input to the re-orientable rule (§7).

---

## 3. Normative assumptions

Every constant carries provenance. Rows are split by **kind**, because market values go stale on a calendar while policy values only change when the team decides. Refreshing a rate must never silently overwrite a policy choice.

### 3.1 Market-sourced (goes stale)

| Constant | v1 value | Source | Consulted | Review |
| :------- | :------- | :----- | :-------- | :----- |
| `TASA_REFERENCIA_UF_ANUAL` | `0.040` | [Banco Central, serie F022.VIV.TIP.MA03.UF.Z.M](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M) — jul-2026 = 4,00% (pub. 2026-08-07). Trajectory: 4,12% ene-26 → 3,96% may-26 → 3,97% jun-26 → ~4,06% jul-26 | 2026-08-16 | Quarterly |
| `PIE_RATIO_BASE` | `0.20` | LTV 80% is the standard, unconditional path across Chilean banks | 2026-08-16 | Annual |
| `PIE_RATIO_ASISTIDO` | `0.10` | [FOGAES — requisitos](https://fogaes.cl/sitio/requisitos/): 90% LTV, primera vivienda, tope UF 4.500. Bill approved ago-2026 raises the cap to UF 6.000, +30.000 cupos, validity extended to 31-may-2028 | 2026-08-16 | On legal change |
| `VALOR_UF_CLP` | repo: `40695` · actual 2026-08-16: `40854` | SII / Banco Central | 2026-08-16 | See §3.3 |

### 3.2 RutaHogar policy (changes only by team decision)

| Constant | v1 value | Basis | Consulted | Review |
| :------- | :------- | :---- | :-------- | :----- |
| `RATIO_DIVIDENDO_MAX` | `0.30` | Internal consistency with `blockers.py:95` (`dividendo_exigente` fires *above* 0.30) and Bci's published FAQ criterion | 2026-08-16 | Only with the blocker |
| `RATIO_CARGA_TOTAL_MAX` | `0.45` | [CMF Educa](https://www.cmfchile.cl/educa/621/w3-article-27502.html) + `blockers.py:106` (`carga_total_alta`) | 2026-08-16 | Only with the blocker |
| `RATIO_DIVIDENDO_SALUDABLE` | `0.25` | CMF Educa; BancoEstado/Enlace Inmobiliario; Scotiabank. **Copy only — never used in calculation** | 2026-08-16 | — |
| `PLAZO_REFERENCIA_ANIOS` | `30` | Most commonly offered term (Bci, Scotiabank, BancoEstado 8–30). Overridable by a declared `plazo_credito_hipotecario` | 2026-08-16 | — |
<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
| `EDAD_MAX_FIN_CREDITO` | `70` | RutaHogar policy: `blockers.py:173` + [[UserStories/HU29-CreditTotalCostComparator|HU 29]] E2. **More conservative than the market** (Renta Nacional 76a364d; Scotiabank up to 79 with insurance) — deliberately kept | 2026-08-16 | — |
========
| `EDAD_MAX_FIN_CREDITO` | `70` | ScoreLeads policy: `blockers.py:173` + [[UserStories/HU29-comparador-costo-credito\|HU 29]] E2. **More conservative than the market** (Renta Nacional 76a364d; Scotiabank up to 79 with insurance) — deliberately kept | 2026-08-16 | — |
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md
| `PLAZO_MINIMO_VIABLE_ANIOS` | `5` | Below this the quote is not meaningful → `requires_info` | 2026-08-16 | — |

### 3.3 Canonical unit: UF

Projects are priced in UF (`precio_min_uf` / `precio_max_uf`) and the mortgage rate is UF-denominated, so **capacity is stored in UF** and CLP is a display conversion carrying the UF value and its date.

This makes the hardcoded `VALOR_UF_CLP = 40695` (0,39% stale vs. $40.854 on 2026-08-16) a **display-precision** issue, not a matching-correctness one — the ranking is computed entirely in UF. It still drifts and should eventually be injected daily rather than hardcoded, but that is not E4's to fix.

### 3.4 The 25% / 30% question, resolved

The two research tracks disagreed here, and the resolution is deliberate:

- **25%** is the published prudential norm (CMF Educa, BancoEstado, Scotiabank) and is what `project_fit.py`'s `required_income = dividendo_estimado * 4` already implies.
- **30%** is what `blockers.py` actually enforces — `dividendo_exigente` only fires *above* 0.30.

A capacity ceiling built at 25% would declare leads unable to afford projects that the engine's own blocker rules consider unproblematic. Two thresholds inside one engine disagreeing about the same ratio undermines the "auditable, versioned rules" mandate.

**Resolution:** `0.30` is the calculation ceiling; `0.25` is retained as UX language only.

| Band | Label shown |
| :--- | :---------- |
| ≤ 25% | Holgado |
| 25–30% | Viable pero exigente |
| > 30% | Fuera de política RutaHogar |
| deuda + dividendo > 45% | No avanzar sin revisión |

---

## 4. The capacity model

Chilean banks underwrite against two independent gates — what you can service, and what you can put down. Capacity is the lesser of the two, and **which side binds is itself a first-class output**.

### 4.1 Maximum sustainable dividend

```
ingreso_total   = ingreso_mensual + ingreso_complementario_validado   # per indicators.py
deuda_total     = deuda_mensual   + deuda_complementaria_declarada    # see §11.1

dividendo_maximo_sostenible_clp = max(0, min(
    RATIO_DIVIDENDO_MAX   * ingreso_total,                 # 0.30
    RATIO_CARGA_TOTAL_MAX * ingreso_total - deuda_total    # 0.45 - existing burden
))
```

`deuda_actual_alta` (deuda/ingreso > 0.40) is **not** added as a third `min()`. Between 40% and 45% a small residual capacity genuinely exists under the total-burden rule; the condition surfaces as a commercial warning instead.

### 4.2 Effective term

```
plazo_efectivo = min(plazo_credito_hipotecario or PLAZO_REFERENCIA_ANIOS,
                     EDAD_MAX_FIN_CREDITO - edad)

if plazo_efectivo < PLAZO_MINIMO_VIABLE_ANIOS: -> capacidad_status = "requires_info"
if edad is missing:                            -> use the declared/default term, set age_term_verified = false
```

A declared term wins over the default: it reflects what the lead is actually asking for. The age cap already supplies the conservatism, so the default is not additionally discounted.

**Consequence to surface in the UI:** leads are then ranked under slightly different term assumptions. That is correct — but the lead card must display `plazo_anios` and `plazo_origen` so an executive is never comparing invisibly-different numbers.

### 4.3 Capacity ceiling

```
tasa_mensual = TASA_REFERENCIA_UF_ANUAL / 12
n            = plazo_efectivo * 12

dividendo_maximo_uf = dividendo_maximo_sostenible_clp / uf_value_clp

principal_maximo_uf = dividendo_maximo_uf * (1 - (1 + tasa_mensual)^(-n)) / tasa_mensual
                      # tasa_mensual = 0 fallback: dividendo_maximo_uf * n

capacidad_por_renta_uf = principal_maximo_uf / (1 - PIE_RATIO_BASE)     # /0.80
capacidad_por_pie_uf   = (ahorro_disponible / PIE_RATIO_BASE) / uf_value_clp

capacidad_compra_estimada_uf = min(capacidad_por_renta_uf, capacidad_por_pie_uf)
restriccion_vinculante       = "renta" if capacidad_por_renta_uf <= capacidad_por_pie_uf else "pie"
```

`tasa_mensual = tasa_anual / 12` (nominal convention) matches Chilean public calculators. If an explicitly *effective* annual rate is ever supplied, use `(1 + tasa)^(1/12) - 1` and record the rate type in metadata.

**Why 20% and not 10% as the base anchor.** 20% is unconditional — it does not depend on the property being new, on a subsidy, on FOGAES, on a first-home profile, or on a specific bank's campaign. 10% is real but conditional, and the intake form captures **no `primera_vivienda` field**, so eligibility is unverifiable from current data. A matching engine's cost function is asymmetric: recommending a lead who cannot actually buy burns an executive's time and the client's trust, while under-recommending still surfaces the lead as `Cercano` or re-orientable. Encoding an unverified 2× multiplier into a ranked list is the failure mode that discredits the whole feature.

### 4.4 Assisted route (FOGAES flag, not capacity)

```
capacidad_asistida_uf = min(principal_maximo_uf / 0.90,
                            (ahorro_disponible / PIE_RATIO_ASISTIDO) / uf_value_clp)

desbloqueable_con_fogaes = capacidad_compra_estimada_uf < proyecto.precio_min_uf
                           and capacidad_asistida_uf   >= proyecto.precio_min_uf
                           and proyecto.precio_max_uf  <= 6000        # FOGAES cap
```

This never enters the ranking. It is an annotation telling the executive "this lead is worth qualifying for FOGAES/subsidio" — the same spirit as the existing `reorient` commercial action. **It is load-bearing, not an edge case:** §9 shows that at 20% pie the savings side binds for most realistic profiles, so this flag is often the difference between an empty panel and a usable one.

### 4.5 Edge cases

| Condition | `capacidad_status` | Capacity value | Notes |
| :-------- | :----------------- | :------------- | :---- |
| `ingreso_total <= 0` or missing | `requires_info` | `null` | **Never 0** — 0 must mean "enough data, no residual capacity" |
| `deuda_total >= 0.45 * ingreso_total` | `sin_capacidad` | `0` | Route to improvement plan, not to projects |
| `deuda_total > ingreso_total` | `sin_capacidad` | `0` | Also raises `deuda_actual_alta` + `carga_total_alta` |
| `ahorro_disponible = 0` | `sin_capacidad` | `0` | Correct for immediate purchase. Still compute `capacidad_por_renta_uf` to show future potential + the 10/15/20% savings gaps |
| `plazo_efectivo < 5` | `requires_info` | `null` | Age/term conflict |
| `edad` missing | `ok` | computed | `age_term_verified = false` — degrade data quality, do not block |
| Complemento incomplete | per `indicators.py` | computed w/o complement | `_valid_complement_income()` already returns 0.0 unless fully validated |

---

## 5. Matching criteria

### 5.1 Gates — pair excluded outright

Only two conditions exclude a lead–project pair. Everything else is scored, not gated.

| Gate | Rule | Rationale |
| :--- | :--- | :-------- |
| **Affordability** | `capacidad_compra_estimada_uf < proyecto.precio_min_uf` | They cannot buy the cheapest unit. Not a ranking question. |
| **Critical blocker** | any blocker with `severity = "critical"` (`morosidad_vigente`, `carga_total_alta`) | `commercial_priority.py` already refuses to route these (`do_not_route`). Matching must not contradict a shipped rule. |

Comuna, tipo, and financial classification are **never** gates (§2).

### 5.2 Affinity — starts at 100, penalties subtract

Mirrors the shape of `calculate_project_fit` so the two are reviewable by the same reader.

| Component | Max penalty | Rule |
| :-------- | ----------: | :--- |
| Holgura de capacidad | **−45** | Linear on the position of `capacidad` within `[precio_min_uf, precio_max_uf]`. At/above `precio_max` → 0. At `precio_min` → full −45. |
| Comuna | **−15** | Applied only when `comuna_objetivo` was declared **and** ≠ `proyecto.comuna` |
| Tipo | **−10** | Applied only on a declared mismatch |
| Clasificación financiera | **−15** | Alto → 0 · Medio → −8 · Bajo → −15 |
| Bloqueadores no críticos | **−15** | `high` −7 each, `medium` −4 each, capped at −15 |

```
afinidad >= 70 -> "Compatible"
afinidad >= 45 -> "Cercano"
afinidad <  45 -> "Marginal"
```

**The 45-vs-15 asymmetry is the point.** Capacity carries three times the weight of classification, and that *is* HU 10 E2 ("capacity beats classification") expressed numerically: a `Medio` lead sitting comfortably above `precio_max` scores ~92 and outranks an `Alto` lead scraping `precio_min` at ~55. Weighted equally, E2 would be unimplementable and the panel would merely re-sort the existing HU 2 dashboard.

<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
**Calibration status: v1, asserted from domain reasoning, not fitted.** There is no conversion history to calibrate against. Revisit once [[UserStories/HU16-ConversionDashboard|HU 16]] produces real outcome data.
========
**Calibration status: v1, asserted from domain reasoning, not fitted.** There is no conversion history to calibrate against. Revisit once [[UserStories/HU16-dashboard-conversion\|HU 16]] produces real outcome data.
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md

---

## 6. Bloqueador principal

Pair-specific, not lead-global. A lead who clears a UF 2.500 project but is pie-blocked on a UF 4.000 one has *different* main blockers on the two cards, and showing a generic lead-level blocker on both tells the executive nothing actionable.

### 6.1 Reference price and shortfall

`restriccion_vinculante` is a **lead-global** property — it always holds `"pie"` or `"renta"` whenever capacity computes. It therefore cannot by itself decide whether *this pair* has a blocker. The pair-scoped question is whether the lead falls short **of this project's reference price**:

| Case | Reference price `precio_ref_uf` | Meaning |
| :--- | :------------------------------ | :------ |
| Pair in `matches` (clears `precio_min`) | `precio_max_uf` | "what it takes to reach the top of this project's range" |
| Pair in `excluidos` (below `precio_min`) | `precio_min_uf` | "what it takes to qualify at all" |

```
brecha_valor_uf = max(0, precio_ref_uf - capacidad_compra_estimada_uf)
```

Because `capacidad_compra_estimada_uf = min(por_renta, por_pie)`, a positive `brecha_valor_uf` is by construction attributable to `restriccion_vinculante`. **A lead whose capacity reaches or exceeds `precio_ref_uf` has `brecha_valor_uf = 0` and therefore no pair-scoped blocker.**

Translate the shortfall into the resource the lead must actually add:

```
if restriccion_vinculante == "pie":
    brecha_recurso_clp = brecha_valor_uf * PIE_RATIO_BASE * uf_value_clp     # additional savings

if restriccion_vinculante == "renta":
    principal_req_uf   = precio_ref_uf * (1 - PIE_RATIO_BASE)
    dividendo_req_clp  = principal_req_uf / annuity_factor * uf_value_clp
    ingreso_req_clp    = dividendo_req_clp / RATIO_DIVIDENDO_MAX
    brecha_recurso_clp = max(0, ingreso_req_clp - ingreso_total)             # additional monthly income
```

### 6.2 Resolution order — first match wins

1. **Critical blocker present** → that blocker. (Pair is excluded anyway; this is the reason.)
2. **`brecha_valor_uf > 0` and `restriccion_vinculante = "pie"`** → `pie_insuficiente_para_proyecto`.
3. **`brecha_valor_uf > 0` and `restriccion_vinculante = "renta"`** → `renta_insuficiente_para_proyecto`.
4. **Any non-critical blocker** → highest severity; ties broken by declaration order in `blockers.py`, which is already deterministic and reviewable. No new precedence table.
5. **None** → `null`.

**The `brecha_valor_uf > 0` guard on steps 2–3 is load-bearing.** Without it, `restriccion_vinculante` — which is always set — makes steps 2–3 fire for every pair, so a lead comfortably above `precio_max_uf` would be shown a fabricated `pie_insuficiente_para_proyecto`, and steps 4–5 would be unreachable. With the guard, a lead who clears the whole price range correctly falls through to their real remaining blocker (step 4) or to `null` (step 5).

Steps 2–3 reuse the `main_gap` vocabulary (`"income"` / `"down_payment"`) already emitted by `project_fit.py`, so the frontend renders one concept. Steps 1 and 4 reuse `blockers.py` verbatim. Only two new codes are introduced, deliberately named so they cannot be confused with the lead-global `pie_insuficiente`.

---

## 7. Re-orientable opportunity

<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
[[UserStories/HU10-LeadProjectMatching|HU 10]] E4: *a user who can buy a project different from their declared objective must show as a re-orientable opportunity.*
========
[[UserStories/HU10-matching-lead-proyecto\|HU 10]] E4: *a user who can buy a project different from their declared objective must show as a re-orientable opportunity.*
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md

`commercial_priority.py` already emits a `reorient` action (`score >= 70 AND project_fit = "Fuera de alcance"`), but it is **lead-global and cannot name an alternative**. It says "reorient this person" and stops. Matching closes that gap. **`commercial_priority.py` is left untouched** — the HU 2 dashboard's behavior does not change and no shipped `/score` path needs re-verification.

A pair is `reorientable` when **all** hold:

1. it passes both gates (§5.1);
2. `afinidad >= 45` (`Cercano` or better);
3. **and at least one divergence:**
   - `comuna_objetivo` was declared and ≠ `proyecto.comuna`, **or**
   - the lead's `project_fit.status ∈ {out_of_reach, near}` against their declared objective while this pair is `Compatible`.

Condition 3's second branch reuses `project_fit`'s already-computed verdict as the "their own plan doesn't work" signal — so E4 comes essentially free from data `/score` already returns. No new computation, no new intake field.

**Stated consequence:** a lead with no declared `comuna_objetivo` cannot trigger branch one, and if `property_value` is unresolvable their `project_fit.status` is `requires_info` (not `out_of_reach`), so branch two cannot fire either. Such a lead is never re-orientable — only normally matched. This is intended: you cannot re-orient someone who never stated a direction. Recorded here so it is not later discovered as a bug.

---

## 8. Frozen contract

HU 10 codes against this verbatim.

### 8.1 Backend — additive keys inside `financial_indicators`

Computed by a new `backend/app/scoring_engine/purchase_capacity.py`. Purely additive; no existing key removed or retyped.

```python
"capacidad_compra_estimada_uf":     3060.4,
"capacidad_compra_estimada_clp":    125_013_000,
"capacidad_por_renta_uf":           4806.6,
"capacidad_por_pie_uf":             3059.6,
"capacidad_asistida_uf":            4272.0,        # FOGAES flag only, never ranked
"restriccion_vinculante":           "pie",          # "renta" | "pie" | None
"dividendo_maximo_sostenible_clp":  750_000,
"capacidad_status":                 "ok",           # "ok" | "requires_info" | "sin_capacidad"
"capacidad_supuestos": {
    "tasa_anual_uf":  0.040,
    "plazo_anios":    30,
    "plazo_origen":   "default",   # "declarado" | "default" | "capado_por_edad"
    "pie_ratio":      0.20,
    "uf_value_clp":   40695,
    "uf_fecha":       "2026-08-16",
    "age_term_verified": True,
    "version":        "e4-matching-v1"
}
```

<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
**`capacidad_supuestos` travels with the number, by design.** Without it, a capacity persisted in June and read in December is uninterpretable — you cannot tell whether it is low because the lead is weak or because the rate moved. This is what makes [[UserStories/NFR-EvaluationAudit|Evaluation Audit (NFR)]] / [[UserStories/NFR-ImmutableEvaluationHistory|Immutable Evaluation History (NFR)]] auditability real, and it costs one dict.
========
**`capacidad_supuestos` travels with the number, by design.** Without it, a capacity persisted in June and read in December is uninterpretable — you cannot tell whether it is low because the lead is weak or because the rate moved. This is what makes [[RNF/RNF4-auditoria-tecnica\|RNF 4]] / [[RNF/RNF5-historial-inmutable\|RNF 5]] auditability real, and it costs one dict.
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md

**`version` is separate from `ALGORITHM_VERSION`**, so matching criteria can be revised (once HU 16 supplies conversion data) without forcing a scoring-engine version bump.

### 8.2 Frontend — `services/leadProjectMatching.js`

Pure functions, no Supabase, vitest-coverable.

```js
matchLeadToProjects(evaluacion, proyectos) -> {
  matches: [ MatchRow ],    // sorted by afinidad desc
  excluidos: [ MatchRow ]   // gate failures, with motivo_exclusion
}

// MatchRow
{
  proyecto_id, proyecto_nombre, comuna, tipo, precio_min_uf, precio_max_uf,
  afinidad,                     // 0-100
  clasificacion,                // 'Compatible' | 'Cercano' | 'Marginal'
  motivo_exclusion,             // null on matches
  reorientable,                 // bool
  bloqueador_principal: {       // null when the lead clears precio_ref and has no
    codigo, titulo,             // remaining non-critical blocker -- see §6.2
    brecha_valor_uf,            // property-value shortfall vs precio_ref_uf (> 0)
    brecha_recurso_clp,         // savings (pie) or monthly income (renta) to add
    brecha_recurso_tipo         // 'ahorro' | 'ingreso' | null (steps 1 & 4)
  } | null,
  evidencia: {                  // HU 10 E3 lead card
    capacidad_uf, pie_disponible_uf, clasificacion_financiera,
    restriccion_vinculante, plazo_anios, plazo_origen,
    desbloqueable_con_fogaes
  }
}
```

Two separate arrays rather than one array with an `excluido` flag — a single array returns rows the UI must remember to filter, which is easy to get wrong. `excluidos` is still returned so HU 10 can offer a "ver descartados" toggle and so exclusions stay debuggable.

`matchLeadToProjects` takes a project array rather than fetching, keeping it pure and letting HU 10 decide whether to feed it `getAvailableProjects()` or a filtered subset.

### 8.3 Architecture seam

| Layer | Owns | Why |
| :---- | :--- | :-- |
| **Backend** `scoring_engine/purchase_capacity.py` | Capacity math | Pure financial computation belonging beside `indicators.py`; versioned under `ALGORITHM_VERSION`; persisted per evaluation → auditable (HU 16 / HU 33) |
<<<<<<<< HEAD:Wiki RutaHogar/research/spike1-e4-lead-project-matching-criteria.md
| **Frontend** `services/leadProjectMatching.js` | Affinity join | The catalog lives in the frontend + Supabase ([[UserStories/HU7-ProjectCatalog|HU 7]]); guardrail #5 forbids new FastAPI endpoints, so the backend cannot see `proyectos` |
========
| **Frontend** `services/leadProjectMatching.js` | Affinity join | The catalog lives in the frontend + Supabase ([[UserStories/HU7-catalogo-de-proyectos\|HU 7]]); guardrail #5 forbids new FastAPI endpoints, so the backend cannot see `proyectos` |
>>>>>>>> 61edf059b53d671e1959b37170de16c1fa94aac7:docs/research/spike1-e4-lead-project-matching-criteria.md

**Known cost — two sources of truth.** Constants would be defined in Python and could drift if re-declared in JS. Mitigation: this document is **normative**; both constant blocks must carry a comment naming it; and the frontend re-declares **only the affinity weights** (§5.2), never the capacity constants — capacity arrives pre-computed from the backend. Duplication is therefore confined to a table the backend never uses.

### 8.4 Dependency status

HU 7 is **planned but not merged** (`story-work/HU17/PLAN.md` — folder name from the E4 numbering). `matchLeadToProjects` consumes its frozen contract (`precio_min_uf`, `precio_max_uf`, `comuna`, `tipo`, `estado`, `ejecutivos`). HU 10 cannot ship before HU 7.

---

## 9. Worked examples

UF = $40.854,01 (2026-08-16) · tasa 4,0% · pie 20% · LTV 80%

### 9.1 Capacity

**Perfil 1 — entrada.** Ingreso $1.500.000 · deuda $100.000 · ahorro $12.000.000 · edad 32 · plazo 30

```
min(0,30 × 1.500.000 ; 0,45 × 1.500.000 − 100.000) = min(450.000 ; 575.000) = $450.000 = 11,01 UF
principal            = 11,01 × 209,466 = 2.307 UF
capacidad_por_renta  = 2.307 / 0,80    = 2.884 UF
capacidad_por_pie    = (12.000.000 / 0,20) / 40.854 = 1.468 UF
capacidad            = 1.468 UF ($60,0 MM)   restriccion_vinculante = "pie"
```

**Perfil 2 — medio.** Ingreso $2.500.000 · deuda $300.000 · ahorro $25.000.000 · edad 38 · plazo 30

```
min(750.000 ; 825.000) = $750.000 = 18,36 UF
principal            = 3.845 UF
capacidad_por_renta  = 4.807 UF
capacidad_por_pie    = 3.060 UF
capacidad            = 3.060 UF ($125,0 MM)  restriccion_vinculante = "pie"
```

**Perfil 3 — alto.** Ingreso $5.500.000 · deuda $500.000 · ahorro $80.000.000 · edad 42 · plazo declarado 25

```
min(1.650.000 ; 1.975.000) = $1.650.000 = 40,39 UF
principal            = 7.652 UF
capacidad_por_renta  = 9.565 UF
capacidad_por_pie    = 9.791 UF
capacidad            = 9.565 UF ($390,7 MM)  restriccion_vinculante = "renta"
```

**Plausibility.** 1.468 UF only reaches very economical housing, peripheral comunas, or a subsidised route. 3.060 UF is plausible for entry/mid projects in Puente Alto, San Bernardo, Cerrillos, La Florida, Estación Central — but not Ñuñoa/Providencia/Las Condes. 9.565 UF reaches upper-segment Ñuñoa, Providencia, lower Las Condes, but not upper Vitacura/Lo Barnechea.

### 9.2 Affinity

Perfil 2 (capacidad 3.060 UF, `Medio`, `comuna_objetivo = Ñuñoa`, blocker `pie_insuficiente` high) vs. **Altos de Macul** — Macul, departamento, 2.400–3.200 UF:

```
gates:      3.060 >= 2.400 OK  ·  no critical blocker  OK
holgura:    (3.060-2.400)/(3.200-2.400) = 0,825  ->  -45 × (1-0,825)  = -7,9
comuna:     Ñuñoa != Macul                                            = -15,0
tipo:       departamento == departamento                              =   0,0
clasif.:    Medio                                                     =  -8,0
blockers:   pie_insuficiente (high)                                   =  -7,0
                                                              afinidad = 62,1  -> "Cercano"

reorientable = true            (gates OK · 62,1 >= 45 · comuna diverges)

precio_ref      = precio_max = 3.200 UF        (pair is in `matches`)
brecha_valor    = max(0 ; 3.200 − 3.060) = 140,4 UF     > 0  -> step 2 fires
bloqueador      = pie_insuficiente_para_proyecto        (restriccion = "pie")
brecha_recurso  = 140,4 × 0,20 × 40.854 ≈ $1,15 MM in additional savings
```

That gap figure is the deliverable's payoff: the executive is told the lead needs roughly **$1,15 MM more in savings** to reach the top of this project's range — not merely that they are "Medio".

**Contrast — same lead vs. Parque Lo Espejo** (Lo Espejo, departamento, 1.800–2.600 UF), which demonstrates the §6.2 guard:

```
gates:      3.060 >= 1.800 OK  ·  no critical blocker  OK
holgura:    capacidad 3.060 >= precio_max 2.600  ->  no penalty          =   0,0
comuna:     Ñuñoa != Lo Espejo                                           = -15,0
tipo:       departamento == departamento                                 =   0,0
clasif.:    Medio                                                        =  -8,0
blockers:   pie_insuficiente (high, lead-level)                          =  -7,0
                                                                afinidad = 70,0  -> "Compatible"

precio_ref      = 2.600 UF
brecha_valor    = max(0 ; 2.600 − 3.060) = 0            -> steps 2-3 SKIPPED
bloqueador      = pie_insuficiente                       (step 4: lead-level blocker)
brecha_recurso  = null
```

The lead clears this project's entire price range, so no pair-scoped shortfall is reported. Without the `brecha_valor_uf > 0` guard the card would have claimed `pie_insuficiente_para_proyecto` here — a blocker that does not exist for this pair. The same lead legitimately shows **different** main blockers on the two cards, which is the whole reason §6 is pair-scoped.

### 9.3 Sensitivity — why no band is carried

`capacidad_por_renta_uf` for Perfil 2 across the plausible rate/term grid:

| | 20 años | 25 años | 30 años |
| :-- | --: | --: | --: |
| **3,5%** | 3.956 | 4.584 | 5.110 |
| **4,0%** | 3.787 | 4.347 | **4.807** |
| **5,0%** | 3.477 | 3.925 | 4.275 |

`capacidad_por_pie_uf` = **3.060 UF** in every cell. Since capacity is the `min()`, **Perfil 2's capacity is 3.060 UF regardless of rate or term.** For Perfil 3 (income-bound) the same grid moves capacity 8.636–9.791 UF, about ±6%.

So the rate assumption is worth ~0–6% while the pie ratio choice (10% vs 20%) is worth **2×**. A displayed band would imply precision the self-declared inputs do not support, and ranking needs a total order anyway — collapsing a band back to one number just relocates the decision into HU 10 undocumented. Scenarios belong to HU 18; matching uses one base case.

---

## 10. Findings on existing code

Raised by this research, **outside E4's scope to fix**. Recorded so they are decided rather than inherited silently.

### 10.1 Complementary debt is dropped — capacity inflation

`indicators.py` adds validated complementary *income* to `ingreso_total`, but `deuda` remains `deuda_mensual` alone. `_valid_complement_income()` **requires** `deuda_mensual_complementario` to be declared, then discards it.

Every ratio and every capacity figure for a lead with a complemento is therefore **overstated**. §4.1 specifies `deuda_total` including the complementary side; if `indicators.py` is not corrected, the capacity model inherits the inflation. **Recommend routing to HU 3 / HU 23 as a defect.**

### 10.2 `project_fit.py` vs `blockers.py` — 25% vs 30%

Not a bug; two policies. Resolved in §3.4 (30% calculates, 25% speaks). If `project_fit.py` is ever revised, `required_income = dividendo_estimado * 4` should be reconciled with the total-burden rule rather than left as a lone 25% ratio.

### 10.3 `edad_fin_credito > 70` is conservative — intentionally

The market allows 76–79 with insurance. HU 29 E2 independently specifies 70. **Keep it**, but the commercial copy should read *"requiere revisión de plazo/seguro"* rather than *"no viable"*.

### 10.4 `VALOR_UF_CLP` hardcoded

0,39% stale today; drifts. Mitigated for matching by making UF canonical (§3.3). Should eventually be injected daily with its date recorded.

### 10.5 No `primera_vivienda` field

FOGAES eligibility cannot be verified from current intake, which is why §4.4 emits a flag rather than a capacity multiplier. **If the client's catalog sits mostly under UF 4.500–6.000, FOGAES is the normal case rather than the exception**, and adding `primera_vivienda` to HU 1's form (a small change) would let capacity branch on `PIE_RATIO_ASISTIDO` directly. Flagged as the single highest-value follow-up.

---

## 11. Open items for the team

| # | Item | Owner | Blocking? |
| - | :--- | :---- | :-------- |
| 1 | UF price range of the client's real projects (Echeverría Izquierdo) — decides whether FOGAES is edge case or norm (§10.5) | Commercial | No — changes a default, not the model |
| 2 | Complementary-debt defect (§10.1) | HU 3 / HU 23 | No — capacity spec already accounts for it |
| 3 | Affinity weights are uncalibrated (§5.2) | HU 16 | No — v1 ships, revisit with data |
| 4 | HU 7 not merged (§8.4) | HU 7 | **Yes for HU 10** |
| 5 | Spike 1 E5 consolidation must reference this document rather than restate it | Spike 1 | No |

---

## 12. Sources

**Regulatory / official**
- [CMF Educa — ¿Tengo capacidad de pago para contratar un crédito hipotecario?](https://www.cmfchile.cl/educa/621/w3-article-27502.html)
- [CMF Educa — Carga financiera](https://www.cmfchile.cl/educa/621/w3-propertyvalue-48398.html)
- [Banco Central — tasa promedio vivienda UF > 3 años (F022.VIV.TIP.MA03.UF.Z.M)](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M)
- [Banco Central — tasas de interés](https://www.bcentral.cl/areas/estadisticas/tasas-de-interes)
- [FOGAES — requisitos](https://fogaes.cl/sitio/requisitos/)
- [Gob.cl — nuevo Fogaes](https://www.gob.cl/noticias/nuevo-fogaes-compra-vivienda-credito-hipotecario-ley-subsidio-dividendo/)
- [MINVU — subsidio al crédito hipotecario](https://www.minvu.gob.cl/nuevo-subsidio-al-credito-hipotecario/)
- [SII — valor UF 2026](https://www.sii.cl/valores_y_fechas/uf/uf2026.htm)

**Bank published terms** (LTV, carga financiera, plazo, edad)
- [BancoEstado / Enlace Inmobiliario — FAQ](https://bancoestado.enlaceinmobiliario.cl/preguntas-frecuentes/contratar-credito-hipotecario) · [Bci](https://www.bci.cl/personas/credito-hipotecario) · [Santander](https://banco.santander.cl/personas/credito-hipotecario) · [Scotiabank](https://www.scotiabankchile.cl/credito-hipotecario) · [Itaú](https://www.itau.cl/personas/creditos/credito-hipotecario) · [Coopeuch](https://www.coopeuch.cl/personas/credito-hipotecario.html) · [Renta Nacional — mutuos hipotecarios](https://mutuoshipotecarios.rentanacional.cl/)

**Internal**
- `backend/app/scoring_engine/` — `indicators.py`, `project_fit.py`, `blockers.py`, `commercial_priority.py`, `constants.py`
- [[research/scoring_improvement_recommendations|Scoring Improvement Recommendations]] · [[research/competitor_prequalification_audit|Competitor Prequalification Audit]]
- `story-work/HU17/PLAN.md` — project catalog frozen contract (folder name from the E4 numbering; the story is now HU 7)
