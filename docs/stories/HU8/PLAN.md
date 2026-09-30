# PLAN — HU8: Detector de beneficios habitacionales aplicables

- **Story:** HU8 — Detector de beneficios habitacionales aplicables
- **Actor:** Lead
- **Source story:** `Wiki RutaHogar/UserStories/HU8-MonthlyPlanTracking.md` (numbering collision — see Resolved Decisions)
- **Status / Sprint:** Pendiente · Sprint 2 · 5 SP
- **Depends on / Required by:** HU3 (Scoring híbrido) — implemented
- **Branch:** `feat/hu8-housing-benefits`

---

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No. The detector is a pure function that appends `housing_benefits` to the response. No score, classification or blocker changes. No ALG amendment. |
| 2 | Needs RLS / multi-tenant scoping? | No. No new tables. Reads from existing evaluation data already scoped to the user. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | No. No schema changes. |
| 4 | Changes the `POST /score` contract? | No. Adds a new optional field `housing_benefits` to the response. Existing fields are unchanged. Per S2, adding a field is additive; changing existing fields is what is frozen. |
| 5 | Consent / privacy impact? | No new consent. Uses data the user already provided (vivienda_nueva, ahorro, property value, income, comuna, edad, RSH, RUI, deuda_hipotecaria). No external data sources consulted. |

> CI checks these against the diff. An answer contradicted by the files touched fails the build.

## Goal

When a lead completes a scoring evaluation, the system detects whether their profile might be compatible with housing benefits (FOGAES, DS49, PADHI, DS1, Leasing Habitacional, Ley 21.748) and shows a referential indication in a "Simulación" section in the recommendations view. This gives the lead alternative financing paths to explore without guaranteeing approval, and without modifying their score.

## Approach

A pure function `detect_housing_benefits` in `scoring_engine/housing_benefits.py` evaluates eligibility rules for all six benefits against the existing profile data, cross-referencing target home parameters (value, type, condition) per E3. It runs after the scoring pipeline and appends a `housing_benefits` object to the result. The frontend reads this field and renders a "Simulación" section in `Recommendations.jsx` (next to "Plan de Mejora") with benefit details, contextual Academy links, and a disclaimer. No score modification, no new form fields, no migration.

## Entities

- **Modified module:** `backend/app/scoring_engine/housing_benefits.py` — pure function, no I/O (expanded to 6 benefits)
- **Modified:** `backend/app/scoring_engine/constants.py` — all benefit thresholds centralized here
- **Modified:** `backend/app/scoring.py` — imports and calls `detect_housing_benefits`, adds result to response dict
- **Modified:** `frontend/src/services/recommendationService.js` — passes `housing_benefits` through to the build output
- **Modified:** `frontend/src/components/Recommendations.jsx` — new "Simulación" section next to Plan de Mejora
- **New:** `backend/tests/test_benefits_detector.py` — pytest tests for all 6 benefit detectors
- **No new tables, no migration, no new API fields in the request contract**

## Algorithms

No ALG amendment. Detection rules per benefit (E3: all detectors cross-reference target home parameters — value, type, condition):

**FOGAES:** `vivienda_nueva == True` AND `property_value_uf <= 4000` AND `pie_ratio >= 0.10` → eligible.
- *E3 check:* condición (nueva/usada) via `vivienda_nueva`; valor via `property_value_uf`.

**DS49 (Fondo Solidario):** `edad >= 18` AND `rsh_tramo <= 40` AND `propiedad_previa == False` AND `ahorro_uf >= 10` AND `grupo_familiar_rsh == True` → eligible.
- *E3 check:* condición via `propiedad_previa` (usada = no elegible); valor se valida contra tope de subsidio del tramo RSH.

**PADHI:** `deuda_hipotecaria_vigente == True` AND `beneficio_previo == True` → orientación educativa (redirigir a Academia).
- *E3 check:* no aplica cruce de vivienda (es redirect educativo, no elegibilidad).

**DS1 (Subsidio Clase Media):** `propiedad_previa == False` AND `ahorro_antiguedad_meses >= 12` → evalúa tramo por RSH/ahorro/tope.
- *E3 check:* condición via `propiedad_previa`; valor se valida contra tope del tramo DS1.

**Leasing Habitacional:** `edad >= 18` AND `registro_rui == True` AND `propiedad_previa == False` AND `beneficio_previo == False` → eligible.
- *E3 check:* condición via `propiedad_previa`; valor se valida contra tope de leasing.

**Ley 21.748:** `vivienda_nueva == True` AND `persona_natural == True` AND `valor_propiedad_uf <= 4000` → eligible (reducción 0.60 pb tasa).
- *E3 check:* condición via `vivienda_nueva`; valor via `valor_propiedad_uf`.

### Local logic

- The `housing_benefits` field is always present in the response (empty list if no benefits apply).
- Each benefit carries `type`, `name`, `eligible` (bool), `conditions_met` (list of strings), `conditions_not_met` (list of strings), and `notes` (human-readable).
- A `summary` and `disclaimer` field are always present regardless of eligibility.

## In scope

- All 6 benefit detectors: FOGAES, DS49, PADHI, DS1, Leasing Habitacional, Ley 21.748
- Display in "Simulación" section in Recommendations.jsx with disclaimer and Academy links
- Pure function with deterministic output
- Pytest tests for all detectors

## Out of scope

- Score modification based on benefits (research says: soften recommendations, not boost scores)
- New form fields for benefit interest (HU25 owns the simulation UI)
- Any external API calls for benefit verification

## Assumptions / unmet dependencies

- The FOGAES UF 4,500 cap is assumed from Spike 1 research. If the actual cap differs, the constant in `housing_benefits.py` must be updated.
- The `vivienda_nueva` field is already collected in the form (HU3). If it is not populated, the detector returns no benefits (graceful degradation).
- The `property_value_uf` is computed by the indicators layer. The detector uses it from `financial_indicators`.

## Steps

1. Expand `backend/app/scoring_engine/constants.py` with DS49, PADHI, DS1, Leasing, Ley 21.748 thresholds.
2. Expand `backend/app/scoring_engine/housing_benefits.py` with detectors for all 6 benefits.
3. Import and call `detect_housing_benefits` in `backend/app/scoring.py` (already done, verify integration).
4. Create `backend/tests/test_benefits_detector.py` with pytest tests for all 6 detectors.
5. Update `frontend/src/services/recommendationService.js` to pass `housing_benefits` (already done, verify).
6. Update `frontend/src/components/Recommendations.jsx`: move benefits into "Simulación" section next to Plan de Mejora, add Academy links per benefit (E4: each benefit card must link to the relevant Academy section), use exact disclaimer text.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — Dado que el usuario tiene una evaluación financiera, cuando revise su resultado, entonces el sistema debe indicar si existe una posible ruta de beneficio habitacional aplicable. | 1, 2, 3, 4, 5, 6 | Reviewer: score a profile, verify "Simulación" section appears in Recommendations with applicable benefits. |
| `E2` — Dado que los beneficios dependen de requisitos externos, cuando se muestre una sugerencia, entonces debe aclararse que es referencial y no garantiza aprobación. | 6 | Reviewer: verify exact disclaimer text renders below benefits section. |
| `E3` — Dado que el usuario tiene una vivienda objetivo, cuando se evalúe la sugerencia, entonces debe considerar el valor, tipo de vivienda y condición (nueva/usada). | 1, 2, 3, 4, 5, 6 | Reviewer: verificar que FOGAES, DS49, DS1, Leasing y Ley 21.748 crucen parámetros de la propiedad objetivo (valor UF, tipo, nueva/usada) contra sus umbrales. |
| `E4` — Dado que existe contenido educativo relacionado, cuando aparezca una sugerencia de beneficio, entonces debe vincularse a la sección de Academia. | 6 | Reviewer: verificar que cada beneficio renderizado tenga un link funcional a Academy. |

## Safeguards

- **S1 (AI never decides the score):** The detector is a pure function. It does not call AI. It does not modify the score. The AI explanation is generated independently.
- **S2 (POST /score contract frozen):** Existing fields unchanged. `housing_benefits` is an additive field in the response.
- **S4 (Score clamped to [0,100]):** Score is not touched by this story.
- **S7 (System does not approve credit):** Disclaimer rendered in the UI. The `disclaimer` field is always present in the API response. Copy reviewed.
- **S8 (Target home always considered):** Every benefit detector cross-references the user's target property parameters (value UF, type, new/used condition) before marking eligibility. This ensures E3 compliance — no benefit is suggested without validating it against the target home.

## Definition of done

- Tier 1 green: pytest (incl. golden + ALG cases + benefits detector tests) · eslint · vitest · Playwright journeys.
- Tier 2 confirmed by a reviewer who is not the author, with evidence per criterion.
- This plan and any `ALG-*` changes committed in the same PR as the code.
- No criterion silently dropped.

## Resolved decisions

| Decision | Rationale |
| :------- | :-------- |
| Advisory-only: detector does not modify the score | Research (scoring_improvement_recommendations.md, section 4) says subsidies should soften recommendations, not boost scores. A score change would require an ALG amendment and reconciliation with the client. |
| All 6 benefits in one story | The kickoff and Spike 1 research define all 6 benefits. FOGAES, DS49, PADHI, DS1, Leasing, and Ley 21.748 share the same parameter set and detection pattern. Implementing them together avoids redundant work. |
| UI in "Simulación" section next to "Plan de Mejora" | Benefits are orientation/simulation content. Placing them next to the improvement plan groups forward-looking guidance together. |
| No new form fields | All required data (vivienda_nueva, ahorro, property value, income, comuna, edad, RSH, RUI, etc.) is already collected in the ScoreRequest model. No user-facing changes to the form. |
| PADHI as educational redirect | PADHI requires morosidad vigente + beneficio previo. It is not a new eligibility path but an orientation to redirect users to the Academia Financiera section. |
| Additive response field, not a contract change | S2 freezes existing fields. Adding a new optional field is additive and does not break existing consumers. |
| E3: target home always cross-referenced | Per HU8 E3, every detector must validate the target property's value, type, and condition before suggesting a benefit. This prevents false positives where a benefit would not actually apply to the user's target home. |
