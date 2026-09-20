# ALG-13 — Observed progress projection

| Field | Value |
| :---- | :---- |
| **Version** | `hu13-observed-projection-v1` |
| **Runs on / implemented in** | HU13 pure projection layer · not implemented yet |
| **Cases** | `docs/algorithms/ALG-13-cases.json` |
| **Open assumptions** | 0 |
| **Last changed** | 2026-09-20 · HU13 · created |

## Purpose

Proyectar, solo cuando la historia observada lo permite, la evolución de variables financieras y
encontrar la primera fecha futura en que el objetivo habitacional declarado alcanza
`project_fit.status == "compatible"`.

ALG-13 ajusta una regresión lineal independiente para cada variable numérica elegible usando todas
sus observaciones activas válidas. No extrapola el score. Para cada estado futuro material ejecuta
el scoring real, ALG-9 y la implementación vigente de project-fit. El score, clasificación,
capacidad y compatibilidad son salidas de esas reglas, no pendientes estadísticas.

Las proyecciones son resultados derivados: nunca crean evaluaciones históricas ni alteran
snapshots. Tampoco consultan BCCh ni otra fuente externa. Usan las versiones y supuestos disponibles
en la fecha de corte y los declaran en su procedencia.

## Inputs → outputs

### Inputs

| Input | Type | Meaning |
| :---- | :--- | :------ |
| `subject_user_id` | stable identifier | Dueño del seguimiento |
| `as_of` | timestamp | Fecha de corte explícita |
| `active_line` | complete snapshots | Línea activa de ALG-11; nunca la auditoría sin filtrar |
| `tracked_numeric_variables` | field descriptors | Variables financieras numéricas autorizadas, unidad, dominio y dirección favorable según las metas congeladas |
| `latest_effective_snapshot` | complete state | Base para construir estados futuros |
| `frozen_baseline_goals` | immutable list | Objetivos y direcciones de ALG-12; no se regeneran |
| `target_project` | object or `null` | Objetivo contra el que la implementación vigente calcula project-fit |
| `current_evaluation` | immutable result or `null` | Resultado real en la fecha de corte |
| `scoring_runner` | deterministic dependency | Ruta vigente de scoring con IA deshabilitada |
| `capacity_runner` | ALG-9 dependency | `calculate_purchase_capacity` o su adaptador puro vigente |
| `project_fit_runner` | deterministic dependency | `calculate_project_fit` vigente |
| `rule_boundary_provider` | deterministic dependency | Expone puntos de transición numéricos de las reglas vigentes sin copiarlos en ALG-13 |

`tracked_numeric_variables` no significa "todo campo con tipo number". Identificadores, fechas,
edad, plazo contractual, precios/UF de mercado, flags y categorías no adquieren una tendencia por
ser representables como números. Como mínimo HU13 sigue ahorro, deuda e ingreso cuando tienen datos
y dirección válidos. Otras variables solo entran si el contrato de seguimiento las declara
explícitamente y el motor vigente acepta proyectarlas.

Cada observación aporta `event_id`, `effective_at`, valor, estado activo y versiones de su evaluación
si existen. Un snapshot puede ser válido para una variable y no para otra.

### Outputs

```text
{
  status: projected | already_compatible | not_projectable,
  cause: null
       | insufficient_data
       | missing_project_goal
       | incomplete_state
       | non_projectable_blocker
       | no_favorable_trend
       | objective_unreachable,
  cutoff_at,
  target_compatible_at: timestamp | null,
  variables: {
    <field>: {
      status: projected | not_projectable,
      cause: null | insufficient_data | zero_slope | adverse_direction | invalid_numeric_series,
      slope_per_day: number | null,
      intercept: number | null,
      observation_ids: [event_id, ...],
      distinct_dates: integer
    }
  },
  milestones: [
    {
      at,
      projected_fields,
      score,
      classification,
      capacidad,
      project_fit
    }
  ],
  provenance: {
    active_observation_ids,
    excluded_observation_ids,
    source_scoring_versions,
    projection_scoring_version,
    capacity_version,
    market_assumptions,
    algorithm_version
  }
}
```

Toda causa `not_projectable` es explícita. `milestones` puede estar vacío, pero nunca contiene una
evaluación persistida ni se confunde con la historia real.

## Rules

### R1 — Select valid observations

Para cada variable numérica:

1. tomar solo elementos de `active_line` del mismo usuario con `effective_at <= as_of`;
2. excluir registros corregidos/anulados, aunque sigan en auditoría;
3. excluir el valor de esa variable si está ausente, es `null`, no es finito o incumple su contrato
   de dominio; y
4. conservar todas las observaciones restantes, incluso si la serie no es monótona o hay varias en
   la misma fecha.

Una variable necesita **al menos dos fechas efectivas distintas**. Dos registros del mismo instante
no bastan. Si no cumple, su estado es `not_projectable` con `cause = insufficient_data`.

### R2 — Ordinary least-squares regression

Convertir cada timestamp a días transcurridos desde la primera observación válida de esa variable:

```text
x_i = days(effective_at_i - first_effective_at)
y_i = observed numeric value in its canonical unit
x_mean = mean(x_i)
y_mean = mean(y_i)
slope = sum((x_i - x_mean) × (y_i - y_mean)) / sum((x_i - x_mean)²)
intercept = y_mean - slope × x_mean
projected(t) = intercept + slope × t
```

Se usan **todas** las observaciones activas válidas. Fechas repetidas conservan cada observación y
por tanto su peso; el requisito de dos fechas distintas garantiza denominador no nulo. La serie no
tiene que ser monótona.

No se redondea durante el ajuste. El redondeo de presentación ocurre después de ejecutar las reglas
de dominio. La unidad de pendiente se reporta siempre, por defecto `valor/día`.

### R3 — Decide whether a fitted variable may move

| Condition | Variable result | Future-state value |
| :-------- | :-------------- | :----------------- |
| fewer than 2 distinct dates | `not_projectable / insufficient_data` | latest declared value |
| zero slope | `not_projectable / zero_slope` | latest declared value |
| slope opposes the frozen goal direction | `not_projectable / adverse_direction` | latest declared value |
| invalid/non-finite regression | `not_projectable / invalid_numeric_series` | latest declared value |
| non-zero slope in the favorable direction | `projected` | regression value, constrained only by the existing field domain |

No se cambia el signo, no se sustituye por una tasa "ideal" y no se supone que una variable no
proyectable mejorará. Las restricciones naturales ya existentes, por ejemplo que una deuda no sea
negativa, se aplican desde el contrato del campo; ALG-13 no inventa nuevos topes financieros.

Situación laboral, morosidad, booleanos y categorías siempre conservan su último valor declarado.
Si uno de ellos mantiene un bloqueador que impide `compatible`, el resultado global es
`not_projectable / non_projectable_blocker`.

### R4 — Build a future financial state

Para un instante futuro `t`:

1. copiar el `latest_effective_snapshot` completo;
2. reemplazar solo las variables cuyo estado de R3 sea `projected` por su valor de regresión en
   `t`, respetando el dominio vigente;
3. mantener sin cambio todos los campos no proyectables;
4. mantener el objetivo habitacional congelado; y
5. usar los supuestos de mercado del corte como supuestos constantes y declarados, sin consultar ni
   predecir BCCh.

El estado futuro es derivado y nunca entra a ALG-11 como evento real.

### R5 — Execute real rules, never a score trend

Para cada estado material futuro:

1. ejecutar la ruta determinista vigente de scoring con IA deshabilitada;
2. obtener la capacidad desde **ALG-9** (`purchase_capacity.py`), con su versión y supuestos;
3. obtener compatibilidad desde `project_fit.py`; y
4. registrar score, clasificación, capacidad y project-fit devueltos.

Cuando el orquestador de scoring ya invoca ALG-9 y project-fit, se consumen esas salidas y no se
ejecutan dos veces. ALG-13 no copia pesos, thresholds, bloqueadores, fórmulas de capacidad ni reglas
de compatibilidad.

Está prohibido ajustar una regresión al score o sumar "X puntos por mes". Un cambio futuro de score
solo existe si la ejecución real de las reglas sobre un estado futuro lo produce.

### R6 — Complete and finite milestone set

La fecha objetivo es la primera fecha futura en que `project_fit.status == "compatible"`. Para poder
probar que es realmente la primera sin inventar un horizonte, se evalúa el conjunto completo de
**hitos materiales**:

- el corte actual;
- cada instante en que una variable proyectada cruza un límite de su dominio;
- cada instante en que cruza un punto de transición consumido por scoring, ALG-9 o project-fit; y
- inmediatamente antes y después de cada transición cuando la comparación estricta/inclusiva lo
  requiera.

Los puntos de transición se obtienen de `rule_boundary_provider`, que referencia las constantes y
predicados de las implementaciones vigentes. No se redeclaran en ALG-13. Entre dos hitos consecutivos
ninguna decisión discreta puede cambiar; para fórmulas continuas se resuelve el cruce con el mismo
predicado vigente. El resultado se normaliza a la primera fecha representable por el contrato de
producto.

Si, después de agotar todos los hitos alcanzables, project-fit nunca es compatible, el resultado es
`not_projectable / objective_unreachable`. Esto cubre una pendiente favorable que no basta para
alcanzar el objetivo sin recurrir a un límite temporal arbitrario.

**Integration prerequisite.** Hoy `scoring.py`, `project_fit.py` y parte de sus thresholds no
exponen un contrato de puntos de transición. La Build debe crear un adaptador puro que los lea desde
la fuente normativa vigente o permita resolver sus cruces, sin duplicar números. Hasta que exista,
no es válido reemplazar R6 por un horizonte o una cantidad fija de meses.

### R7 — Final objective

| Condition | Global result |
| :-------- | :------------ |
| target exists and current `project_fit.status == "compatible"` | `already_compatible`; `target_compatible_at = as_of` |
| no target project | `not_projectable / missing_project_goal` |
| current state cannot execute required real rules | `not_projectable / incomplete_state` |
| a held categorical/blocker condition prevents compatibility | `not_projectable / non_projectable_blocker` |
| no variable has a favorable projectable trend and current state is not compatible | `not_projectable / no_favorable_trend` |
| first future real execution returns `compatible` | `projected`; return that first date |
| all reachable material states remain non-compatible | `not_projectable / objective_unreachable` |

Score `Alto`, capacidad mayor o igual al precio, o la mejora de una variable aislada nunca sustituyen
el predicado final.

### R8 — Versions and auditability

La procedencia incluye todas las observaciones usadas, las excluidas por corrección/anulación,
versiones históricas encontradas, versión de scoring ejecutada al corte, versión/supuestos de ALG-9,
supuestos de mercado y versión de ALG-13.

Versiones históricas distintas no recalculan ni invalidan esas evaluaciones. La regresión usa los
antecedentes numéricos declarados de sus snapshots activos; el estado futuro se evalúa completo con
la versión vigente explícitamente registrada para la proyección.

## Invariants and edge cases

**Invariants:**

1. Solo observaciones activas del mismo usuario pueden afectar una pendiente.
2. Cada pendiente usa todas las observaciones válidas de su variable y al menos dos fechas distintas.
3. Una variable no proyectable conserva su último valor; nunca se supone una mejora.
4. Score y clasificación provienen del motor real, no de interpolación.
5. Capacidad proviene de ALG-9 y compatibilidad de `project_fit.py`; sus reglas no se duplican.
6. La fecha objetivo existe solo para el primer estado cuyo project-fit real es `compatible`.
7. Una proyección nunca agrega, modifica ni elimina una evaluación histórica.
8. Fecha de corte, observaciones, exclusiones, versiones y supuestos siempre viajan con el resultado.
9. Mismos inputs y mismas versiones producen la misma salida; no intervienen IA, reloj implícito,
   aleatoriedad ni red.
10. ALG-13 no depende de BCCh ni de `feat/scoring-bcch`.

**Edge cases:** cero o una observación; fechas repetidas; pendiente cero o adversa; ahorro creciente;
deuda decreciente; serie no monótona; corrección que elimina un outlier; objetivo ya compatible;
objetivo ausente; datos incompletos; cruce real de un threshold de score; capacidad suficiente sin
project-fit compatible; bloqueador categórico no proyectable; versiones históricas distintas;
valores nulos/no finitos; varias observaciones válidas en una fecha.

## Dependencies and non-dependencies

- **Consumes ALG-11:** only its active line; audit-only records are provenance, never observations.
- **Consumes ALG-9:** purchase capacity and `capacidad_supuestos`.
- **Consumes current code:** deterministic scoring in `backend/app/scoring.py` with AI disabled and
  project fit in `backend/app/scoring_engine/project_fit.py`.
- **Does not consume ALG-8:** housing-benefit detection is not the final compatibility predicate.
- **Does not consume ALG-10:** lead–catalog affinity is a commercial ranking, not compatibility with
  the user's frozen objective.
- **Does not consume BCCh:** the latest available market snapshot is held and disclosed, not fetched
  or forecast.

## Assumptions log

No open assumptions. Linear regression, two distinct dates, held non-projectable fields and
`project_fit.status == "compatible"` are explicit HU13 Grill decisions. R6 adds no horizon or
financial threshold; it is the completeness requirement needed to implement "first date".
