# ALG-12 — Baseline goal progress

| Field | Value |
| :---- | :---- |
| **Version** | `hu13-goal-progress-v2` |
| **Runs on / implemented in** | `backend/app/tracking/goal_progress.py` |
| **Cases** | `docs/algorithms/ALG-12-cases.json` |
| **Open assumptions** | 0 |
| **Last changed** | 2026-09-20 · HU13 · implemented v2 without rule changes |

## Purpose

Calcular el progreso actual de cada acción o meta contra el plan congelado en el baseline de
HU13. El resultado separa dos preguntas:

- **estado de acción:** `pendiente`, `en_progreso` o `cumplida`; y
- **estado temporal E2:** `adelantado`, `dentro_de_lo_esperado` o `atrasado`.

La separación evita considerar "cumplida" una meta solo porque va adelantada, o considerarla
"atrasada" cuando ya está cumplida. El algoritmo soporta metas numéricas de aumento o reducción,
booleanas, categóricas y metas no verificables confirmables por el usuario.

ALG-12 no genera ni retoca metas, no recalcula scoring y no regenera el plan. Consume el plan y
las reglas de verificación que quedaron congeladas en la primera evaluación/plan válido. Cuando una
meta remite a scoring, bloqueadores o project-fit, se consume el resultado de la implementación
vigente; no se copian sus thresholds aquí.

## Inputs → outputs

### Inputs

| Input | Type | Meaning |
| :---- | :--- | :------ |
| `goal` | immutable object | Meta congelada: id, tipo, valor inicial, objetivo, unidad, dirección, verificabilidad y fecha objetivo |
| `baseline_at` | timestamp | Inicio de la trayectoria; fecha de la primera evaluación válida |
| `target_at` | timestamp or `null` | Fecha objetivo congelada; puede derivarse del plazo original del plan |
| `as_of` | timestamp | Fecha de corte explícita; nunca se toma del reloj implícitamente |
| `current_snapshot` | complete effective state | Último estado activo producido por ALG-11 |
| `current_evaluation` | immutable result or `null` | Resultado vigente de scoring/blockers/project-fit cuando la verificación lo requiere |
| `manual_confirmation` | object or `null` | Confirmación del propio usuario, con id y fecha, solo aplicable a metas no verificables |
| `prior_goal_events` | list | Resultados históricos append-only de esta meta, incluidos cumplimientos anteriores |

Una meta verificable debe traer una referencia de verificación congelada: campo fuente, dirección
y objetivo, o un predicado identificado que pertenece a la lógica vigente. ALG-12 no interpreta
texto libre para inventar un comparador.

### Outputs

```text
{
  goal_id,
  calculation_status: ok | insufficient_data,
  action_status: pendiente | en_progreso | cumplida,
  temporal_status: adelantado | dentro_de_lo_esperado | atrasado | null,
  temporal_status_reason: null | insufficient_data | missing_target_date,
  progress: {
    initial_value,
    current_value,
    target_value,
    percentage,          # [0, 100] or null
    remaining_value      # numeric gap, unmet condition, or null
  },
  schedule: {
    expected_percentage, # [0, 100] or null
    tolerance_pp: 5
  },
  verification: {
    verifiable,
    source,
    manual_confirmation_received,
    manual_confirmation_accepted,
    rejection_reason
  },
  evidence: {
    ever_completed,
    completion_event_ids,
    currently_regressed
  }
}
```

Para una meta booleana o categórica no cumplida, `remaining_value` contiene la condición objetivo;
cuando se cumple es `null`. Para una meta no calculable, `percentage` y `remaining_value` son
`null`; no se fabrica avance.

## Rules

### R1 — Frozen baseline

La meta, su valor inicial, objetivo, dirección, verificabilidad, predicado y fecha objetivo provienen
exclusivamente del baseline. Una evaluación posterior puede cambiar el valor actual, pero no esos
campos. Una meta cumplida continúa visible y su evidencia histórica nunca se elimina.

### R2 — Numeric progress

**Already-satisfied baseline takes precedence.** Evaluate the comparator from the frozen
`direction`: `current <= target` for reduction, `current >= target` for increase. If the
initial value already satisfies that comparator, preserve the original direction, initial value,
and target, even when they do not form a normal progress interval. Do not correct, invert, or
regenerate the goal.

| Frozen direction | Baseline already satisfied | Current fulfillment | Percentage | Remaining value |
| :--------------- | :------------------------- | :------------------ | :--------- | :-------------- |
| `reduce` | `initial <= target` | `current <= target` | `100` if fulfilled, otherwise `0` | `max(current - target, 0)` |
| `increase` | `initial >= target` | `current >= target` | `100` if fulfilled, otherwise `0` | `max(target - current, 0)` |

This includes equality and requires no division. A later loss of fulfillment reopens the
effective action to `pendiente`; subsequent fulfillment returns it to `cumplida`. R8 preserves
earlier completion evidence. Missing data still follows R5 and does not fabricate a percentage.
For example, `reduce_debt` with `initial = 200000` and `target = 300000` stays at `100%`
while `current <= 300000`; at `current = 400000` it has `0%` progress and `100000` remaining.

Only when the baseline does **not** already satisfy the comparator, use the normal interval:

Para una meta de aumento (`direction = increase`, `target > initial`):

```text
raw_percentage = 100 × (current - initial) / (target - initial)
remaining_value = max(target - current, 0)
fulfilled = current >= target
```

Para una meta de reducción (`direction = reduce`, `target < initial`):

```text
raw_percentage = 100 × (initial - current) / (initial - target)
remaining_value = max(current - target, 0)
fulfilled = current <= target
```

En ambos casos:

```text
percentage = clamp(raw_percentage, 0, 100)
```

El valor actual no se clampa: un empeoramiento real sigue visible aunque el porcentaje mostrado sea
`0`, y un sobrecumplimiento sigue visible aunque el porcentaje sea `100`.

Si `target == initial`, aplica la tabla de baseline ya satisfecho, incluido el restante numérico
`0` cuando se cumple; no se sustituye por `null`.

### R3 — Boolean and categorical progress

| Goal type | Fulfilled | Percentage | Remaining value |
| :-------- | :-------- | :--------- | :-------------- |
| boolean | current equals target | `100` if true, otherwise `0` | `null` if fulfilled, otherwise target boolean |
| categorical | current equals target, or existing referenced predicate says true | `100` if true, otherwise `0` | `null` if fulfilled, otherwise target category |

No se inventa orden entre categorías. Un avance parcial categórico solo existe si el plan
congelado referencia un predicado vigente que lo produce; de lo contrario la comparación es exacta.

### R4 — Verifiable and non-verifiable goals

| Condition | Effective verification |
| :-------- | :--------------------- |
| verifiable goal, current data fulfills predicate | automatic `cumplida`; manual input is irrelevant |
| verifiable goal, current data contradicts predicate | cannot be manually forced to `cumplida`; confirmation is rejected with `verifiable_data_contradiction` |
| non-verifiable goal, valid owner confirmation exists | `100%`, `cumplida` |
| non-verifiable goal, no confirmation | `0%`, `pendiente` |

La confirmación manual también es un evento append-only; revocarla crea otro evento, no elimina el
anterior. Solo el propietario puede confirmar.

### R5 — Action status

| Condition | `action_status` |
| :-------- | :-------------- |
| fulfilled / percentage `100` | `cumplida` |
| calculable and `0 < percentage < 100` | `en_progreso` |
| calculable and percentage `0` | `pendiente` |
| insufficient current data and prior effective state exists | retain prior effective action state, but `calculation_status = insufficient_data` |
| insufficient current data and no prior effective state | `pendiente`, with `calculation_status = insufficient_data` |

Retener un estado por falta de datos no crea una nueva evidencia de cumplimiento. Al reaparecer el
dato, el estado vuelve a calcularse automáticamente.

### R6 — Expected linear trajectory

La trayectoria esperada es lineal desde `baseline_at` hasta `target_at`:

```text
expected_percentage = clamp(
  100 × (as_of - baseline_at) / (target_at - baseline_at),
  0,
  100
)
```

Si `target_at <= baseline_at`, el esperado es `100` desde el baseline. Si falta una fecha válida o
el progreso actual es insuficiente, `expected_percentage` y `temporal_status` son `null` y se entrega
la causa; no se inventa trayectoria.

### R7 — E2 temporal status

`TOLERANCE_PP = 5`, cerrada por la Grill de HU13.

| Condition | `temporal_status` |
| :-------- | :---------------- |
| `actual > expected + 5 pp` | `adelantado` |
| `actual < expected - 5 pp` | `atrasado` |
| otherwise, including exactly `expected ± 5 pp` | `dentro_de_lo_esperado` |

El estado temporal se calcula con porcentajes ya limitados a `[0, 100]`. No cambia el estado de
acción ni la verificación de cumplimiento.

### R8 — Regression and evidence

Cada cálculo vigente usa el valor actual. Si una variable empeora después de estar cumplida, puede
volver a `en_progreso` o `pendiente`. `prior_goal_events` conserva el evento cumplido:

- `ever_completed = true` si existe al menos un evento activo histórico con `cumplida`;
- `completion_event_ids` lista esos eventos en orden determinista; y
- `currently_regressed = ever_completed && action_status != cumplida`.

Corregir/anular un evento mediante ALG-11 puede retirarlo de esta evidencia efectiva, pero el evento
sigue visible en la auditoría completa.

## Invariants and edge cases

**Invariants:**

1. El baseline y la definición de la meta nunca son reemplazados por una evaluación posterior.
2. `percentage` y `expected_percentage`, cuando existen, siempre están en `[0, 100]`.
3. Una meta verificable nunca queda `cumplida` contra los datos actuales por orden manual.
4. Los estados de acción y temporales pertenecen a enumeraciones distintas y no se sustituyen.
5. Un empeoramiento puede reducir el porcentaje y reabrir el estado efectivo.
6. La evidencia previa de cumplimiento no se borra por una regresión.
7. Igual baseline, snapshot, fecha de corte y eventos producen igual resultado; no intervienen IA,
   aleatoriedad ni reloj implícito.
8. Ninguna regla o threshold de scoring se redefine en este algoritmo.
9. An already-satisfied quantitative baseline preserves its original direction and values and
   yields only `0%` or `100%` when calculable, even after regression and renewed fulfillment.

**Edge cases:** meta cumplida en baseline; objetivo igual al valor inicial; aumento y reducción;
progreso parcial; sobrecumplimiento; regresión; metas booleanas y categóricas; dato insuficiente;
confirmación manual contradictoria; meta no verificable; desaparición y reaparición de una
condición; límites exactos de tolerancia `±5 pp`; fecha objetivo ausente o no posterior al baseline.
Also: reduction with `initial < target` and increase with `initial > target`; continued
fulfillment at the exact target, regression across it, and return to fulfillment.

## Dependencies and non-dependencies

- **Consumes ALG-11:** el snapshot efectivo actual y solo los eventos de meta activos para la
  evidencia histórica.
- **Consumes the frozen plan contract:**
  `backend/app/scoring_engine/improvement_plan.py` is the current implementation that emits
  quantitative `current_value`, `target_value` and `estimated_months`; those values are copied into
  the baseline, never recalculated by ALG-12.
- **References current scoring outputs:** when a goal is verified by a blocker, score or
  project-fit result, ALG-12 consumes that result and version; it does not restate the rule.
- **Does not consume `monthlyPlanService.js`:** its generated targets and status vocabulary are a
  legacy UI calculation, not the frozen normative baseline.
- **Does not regenerate `result.improvement_plan`:** that second, legacy plan representation lacks
  quantitative targets for several actions and is not a substitute for the goal contract.

## Assumptions log

No open assumptions. The linear trajectory and `±5` percentage-point tolerance are explicit HU13
Grill decisions, not developer judgments.

The `v2` already-satisfied baseline rule was explicitly confirmed by the user on 2026-09-20
after reproducing a `reduce_debt` action with initial `200000` and target `300000` from the
existing structured plan generator. It changes no generator or scoring rule.
