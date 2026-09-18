# ALG-9 — Snapshot-based purchase capacity

| Field | Value |
| :---- | :---- |
| **Version** | Design draft; implementation baseline MATCHING_VERSION = `e4-matching-v1`. New runtime version pending implementation alongside ALG-1. |
| **Runs on / implemented in** | Backend pure layer · `scoring_engine/purchase_capacity.py`; snapshot contract not implemented |
| **Cases** | `ALG-9-cases.json` · 10 scenarios plus 7 branch variants; current runner requires later adaptation |
| **Open assumptions** | 0 business decisions · closed log and PLAN handoff below |
| **Last changed** | 2026-09-18 · close BCCh sources, controlled failure, zero-capacity and shared debt decisions |

## Purpose

Compute maximum mortgage principal, income-supported property value, savings-supported property
value and their minimum. Supply the income-supported value to [ALG-1](ALG-1.md) as its savings
reference. BCCh is a market data source, never a new score component.

ALG-9 receives a resolved snapshot. It never calls APIs, reads a cache/database, consults a clock
or chooses a newer snapshot. Both comunas are catalog/matching preferences only. No comuna,
average price or target property price enters initial capacity or savings scoring.
`dividendo_estimado` still feeds ALG-1 payment ratios but does not constrain ALG-9.

This future specification changes no product code, endpoint, frontend, database or migration.
No backfill or recalculation of historical evaluations is authorized.

## Inputs → outputs

### Financial inputs

| Field | Type · unit | Rule |
| :---- | :---------- | :--- |
| `ingreso_total` | number · CLP/month, from indicators | Principal plus validated complementary income; retain `indicators.py::_valid_complement_income` |
| `deuda_mensual` | number · CLP/month | Principal debt |
| `deuda_mensual_complementario` / `complemento_deuda_mensual` | number · CLP/month | First nonempty alias; include only when complementary income is considered, using the same decision as ALG-1 |
| `ahorro_disponible` | number · CLP | Missing/nonpositive becomes 0, as current code |
| `edad` | number · years | Positive age activates cap; absent/nonpositive means unverified |
| `plazo_credito_hipotecario` | number · years | Positive declared value wins; otherwise use snapshot term |
| `market_snapshot` | object | Complete resolved bundle, immutable for this evaluation |

Retain existing `_positive_float` and complementary-alias semantics for finite financial inputs.
Reject nonfinite financial inputs at the boundary. Snapshot validation never substitutes a
hardcoded market value.

### Required snapshot

| Field | Type · unit | Validity / interpretation |
| :---- | :---------- | :------------------------ |
| `uf_value_clp` | finite number · CLP/UF | > 0 |
| `tasa_anual_uf` | finite number · annual ratio | ≥ 0; nominal convention, monthly rate = annual / 12 |
| `ltv_referencial` | finite number · loan/property ratio | Strictly between 0 and 1 |
| `plazo_referencial_anios` | positive finite number · years | BCCh term percentile 50 in months / 12; do not truncate fractional years; required even with declared term |
| `effective_date` | string · ISO calendar date | As-of cutoff used to resolve the bundle; preserve individual observation dates in source |
| `fetched_at` | string · ISO timestamp with timezone | Retrieval time, not evaluation time |
| `source` | object with four field keys | Per-field BCCh dataset/series, units, observation effective_date and fetched_at; see mapping below |

### Closed BCCh source mapping

| Snapshot field | BCCh series / selector | Source-unit conversion |
| :------------- | :--------------------- | :--------------------- |
| `uf_value_clp` | `F073.UFF.PRE.Z.D` · Unidad de Fomento | CLP/UF unchanged |
| `tasa_anual_uf` | `F022.VIV.TIP.MA03.UF.Z.M` · tasa vivienda >3 años, UF | Annual percentage / 100; preserve existing monthly convention annual ratio / 12 |
| `ltv_referencial` | `F034.RPV.PPO.BCCH.Z.Z.T` · LTV promedio ponderado | Percentage / 100 |
| `plazo_referencial_anios` | “Plazo de créditos hipotecarios para la vivienda”, selector “Percentil 50” | Published months / 12, without rounding to integer years |

The choice is a user decision, not a configurable fallback to other series or percentiles.
Official references: [UF series code](https://si3.bcentral.cl/estadisticas/Principal1/Web_Services/ayuda_soporte.html),
[housing rate](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_TASA_INTERES/MN_TASA_INTERES_09/TSF_27?idSerie=F022.VIV.TIP.MA03.UF.Z.M),
[weighted LTV](https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_ESTADIST_EXPERIM/MN_EXPERIM01/IVM_ECRED_02?idSerie=F034.RPV.PPO.BCCH.Z.Z.T)
and [term table, percentile 50](https://si3.bcentral.cl/Siete/ES/Siete/Cuadro/CAP_IND_VIVIENDA/MN_IND_VIVIENDA/IVM_ECRED_01/638290046022543847).
The term table publishes months. LTV is a weighted market observation, not a bank's guaranteed
offer. Source mappings were checked on 2026-09-18; fixture values are not quotations.

`source` has keys `uf_value_clp`, `tasa_anual_uf`, `ltv_referencial`,
`plazo_referencial_anios`. Each entry records provider `BCCh BDE`, series (the exact code above,
or the exact term dataset name), statistic (`Percentil 50` for term), original unit,
`effective_date` and timezone-aware `fetched_at`. Term source also records the table URL;
the connector must bind that row, not guess a series identifier.

For each source, infrastructure chooses the latest published available observation on or before
the bundle's as-of cutoff. Record each actual observation date separately because frequencies
differ; for period-valued observations also retain the published period label (e.g. quarter).
Do not relabel a quarterly LTV as daily. Bundle `fetched_at` is successful bundle retrieval/
resolution time; individual retrieval times remain in source. Those are audit facts, not a clock
read inside ALG-9. Missing provenance or required values makes a candidate snapshot invalid.
The PLAN must specify connector mechanics and normalized period-date representation against
the BCCh metadata without changing these source selections.

Values are ratios: 0.04 means 4%, not 4. 100 converts percentages, 12 converts months/years;
neither is a new risk threshold. Zero/one are domain boundaries. No maximum rate or freshness
cutoff is introduced. Snapshot LTV and fallback term are observations, never local constants.

### Outputs

| Key | Type · unit | Meaning |
| :-- | :---------- | :------ |
| `principal_maximo_uf` | number · UF, 1 decimal, or null | Maximum mortgage principal |
| `principal_maximo_clp` | integer · CLP, or null | Same principal, rounded for output |
| `capacidad_por_renta_uf` | number · UF, 1 decimal, or null | Principal / LTV, unrounded operands |
| `valor_vivienda_soportable_por_renta_clp` | number · CLP, unrounded, or null | Reference V for ALG-1 |
| `pie_ratio` | number · ratio, unrounded, or null | Savings / V |
| `capacidad_por_pie_uf` | number · UF, 1 decimal, or null | Savings-supported ceiling |
| `capacidad_compra_estimada_uf` | number · UF, 1 decimal, or null | Minimum of both ceilings |
| `capacidad_compra_estimada_clp` | integer · CLP, or null | Minimum converted before rounding UF |
| `capacidad_asistida_uf` | number · UF, 1 decimal, or null | Existing assisted annotation; never initial score or ranking capacity |
| `restriccion_vinculante` | renta / pie / null | Ties choose renta before rounding |
| `dividendo_maximo_sostenible_clp` | integer · CLP/month, or null | Sustainable payment |
| `capacidad_status` | ok / sin_capacidad / requires_info | Existing vocabulary |
| `capacidad_supuestos` | object, always emitted | Audit information below |

Retain supuestos keys `tasa_anual_uf`, `plazo_anios`, `plazo_origen` (declarado/default/
capado_por_edad), `pie_ratio`, `ratio_dividendo_max`, `ratio_dividendo_saludable`,
`fogaes_tope_uf`, `fogaes_tope_con_subsidio_uf`, `fogaes_pie_ratio`, `uf_value_clp`,
`uf_fecha`, `age_term_verified`, `plazo_bajo_minimo`, `version`.
Add `market_snapshot` (exact resolved bundle) and `snapshot_valid` (boolean).

Here `supuestos.pie_ratio=1-LTV` is the **required financing pie**, distinct from output
`pie_ratio=ahorro/V`. `uf_fecha` comes from `source.uf_value_clp.effective_date`, not the
bundle cutoff or a hardcoded date. Effective `plazo_anios` preserves a fractional declared
term without current code's integer truncation in audit metadata.

For an invalid snapshot, preserve the supplied snapshot (or null when absent), set
`snapshot_valid=false`, and set effective market/term assumptions to null. Retain internal
policy constants and version. For valid snapshot but missing income, retain valid assumptions.
On either `requires_info` path all numeric results and binding side are null.

These are pure-layer names, not additions to the frozen `POST /score` contract. A future build
must define compatible transport/persistence before exposing fields.

## Rules

### R1 — Sustainable dividend (unchanged ratios; consistent financial scope)

`deuda_total = deuda_mensual + deuda_complementaria_considerada`.
Use ALG-1's unchanged complementary-income eligibility: if its income is accepted, its normalized
monthly debt is included; otherwise neither contributes. Missing complementary debt prevents
accepting its income; zero debt is valid. ALG-1 ratios/blockers and ALG-9 use this same total.
No change to complement component penalties or eligibility thresholds is authorized.
`D = max(0, min(0.30*ingreso_total, 0.45*ingreso_total-deuda_total))`.

| Parameter / condition | Effect | Source |
| :-------------------- | :----- | :----- |
| RATIO_DIVIDENDO_MAX = 0.30 | Calculation ceiling | Existing `constants.py`, `_dividendo_maximo_sostenible` |
| RATIO_CARGA_TOTAL_MAX = 0.45 | Total burden ceiling | same |
| RATIO_DIVIDENDO_SALUDABLE = 0.25 | Prudential label, not a third minimum | Existing constants / prior ALG-9 |
| Debt ratio > 0.40 | No additional ALG-9 minimum | Current implementation; blockers separate |

Labels remain Holgado at ≤25%, Viable pero exigente at >25% and ≤30%, Fuera de política RutaHogar
at >30%; total burden >45% remains No avanzar sin revisión.
25% has numeric uses in ALG-1; its label-only role here is local to ALG-9.

### R2 — Effective term

| Condition | Effect | Source |
| :-------- | :----- | :----- |
| Positive declared term | Use it; origin declarado | Existing `_plazo_efectivo` |
| Otherwise | Snapshot reference term; origin default | User decision replacing fixed 30 |
| Positive age and shorter `max(0,70-edad)` | Cap term; origin capado_por_edad | EDAD_MAX_FIN_CREDITO = 70 |
| Age absent/nonpositive | No cap; age_term_verified=false | Current implementation |
| Effective term < 5 | plazo_bajo_minimo=true; warning, not missing information | PLAZO_MINIMO_VIABLE_ANIOS = 5 |
| Effective term = 0 | Principal and renta ceiling 0; pie still computed | Current implementation |

### R3 — Annuity and savings reference

Let U = snapshot UF, L = snapshot LTV, r = snapshot annual rate / 12,
n = effective term * 12, S = normalized savings. 12 is months per year
(current MESES_POR_ANIO), not a new policy threshold.

```text
annuity_factor = (1 - (1+r)^(-n)) / r      if r > 0
annuity_factor = n                        if r = 0
principal_maximo_clp_raw = D * annuity_factor
principal_maximo_uf_raw = principal_maximo_clp_raw / U
V = principal_maximo_clp_raw / L
por_renta_uf = V / U
pie_financiamiento = 1 - L
por_pie_uf = S / pie_financiamiento / U
capacidad_uf = min(por_renta_uf, por_pie_uf)
pie_ratio = S / V                         if V > 0
pie_ratio = 0                             if V <= 0 and calculation is valid
```

UF, rate, LTV (formerly 1-PIE_RATIO_BASE) and fallback term are snapshot inputs.
Internal 25/30/45% ratios, age/term policy and assisted rules stay unchanged.
No insurance, fee, inflation, stress or subsidy adjustment is added.
When income capacity <=0, the mortgage pie_ratio is 0 even if nominal savings are positive.
Keep ahorro_disponible intact: this rule changes neither the savings declaration nor the
term-independent savings ceiling. With valid inputs V cannot be negative; invalid data is
not reclassified as zero capacity.

V precedes the savings minimum: dividing by final capacity would make savings scoring circular.
ALG-1 retains its 10/15/20% thresholds even when snapshot LTV changes. Financing feasibility
and the existing scoring thresholds are different rules.

Keep full precision for intermediate calculations and V/pie_ratio. Only round output UF to
one decimal and displayed CLP amounts to integers, with current Python round semantics.
Binding side and status use unrounded values: tiny positive capacity may display 0.0 yet be ok.

### R4 — Assisted annotation (unchanged)

`capacidad_asistida_uf = min(principal_maximo_uf_raw/(1-0.10), S/0.10/U)`.

Reuse FOGAES_MIN_PIE_RATIO=0.10, FOGAES_MAX_PROPERTY_UF=6000 and
FOGAES_MAX_UF_CON_SUBSIDIO=3000 from existing constants, owned by benefits logic.
These are inherited code values, not a new legal-eligibility claim.
They travel in supuestos for ALG-10; ALG-9 does not cap the annotation at those property prices.
It neither grants eligibility nor increases initial score. With variable base LTV, assistance
does not necessarily double savings capacity, contrary to the old fixed-base explanation.

### R5 — Validation, infrastructure fallback and history

1. Infrastructure resolves and validates the complete snapshot before evaluation.
2. If BCCh retrieval fails or yields invalid data, infrastructure selects the last valid
   complete snapshot. Preserve original values, effective_date, fetched_at and source.
   Do not fabricate a new retrieval time, mix a partial update or substitute constants.
3. ALG-9 validates deterministically. Invalid/missing snapshot or nonpositive income returns
   requires_info with all numeric outputs and binding side null; supuestos is always present.
   Invalidity takes precedence even when age would give term zero. ALG-9 never fetches a fallback.
4. With valid inputs, zero headroom, zero savings or zero effective term gives sin_capacidad;
   otherwise ok. Positive terms below 5 still compute.
5. Every evaluation preserves the exact used snapshot, effective term, assumptions, algorithm
   version and result. Reading an old evaluation never fetches/recomputes. Only a new evaluation
   may use a newer snapshot. Historical backfill/recalculation is prohibited.
6. If no valid snapshot has ever existed, return a controlled market-data failure. The pure
   ALG-9 diagnostic remains requires_info with null numeric results and snapshot_valid=false.
   Orchestration stops before ALG-1 aggregation and does not manufacture any market-dependent
   component, base/adjusted/final score or classification, including zero or Requiere antecedentes.
   That classification still belongs only to its existing scoring rule, not upstream outage.
   Do not replace market-dependent weights with a score from the other components.
7. Do not persist this failed attempt as a completed scored evaluation. Preserve user financial
   declarations (including nominal savings) for an explicit later retry/new evaluation.
   Record a diagnostic reason distinguishing missing market reference from missing income.
   A failure diagnostic is not a new score status/classification or a successful API response.
   Suggested user message: “No fue posible obtener una referencia de mercado válida para completar
   la evaluación. Intenta nuevamente más tarde.” This does not blame the user's financial profile.
8. The PLAN must map this failure onto the existing error-handling path and decide storage/
   observability wiring. This task changes no HTTP status, endpoint contract or database schema.
   The fallback/failure behavior itself is closed; transport is an implementation-planning detail.

## Invariants and edge cases

- Same financial input plus same resolved snapshot yields identical complete output.
- Changing, adding or removing either comuna or changing a target property price has no effect.
- Computed capacities, principal and savings ratio are nonnegative; zero is distinct from null.
- Rounded capacity equals the minimum of rounded ceilings. Ties bind renta before rounding.
- Zero savings still computes renta and ratio 0; zero income yields nulls.
- Zero renta with positive savings gives mortgage pie_ratio=0 and preserves nominal savings.
- BCCh outage with a previous valid snapshot preserves the full snapshot and deterministic result;
  without one, no completed score/classification is produced.
- Rate 0 uses annuity limit n; LTV 0 or 1 is invalid, avoiding division by zero.
- Missing age degrades verification, not arithmetic. A short term is a finding, not missing data.
- Supuestos always travels with the number. No clock, randomness, AI or I/O enters this function.
- No new output or golden-fixture compatibility is claimed for the current endpoint.

## Assumptions log

| ID | Assumption | Made by | Date | Would be wrong if | Status |
| :-- | :--------- | :------ | :--- | :---------------- | :----- |
| A1 | Keep annual ratio/12 convention and existing annuity, without fees/insurance | User instruction to keep other rules; existing code | 2026-09-18 | A future task changes the annuity convention | confirmed |
| A2 | Complementary income and its debt share the same acceptance decision in ALG-1/ALG-9 | User decision | 2026-09-18 | Paths use different financial scopes | closed; replaces old discrepancy |
| A3 | Preserve age cap 70 and short-term warning 5, not a refusal | User instruction / existing constants | 2026-09-18 | A future task changes term policy | confirmed |
| A4 | Income capacity <=0 gives mortgage pie_ratio=0; nominal savings stay intact | User decision | 2026-09-18 | Invalid snapshot is incorrectly treated as zero capacity | confirmed |
| A5 | Use the three exact BCCh series and term percentile 50 above; keep per-field source/effective_date/fetched_at and bundle provenance; convert months without truncation | User source selection; Codex provenance specification | 2026-09-18 | Connector selects another statistic or misstates observation dates/units | closed |
| A6 | No last valid snapshot means controlled failure: no fabricated capacity or completed score/classification | User decision | 2026-09-18 | Integration silently substitutes market defaults or persists a successful score | closed; transport belongs in PLAN |
| A7 | On BCCh failure, use the unchanged last valid complete snapshot; no invented freshness cutoff | User decision | 2026-09-18 | A future task explicitly approves a different freshness policy | confirmed |
| A8 | Fixtures are synthetic, not live market quotes; legacy amounts and rates remain branch probes. Fractional term probes derive from months/12; financial-scope variants change only debt acceptance | Codex fixture author | 2026-09-18 | Fixtures are used as production defaults | documented; not a policy assumption |

Earlier fixed-20%-base, unspecified-source, stale-UF and inconsistent-debt assumptions are superseded.
Weights, risk thresholds, annuity convention, 30% calculation / 25% label and assisted rules remain.

## PLAN handoff

No business-rule blocker remains for writing the PLAN. Plan the BCCh adapter (including binding the
named percentile-50 row and preserving original period metadata), snapshot storage/reuse, shared
income/debt normalization, controlled-error transport, test-runner changes and new runtime versions.
The exact term API identifier is an adapter lookup, not an undecided statistical choice; do not
invent it. These implementation details do not authorize product changes in this documentary task.
No historical evaluation is recalculated and no PLAN is written here.

## Contradictions with current code and test migration

- ALG-1 currently ignores complementary debt; ALG-9 includes it unconditionally. Neither matches
  the shared accepted financial scope defined here.
- Current signature accepts only data/indicators. Rate, base pie and fallback term are constants;
  UF silently falls back to a constant. No full snapshot validation/provenance exists there.
- Supuestos uses hardcoded uf_fecha even with injected UF. Maximum principal and ALG-1 pie_ratio
  are not emitted. Current term metadata truncates fractional years while arithmetic does not.
- Orchestration resolves target price before indicators and merges ALG-9 afterwards. ALG-1
  still uses target-price savings ratios; legacy initial paths also read comuna prices.
- The old claim that UF drift affects display only was incorrect: dividing CLP income/savings
  by UF changes UF capacity and therefore matching.
- The additive-only version rationale no longer applies when ALG-9 feeds initial scoring.
  A future build must assign new runtime versions while preserving historical evaluations.
- `backend/tests/test_purchase_capacity.py` passes no snapshot and asserts the old key set.
  These target fixtures intentionally require later runner/implementation changes; the existing
  suite is not expected to pass against them today. No test/product code is edited here.

## Case contract

Each input contains an explicit resolved market_snapshot; a future runner passes it to the
pure algorithm. This is not an authorized public request field. Expected objects are recursive
partial assertions. repeat_of and same_result_as require complete equality (the latter after
preference changes). Snapshots are duplicated so cases are self-contained.
Cases with `scope=infrastructure_fallback` first resolve the supplied last-valid snapshot and
then assert the pure result. `expect_integration` describes control-flow assertions, not new
public response fields. Nested `variants` are additional branch probes attached to a scenario;
each input is complete and has its own expectations. All scenarios remain documentary targets.

Rounded outputs use exact comparison. Unrounded V and both pie_ratio fields use fixture tolerances
1e-6 CLP and 1e-12 ratio, respectively: test-precision assumptions, not business thresholds.
All dates/amounts are synthetic fixtures or reused old examples, never live BCCh observations.
