# HU 13 - Seguimiento mensual del plan de mejora

> **⚠️ Parcial - Sprint 2.** Permite al lead registrar su avance financiero mensual, ver si va adelantado o atrasado respecto a su plan, y recalcular su score al cumplir hitos.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 8 |
| **Actor** | Lead |
| **Sprint** | Sprint 2 |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** lead con un plan de mejora activo, **quiero** registrar mi avance financiero mensual y actualizar mi situación, **para** saber si estoy avanzando correctamente hacia mi objetivo inmobiliario.

---

## Criterios de aceptación

### E1 - Registro de avance mensual

**Dado** que el usuario tiene un plan activo, **cuando** registre deudas pagadas o monto ahorrado, **entonces** el sistema debe actualizar su avance mensual y mostrar si se encuentra adelantado, dentro de plazo o atrasado respecto a su plan.

### E2 - Proyección de elegibilidad

**Dado** que el usuario actualiza su progreso financiero, **cuando** el sistema recalcula su situación, **entonces** debe mostrar una fecha estimada de elegibilidad o acercamiento al objetivo.

### E3 - Actualización del estado del plan de mejora

**Dado** que el usuario tiene un plan de mejora activo, **cuando** registre avances, complete hitos o no cumpla actividades planificadas, **entonces** el sistema debe actualizar el estado del plan en la plataforma, usando estados como "No iniciado", "En progreso", "Completado" o "Requiere ajuste".

### E4 - Recalcular scoring en base al cumplimiento de hitos financieros

**Dado** que el usuario registra el cumplimiento de un hito financiero, como pago de deuda o aumento de ahorro, **cuando** el sistema valide dicho avance, **entonces** debe recalcular el score financiero y actualizar la clasificación del usuario si corresponde.

### E5 - Ingreso y validación de hitos financieros

**Dado** que el usuario desea registrar avances dentro de su plan de mejora, **cuando** ingrese un hito financiero como deuda pagada, ahorro acumulado o mejora de continuidad laboral, **entonces** el sistema debe validar que el dato ingresado sea consistente, positivo y no contradiga la información financiera registrada previamente.

---

## Notas

- Hitos y metas corresponden a la tabla `improvement_goals`. Ver [[../Database/improvement_goals|improvement_goals]].
- El recalculo de E4 debe producir una evaluación versionada nueva, no mutar la anterior. Ver [[../RNF/RNF5-historial-inmutable|RNF 5]].
- Depende del plan generado en [[HU4-plan-de-mejora|HU 4]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `frontend/src/services/monthlyPlanService.js:73` construye el plan mensual y `:88` resuelve el estado de cada mes (`logrado`, `no_logrado`, `pendiente`). |
| `E2` | ✅ | `monthlyPlanService.js:135` expone `getNextPrequalificationDate` y `:142` `canPrequalify`, que proyectan cuándo el lead puede volver a evaluarse. |
| `E3` | ⚠️ | Los estados implementados son por mes (`logrado` / `no_logrado` / `pendiente`) y por meta (`goalsService.js:44`), no los cuatro estados de plan que pide el criterio ("No iniciado", "En progreso", "Completado", "Requiere ajuste"). |
| `E4` | ⚠️ | `canPrequalify` habilita una nueva preevaluación al completar metas, pero el recálculo lo dispara el usuario; no es automático al validar el hito. |
| `E5` | ✅ | `RegisterMilestone.jsx` valida el hito antes de guardarlo; `monthlyPlanService.js:9` comprueba que la meta sea monetaria y consistente. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
