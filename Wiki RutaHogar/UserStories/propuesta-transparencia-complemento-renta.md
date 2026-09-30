# Propuesta — Transparencia del complemento de renta para el lead

> **Propuesta sin numerar.** Hoy un lead puede declarar un co-deudor completo y ser evaluado en silencio como si estuviera solo. Esta historia le dice si su complemento se consideró, por qué no, y qué falta para que cuente.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | — *(fuera del backlog numerado)* |
| **Estado** | Propuesta |

---

## Historia de usuario

> **Como** lead que declara a un co-deudor, **quiero** saber si su renta se consideró en mi evaluación y qué la deja fuera cuando no se considera, **para** poder corregirlo en vez de recibir un resultado que no explica por qué mi complemento no sirvió.

---

## Criterios de aceptación

### E1 - Resultado y efecto del complemento

**Dado** que el lead declaró complemento de renta y este se consideró, **cuando** reciba su evaluación, **entonces** debe verse por qué monto se consideró y qué cambió gracias a él — capacidad, ratio o clasificación.

### E2 - Motivo del descarte

**Dado** que el complemento se declaró pero no se consideró, **cuando** el lead revise su resultado, **entonces** debe indicarse cuál de las condiciones no se cumplió.

### E3 - Camino de corrección

**Dado** que el complemento fue descartado por un dato faltante o corregible, **cuando** el lead revise su plan de mejora, **entonces** debe ofrecerse el paso concreto para volver a evaluarse con el complemento válido.

### E4 - Advertencia antes de enviar

**Dado** que el lead está completando el formulario con complemento activo, **cuando** los datos declarados harían que el complemento se descarte, **entonces** debe advertírselo antes de enviar la evaluación.

---

## Notas

- **El dato ya existe y nadie lo muestra.** `ingreso_complementario_considerado` se calcula y se
  devuelve en la respuesta (`backend/app/scoring_engine/indicators.py:80` y
  `backend/app/scoring.py:176`), y **ningún archivo del frontend lo consume**. E1 es, en su mayor
  parte, renderizar un número que ya viaja.
- **`Result.jsx` no menciona el complemento ni una vez.** El lead completa un bloque entero de
  campos del co-deudor en `ScoreForm.jsx:1451` y el resultado no vuelve a hablar del tema.
- **El descarte es silencioso y total.** `_valid_complement_income()`
  (`indicators.py:32`) devuelve `0.0` si falla **cualquiera** de estas condiciones: ingreso
  complementario > 0 · deuda complementaria declarada · morosidad del co-deudor igual a `"no"` ·
  tipo de contrato declarado · continuidad declarada · relación distinta de `amigo` y `otro`. Un
  lead que declara a un amigo con renta alta es evaluado exactamente igual que si no hubiera
  declarado a nadie, y nada se lo dice.
- **E4 es prevención, no redundancia con E2.** La relación `amigo`/`otro` y la morosidad del
  co-deudor se conocen en el formulario: advertir ahí evita una evaluación que el lead va a tener
  que repetir.
- El motor de reglas **sí** produce señales de complemento — `complemento_sin_datos`,
  `complemento_morosidad_alta`, `complemento_relacion_debil`, `complemento_deuda_alta`,
  `complemento_continuidad_baja`, entre otras (`backend/app/scoring.py:765` y siguientes). E2 y E4
  se apoyan en esos códigos existentes; no hay reglas nuevas que inventar.
- **La IA no decide nada aquí.** Redacta el motivo a partir del código de riesgo ya calculado, igual
  que en [[HU3-scoring-hibrido|HU 3]].

---

## Relación con otras historias

| Historia | Relación |
| :------- | :------- |
| [[HU1-ingreso-datos-financieros\|HU 1]] | E4 vive en su formulario. HU 1 E4 ya obliga a pedir los datos del co-deudor; esta historia cierra el ciclo diciendo qué pasó con ellos. |
| [[HU3-scoring-hibrido\|HU 3]] | La explicación del complemento es parte de la explicación del score. |
| [[HU4-plan-de-mejora\|HU 4]] | E3 es un paso más del plan de mejora, no una superficie nueva. |
| [[propuesta-complemento-vista-ejecutivo\|Complemento en la vista del ejecutivo]] | La misma verdad, contada al otro actor. Comparten la fuente; no comparten la pantalla. |

> **⚠️ Precondición de correctitud — defecto §10.1.** `indicators.py:62` suma la **renta** del
> co-deudor a `ingreso`, pero `indicators.py:63` deja `deuda` como `deuda_mensual` sola.
> `_valid_complement_income()` **exige** que la deuda complementaria se declare y luego la descarta.
> Todo ratio y toda capacidad de un lead con complemento están **sobreestimados** hoy. Mostrar con
> más prominencia un número inflado empeora el problema en vez de mejorarlo: **el defecto se corrige
> antes o junto con esta historia.** Registrado en
> [Spike 1 E4 §10.1 y §11 ítem 2](../../docs/research/spike1-e4-lead-project-matching-criteria.md),
> con dueño [[HU3-scoring-hibrido|HU 3]] / [[HU14-analisis-evolucion-comercial-lead|HU 14]].

---

## Estado frente al código

Historia propuesta, sin implementación.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | `ingreso_complementario_considerado` no se consume en `frontend/src`; sin comparación con y sin complemento. |
| `E2` | ❌ | `Result.jsx` no menciona el complemento; el descarte de `indicators.py:32` es silencioso. |
| `E3` | ❌ | Las recomendaciones de `scoring.py:771` existen, pero no hay ruta de reevaluación asociada. |
| `E4` | ❌ | `ScoreForm.jsx:702` valida completitud, no validez del complemento. |
