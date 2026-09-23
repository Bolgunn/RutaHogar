# ALG-16 - Comparacion de leads para un proyecto

| Field | Value |
| :---- | :---- |
| **Version** | `hu14-lead-comparison-v1` |
| **Runs on / implemented in** | frontend · `frontend/src/lib/matching/leadComparison.js` (puro, sin Supabase, sin fetch) |
| **Cases** | `docs/algorithms/ALG-16-cases.json`, cubiertos por `frontend/src/lib/matching/__tests__/leadComparison.test.js` |
| **Open assumptions** | 3 - ver `Assumptions log` |
| **Last changed** | 2026-09-22 · HU 14 · creado |

## Purpose

**Que calcula.** Una comparacion compacta, acotada a un proyecto, para hasta dos leads seleccionados por un ejecutivo.

**Cuando corre.** En la bandeja ejecutiva, despues de seleccionar un proyecto y dos leads para comparar.

**De que depende.** Usa `ALG-10` para compatibilidad/afinidad contra el proyecto, y lee score, indicadores positivos, riesgos y contexto/preferencias del lead.

**Que no hace.** No rankea todos los leads, no aprueba leads, no crea un nuevo score y no persiste decisiones. Resume evidencia para decidir a quien contactar primero para un proyecto especifico.

## Inputs -> outputs

### Inputs

`buildLeadProjectComparison(leads, project) -> ComparisonRow[]`

| Field | Path | Type | Notes |
| :---- | :--- | :--- | :--- |
| leads | `leads[]` | evaluaciones | Usa maximo dos |
| proyecto | `project` | contrato HU 7 | Obligatorio; sin proyecto retorna `[]` |
| score | `lead.result.adjusted_score ?? lead.result.score` | numero o null | Score general, no especifico del proyecto |
| clasificacion | `lead.result.classification` | string | Clasificacion general |
| match | `ALG-10` MatchRow | objeto o null | Evidencia contra el proyecto |
| preferencias/contexto | `lead.preferences`, `lead.context`, `input.*`, `onboarding.*` | strings | Senales de comuna/tipo |
| positivos/riesgos | `result.positive_indicators`, `result.risks` | arrays | Factores visibles |

### Outputs

`ComparisonRow`:

| Field | Type | Meaning |
| :---- | :--- | :---------- |
| `lead` | evaluacion | Lead original |
| `match` | MatchRow o null | Resultado `ALG-10` para el proyecto |
| `name` | string | Nombre visible |
| `score` | numero o null | Score general |
| `classification` | string | Clasificacion general |
| `capacity.valueUf` | numero o null | Capacidad en UF tomada de evidencia del match |
| `capacity.reachesMin` | bool | Si alcanza precio minimo del proyecto |
| `capacity.blocker` | string o null | Bloqueador principal del par |
| `capacity.exclusion` | string o null | Motivo de exclusion `ALG-10` |
| `affinity.value` | numero o null | Afinidad `ALG-10` |
| `affinity.classification` | string o null | `Compatible`, `Cercano`, `Marginal` |
| `affinity.communeDeclared` | bool o null | Si la comuna del proyecto aparece en contexto/preferencias |
| `affinity.typeMatches` | bool o null | Si tipo del proyecto coincide con preferencia |
| `factors.positive` | string[] | Hasta cuatro factores favorables |
| `factors.difficult` | string[] | Hasta cuatro factores que dificultan |

## Rules

### R1 - Proyecto obligatorio

Sin proyecto no hay comparacion. La funcion retorna `[]` porque E3 es explicitamente dependiente de proyecto.

### R2 - Hechos del proyecto vienen de ALG-10

Para cada lead:

```text
match = matchLeadToProjects(lead, [project]).matches[0]
     o matchLeadToProjects(lead, [project]).excluidos[0]
```

No se recalcula capacidad ni afinidad localmente.

### R3 - Score general versus encaje de proyecto

La comparacion debe mostrar ambos:

- score/clasificacion general de la evaluacion;
- capacidad/afinidad especificas contra el proyecto desde `ALG-10`.

Esto evita confundir un lead con buen score general con un lead mejor ajustado al proyecto seleccionado.

### R4 - Senal de comuna desde contexto/preferencias

`affinity.communeDeclared` compara la comuna del proyecto contra aliases conocidos:

```text
lead.preferences.comuna_*
lead.context.comuna_*
lead.input.preferences.comuna_*
lead.input.preferencias.comuna_*
lead.input.context.comuna_*
lead.input.simulation_context.comuna_*
lead.input.comuna_*
lead.input.project_goal.comuna
lead.onboarding.comuna_*
```

La comparacion normaliza espacios y minusculas. Si no existe ninguna comuna registrada, el valor es `null`.

### R5 - Senal de tipo

`affinity.typeMatches` compara `lead.onboarding.tipo_propiedad` con `project.tipo`. Si falta alguno, devuelve `null`.

### R6 - Factores favorables

Se agregan, deduplican y limitan a cuatro:

- score >= 80;
- alcanza precio minimo del proyecto;
- FOGAES podria desbloquear el par;
- comuna del proyecto declarada;
- tipo de vivienda coincide;
- textos de `result.positive_indicators`.

### R7 - Factores que dificultan

Se agregan, deduplican y limitan a cuatro:

- score < 50;
- comuna del proyecto no declarada;
- tipo de vivienda no coincide;
- bloqueador principal del par;
- `capacidad_requiere_antecedentes`;
- `capacidad_insuficiente`;
- textos de `result.risks`.

## UI obligations

- Habilitar comparacion solo con proyecto seleccionado.
- Permitir maximo dos leads.
- Mostrar score, capacidad, afinidad, senales clave y factores acotados.
- No mostrar todos los indicadores crudos; para detalle completo se abre la ficha del lead.
- En movil, apilar las tarjetas.

## Invariants and edge cases

- Sin proyecto retorna `[]`.
- Se comparan maximo dos leads.
- Capacidad y afinidad vienen de `ALG-10`.
- Los aliases de comuna en contexto/preferencias son reconocidos.
- Antecedentes faltantes de capacidad aparecen como factor dificil.

Cubierto por `frontend/src/lib/matching/__tests__/leadComparison.test.js` y documentado en `docs/algorithms/ALG-16-cases.json`.

## Assumptions log

| Assumption | Made by | Date | Would be wrong if | Status |
| :--------- | :------ | :--- | :---------------- | :----- |
| A1 - Comparar exactamente dos leads es la UX mas clara para E3. | Equipo producto/desarrollo | 2026-09-22 | Ejecutivos necesitan comparar grupos o rankings completos. | confirmed |
| A2 - Cuatro factores favorables y cuatro dificiles bastan para no saturar el modal. | Equipo desarrollo | 2026-09-22 | En uso real se necesita mas evidencia sin abrir ficha. | open |
| A3 - `tipo_propiedad` vive en onboarding; si se agregan nuevas fuentes, se deben ampliar aliases. | Equipo desarrollo | 2026-09-22 | El contrato nuevo mueve preferencia de tipo a `context` o `preferences`. | open |

## Change log

| Date | Change |
| :---- | :----- |
| 2026-09-22 | Creado para HU 14 E3. |
