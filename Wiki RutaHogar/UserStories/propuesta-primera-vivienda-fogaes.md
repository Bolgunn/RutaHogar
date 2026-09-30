# Propuesta — Declaración de primera vivienda para capacidad asistida

> **Propuesta sin numerar.** Incorpora `primera_vivienda` al formulario de ingreso para que el modelo de capacidad pueda ramificar sobre el pie asistido FOGAES en vez de limitarse a emitir una bandera informativa.

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

> **Como** lead que compra su primera vivienda, **quiero** poder declararlo en el formulario, **para** que mi capacidad de compra se calcule con el pie mínimo asistido que me corresponde y no con el pie general.

---

## Criterios de aceptación

### E1 - Captura de la declaración

**Dado** que el usuario completa el formulario de ingreso de datos, **cuando** llegue al paso del objetivo inmobiliario, **entonces** debe poder declarar si la vivienda que busca es su primera vivienda.

### E2 - Ramificación de la capacidad

**Dado** que el lead declaró que es su primera vivienda y el precio objetivo está dentro de los topes de `ALG-8`, **cuando** se calcule su capacidad de compra, **entonces** el pie exigido debe ser `FOGAES_MIN_PIE_RATIO` y no el pie general.

### E3 - Ausencia de declaración

**Dado** que el lead no declara el campo, **cuando** se calcule su capacidad, **entonces** el sistema debe mantener el comportamiento actual — pie general y bandera FOGAES informativa — sin bloquear la evaluación.

### E4 - Trazabilidad y alcance del supuesto

**Dado** que la capacidad se calculó con pie asistido, **cuando** el lead o el ejecutivo revisen el resultado, **entonces** `capacidad_supuestos` debe registrar qué pie se aplicó y por qué, y debe aclararse que la elegibilidad FOGAES la confirma el banco.

---

## Notas

- Origen: [Spike 1 · E4](../../docs/research/spike1-e4-lead-project-matching-criteria.md) §10.5, donde
  se registra como **el follow-up de mayor valor** del spike. [[HU10-matching-lead-proyecto|HU 10]] lo
  dejó explícitamente fuera de su alcance y lo asignó a [[HU1-ingreso-datos-financieros|HU 1]]
  (`docs/stories/HU10-matching-lead-proyecto/PLAN.md:161`).
- Hoy `ALG-9` §4.4 emite una **bandera**, no un multiplicador de capacidad, porque la elegibilidad no
  se puede verificar desde el intake actual. Este campo es lo único que falta para cerrar esa brecha.
- Las constantes ya existen y **se reutilizan, no se redeclaran**: `FOGAES_MIN_PIE_RATIO`,
  `FOGAES_MAX_PROPERTY_UF` y `FOGAES_MAX_UF_CON_SUBSIDIO` en
  `backend/app/scoring_engine/constants.py:50`, propiedad de `ALG-8`.
- El cambio al contrato de `POST /score` es **aditivo** — un campo opcional nuevo. E3 es lo que
  mantiene la salvaguarda S2 del handbook: ningún payload existente cambia de comportamiento.
- **Dependencia abierta (no bloqueante):** §11 ítem 1 del spike — el rango real de precios en UF del
  catálogo de Echeverría Izquierdo decide si FOGAES es el caso normal o la excepción. Eso dimensiona
  el impacto de esta historia, no su diseño.

---

## Estado frente al código

Historia propuesta, sin implementación. La verificación criterio por criterio se completa cuando la
historia entre a un sprint.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No existe `primera_vivienda` en `ScoreForm.jsx` ni en `ScoreRequest`. |
| `E2` | ❌ | `ALG-9` §4.4 emite bandera; no hay ramificación de pie. |
| `E3` | — | Es el comportamiento actual; se verifica como no-regresión. |
| `E4` | ❌ | `capacidad_supuestos` no registra el pie aplicado y no hay copy de alcance. |
