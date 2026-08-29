# HU 3 - Scoring hibrido con explicación inteligente

> **✅ Implementada - PMV.** El motor central de RutaHogar. Procesa los datos financieros enviados en HU 1, calcula un score de 0 a 100 con reglas parametricas, clasifica al lead y genera una explicación asistida por IA de los factores clave. Cada evaluación se guarda como registro inmutable.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Muy compleja |
| **Puntos de Historia** | 8 |
| **Actor** | Lead |
| **Sprint** | PMV |
| **Estado** | ✅ Implementada |

---

## Historia de usuario

> **Como** persona interesada en comprar vivienda, **quiero** recibir una evaluación financiera inmediata mediante un scoring hibrido con explicación inteligente, **para** entender mi nivel de preparación, los principales factores que influyen en mi resultado y los siguientes pasos recomendados antes de iniciar una evaluación formal.

---

## Criterios de aceptación

### E1 - Despliegue del resultado de la evaluación

**Dado** que el usuario completó el formulario, **cuando** envia sus datos a procesamiento, **entonces** el sistema debe mostrar el resultado del scoring en un máximo de 60 segundos tras el envio del formulario.

### E2 - Clasificación del lead por score

**Dado** que el sistema RutaHogar recibió los datos del usuario, **cuando** se ejecuta el scoring, **entonces** el resultado debe clasificar al usuario en niveles de prioridad claros (Alto, Medio, Bajo).

### E3 - Explicación asistida por IA

**Dado** que el sistema presenta el resultado de la evaluación, **cuando** el usuario visualiza su clasificación crediticia, **entonces** el sistema, mediante un agente de IA, debe mostrar una explicación detallada de los principales factores que influyeron en el score.

### E4 - Advertencia de alcance del sistema

**Dado** que el usuario visualiza su resultado, **cuando** se despliega la explicación del scoring, **entonces** el sistema debe indicar explícitamente que el score es orientativo y no reemplaza una evaluación bancaria formal.

### E5 - Trazabilidad del resultado

**Dado** que el calculo del scoring es exitoso, **cuando** el sistema guarda la evaluación, **entonces** debe generar un registro inmutable con fecha y hora, score numérico, clasificación, snapshot de entrada, versión del algoritmo y desglose por componente.

### E6 - Flujo educativo / notificación al ejecutivo

**Dado** que un lead envia sus datos financieros, **cuando** el sistema lo evalua y determina que no alcanza el score mínimo calificante, **entonces** debe poder entrar a un flujo de educación financiera sin intervención del ejecutivo; y a la inversa, si el score es Alto, el ejecutivo comercial debe ser notificado.

---

## Notas

- El motor de scoring vive en `backend/app/scoring.py` y `backend/app/scoring_engine/`. Score base 50, clampeado a [0, 100]. Umbrales: Alto >= 70, Medio >= 40, Bajo < 40.
- La capa de IA (`backend/app/ai.py`) usa Groq y solo redacta: nunca calcula ni ajusta el score (salvaguarda S1 del handbook).
- El registro inmutable de E5 corresponde a la tabla `evaluations`. Ver [[../Database/evaluations|evaluations]]. El versionado completó se expande en [[../RNF/RNF5-historial-inmutable|RNF 5]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/components/ScoreForm.jsx:976` fija `timeout: 60000` en la llamada y `ScoreForm.jsx:994` captura `ECONNABORTED` para mostrar un mensaje controlado. |
| `E2` | ✅ | `backend/app/scoring.py:205` clampea el score y la clasificación se resuelve en `scoring.py:210`; `_apply_final_classification` (`scoring.py:289`) ajusta por bloqueadores. |
| `E3` | ✅ | `backend/app/ai.py:27` consulta Groq mediante `_ask_groq`. La IA solo redacta: el score ya viene calculado (salvaguarda S1). |
| `E4` | ✅ | El aviso de alcance se muestra junto al resultado en `Result.jsx`. |
| `E5` | ✅ | `backend/app/scoring_engine/constants.py:6` define `ALGORITHM_VERSION`, persistido junto a la evaluación. Ver [[../Database/evaluations|evaluations]]. |
| `E6` | ✅ | `frontend/src/App.jsx` redirige a `recommendations` cuando la clasificación no es Alto, y `App.jsx:598` marca los leads como vistos al entrar a `/leads`. Detalle en las notas de implementación de esta página. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.

---

## Notas de implementación

Registro técnico de lo ya construido para esta historia.

### Redirección post-evaluación según clasificación (E6)

Implementa el criterio E6 de [[HU3-scoring-hibrido|HU 3]]: los leads que no califican son redirigidos automáticamente a un flujo educativo; los leads Alto van al resumen de resultado.


### Comportamiento

Al completar el formulario de preevaluación (`ScoreForm`), `App.jsx` redirige según la clasificación obtenida:

| Clasificación | Redirección |
| :------------ | :---------- |
| **Alto** | `home` — muestra el resultado detallado |
| **Medio** | `recommendations` — flujo de educación financiera |
| **Bajo** | `recommendations` — flujo de educación financiera |


### Implementación

En `handleResult` dentro de `App.jsx`:

```js
setPage(resultSnapshot.classification === "Alto" ? "home" : "recommendations");
```

La lógica de guardado en Supabase ocurre después de la redirección. Si el guardado falla, `resultSaved` queda en `false` y se muestra el error — la redirección no se revierte.


### Archivos involucrados

| Archivo | Cambio |
| :------ | :----- |
| `frontend/src/App.jsx` | Una línea en `handleResult` — reemplaza `setPage("home")` incondicional |

### Explicación asistida por IA

El módulo `backend/app/ai.py` genera tres textos con lenguaje natural a partir del resultado del scoring. Cada texto tiene una audiencia distinta y un propósito diferente.


### Textos generados

| Función | Campo en la respuesta | Audiencia | Propósito |
| :------ | :-------------------- | :-------- | :-------- |
| `generate_user_explanation` | `ai_explanation` | Cliente (usuario) | Explica en segunda persona qué factores influyeron en su evaluación |
| `generate_executive_summary` | `executive_summary` | Ejecutivo comercial | Resumen del perfil del lead para priorización |
| `generate_commercial_guidance` | `commercial_guidance` | Ejecutivo comercial | Acción comercial concreta recomendada (Contactar pronto, Agendar reunión, etc.) |


### Proveedor LLM

Las tres funciones llaman a `_ask_groq` (`backend/app/ai.py:27`), un wrapper interno que consulta el
modelo configurado vía la API de Groq.

- **Modelo por defecto:** `openai/gpt-oss-20b` (`ai.py:24`). Groq retiró los modelos Llama 3.x el
  16/08/2026; este es el reemplazo oficial recomendado para `llama-3.1-8b-instant`.
- Se puede cambiar sin tocar código con la variable `GROQ_MODEL` en `backend/.env`.
- Requiere `GROQ_API_KEY` en `backend/.env`. Si la clave no existe o la librería de Groq no está
  instalada, `_ask_groq` devuelve `None` y lo registra en los logs del servidor.
- **Ante cualquier fallo devuelve `None`, nunca un texto de reemplazo.** Los tres generadores
  propagan ese `None` (`ai.py:210`, `ai.py:277`, `ai.py:337`): un texto de IA fallido jamás se
  muestra al usuario como contenido, y el detalle del error del proveedor no se filtra al producto.
  El resto del resultado del score sigue siendo válido.
- Temperatura: `0.4`. Para los modelos `openai/gpt-oss` se envía además `reasoning_effort: "low"`,
  suficiente para textos cortos, con reintento automático si el SDK instalado no lo soporta.
- El texto generado pasa por `_clean_generated_text` (`ai.py:76`), que normaliza espacios,
  puntuación doble y tildes faltantes en palabras clave.

> La IA solo redacta sobre un resultado ya calculado. No decide, ajusta ni recalcula el score
> (salvaguarda **S1** del handbook).

### `generate_user_explanation` — explicación para el cliente

#### Inputs

| Parámetro | Origen |
| :-------- | :----- |
| `classification` | `"Alto"` / `"Medio"` / `"Bajo"` — resultado del scoring |
| `score` | Puntaje numérico 0–100 |
| `positive_indicators` | Lista de strings generada por `calculate_score` |
| `risks` | Lista de strings de riesgos detectados por `calculate_score` |
| `extra_context` | Dict con campos adicionales del formulario (ver abajo) |

#### Extra context — campos del formulario

Campos que no afectan el score pero sí enriquecen la explicación al cliente:

| Clave | Qué es | Cuándo se incluye |
| :---- | :----- | :---------------- |
| `edad` | Edad calculada desde `birthDate` | Siempre que esté disponible |
| `plazo_credito_hipotecario` | Plazo en años elegido en el formulario | Siempre que esté disponible |
| `morosidad_actual` | `"si"` / `"no"` | Siempre |
| `monto_morosidad` | Monto CLP de deuda morosa | Solo si `morosidad_actual == "si"` |
| `antiguedad_morosidad` | Rango de antigüedad de la morosidad | Solo si `morosidad_actual == "si"` |
| `patrimonio_total_clp` | Suma de vehículos + inmuebles convertida a CLP | Solo si `declara_patrimonio == true` |
| `property_value_clp` | Valor estimado de la vivienda en CLP | Si el usuario lo ingresó |

La edad sumada al plazo se incluye explícitamente en el prompt cuando supera 70 años, para que el modelo mencione el riesgo de seguro de desgravamen. El patrimonio declarado se menciona como fortaleza del perfil. La antigüedad de la morosidad se traduce a etiqueta legible antes de enviarse al prompt.

#### Comportamiento del prompt

El prompt instruye al modelo a:
1. Redactar un párrafo único de 80–120 palabras.
2. Hablar en segunda persona (tú), tono empático, sin tecnicismos.
3. Mencionar lo positivo, luego los riesgos de forma constructiva.
4. No mencionar el puntaje exacto ni los umbrales del sistema.
5. Incorporar los datos del `extra_context` cuando estén disponibles.

Al final del texto generado se agrega el disclaimer, salvo que el modelo ya lo haya incluido (`ai.py:341`):

> Esta preevaluación es orientativa y no reemplaza una evaluación bancaria formal.


### `generate_executive_summary` — resumen ejecutivo

Recibe `classification`, `score`, `positive_indicators` y `risks`. Genera un párrafo de máximo 100 palabras dirigido al ejecutivo comercial explicando por qué el lead obtuvo esa clasificación y qué tan preparado está para avanzar en un proceso hipotecario. No habla en primera persona ni al cliente.


### `generate_commercial_guidance` — acción comercial

Recibe además `recommendations`. Devuelve un texto con formato fijo:

```
Acción: [nombre de la acción]
Motivo: [explicación en máximo 30 palabras]
```

Las acciones posibles son del estilo: "Contactar pronto", "Agendar reunión", "Mantener seguimiento", "Recontactar en algunos meses".


### Flujo de llamadas

```
POST /score
  → calculate_score(data)          # scoring.py
      → generate_user_explanation  # ai.py — para el cliente
      → generate_improvement_plan  # scoring.py — plan de mejora
      → generate_executive_summary # ai.py — para el ejecutivo
      → generate_commercial_guidance # ai.py — acción comercial
  ← result (score + clasificacion + textos IA)
```

`risk_codes` se elimina del resultado antes de devolverlo al frontend — es un artefacto interno de scoring usado solo para generar los textos.


### Archivos involucrados

| Archivo | Rol |
| :------ | :-- |
| `backend/app/ai.py` | Tres funciones de generación + wrapper Groq + limpieza de texto |
| `backend/app/scoring.py` | Orquesta las llamadas, computa `patrimonio_total_clp`, arma `extra_context` |
| `frontend/src/components/Result.jsx` | Muestra `ai_explanation` al cliente |
| `frontend/src/components/DashboardLeads.jsx` | Muestra `executive_summary` y `commercial_guidance` al ejecutivo |
