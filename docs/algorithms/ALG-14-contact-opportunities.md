# ALG-14 - Deteccion de oportunidades de contacto

| Field | Value |
| :---- | :---- |
| **Version** | `hu14-contact-opportunities-v1` |
| **Runs on / implemented in** | frontend · `frontend/src/lib/matching/contactOpportunities.js` (puro, sin Supabase, sin fetch) |
| **Cases** | `docs/algorithms/ALG-14-cases.json`, cubiertos por `frontend/src/lib/matching/__tests__/contactOpportunities.test.js` |
| **Open assumptions** | 3 - ver `Assumptions log` |
| **Last changed** | 2026-09-22 · HU 14 · creado |

## Purpose

**Que calcula.** A partir del historial de evaluaciones y de los proyectos visibles para el ejecutivo comercial, identifica leads cuya ultima evaluacion produjo una nueva oportunidad de contacto.

**Cuando corre.** En el dashboard ejecutivo, despues de cargar evaluaciones y proyectos disponibles/asignados. Alimenta la tarjeta de oportunidades, el modal y la notificacion.

**De que depende.** Usa `ALG-10` para compatibilidad/afinidad contra proyectos y `leadRanking.js` para posiciones top-N. Lee evaluaciones persistidas con forma `{ input, onboarding, result, created_at }`.

**Que no hace.** No modifica scoring, matching, persistencia, permisos ni CRM. Es una capa de priorizacion comercial de solo lectura.

## Inputs -> outputs

### Inputs

`detectContactOpportunities(evaluations, projects, options) -> Opportunity[]`

| Field | Path | Type | Notes |
| :---- | :--- | :--- | :--- |
| identidad del lead | `user_id` o `email` o `id` | string | Agrupa evaluaciones del mismo lead |
| fecha | `created_at` | fecha ISO | Ordena ultima y anterior evaluacion |
| score | `result.adjusted_score ?? result.score` | numero o null | Evidencia y delta; no decide por si solo |
| clasificacion | `result.classification` | string | `Alto`, `Medio`, `Bajo` u otro valor persistido |
| proyectos | `projects[]` | contrato HU 7 | Universo visible para el ejecutivo |
| limite top | `options.topLimit` | entero | Por defecto 10 |

### Outputs

`Opportunity`:

| Field | Type | Meaning |
| :---- | :--- | :---------- |
| `id` | string | Id estable de UI: lead + ultima evaluacion |
| `lead` | evaluacion | Ultima evaluacion |
| `previous` | evaluacion | Evaluacion anterior del mismo lead |
| `primary` | trigger | Motivo principal mostrado primero |
| `triggers` | trigger[] | Todos los motivos detectados |
| `score_delta` | numero o null | Variacion de score |
| `latest_score`, `previous_score` | numero o null | Evidencia visible |
| `created_at` | fecha ISO | Fecha de la ultima evaluacion |

Tipos de `trigger.type`: `score_high`, `capacity`, `compatibility`, `affinity_top`.

## Rules

### R1 - Agrupacion por lead

Las evaluaciones se agrupan por `user_id`, luego `email`, luego `id`. Solo grupos con al menos dos evaluaciones pueden generar oportunidad, porque este algoritmo detecta cambios.

### R2 - Oportunidad por prioridad general Alta

Se crea `score_high` cuando:

```text
latest.result.classification == "Alto"
y previous.result.classification != "Alto"
```

Si ambos scores existen, el detalle debe indicar la variacion.

### R3 - Oportunidad por capacidad para proyecto

Para cada proyecto visible se calcula el match ultimo y anterior con `ALG-10`. Se crea `capacity` cuando:

```text
latestMatch.evidencia.alcanza_precio_min == true
```

Un match ultimo excluido no genera trigger de proyecto.

### R4 - Oportunidad por compatibilidad

Se crea `compatibility` cuando:

```text
latestMatch.clasificacion == "Compatible"
y previousMatch.clasificacion != "Compatible"
y latestMatch.motivo_exclusion == null
```

### R5 - Oportunidad por entrada a top-N

Para cada proyecto se rankean leads actuales y anteriores. Se crea `affinity_top` cuando un lead entra al top `N` del proyecto y antes no estaba en ese top. `N = 10` por defecto.

### R6 - Ordenamiento

Las oportunidades se ordenan por:

1. mejor ranking del motivo principal, si existe;
2. mayor `score_delta`;
3. evaluacion mas reciente.

## UI obligations

- Mostrar que cambio produjo la oportunidad.
- Mostrar un motivo principal, conservando todos los triggers.
- Permitir descartar oportunidades sin mutar evaluaciones.
- El descarte es local y se guarda por ejecutivo en `localStorage`.

## Invariants and edge cases

- Un lead con una sola evaluacion no genera oportunidad por cambio.
- Pasar a `Alto` genera `score_high`.
- Pasar a `Compatible` para un proyecto genera `compatibility`.
- Las etiquetas duplicadas se deduplican en UI, no en la lista normativa de triggers.

Cubierto por `frontend/src/lib/matching/__tests__/contactOpportunities.test.js` y documentado en `docs/algorithms/ALG-14-cases.json`.

## Assumptions log

| Assumption | Made by | Date | Would be wrong if | Status |
| :--------- | :------ | :--- | :---------------- | :----- |
| A1 - El universo correcto para detección de oportunidades es con respecto a los proyectos visibles/asignados al ejecutivo. | Equipo producto/desarrollo | 2026-09-22 | E2 debe interpretarse solo contra `project_goal` del lead. | open |
| A2 - Top 10 es suficiente para detectar una entrada comercialmente relevante. | Equipo desarrollo | 2026-09-22 | Los ejecutivos necesitan un umbral distinto por volumen de cartera. | open |
| A3 - El descarte local es aceptable mientras no exista CRM/tareas persistentes. | Equipo producto/desarrollo | 2026-09-22 | Se requiere trazabilidad auditada de descartes. | open |

## Change log

| Date | Change |
| :---- | :----- |
| 2026-09-16 | Creado para HU 14 E2. |
