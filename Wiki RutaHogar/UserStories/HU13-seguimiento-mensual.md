# HU 13 - Seguimiento plan de mejora

> **⚠️ Parcial - Sprint 2.** Registra los avances financieros del lead y muestra cómo evoluciona su progreso respecto al proyecto objetivo.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 3 |
| **Actor** | Lead |
| **Sprint** | Sprint 2 |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** usuario con un plan de mejora activo, **quiero** registrar mis avances financieros y visualizar cómo evoluciona mi progreso respecto al proyecto objetivo, **para** saber si me estoy acercando a cumplir las condiciones necesarias para acceder a él.

---

## Criterios de aceptación

### E1 - Registro histórico de avances

**Dado** que el usuario tiene un plan de mejora activo, **cuando** actualice información relacionada con ingreso, situación laboral, deuda o ahorro, **entonces** el sistema debe guardar el nuevo valor como un avance histórico asociado al plan, conservando también los valores anteriores para poder visualizar su evolución en el tiempo.

### E2 - Comparación con el plan esperado

**Dado** que el plan establece metas o hitos esperados en el tiempo, **cuando** el usuario registre nuevos avances, **entonces** el sistema debe indicar si su progreso se encuentra adelantado, dentro de lo esperado o atrasado respecto al plan.

### E3 - Proyección dinámica hacia el proyecto objetivo

**Dado** que el usuario posee un proyecto objetivo y avances registrados, **cuando** cambie su situación financiera, **entonces** el sistema debe recalcular una fecha estimada en la que podría alcanzar una condición compatible con dicho proyecto, considerando su situación y progreso actuales.

### E4 - Historial de evolución

**Dado** que el usuario ha realizado varias actualizaciones de su situación, **cuando** consulte el seguimiento de su plan, **entonces** debe poder visualizar la evolución de sus principales variables y cómo estas han afectado su evaluación y proyección.

## Notas

- Hitos y metas corresponden a la tabla `improvement_goals`. Ver [[../Database/improvement_goals|improvement_goals]].
- El recálculo de E3 debe producir una evaluación versionada nueva, no mutar la anterior. Ver [[../RNF/RNF5-historial-inmutable|RNF 5]].
- Depende del plan generado en [[HU4-plan-de-mejora|HU 4]].
- **Todos los criterios de esta historia empiezan cuando el usuario ya volvió** ("cuando registre",
  "cuando actualice"). La historia recompensa el retorno, pero no lo produce. El disparo sin acción
  del usuario y la notificación fuera de la plataforma son [[HU20-retorno-por-cambio|HU 20]]; las dos
  se leen juntas y HU 20 no re-implementa el plan mensual de esta historia.

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

> **Los criterios de esta historia cambiaron con el documento del equipo** (de cinco a cuatro, con
> otro alcance). La tabla se rehízo contra los criterios nuevos y **necesita una pasada de
> verificación completa** antes de darse por firme.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ⚠️ | `RegisterMilestone.jsx` y `monthlyPlanService.js:73` registran avances contra `improvement_goals`, pero el criterio nuevo pide conservar los valores anteriores de ingreso, situación laboral, deuda y ahorro como serie histórica, y eso no está verificado. |
| `E2` | ⚠️ | `monthlyPlanService.js:88` resuelve estados **por mes** (`logrado` / `no_logrado` / `pendiente`), no los tres estados de progreso respecto al plan que pide el criterio (adelantado / dentro de lo esperado / atrasado). |
| `E3` | ✅ | `monthlyPlanService.js:135` expone `getNextPrequalificationDate` y `:142` `canPrequalify`, que proyectan cuándo el lead alcanzaría una condición compatible. |
| `E4` | ❌ | No se encontró una vista que muestre la evolución de las variables principales ni su efecto sobre la evaluación y la proyección. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
