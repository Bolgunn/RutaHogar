# HU 29 - Planificador Interactivo de Metas de Ahorro para Compras en Verde/Blanco

> **✅ Implementada - Sprint 3.** Permite a los leads planificar su ahorro mensual de pie para proyectos en verde o blanco, comparar con modalidades de inmobiliaria (tarjeta y pagaré), simular protección inflacionaria y fijar metas de ahorro en el dashboard de seguimiento.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | ✅ Implementada |

---

## Historia de usuario

> **Como** lead interesado en comprar una propiedad en etapa de construcción (en verde o en blanco), **quiero** simular un cronograma interactivo de ahorro mensual adaptado al plazo de entrega de la obra (ej. 12, 18, 24, 30 meses), **para** definir un plan de aportes periódico que me permita llegar a la fecha de escrituración con el pie completo sin sobreendeudarme.

---

## Criterios de aceptación

### E1 - Cálculo de cuotas de ahorro

**Dado** el valor del pie en UF y la fecha estimada de recepción municipal / entrega del edificio, **cuando** el usuario ingrese el plazo restante en meses, **entonces** el sistema debe calcular la cuota mensual sugerida de ahorro en UF y su equivalente en pesos a valor de hoy.

### E2 - Comparación con esquemas comerciales de la inmobiliaria

**Dado** el proyecto seleccionado, **cuando** la inmobiliaria ofrezca la opción de  pago de pie en cuotas con tarjeta de crédito o pagarés, **entonces** el simulador debe contrastar el plan de ahorro personal versus el calendario de cuotas de pie de la inmobiliaria.

### E3 - Simulación de protección inflacionaria

**Dado** el ahorro en el mediano plazo, **cuando** el lead revise la proyección, **entonces** se debe mostrar una estimación de cómo ahorrar en instrumentos reajustables (cuentas en UF o depósitos a plazo) protege el poder adquisitivo frente al encarecimiento de la propiedad expresada en UF.

### E4 - Conexión con seguimiento mensual

**Dado** que el lead tenga activo el seguimiento del plan de mejora (HU 13), **cuando** fije su meta de pie en verde, **entonces** el monto mensual debe quedar fijado como meta de ahorro periódica en su dashboard personal.
