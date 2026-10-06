# ALG-11 — Referential financing simulation

| Field | Value |
| :---- | :---- |
| **Version** | `hu17-v2` |
| **Runs on / implemented in** | Frontend pure layer · `frontend/src/lib/financing/` |
| **Cases** | `docs/algorithms/ALG-11-financing-cases.json` · asserted by Vitest |
| **Open assumptions** | 0 — closed in the HU17 Grill |
| **Last changed** | 2026-09-27 · HU17 design baseline |

## Purpose

Calculate a user-controlled, referential mortgage scenario without changing the stored
prequalification, its score, its classification, or the `POST /score` contract. A scenario answers
what its declared inputs would imply at a recorded market reference; it never approves credit,
guarantees a subsidy, contacts a bank, or predicts a project's price or mortgage rate.

The selected project is a price-in-UF input. Its project-goal status only chooses the initial
selection and is never written by this algorithm. A manual property is allowed and has no project
identifier. This algorithm is intentionally limited to HU17; it does not establish a total-credit
cost model for HU29.

## Inputs → outputs

| Input | Unit / source | Rule |
| :---- | :------------ | :--- |
| `precio_uf` | UF · selected catalog project or manual property | Positive. A catalog project's price stays in UF; HU17 does not project it. |
| `uf_actual` | CLP/UF · persisted BCCh market snapshot | Required for a current-UV scenario. Never fetched live from BCCh. |
| `fecha_compra`, `uf_proyectada` | Optional ISO date, CLP/UF · ALG-11 R1 | Present only after the lead voluntarily enables the advanced UF projection. It is not a purchase promise. |
| `pie_clp`, `credito_clp`, `subsidio_principal_clp` | CLP | The three terms must close the composition in R2. |
| `plazo_anios` | years | One of 10, 15, 20, 25, 30; terms ending after age 70 are unavailable when a valid age is known. |
| `tasa_anual` | annual ratio | Market-snapshot rate by default; the user may replace it with a finite, non-negative value. |
| `renta_propia_clp`, `renta_complementaria_clp` | CLP/month | Scenario income is their non-negative sum. Complementary debt and codebtor underwriting facts are deliberately out of scope. |
| `deuda_mensual_clp` | CLP/month · latest evaluation | The lead's own declared debt only. |
| `ltv_referencial` | ratio · persisted BCCh market snapshot | Used as the financing-reference bound, never as a bank approval rule. |
| selected benefit catalogue entry | immutable official catalogue version or reviewed estimation baseline | At most one monetary primary benefit (DS1 or DS49). The result records whether it is an official fixed amount, a base amount, or a range; ancillary effects only exist when their reviewed entry defines them. |

The result contains the frozen inputs and market/benefit provenance, price in UF and CLP, `pie`,
official primary subsidy amount, `credito`, estimated dividend, total income, dividend-to-income
ratio, total-burden ratio, LTV ratio, financial status, reasons, benefit eligibility status and —
when applicable — one reference adjustment. Amounts displayed in CLP are rounded to whole pesos;
calculations use full precision until output formatting.

## Rules

### R1 — UF selection and projection

| Condition | Effect | Message shown |
| :-------- | :----- | :------------ |
| Default scenario | Use the latest persisted BCCh snapshot's UF value and provenance. No date is requested or inferred. | Current market reference. |
| Lead voluntarily enables projected UF and there are at least 90 distinct effective dates in the preceding 12 calendar months | The interface then asks for a scenario date. Ordinary least-squares linear regression over those daily CLP/UF observations estimates its UF. The date must be today through 24 months ahead. Store value, window bounds, count and regression provenance with the scenario. | Projected market reference; it is not an expected purchase date. |
| Fewer than 90 usable dates, invalid observation, or unsupported date | Do not offer/select projected UF; current UF remains usable. | No explanatory message is shown. |

The 12-month window, 90-date minimum and 24-month horizon are confirmed product limits, not a claim
that UF can be predicted. The projection has no effect on `POST /score`, market snapshots, rate or
project price.

### R2 — Financing composition and mortgage payment

```text
precio_clp = precio_uf × uf_seleccionada
precio_clp = pie_clp + subsidio_principal_clp + credito_clp
dividendo = annuity(credito_clp, tasa_anual / 12, plazo_anios × 12)
```

Changing `pie` recomputes `credito`; changing `credito` recomputes `pie`. Values are clamped at
zero and the UI never leaves a non-closing composition. With a zero rate, the payment is
`credito / months`. The implementation reuses the existing annuity formula in
`frontend/src/lib/mortgage.js`; it does not create a second mortgage formula.

Only a selected DS1 or DS49 monetary amount may reduce the financed composition. A reviewed
catalogue amount has priority. When it is not yet published, a reviewed estimation baseline may
show an official DS49 base amount separately from potential complementary amounts. A DS1 amount
that still varies by tranche, price and geographic zone is shown as a range and does not silently
become a single applied amount. The result must expose the resulting credit/dividend range so the
lead can understand its possible impact without treating it as an award. FOGAES, PADHI and Leasing
are informational in HU17. Ley 21.748 may alter the rate only if the selected, versioned official
catalogue entry explicitly supplies that effect. There is no manually entered subsidy amount and no
automatic benefit selection.

### R3 — Financial status

Let `I = renta_propia + renta_complementaria`, `D = deuda_mensual`, `P = dividendo`, and
`L = credito / precio_clp` when price is positive.

| Condition | Financial status | Reason |
| :-------- | :--------------- | :----- |
| Inputs required for ratios are missing or non-positive | `Sin datos suficientes` | Do not invent a classification. |
| `P/I <= 0.25`, `(D + P)/I <= 0.45`, and `L <= ltv_referencial` | `Compatible` | Sustainable dividend, total burden and financing reference hold. |
| `0.25 < P/I <= 0.30`, `(D + P)/I <= 0.45`, and `L <= ltv_referencial` | `Cercano` | Dividend is above the healthy reference but within its maximum. |
| Any other computable case | `Requiere ajuste` | Dividend, total burden, LTV or composition needs adjustment. |

The ratios 25%, 30% and 45% are reused unchanged from ALG-9 and
`backend/app/scoring_engine/constants.py`. They are labels for this separate scenario, not a new
score or a modification of ALG-9. No regional penalty, property-price forecast, rate forecast,
insurance, CAE, fee, tax, or financial-capacity rule is added.

### R4 — Benefit eligibility and hypothetical use

The selector evaluates the selected catalog version against the latest evaluation data and selected
housing scenario. It returns short, structured unmet conditions. A user may still apply an official
DS1/DS49 amount even when those conditions are unmet: that is a hypothetical scenario, not an
eligibility assertion.

When the selected benefit is not currently applicable, the UI shows a red
`No aplicable actualmente` result and the short reason. That label takes precedence over the
financial status, while the underlying financial result remains visible as a hypothetical. The
scenario must not appear as a green approval because a hypothetical subsidy made it affordable.

### R5 — Light E3 adjustment

For a computable `Cercano` or `Requiere ajuste` scenario, derive one non-prescriptive reference
configuration: reduce the principal only enough to meet the stricter of the dividend, total-burden
and LTV bounds, then close the composition by increasing `pie`. Present it as a reference card;
do not auto-apply it, rank alternatives, alter the user's draft, or give multiple recommendations.
If no finite adjustment can be calculated, show no card rather than inventing one.

### R6 — Saved snapshots

Saving writes a new immutable scenario containing all input values, the computed result, selected
UF/reference provenance, selected official benefit catalogue version and benefit amount/effect.
Editing or duplicating loads a draft; saving that draft creates a new row with an optional parent
scenario reference. Existing rows are never updated. Deleting removes only the authenticated
owner's chosen snapshot.

## Invariants and edge cases

- Same frozen inputs, market reference and catalogue version produce the same result; no clock,
  network request or AI runs inside the pure calculation.
- `precio = pie + primary subsidy + credit` holds after every editable input change.
- The project goal is read to choose a default only; it is not changed by selecting, saving,
  deleting, duplicating or editing a scenario.
- A project price remains in UF. UF projection changes only its CLP conversion.
- A selected inapplicable benefit keeps its official hypothetical amount but cannot produce a
  final eligible/green result.
- A saved scenario is historical: later BCCh snapshots or catalogue versions never rewrite it.
- A missing projection history silently removes the voluntary projection control; it never substitutes
  a custom UF, inferred purchase date, or hardcoded value.

## Assumptions log

| Assumption | Made by | Date | Would be wrong if | Status |
| :--------- | :------ | :--- | :---------------- | :----- |
| A simple unweighted linear regression is enough for a short, referential UF view. | Product owner | 2026-09-27 | The product requires a statistically validated forecast or a longer horizon. | confirmed |
| A monthly source-change check is timely enough for benefit catalogue review. | Product owner | 2026-09-27 | MINVU starts publishing material changes more frequently. | confirmed |
| A single pie-based reference adjustment satisfies HU17 E3 without turning the simulator into an adviser. | Product owner | 2026-09-27 | The acceptance criterion is revised to require ranked or multi-variable advice. | confirmed |
