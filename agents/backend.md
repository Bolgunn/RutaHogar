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

- **Base**: 50. Clamped a [0, 100]. Clasificación: ≥70 Alto, ≥40 Medio.
- **VALOR_UF_CLP**: 40695 (no 45408 como decía antes).
- Usa `property_value_clp` si se declara; si no, calcula desde `PRECIOS_REFERENCIA_UF`.

Reglas principales:

| Regla | Efecto |
|-------|--------|
| Ingreso ≥ 4× dividendo | +25 |
| Ingreso < 4× dividendo | −15 |
| Deuda > 40% ingreso | −20 |
| Ahorro ≥ 20% precio ref. | +15 |
| Ahorro ≥ 10% precio ref. | +5 |
| Ahorro insuficiente | −20 |
| Contrato indefinido | +10 |
| **Contrato plazo_fijo** | **−18** |
| **Contrato honorarios_variable** | **−10** |
| Contrato independiente con poca continuidad | −5 |
| Continuidad < 6m | −15 |
| Continuidad 6-12m | −8 |
| Continuidad > 3a | +5 |
| Morosidad sí (antigüedad < 12m) | **−35** |
| Morosidad sí (antigüedad ≥ 12m) | **−25** |
| Morosidad no_lo_se | −12 |

**Complemento renta** — evalúa co-deudor completo. Claves:
- `relacion_complementario` en `{"amigo", "otro"}` = relación débil (−5, no suma a capacidad).
- Perfil limpio (sin morosidad, deuda ≤ 40%, indefinido, continuidad >1a, relación no débil) = +10.
- Morosidad sí = −20. Deuda > 40% = −15. Plazo fijo = −10. Continuidad < 6m = −10.

### Return

```json
{
  "score": 74.5, "classification": "Alto",
  "risks": [], "recommendations": [{"text": "...", "benefit": "..."}],
  "positive_indicators": [], "risk_codes": [],
  "component_scores": {"carga_financiera": 10, ...},
  "algorithm_version": "1.0.1",
  "ai_explanation": "...",
  "improvement_plan": ["..."],
  "executive_summary": "...",
  "commercial_guidance": "..."
}
```

`risk_codes` se elimina del return final (usado internamente para generar texto).

### Evolución profesional del scoring

La evolución esperada del motor debe mantener compatibilidad con `POST /score` y
sumar capacidades auditables sin romper el flujo actual:

- Reglas versionadas con `algorithm_version` persistido en historial.
- Bloqueadores explícitos para casos críticos: morosidad vigente, datos
  incompletos, endeudamiento extremo, edad/plazo riesgoso u objetivo fuera de
  alcance.
- Componentes ponderados: carga financiera, ahorro/pie, estabilidad laboral,
  historial crediticio declarado, complemento de renta, patrimonio declarado y
  compatibilidad con proyecto.
- `project_fit`: ajuste entre comuna, tipo de propiedad, plazo, valor declarado
  y capacidad financiera.
- `commercial_priority`: prioridad comercial separada del score financiero.
- Auditoría: guardar inputs relevantes, componentes, bloqueador principal,
  versión de reglas y textos generados.

No consultar datos financieros externos, bancos, CMF, Dicom u otros servicios
sin consentimiento explícito y alcance aprobado.

### AI (`backend/app/ai.py`)

Usa **Groq** (`llama-3.1-8b-instant`). Requiere `GROQ_API_KEY` (env var o `backend/.env`). Sin fallback real — retorna "No disponible" sin API key.

Tres generadores:
- `generate_executive_summary(classification, score, positive_indicators, risks)` — para el ejecutivo comercial.
- `generate_commercial_guidance(classification, score, positive_indicators, risks, recommendations)` — acción comercial sugerida. `recommendations` puede ser lista de strings o de dicts `{"text", "benefit"}`.
- `generate_user_explanation(classification, score, positive_indicators, risks)` — reemplazó a `generate_ai_explanation`. Texto en 2ª persona para el usuario.

`generate_improvement_plan()` vive en `scoring.py` (no en ai.py), es determinística.

La integración Groq debe mantenerse opcional por ambiente. Nunca hardcodear
`GROQ_API_KEY`; usar variables de entorno/secrets.

### Serverless entrypoints

- `api/score.py` — root, rewrite de Vercel `/score`
- `backend/api/index.py` — serverless desde `backend/`

### Precios referencia comuna

`PRECIOS_REFERENCIA_UF` en `scoring.py` (~40 comunas en UF).
