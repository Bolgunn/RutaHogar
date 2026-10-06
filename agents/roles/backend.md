# Backend — RutaHogar Plataforma Profesional

FastAPI + Pydantic v2. Dependencias: `fastapi`, `uvicorn[standard]`, `pydantic`, `groq`.

RutaHogar ya no es MVP. El backend sostiene una plataforma profesional de
precalificación financiera inmobiliaria: scoring orientativo y explicable,
reglas auditables/versionadas, trazabilidad, privacidad, priorización comercial
y plan de mejora financiero.

El backend no aprueba créditos ni reemplaza evaluación bancaria formal. La IA no
decide el score; solo redacta explicaciones o guías a partir del score calculado
por reglas. No reemplazar reglas por ML sin instrucción explícita.

## Endpoint único

```
POST /score
```

### ScoreRequest (`backend/app/main.py`)

| Campo | Tipo | Requerido | Valores / Notas |
|-------|------|-----------|-----------------|
| ingreso_mensual | float | sí | ≥ 0 |
| deuda_mensual | float | sí | ≥ 0 |
| ahorro_disponible | float | sí | ≥ 0 |
| edad | int | sí | 18-100 |
| property_value | float? | no | monto vivienda (clp) |
| property_value_unit | str? | no | `uf` / `clp` |
| property_value_uf | float? | no | si se declara en UF |
| property_value_clp | float? | no | si se declara en CLP |
| uf_value_clp | float? | no | Valor UF usado en frontend |
| plazo_credito_hipotecario | int | sí | 10/15/20/25/30 |
| tipo_contrato | str | sí | `indefinido` / `plazo_fijo` / `independiente` / `honorarios_variable` |
| continuidad_laboral | str | sí | `menos_6_meses` / `entre_6_y_12_meses` / `entre_1_y_3_anios` / `mas_3_anios` |
| morosidad_actual | str | sí | `si` / `no` / `no_lo_se` |
| monto_morosidad | float? | no | requerido si morosidad=si |
| antiguedad_morosidad | str? | no | `menos_3_meses` / `3_a_12_meses` / `1_a_3_anios` / `mas_3_anios` |
| comuna_objetivo | str? | no | clave en PRECIOS_REFERENCIA_UF |
| dividendo_estimado | float | sí | ≥ 0 |
| complemento_renta | bool | no | default false |
| ingreso_mensual_complementario | float? | sí si complemento | |
| deuda_mensual_complementario | float? | sí si complemento | |
| tipo_contrato_complementario | str? | sí si complemento | mismos valores que tipo_contrato |
| continuidad_laboral_complementario | str? | sí si complemento | mismos valores que continuidad_laboral |
| morosidad_complementario | str? | sí si complemento | `si` / `no` / `no_lo_se` |
| relacion_complementario | str? | sí si complemento | `conyuge` / `pareja_conviviente` / `pareja_hijos_comun` / `padre_madre` / `hijo_hija` / `hermano_hermana` / `otro_familiar` / `amigo` / `otro` |
| consentimiento | bool | sí | debe ser true |
| declara_patrimonio | bool | no | |
| valor_vehiculos / valor_inmuebles | float? | no | |
| patrimonio_unit | str? | no | `clp` |

Validaciones con `@field_validator` + `@model_validator` (Pydantic v2). Constantes validadoras definidas como sets al inicio del archivo.

### Scoring (`backend/app/scoring.py`)

```
calculate_score(data: Dict) -> Dict
```

- **Motor ponderado**: `component_scores` se calcula en `scoring_engine/components.py` y se combina con `SCORING_WEIGHTS` (`_calculate_weighted_score`). Clamped [0,100].
- **Clasificación**: ≥75 `Alto`, ≥50 `Medio`, si no `Bajo`; `complemento_incompleto` fuerza `Requiere antecedentes` (`_apply_blocker_classification` / `_apply_final_classification`).
- **Bloqueadores y caps**: `detect_blockers()` genera bloqueadores con `severity`; los críticos limitan el score final: `pie_insuficiente`→74, `dividendo_exigente`→69, `carga_total_alta`→59, `morosidad_vigente`→59.
- `original_classification` y `main_blocker` (el de mayor `severity`) se conservan para auditoría.
- **VALOR_UF_CLP**: 40695.
- Resolución del valor de propiedad en `scoring_engine/property_value.py` (`resolve_property_value_clp`): usa `property_value_clp` declarado o estima desde `PRECIOS_REFERENCIA_UF`.

Componentes (`SCORING_WEIGHTS`, en `scoring_engine/constants.py`):

| Componente | Peso | Descripción |
|------------|------|-------------|
| capacidad_pago | 0.25 | Ingreso vs dividendo estimado |
| endeudamiento | 0.20 | Deuda mensual / carga total vs ingreso |
| pie_ahorro | 0.20 | Ahorro disponible vs pie mínimo estimado |
| estabilidad_laboral | 0.15 | Tipo de contrato + continuidad |
| historial_pago | 0.10 | Morosidad declarada |
| complemento_renta | 0.05 | Co-deudor completo y limpio |
| calidad_datos | 0.05 | Completitud de antecedentes |

### scoring_engine (`backend/app/scoring_engine/`)

| Módulo | Rol |
|--------|-----|
| `constants.py` | `ALGORITHM_VERSION`, `SCORING_WEIGHTS`, `CLASSIFICATION_THRESHOLDS`, `BLOCKER_SEVERITIES`, `PROJECT_FIT_CLASSIFICATIONS`, `COMMERCIAL_ACTIONS` |
| `indicators.py` | `calculate_financial_indicators` (ratios deuda/ingreso, carga, pie). Fallback en `scoring.py: _fallback_financial_indicators` |
| `blockers.py` | `detect_blockers`: códigos y severidades (ej. `morosidad_vigente`, `pie_insuficiente`, `carga_total_alta`, `complemento_incompleto`, `deuda_actual_alta`, `edad_plazo_riesgoso`) |
| `components.py` | `calculate_component_scores` — cada componente en 0-100 |
| `project_fit.py` | `calculate_project_fit` — compatibilidad objetivo vs capacidad (`Compatible` / `Cercano` / `Fuera de alcance` / `Requiere antecedentes`) |
| `commercial_priority.py` | `calculate_commercial_priority` — acción comercial (`contact_now`, `contact_with_review`, `nurture`, `reorient`, `request_info`, `do_not_route`) |
| `property_value.py` | `resolve_property_value_clp` |
| `improvement_plan.py` | `build_structured_improvement_plan` |
| `explanations.py` | `build_deterministic_explanations` (base sin depender de Groq) |

### Return

```json
{
  "score": 74.0, "base_score": 76.0, "adjusted_score": 74.0,
  "score_adjustment_reason": "...",
  "classification": "Medio", "original_classification": "Alto",
  "classification_reason": "...",
  "positive_indicators": [], "risks": [],
  "recommendations": [{"text": "...", "benefit": "..."}],
  "component_scores": {"capacidad_pago": 82.0, "endeudamiento": 70.0, "pie_ahorro": 30.0, "estabilidad_laboral": 90.0, "historial_pago": 100.0, "complemento_renta": 0.0, "calidad_datos": 80.0},
  "algorithm_version": "1.1.0",
  "financial_indicators": {},
  "blockers": [], "main_blocker": null,
  "property_value_resolution": {},
  "project_fit": {},
  "commercial_priority_detail": {},
  "structured_improvement_plan": [],
  "ai_explanation": "...", "improvement_plan": [],
  "executive_summary": "...", "commercial_guidance": "..."
}
```

- `risk_codes` se elimina del return final (usado internamente para generar texto).
- `structured_improvement_plan` viene de `build_structured_improvement_plan` (determinístico).
- `improvement_plan` de `generate_improvement_plan()` en `scoring.py` (determinístico; dicts con `category`, `description`, `impact_level`, `impact_score`, `expected_benefit`).
- Explicaciones determinísticas desde `explanations.py` + 3 textos de IA (ver sección AI).

### AI (`backend/app/ai.py`)

Usa **Groq** (`llama-3.1-8b-instant`). Requiere `GROQ_API_KEY` (`api_key = os.environ.get("GROQ_API_KEY")` en env var o `backend/.env`). Sin fallback real — retorna "No disponible" sin API key.

Tres generadores. Todos reciben el contexto profesional (classification, score, positive_indicators, risks, financial_indicators, blockers, main_blocker, project_fit, commercial_priority_detail, structured_improvement_plan):
- `generate_executive_summary(...)` — para el ejecutivo comercial.
- `generate_commercial_guidance(...)` — acción comercial sugerida. `recommendations` puede ser lista de strings o de dicts `{"text", "benefit"}`.
- `generate_user_explanation(...)` — reemplazó a `generate_ai_explanation`. Texto en 2ª persona para el usuario.

Las explicaciones determinísticas (`scoring_engine/explanations.py`) existen como base aunque Groq no esté disponible. La integración Groq debe mantenerse opcional por ambiente. Nunca hardcodear `GROQ_API_KEY`; usar variables de entorno/secrets.

### Serverless entrypoints

- `api/score.py` — root, rewrite de Vercel `/score`
- `backend/api/index.py` — serverless desde `backend/`

### Precios referencia comuna

`PRECIOS_REFERENCIA_UF` en `scoring.py` (~40 comunas en UF).

### Tests

- `backend/tests/test_score_professional.py` — pytest. Correr: `cd backend; .venv\Scripts\python -m pytest tests\test_score_professional.py -q`.
- `backend/test_thresholds.py` — verificaciones de umbrales de clasificación.
