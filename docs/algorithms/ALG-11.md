# ALG-11 — Immutable tracking lineage

| Field | Value |
| :---- | :---- |
| **Version** | `hu13-lineage-v1` |
| **Runs on / implemented in** | HU13 pure tracking layer · not implemented yet |
| **Cases** | `docs/algorithms/ALG-11-cases.json` |
| **Open assumptions** | 0 |
| **Last changed** | 2026-09-20 · HU13 · created |

## Purpose

Construir el historial efectivo de seguimiento de un usuario sin modificar ni eliminar ningún
registro previo. Cada actualización de datos, evaluación y corrección agrega un evento. El algoritmo
produce dos vistas distintas del mismo conjunto append-only:

- la **línea activa**, usada por gráficos, estadísticas, progreso y proyecciones; y
- la **línea completa de auditoría**, que conserva también originales, correcciones y anulaciones.

La separación es necesaria porque una corrección histórica puede cambiar el estado efectivo de
eventos posteriores sin autorizar que esos registros almacenados se reescriban. La línea activa se
reconstruye reproduciendo los parches vigentes en orden; la auditoría conserva el snapshot completo
que acompañó a cada evento cuando fue registrado.

El algoritmo no decide persistencia, nombres de tablas ni columnas. `previous`, `correction_of` y
`annuls` son relaciones semánticas; una implementación puede representarlas de otra manera si
preserva exactamente sus significados e invariantes.

## Inputs → outputs

### Inputs

| Input | Type | Meaning |
| :---- | :--- | :------ |
| `actor_user_id` | stable identifier | Usuario autenticado que intenta agregar el evento |
| `subject_user_id` | stable identifier | Dueño de todos los antecedentes del seguimiento |
| `baseline` | immutable reference | Primera evaluación/plan válido del flujo HU13; fija identidad, plan y metas congeladas |
| `latest_effective_snapshot` | object or `null` | Estado completo vigente antes de procesar el evento |
| `event_id` | unique idempotency key | Identidad estable del intento lógico, provista antes de persistir |
| `event_kind` | enum | `baseline`, `data_update`, `evaluation` o `correction` |
| `effective_at` | timestamp | Momento del dominio al que corresponde el estado |
| `recorded_at` | timestamp | Momento autoritativo en que el evento fue aceptado |
| `reason` | non-empty string/code | Motivo declarativo; nunca una inferencia de fraude |
| `patch` | presence-preserving map | Campos enviados; distingue omitido, valor y `null` explícito |
| `previous` | event reference or `null` | Evento fuente inmediatamente anterior para una alta normal |
| `correction_of` | event reference or `null` | Registro que una corrección reemplaza o anula lógicamente |
| `correction_effect` | enum or `null` | `replace` o `annul`; solo para `correction` |
| `history` | ordered-independent event set | Todos los registros previos, incluidos los no activos |
| `field_contract` | field metadata | Validez de tipo y si cada campo admite `null`; no contiene reglas de scoring |

El input debe conservar la **presencia** de cada clave. Un mapa que convierta por anticipado
"omitido" y `null` en el mismo valor no cumple el contrato.

Cada registro histórico contiene, como mínimo, su usuario, `event_id`, tipo, ambos timestamps,
motivo, parche original, snapshot completo al registrar, relaciones de linaje y versión del
algoritmo. Una evaluación agrega además las versiones y supuestos que produjo el motor, pero ALG-11
no recalcula ese resultado.

### Outputs

```text
{
  outcome: appended | idempotent_replay | rejected | idempotency_conflict,
  new_complete_snapshot: object | null,
  appended_record: event | null,
  active_line: [effective_state, ...],
  audit_line: [event, ...],
  latest_effective_snapshot: object | null,
  excluded_from_metrics: [event_id, ...],
  error: null | owner_mismatch | invalid_lineage | invalid_patch |
}
```

Cada elemento de `active_line` identifica el registro fuente y contiene el snapshot completo
reconstruido para ese punto. `audit_line` contiene los registros originales sin sustituir su
snapshot almacenado. Un resultado rechazado no agrega nada.

## Rules

### R1 — Ownership boundary

| Condition | Effect | Message shown |
| :-------- | :----- | :------------ |
| `actor_user_id != subject_user_id` | reject with `owner_mismatch` | No puedes actualizar el seguimiento de otro usuario. |
| any referenced event belongs to another user | reject with `owner_mismatch` | No puedes usar antecedentes de otro usuario. |
| all events and references belong to the subject | continue | — |

No se mezclan usuarios ni siquiera para resolver una referencia. La autorización ocurre antes de
crear el registro append-only.

### R2 — Partial patch semantics

Para cada campo definido por `field_contract`:

| Patch state | Effect |
| :---------- | :----- |
| key omitted | copy the value from the preceding effective state |
| key present with a valid value | replace that field with the supplied value |
| key present with `null` and field allows `null` | set the field explicitly to `null` |
| key present with `null` and field forbids `null` | reject the complete event as `invalid_patch` |
| unknown or invalid value | reject the complete event as `invalid_patch` |

La operación es atómica: no existe un registro parcialmente aceptado. Los valores pueden mejorar,
mantenerse o empeorar. ALG-11 no impone monotonía a ahorro, deuda, ingreso, score ni clasificación.

La primera evaluación válida no tiene estado anterior: su parche debe bastar para construir un
snapshot completo según el contrato de entrada vigente. Ese evento fija el baseline lógico.

### R3 — Semantic lineage

| Relation | Meaning |
| :------- | :------ |
| `previous` | para `data_update` o `evaluation`, referencia el último registro fuente de la línea activa conocido al aceptar el evento |
| `correction_of` | referencia exacta al registro cuya posición lógica se corrige; seguir correcciones previas lleva al mismo slot original |
| `annuls` | conjunto derivado de registros desplazados de la línea activa por la corrección ganadora |

Una corrección `replace` ocupa el mismo slot lógico y conserva el `effective_at` del registro
corregido; su `recorded_at` sigue mostrando cuándo se corrigió. Una corrección `annul` elimina ese
slot solo de la línea activa. En ambos casos, todos los registros continúan en auditoría.

La identidad del baseline, su plan y sus metas congeladas nunca cambian. Si se corrigen antecedentes
de su snapshot, la corrección ocupa el slot del baseline, pero no reemplaza el plan ni crea otro
baseline.

### R4 — Resolve active slots

1. Validar que todas las referencias existan, pertenezcan al usuario y no formen ciclos.
2. Agrupar cada registro original y todas sus correcciones transitivas en un mismo slot lógico.
3. Para un slot sin correcciones, seleccionar el registro original.
4. Para un slot con correcciones, seleccionar la corrección máxima por
   `(recorded_at, event_id)`. Esta regla resuelve determinísticamente correcciones concurrentes y
   timestamps iguales.
5. Si la ganadora es `annul`, omitir el slot activo. Si es `replace`, usar su parche como parche
   vigente del slot.

Las correcciones perdedoras y los registros reemplazados aparecen en `annuls` y
`excluded_from_metrics`; no se borran ni se etiquetan como fraude.

### R5 — Rebuild the effective line

Los slots activos se ordenan por la clave total:

```text
(effective_at, original_recorded_at, original_event_id)
```

El slot del baseline va primero. Ante igualdad de timestamps, la clave completa evita depender del
orden de lectura de la base de datos.

Desde el baseline se aplican, en orden, los parches vigentes de cada slot. Cada resultado de replay
es un snapshot completo y forma un elemento de `active_line`. Por eso corregir un evento intermedio
reconstruye todos los estados efectivos posteriores sin modificar los snapshots almacenados de sus
registros fuente.

`latest_effective_snapshot` es el último snapshot reconstruido. Solo `active_line` alimenta
gráficos, estadísticas, ALG-12 y ALG-13. `audit_line` se ordena por
`(recorded_at, event_id)` y nunca se usa para cálculos de progreso.

### R6 — Idempotency

`event_id` es obligatorio antes del append.

| Condition | Effect |
| :-------- | :----- |
| existing `event_id` and canonically equal request | return `idempotent_replay`; return the existing record; append nothing |
| existing `event_id` but any semantic field differs | return `idempotency_conflict`; append nothing |
| new `event_id` | validate and append exactly one record |

La igualdad canónica incluye usuario, tipo, timestamps del dominio, motivo, parche y relaciones;
no depende del orden textual de las claves JSON.

### R7 — Evaluation snapshots

Una evaluación nueva se calcula con el snapshot efectivo vigente en ese momento y se agrega como un
nuevo evento. Resultados históricos de scoring, clasificación, capacidad, project-fit, versiones y
supuestos se copian al registro; nunca se recalculan durante el replay. El replay solo reconstruye
antecedentes declarados. Una proyección de ALG-13 es derivada y no se registra como evaluación real.

## Invariants and edge cases

**Invariants:**

1. La cantidad de registros persistidos nunca disminuye y ningún registro previo cambia.
2. Todo registro y referencia de una ejecución pertenece a un solo usuario.
3. Todo elemento activo representa un estado completo aunque su evento haya enviado un solo campo.
4. Omitido y `null` explícito nunca son equivalentes.
5. Registros reemplazados o anulados aparecen en auditoría y no participan en métricas.
6. La identidad, plan y metas del baseline permanecen congelados.
7. Mismo conjunto de eventos válidos produce la misma línea activa, sin depender del orden de
   consulta, reloj local, aleatoriedad ni IA.
8. Corregir un evento intermedio vuelve a aplicar los parches posteriores sobre el estado corregido.
9. Un `event_id` aceptado produce como máximo un registro.
10. Ninguna corrección genera una etiqueta o inferencia de fraude.

**Edge cases:** primera evaluación; parche de un campo; empeoramientos reales; corrección del
último registro; corrección y anulación de un registro intermedio; correcciones múltiples;
timestamps iguales; reintento idempotente; colisión de clave; campo omitido frente a `null`;
referencia inexistente, cíclica o perteneciente a otro usuario.

## Assumptions log

No open assumptions. The lineage, correction, ownership and idempotency rules above are closed HU13
Grill decisions; they introduce no financial threshold.
