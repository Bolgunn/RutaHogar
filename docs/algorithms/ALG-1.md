# ALG-1 — Initial weighted scoring

| Field | Value |
| :---- | :---- |
| **Version** | Design draft; baseline ALGORITHM_VERSION = `1.1.0-prep`, runtime SCORING_VERSION = `1.1.0`. New runtime version pending implementation. |
| **Runs on / implemented in** | Backend · `components.py`, `constants.py`, aggregation in `scoring.py`. Redesign not implemented. |
| **Cases** | `ALG-1-cases.json` · 10 scenarios plus 4 branch variants; no runner added |
| **Open assumptions** | 0 business decisions · closed log and PLAN handoff below |
| **Last changed** | 2026-09-18 · close financial completeness, complementary debt, zero-capacity and market-failure decisions |

## Purpose

Preserve current components, weights, numeric thresholds, rounding, caps and classification
rules. Replace the ahorro/pie property reference with financial capacity from
[ALG-9](ALG-9-purchase-capacity.md). BCCh provides market observations through infrastructure;
it is not a new score component, bonus or penalty.

Both `comuna_objetivo` and the second comuna are catalog/matching preferences only.
Changing, adding or removing either must not alter initial components, blockers, score or
classification. No initial scoring path may use comuna prices or their average as a fallback.
This is a future specification; no product code or `POST /score` contract is changed.

## Inputs → outputs

- `data`: income, debt and declared dividend in CLP/month; savings in CLP; age and declared
  term in years; contract, continuity, morosidad and complementary-income declarations.
- `indicators`: dimensionless payment, debt, total-burden and savings ratios. ALG-9 receives
  the already-resolved market snapshot and provides the savings reference.
- `blockers`: existing objects with `code` and `severity`; detection remains owned by
  `backend/app/scoring_engine/blockers.py`. No new algorithm document is introduced.
- `component_scores`: exactly the seven numeric keys below, each clamped to [0,100] and
  rounded to one decimal. Aggregation returns existing `base_score`, `adjusted_score`,
  `score`, `original_classification`, `classification` and explanation fields.

Retain `indicators.py::_valid_complement_income`: complementary income counts only with
complemento enabled, positive income, declared debt, morosidad `no`, contract and continuity
present, and relation other than `amigo`, `otro` or missing. Canonical complementary fields
take precedence over `complemento_*` aliases. Use the same accepted financial scope in both
algorithms: when complementary income is considered, include its normalized monthly debt too;
when it is not considered, exclude both its income and debt from combined ratios/capacity.
Thus `ingreso_total = ingreso_principal + ingreso_complementario_considerado` and
`deuda_total = deuda_principal + deuda_complementaria_considerada`.
A declared zero complementary debt is valid; a missing debt prevents accepting that income.
This does not change complement eligibility or its component/blocker penalties.

## Rules

Risk thresholds, weights and caps below are transcribed from the named functions/constants.
Financial-only completeness is the explicitly authorized exception documented in A2.
These are product rules, not newly asserted banking standards; no risk calibration is introduced.
Component functions emit numbers, not messages; existing explanation generation remains separate.

| Component | Weight | Source |
| :-------- | -----: | :----- |
| `capacidad_pago` | 0.25 | `constants.py::SCORING_WEIGHTS` |
| `endeudamiento` | 0.20 | same |
| `pie_ahorro` | 0.20 | same |
| `estabilidad_laboral` | 0.15 | same |
| `historial_pago` | 0.10 | same |
| `complemento_renta` | 0.05 | same |
| `calidad_datos` | 0.05 | same |

### Payment and debt

Source: `components.py::_score_payment_capacity` and `_score_debt`.

| Condition | Points / effect |
| :-------- | :-------------- |
| Payment ratio missing/invalid | 0 |
| Payment ratio ≤ 0.25 | 100 |
| 0.25 < ratio ≤ 0.30 | 80 |
| 0.30 < ratio ≤ 0.40 | 55 |
| ratio > 0.40 | 25 |
| Both debt and total-burden ratios missing | 0 |
| Otherwise debt baseline | 100 |
| Debt ratio > 0.40 / > 0.30 / > 0.20 | subtract 45 / 25 / 10; first matching branch |
| Total burden > 0.45 / > 0.35 / > 0.25 | subtract 50 / 25 / 10; first matching branch |

Debt and total-burden deductions accumulate. A missing ratio contributes no deduction when
the other exists. Negative/non-numeric ratios are missing, as in `_ratio_or_none`.
Payment ratio is declared dividend / ingreso_total; debt ratio is deuda_total / ingreso_total;
total burden is (deuda_total + declared dividend) / ingreso_total. The same deuda_total must
reach initial-scoring indicators and their debt/burden blockers, and ALG-9's dividend ceiling.
Do not count complementary income while dropping its debt, or count that debt twice.

### Savings

Source: `components.py::_score_savings`. Let `V` be ALG-9's **unrounded income-supported
property value in CLP**: `principal_maximo_clp / snapshot.ltv_referencial`.
For positive V, `p = pie_ratio = ahorro_disponible / V`.

Do not divide by the final `min(por_renta, por_pie)`: when savings bind, that would mechanically
produce `1-LTV`, hiding the shortfall. Neither a comuna price nor a declared target price is
the initial savings reference.

| Condition | Points |
| :-------- | :----- |
| p ≥ 0.20 | 100 |
| 0.15 ≤ p < 0.20 | `82 + min((p-0.15)/0.05, 1)*13` |
| 0.10 ≤ p < 0.15 | `58 + min((p-0.10)/0.05, 1)*18` |
| 0 < p < 0.10 | `20 + min(p/0.10, 1)*35` |
| p = 0 | 0 |
| Missing p; recommended coverage ≥ 1 | 100 |
| Missing p; minimum coverage ≥ 1 | `65 + min(recommended_coverage, 1)*25` |
| Missing p; minimum coverage > 0 | `20 + min(minimum_coverage, 1)*35` |
| Otherwise | 0 |

Preserve discontinuities at 0.10, 0.15 and 0.20. Coverage denominators and pie amounts use the
same V: minimum `0.10*V`, intermediate `0.15*V`, recommended `0.20*V`; brechas remain
`max(pie_amount-ahorro,0)`. Scoring thresholds stay fixed even when LTV changes.
`1-LTV` is ALG-9's financing requirement, not a replacement scoring threshold.
For valid computed income capacity <= 0, the mortgage pie_ratio and coverages are 0;
`ahorro_disponible` remains the declared nominal amount. This is not the zero-savings case:
positive savings can coexist with zero borrowing capacity. V is nonnegative by construction.
Invalid/missing snapshot is not zero capacity: use the last valid snapshot through infrastructure.
If none exists, stop the evaluation as a controlled market-data failure before aggregation.
Do not use the component's missing-ratio fallback to manufacture a final score, zero score or
classification. Do not renormalize the other component weights or persist a completed evaluation.
Financial declarations, including savings, remain intact for a later explicitly requested
evaluation. See ALG-9 R5; the failure is not a new score classification.

### Work stability and payment history

Source: `_score_work_stability`, `_score_payment_history`.

| Condition | Points / effect |
| :-------- | :-------------- |
| Work baseline | 60 |
| Contract indefinido / independiente / plazo_fijo / honorarios_variable / other | +25 / -5 / -25 / -20 / -20 |
| Continuity mas_3_anios / entre_1_y_3_anios / entre_6_y_12_meses / menos_6_meses / other | +15 / +5 / -15 / -30 / -15 |
| Morosidad no / no_lo_se / si / other | 100 / 45 / 15 / 0 |

### Complementary income

Source: `_score_income_complement`.

| Condition | Points / effect |
| :-------- | :-------------- |
| Complemento disabled | return 50 |
| Enabled with `complemento_incompleto` blocker | return 20 |
| Otherwise baseline | 75 |
| Complementary income ≤ 0 | -25 |
| Positive complementary income and debt > 0.40 of that income | -25 |
| Complementary morosidad si / no_lo_se | -45 / -20 |
| Contract plazo_fijo or honorarios_variable / indefinido | -15 / +10 |
| Continuity menos_6_meses / entre_1_y_3_anios or mas_3_anios | -20 / +10 |
| Relation amigo or otro, or blocker `complemento_debil` | -20 once |

Other conditions add nothing. Apply all applicable rows after early returns, then clamp.

### Data quality

The current code splits completeness into 80 points for key fields plus up to 20 for optional
property/comuna fields. That split is superseded by the user's financial-only completeness decision.
The target formula is:

`calidad_datos = round(clamp(100 * completed_financial_fields / 9 - penalty, 0, 100), 1)`

The nine fields are `ingreso_mensual`, `deuda_mensual`, `ahorro_disponible`,
`dividendo_estimado`, `edad`, `plazo_credito_hipotecario`, `tipo_contrato`,
`continuidad_laboral`, `morosidad_actual`. Age and term are relevant to mortgage duration;
contract/continuity/history are financial-risk inputs. Each has equal completeness contribution.
Present means neither null nor empty string, as before; zero counts.
`penalty = 35` for `complemento_incompleto`, otherwise 0, unchanged.
A snapshot fallback does not pretend the user declared a term; an absent declaration remains absent.

Neither comuna, second comuna, `property_value_clp`, `property_value_uf`,
`property_value`, their aliases, nor snapshot availability adds completeness points.
Declared objective prices no longer affect initial scoring through this component.
There are no replacement optional fields. Complete financial information reaches 100 without
catalog preferences or a target price; the component's weight remains 0.05.
100 is the existing component scale maximum, 9 is the existing key-field count, and 35 is the
existing penalty. This required completeness change introduces no new weight or risk threshold.
Its derivation and authorization are recorded in A2.

### Aggregation and classification

Preserved boundary with `scoring.py`:
`base_score = round(clamp(sum(component_score * weight),0,100),1)`.
Weights sum to 1. Apply the lowest active cap without increasing the base score.

| Condition | Effect | Source |
| :-------- | :----- | :----- |
| `pie_insuficiente` | cap 74 | `_apply_blocker_score_caps` |
| `dividendo_exigente` | cap 69 | same |
| `carga_total_alta` or `morosidad_vigente` | cap 59 | same |
| Score ≥ 75 / ≥ 50 / otherwise | Alto / Medio / Bajo | `_classify_weighted_score`, first matching branch |
| `complemento_incompleto` | final `Requiere antecedentes` | `_apply_final_classification` |

`score=adjusted_score`. Original classification uses base score; final classification uses
adjusted score except the incomplete-complement override. Preserve blocker thresholds and
severities; savings blockers must use V too, or comuna would still leak into classification.
No new blocker or classification is introduced.

## Invariants and edge cases

- Same financial declarations, resolved snapshot and blockers produce identical results.
- Adding, changing or removing either comuna leaves initial scoring unchanged.
- Completed evaluations have components/scores in [0,100]; caps never increase score.
- Without a usable snapshot, there is no completed score or classification, not a zero score.
- More savings with other financial inputs/snapshot fixed never lowers `pie_ahorro`.
- Market changes can change the savings reference and derived savings blockers, but never
  weights, score thresholds or existing evaluations. Preserve their snapshot and result.
- No API, clock, randomness or AI belongs in the pure calculation.
- Cases are component/aggregation contracts with explicit indicators/blockers, not endpoint
  tests. `expect` is a recursive partial assertion. `same_result_as` requires full equality.
  Synthetic inputs are branch probes, not market observations or policy thresholds.
  Cases with `scope=financial_scope` additionally assert the shared income/debt selection before
  components; `scope=evaluation_precondition` asserts the controlled-failure boundary, not
  a call to components with null market data. `expect_integration` describes integration outcomes,
  not additions to the public response contract. The normal component fixtures assume a valid
  resolved snapshot has already passed that boundary.
  Nested `variants` have complete inputs and their own expectations and must also be asserted.

## Assumptions log

| ID | Assumption | Made by | Date | Would be wrong if | Status |
| :-- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | Preserve numeric risk thresholds, weights, caps and savings discontinuities | User confirmation of existing code | 2026-09-18 | A later task explicitly changes scoring policy | confirmed |
| A2 | Financial-only completeness uses the existing nine key fields across the existing 0–100 scale, retains penalty 35 and weight 0.05; no optional price/comuna bonus | User decision; Codex documents normalization 100*n/9 | 2026-09-18 | A later decision changes the financial field set | closed; supersedes 80+optional scheme |
| A3 | Income capacity <=0 implies mortgage pie_ratio=0, preserving nominal savings; invalid snapshot never fabricates score | User decision | 2026-09-18 | Market-data failure is confused with computed zero capacity | confirmed |
| A4 | Include complementary monthly debt exactly when its income is considered, consistently in ALG-1/ALG-9 | User decision; common accepted financial scope | 2026-09-18 | Either path uses different eligibility or double-counts debt | closed; supersedes principal-only ALG-1 / unconditional ALG-9 debt |

## PLAN handoff

No business-rule assumption blocks writing the PLAN. It must reference these decisions and
plan snapshot resolution/storage, controlled-failure transport using the existing API error path,
shared financial normalization, fixture-runner adaptation and runtime versioning. It must not
invent a score/classification for service unavailability, reopen weights/thresholds, or recalculate
historical evaluations. No PLAN or implementation is produced in this task.

## Contradictions with current code

- `property_value.py` resolves declared prices, then comuna prices, then their average.
  `scoring.py` also uses `PRECIOS_REFERENCIA_UF` for legacy risks/recommendations and patrimony.
  Replacing only the ratio would leave other evaluation paths dependent on comuna.
- `indicators.py` derives pie from property value. ALG-9 currently runs afterwards without
  replacing that ratio. Future dependency order: resolve income → ALG-9 → financial savings
  indicators → blockers → components → aggregation.
- `calidad_datos` currently rewards comuna/property presence and uses the 80+optional split;
  A2 replaces it with financial-only completeness while preserving its component weight.
- `indicators.py` ignores complementary debt, while ALG-9 adds it regardless of income
  acceptance. Both conflict with the now-closed common financial-scope rule.
- The orchestrator still executes legacy additive calculations but overwrites their score
  with the weighted result. `backend/app/REGLAS_SCORING.md` describes the old base-50, 70/40
  model; it is historical source material, not this specification's numeric authority.
- Constants describe preparatory layers although the orchestrator calls them. Feeding capacity
  into initial score changes a rule: the old additive-only version rationale no longer applies.
- Snapshot storage, controlled-failure wiring and new runtime version require a later build.
  This document does not change the API, storage, product code or historical evaluations.
