# ScoreLeads Scoring Improvement Recommendations

Reviewed: 2026-06-17  
Input evidence: `competitor_prequalification_audit.md`, `competitor_field_matrix.csv`, `inmobiliaria_field_matrix.csv`  
Constraint: no production code modified.

## Recommendation Summary

ScoreLeads already captures the industry core: income, debt, savings/pie, estimated dividend, employment type, continuity, morosidad, comuna, consent, and income complement.

The biggest improvement is to make the current score more mortgage-realistic without turning the form into a bank application:

1. Score total financial burden: `(deuda_mensual + dividendo_estimado) / ingreso_total`.
2. Replace binary income/dividend logic with tiered dividend-to-income bands.
3. Distinguish 10%, 15%, and 20% down payment levels.
4. Use complemento de renta as a numeric income amount plus relationship confidence, not a flat +5.
5. Treat subsidy/FOGAES and pie en cuotas as recommendation paths, not repayment-capacity boosts.
6. Add purchase timing and property-readiness signals to the sales dashboard, not the financial score.
7. Keep RUT/phone/email delayed until after the user gets value.

## Common Qualification Signals

Signals common across public flows and safe for ScoreLeads:

- `ingreso_mensual` / renta líquida.
- `dividendo_estimado`.
- Existing monthly obligations / other credit payments.
- Property value or target price.
- Down payment available and down-payment percentage.
- Property type and condition: house/apartment, new/used.
- Employment type and labor continuity.
- Morosidad / good credit behavior.
- Co-buyer/codebtor/complement income amount.
- Complement relationship.
- Subsidy/FOGAES interest or eligibility.
- Purchase timing.
- Property selected vs browsing.
- Owner-occupier vs investor intent.

Signals mostly useful for sales prioritization:

- Project selected.
- Desired comuna.
- Purchase timing.
- Preferred contact channel.
- Has property selected.
- Investor vs live-in intent.
- Existing property as part payment.
- Interest in pie en cuotas.

Signals seen in full bank/advisory applications but too invasive for ScoreLeads pre-score:

- RUT.
- Phone/email before value.
- Full address.
- Nationality/residency.
- Gender.
- Marital status.
- Dependents.
- Education/profession.
- Detailed assets, investments, vehicles.
- Document uploads.

## Visible Thresholds and Rules to Use

Use as policy direction, not as exact copy of competitor algorithms:

- TOCTOC uses max dividend = 25% of declared income.
- TOCTOC assumes 80% financing in calculator, equivalent to 20% pie.
- Casaverso requires pie between 10% and 90% of property value.
- MINVU/Casaverso subsidy/FOGAES guidance can reduce pie to 10% for eligible new homes.
- MINVU/Itaú/Casaverso/Renta Nacional reference new homes up to 4,000 UF for subsidy paths.
- Labor continuity standards vary widely: 3 months/1 year in TOCTOC versus 12/24 months in Banco Falabella.
- Age is mainly tied to maximum term/life insurance feasibility, not broad lead quality.

## Proposed Scoring Algorithm Improvements

### 1. Capacity: Use Dividend Ratio and Total Burden

Current:

- Income >= 4x dividend gives +25.
- Debt > 40% income gives -20.

Recommended:

Use `ingreso_total = ingreso_mensual + complemento_monto` when complemento is valid and complete.

Calculate:

```text
dividend_ratio = dividendo_estimado / ingreso_total
total_burden = (deuda_mensual + dividendo_estimado) / ingreso_total
```

Suggested scoring bands:

```text
dividend_ratio <= 0.25: +20
0.25 < dividend_ratio <= 0.30: +10
0.30 < dividend_ratio <= 0.35: -5
dividend_ratio > 0.35: -20

total_burden <= 0.35: +10
0.35 < total_burden <= 0.45: -5
total_burden > 0.45: -20
```

Why:

- 25% is a visible public benchmark.
- Creditú asks current monthly credit payments, indicating total burden matters.
- This is more nuanced than a single 4x threshold.

Actionability: `add_to_score`

### 2. Savings / Pie: Tier 10%, 15%, 20%

Current:

- >=20% reference price: +15.
- >=10%: +5.
- otherwise -20.

Recommended:

```text
pie_ratio >= 0.20: +15
0.15 <= pie_ratio < 0.20: +10
0.10 <= pie_ratio < 0.15: +3 and recommendation
pie_ratio < 0.10: -20
```

Explanation behavior:

- 20%: strong standard path.
- 15%-19.9%: promising, may need bank-specific or commercial support.
- 10%-14.9%: viable only if subsidy/FOGAES/new-home constraints fit.
- <10%: improvement path before commercial handoff.

Do not count `pie_en_cuotas` as current savings.

Actionability: `add_to_score`, `add_to_recommendations`

### 3. Complemento de Renta: Make It Quantitative

Current:

- `complemento_renta = true` gives flat +5.

Recommended:

- Use `complemento_monto` in `ingreso_total`.
- Keep relationship as a confidence/explanation modifier.
- Do not add a flat boost if amount is missing.

Suggested logic:

```text
if complemento_renta and complemento_monto > 0:
  ingreso_total = ingreso_mensual + complemento_monto
  use ingreso_total for dividend_ratio and total_burden

  if complemento_relacion in spouse/direct_family:
    +3 confidence modifier
  elif complemento_relacion is other:
    +0 and explanation to validate requirements
else:
  no complement boost
```

Recommended relationship options:

- `conyuge`
- `familiar_directo`
- `pareja_con_hijos_en_comun`
- `tercero`
- `otro`

Actionability: `add_to_score`, `add_to_recommendations`

### 4. Subsidy and FOGAES: Recommendation, Not Big Score Boost

Optional fields:

- `subsidio_habitacional`
- `fogaes_interes`
- `vivienda_nueva`
- `precio_propiedad_uf`

Recommended scoring:

- Do not use subsidy/FOGAES as a large positive score.
- Use it to soften recommendations when pie is 10%-15% and the property is eligible.
- Use it to avoid telling the user the case is impossible when a legitimate assistance path may exist.

Rules:

```text
if vivienda_nueva and precio_propiedad_uf <= 4000 and pie_ratio >= 0.10:
  add recommendation: evaluate FOGAES/subsidio a la tasa

if not vivienda_nueva:
  do not recommend new-home subsidy paths

if pie_ratio < 0.10:
  explain subsidy may help only after reaching minimum viable pie or if specific program applies
```

Actionability: `add_to_recommendations`

### 5. Employment and Continuity

Current rules are usable:

- Indefinite contract +10.
- Independent -5.
- >3 years +5.
- 6-12 months -8.
- <6 months -15.

Recommended refinement:

- Keep scoring rules stable for now.
- Improve explanation for independent workers and short tenure.
- Mention that public bank requirements vary widely, so ScoreLeads is a guide.
- Consider `continuidad_laboral` thresholds differently for independent workers later if evidence from bank partners supports it.

Actionability: `add_to_recommendations`

### 6. Morosidad

Keep current penalties:

- `si`: strong penalty.
- `no_lo_se`: medium penalty and recommendation to check credit status.

Why:

- Public pages repeatedly mention good financial behavior/no moras/protestos.
- Morosidad is one of the clearest visible risk signals.

Actionability: `add_to_score`, `add_to_recommendations`

## Proposed Frontend Form Additions

Non-invasive additions for HdU 1:

- `valor_propiedad_uf` or `precio_propiedad_uf`.
- `plazo_credito_anios`.
- `vivienda_nueva`.
- `tipo_propiedad`: `departamento`, `casa`.
- `estado_propiedad`: `nueva`, `usada`, `no_lo_se`.
- `subsidio_habitacional`: `si`, `no`, `no_lo_se`.
- `fogaes_interes`: bool.
- `plazo_compra`.
- `intencion_compra`.
- `tiene_propiedad_vista`.
- `pie_en_cuotas_interes`.
- `propiedad_en_parte_pago`.

Helpful copy changes:

- For `deuda_mensual`: "Incluye cuotas de consumo, tarjetas, automotriz, línea de crédito u otros pagos mensuales."
- For `ahorro_disponible`: show calculated `% de pie` beside the input.
- For `dividendo_estimado`: show "si no lo sabes, podemos estimarlo desde valor, pie y plazo".

Do not add before result:

- RUT.
- Phone.
- Email, unless already part of existing auth.
- Document uploads.

## Proposed Sales Dashboard Additions

Use for HdU 2 prioritization, not core score:

- `plazo_compra`: immediate/soon leads should rank higher for executive follow-up.
- `tiene_propiedad_vista`: property-selected users are more sales-ready.
- `intencion_compra`: investor vs live-in segmentation.
- `score_financiero`: keep current classification.
- `readiness_label`: e.g. `listo_para_contacto`, `nutrir`, `requiere_plan`.
- `pie_ratio`.
- `total_burden_ratio`.
- `subsidy_path_possible`.
- `complemento_renta_used`.
- `primary_blocker`: income, debt, pie, morosidad, continuity.

Suggested dashboard logic:

```text
High financial score + immediate timing + property selected:
  top priority

High score + browsing:
  good lead, lower urgency

Medium score + immediate timing:
  commercial nurture with financing plan

Low score:
  plan-first, avoid executive handoff unless property/subsidy path is exceptional
```

Actionability: `add_to_sales_dashboard`

## Non-Breaking Optional Additions to POST /score

Add as optional fields only:

```text
valor_propiedad_uf
plazo_credito_anios
tipo_propiedad
estado_propiedad
vivienda_nueva
subsidio_habitacional
fogaes_interes
plazo_compra
intencion_compra
tiene_propiedad_vista
pie_en_cuotas_interes
propiedad_en_parte_pago
```

Compatibility rules:

- If `valor_propiedad_uf` is absent, keep current comuna reference price logic.
- If `plazo_credito_anios` is absent, keep current `dividendo_estimado` as the user-provided capacity input.
- If subsidy/FOGAES fields are absent, do not change score.
- Return new explanation details inside existing `risks`, `recommendations`, `ai_explanation`, and `improvement_plan` first.

## Breaking Changes to Avoid

Avoid:

- Removing or renaming current required fields.
- Replacing `ahorro_disponible` with `pie_disponible`.
- Requiring `valor_propiedad_uf`.
- Requiring RUT/contact fields.
- Requiring Supabase or external APIs for local scoring.
- Changing response keys: `score`, `classification`, `risks`, `recommendations`, `ai_explanation`, `improvement_plan`.

## Signals to Avoid or Handle Carefully

Avoid in core score:

- RUT.
- Nationality/residency.
- Gender.
- Marital status.
- Dependents.
- Full address.
- Education/profession.
- Detailed assets, vehicles, investments.
- Bank account/customer status.

Handle carefully:

- Age: use only for optional term/insurance feasibility explanation, not as a general lead-quality score.
- Subsidy: recommendation only, because eligibility is property/program-specific.
- Pie en cuotas: improvement/commercial option only, not liquid savings.
- Investor intent: segment and explain, do not penalize by default.

## Recommended Implementation Sequence

1. Add derived metrics internally without changing API:
   - `dividend_ratio`
   - `total_burden_ratio`
   - `pie_ratio`

2. Replace current scoring bands:
   - Tier dividend ratio.
   - Add total burden.
   - Tier pie at 10%, 15%, 20%.

3. Rework complemento de renta:
   - Use `complemento_monto` in capacity.
   - Add relationship-aware explanation.
   - Remove flat +5 or reduce it to a small confidence modifier.

4. Add optional frontend fields:
   - property value/type/condition
   - purchase timing
   - property selected
   - subsidy/FOGAES interest

5. Add recommendation-only logic:
   - subsidy/FOGAES path
   - pie en cuotas path
   - property in part payment path

6. Enhance sales dashboard prioritization:
   - financial score + timing + property selected + blocker reason.

7. Only after value is shown, ask for contact data if the business needs commercial handoff.

## Suggested Rule Sketch

Policy sketch only, not production code:

```text
score = 50

ingreso_total = ingreso_mensual
if complemento_renta and complemento_monto > 0:
  ingreso_total += complemento_monto

dividend_ratio = dividendo_estimado / ingreso_total
total_burden = (deuda_mensual + dividendo_estimado) / ingreso_total
pie_ratio = ahorro_disponible / precio_objetivo

capacity:
  dividend_ratio <= 25%: +20
  <= 30%: +10
  <= 35%: -5
  > 35%: -20

burden:
  total_burden <= 35%: +10
  <= 45%: -5
  > 45%: -20

pie:
  >= 20%: +15
  >= 15%: +10
  >= 10%: +3
  < 10%: -20

employment:
  keep current contract and continuity rules

morosidad:
  keep current strong penalties

subsidy/fogaes:
  recommendation modifier only

purchase timing/property selected:
  sales dashboard priority only
```

## Final Product Principle

ScoreLeads should feel closer to TOCTOC/ComparaOnline/RVC in the first experience: low-friction inputs, immediate value, transparent assumptions, and delayed contact. It should not feel like Buydepa's full application or bank simulators that ask RUT first.
