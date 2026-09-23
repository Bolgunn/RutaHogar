# ALG-15 - Preguntas sugeridas para abordaje comercial

| Field | Value |
| :---- | :---- |
| **Version** | `hu14-contact-questions-v1` |
| **Runs on / implemented in** | frontend · `frontend/src/lib/commercial/contactQuestions.js` (puro, sin Supabase, sin fetch) |
| **Cases** | `docs/algorithms/ALG-15-cases.json`, cubiertos por `frontend/src/lib/commercial/__tests__/contactQuestions.test.js` |
| **Open assumptions** | 4 - ver `Assumptions log` |
| **Last changed** | 2026-09-22 · HU 14 · creado |

## Purpose

**Que calcula.** Una lista priorizada de preguntas sugeridas para que el ejecutivo prepare el contacto comercial con un lead.

**Cuando corre.** En la ficha del lead, una vez conocidos el lead seleccionado, el proyecto seleccionado y el match contra ese proyecto, si existe.

**De que depende.** Lee informacion financiera, contextual y de preferencias del lead; tambien lee proyecto seleccionado y match de `ALG-10`.

**Que no hace.** No entrega asesoria crediticia, no aprueba financiamiento, no modifica scoring y no infiere hechos no presentes en la evaluacion. Solo sugiere preguntas para obtener informacion relevante que no se puede deducir desde numeros financieros.

## Inputs -> outputs

### Inputs

`buildContactQuestions({ lead, selectedProject, selectedMatch }) -> ContactQuestion[]`

| Field | Path | Type | Notes |
| :---- | :--- | :--- | :--- |
| score | `lead.result.adjusted_score ?? lead.result.score` | numero o null | Preguntas por tramo |
| clasificacion | `lead.result.classification` | string | `Alto`, `Medio`, `Bajo` |
| plazo de compra | `lead.input.plazo_compra` | string | Senal de urgencia |
| propiedad vista | `lead.input.tiene_propiedad_vista` | bool/string/ausente | Etapa de busqueda |
| ahorro | `lead.input.ahorro_disponible` | CLP | Disponibilidad real de pie |
| ingreso | `lead.input.ingreso_mensual` | CLP/mes | Se usa junto a ahorro |
| deuda | `lead.input.deuda_mensual` | CLP/mes | Contexto de deuda |
| contrato | `lead.input.tipo_contrato` | string | Estabilidad laboral |
| comunas/preferencias | `input`, `onboarding`, `context`, `preferences` | strings | Flexibilidad territorial |
| proyecto seleccionado | `selectedProject` | contrato HU 7 | Opcional |
| match seleccionado | `selectedMatch` | MatchRow de `ALG-10` | Opcional |

### Outputs

`ContactQuestion`:

| Field | Type | Meaning |
| :---- | :--- | :---------- |
| `id` | string | Identificador estable para tests/UI |
| `category` | string | Chip visible |
| `question` | string | Pregunta sugerida |
| `reason` | string | Motivo comercial de la pregunta |

La prioridad interna solo ordena y no se expone a la UI.

## Rules

### R1 - Preguntas base

Siempre existe un conjunto base reducido: motivacion de compra, participantes en la decision y tradeoff entre comuna, precio, entrega y tipo de vivienda. Estas preguntas tienen menor prioridad que las preguntas contextuales.

### R2 - Preguntas por score/clasificacion

| Condition | Intent |
| :-------- | :-------- |
| `Alto` o score >= 80 | Confirmar siguiente paso y disposicion a visita/revision de proyecto |
| `Medio` o 50 <= score < 80 | Identificar principal barrera: pie, dividendo, documentacion, plazo o proyecto |
| `Bajo` o score < 50 | Definir si busca comprar ahora o preparar un plan futuro |

### R3 - Sin proyecto seleccionado

Si no hay proyecto seleccionado, se pregunta por la condicion irrenunciable de busqueda. No se hacen supuestos de proyecto.

### R4 - Con proyecto seleccionado

| Condition | Intent |
| :-------- | :-------- |
| Proyecto seleccionado distinto a `input.project_goal` | Medir apertura a evaluar ese proyecto |
| Comuna del proyecto fuera de preferencias/contexto | Medir disposicion a evaluar comuna no declarada |
| Match `Compatible` | Descubrir que informacion necesita para avanzar |
| Brecha por `ahorro` | Validar fuentes adicionales de pie |
| Brecha por `ingreso` | Validar complemento de renta o codeudor |

### R5 - Triggers financieros/contextuales

| Condition | Intent |
| :-------- | :-------- |
| Plazo corto | Preparacion con banco, documentos o preaprobacion |
| Sin propiedad vista o desconocida | Etapa de busqueda |
| Ahorro >= 6x ingreso mensual | Disponibilidad real del ahorro |
| Deuda > 0 | Si la deuda es temporal, renegociable o permanente |
| Comuna alternativa | Flexibilidad territorial |
| Capacidad requiere antecedentes | Ingresos adicionales, variables o complementarios |
| Contrato no indefinido | Cambios laborales esperados |

### R6 - Orden y largo visible

Las preguntas se ordenan por prioridad descendente. La UI puede mostrar las primeras cinco y ofrecer `Ver mas`.

## UI obligations

- Mostrar categoria, pregunta y motivo.
- Permitir copiar preguntas.
- No presentar preguntas como requisitos formales de credito.
- Ubicar el bloque en la ficha del lead, antes del historial.

## Invariants and edge cases

- Las preguntas base siempre existen.
- Plazo corto y antecedentes faltantes superan a preguntas base.
- La pregunta por comuna fuera de preferencias solo aparece con proyecto seleccionado y comuna no declarada.
- Clasificacion alta y baja producen preguntas diferentes.

Cubierto por `frontend/src/lib/commercial/__tests__/contactQuestions.test.js` y documentado en `docs/algorithms/ALG-15-cases.json`.

## Assumptions log

| Assumption | Made by | Date | Would be wrong if | Status |
| :--------- | :------ | :--- | :---------------- | :----- |
| A1 - Preguntas deterministicas son preferibles a IA generativa para este flujo comercial. | Equipo producto/desarrollo | 2026-09-22 | Se requiere personalizacion libre no deterministica y revisada por humano. | confirmed |
| A2 - Cinco preguntas visibles son suficientes para preparar el primer contacto. | Equipo desarrollo | 2026-09-22 | Ejecutivos necesitan ver mas preguntas sin interaccion adicional. | open |
| A3 - Ahorro >= 6x ingreso mensual justifica preguntar disponibilidad real de fondos. | Equipo desarrollo | 2026-09-22 | Datos reales muestran que ese umbral no predice disponibilidad de pie. | open |
| A4 - Las preferencias de comuna pueden vivir en `context`, `preferences`, `input` u `onboarding`; se leen aliases seguros conocidos. | Equipo desarrollo | 2026-09-22 | El contrato de evaluaciones se normaliza a una sola fuente obligatoria. | confirmed |

## Change log

| Date | Change |
| :---- | :----- |
| 2026-09-22 | Creado para HU 14 E4. |
