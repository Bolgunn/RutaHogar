# HU 4 - Generación de plan de mejora personalizado

> **⚠️ Parcial - Sprint 1.** Genera un plan de mejora paso a paso para los leads que aún no califican, con recomendaciones priorizadas, un plan de pago de deudas y una meta de ahorro para el pie.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 8 |
| **Actor** | Lead |
| **Sprint** | Sprint 1 |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** lead en etapa de preparación, **quiero** recibir un plan de mejora personalizado con recomendaciones, metas de deuda y ahorro, **para** saber qué acciones debo realizar para acercarme a mi objetivo inmobiliario.

---

## Criterios de aceptación

### E1 - Generación de plan personalizado

**Dado** que un usuario no cumple las condiciones para comprar su objetivo inmobiliario, **cuando** finaliza su evaluación financiera, **entonces** el sistema debe generar un plan de mejora paso a paso basado en sus datos.

### E2 - Recomendaciones personalizadas

**Dado** que el usuario recibió su score, **cuando** el sistema identifique oportunidades de mejora, **entonces** debe generar recomendaciones relacionadas con ahorro, deuda, continuidad laboral, plazo u objetivo inmobiliario, priorizando según el impacto estimado e indicando el beneficio esperado al aplicarlas.

### E3 - Crear plan de pagos de deudas

**Dado** que el usuario presenta deudas vigentes que afectan su score financiero, **cuando** el sistema genere el plan de mejora personalizado, **entonces** debe crear una propuesta de pago de deuda indicando monto objetivo, prioridad de pago y plazo estimado para reducir su carga financiera. Si el usuario tiene más de una deuda, estas se deben ordenar según su impacto en el score, monto pendiente o urgencia de pago, para orientar al usuario sobre cuáles abordar primero.

### E4 - Crear plan de ahorro para el pie

**Dado** que el usuario no cuenta con el ahorro suficiente para cubrir el pie requerido de su objetivo inmobiliario, **cuando** el sistema genere el plan de mejora, **entonces** debe proponer una meta de ahorro mensual y un plazo estimado para alcanzar el monto necesario.

---

## Notas

- El plan se genera en `backend/app/scoring_engine/improvement_plan.py` a partir de los `risk_codes` calculados por el motor.
- `risk_codes` disponibles: `ingreso_dividendo`, `deuda_alta`, `ahorro_bajo`, `precio_objetivo`, `contrato_independiente`, `continuidad_baja`, `continuidad_media`, `morosidad_alta`, `morosidad_media`.
- Se devuelve como el arreglo `improvement_plan` en la respuesta de `POST /score`.
- El seguimiento en el tiempo de las metas de deuda y ahorro es [[HU13-seguimiento-mensual|HU 13]] y usa la tabla `improvement_goals`. Ver [[../Database/improvement_goals|improvement_goals]].

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `backend/app/scoring_engine/improvement_plan.py` genera el plan a partir de los `risk_codes` de la evaluación. |
| `E2` | ✅ | Las recomendaciones se renderizan en `frontend/src/components/Recommendations.jsx`, ordenadas por impacto. |
| `E3` | ⚠️ | Existe generación de recomendaciones de deuda, pero no se encontró una propuesta de pago con monto objetivo, prioridad y plazo por deuda individual, ni el ordenamiento entre varias deudas que pide el criterio. |
| `E4` | ✅ | `frontend/src/components/HousingSavingsPlan.jsx` y `services/housingSavingsPlanService.js` construyen la meta de ahorro mensual y su plazo estimado. |

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
