# HU 29 - Planificador interactivo de metas de ahorro para compras en verde/blanco

> **🗓 Planificada - Sprint 3.** El lead simula cuánto ahorrar cada mes para completar el pie antes de la entrega de una obra en verde o en blanco, lo compara con las cuotas de pie de la inmobiliaria y lo fija como meta en su seguimiento.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Rodrigo — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** lead interesado en comprar una propiedad en etapa de construcción (en verde o en blanco), **quiero** simular un cronograma interactivo de ahorro mensual adaptado al plazo de entrega de la obra (ej.: 12, 18, 24, 30 meses), **para** definir un plan de aportes periódico que me permita llegar a la fecha de escrituración con el pie completo sin sobreendeudarme.

---

## Criterios de aceptación

### E1 - Cuota mensual sugerida

**Dado** el valor del pie en UF y la fecha estimada de recepción municipal o entrega del edificio, **cuando** el usuario ingrese el plazo restante en meses, **entonces** el sistema debe calcular la cuota mensual sugerida de ahorro en UF y su equivalente en pesos a valor de hoy.

### E2 - Contraste con el pie en cuotas de la inmobiliaria

**Dado** el proyecto seleccionado, **cuando** la inmobiliaria ofrezca la opción de pago de pie en cuotas con tarjeta de crédito o pagarés, **entonces** el simulador debe contrastar el plan de ahorro personal versus el calendario de cuotas de pie de la inmobiliaria.

### E3 - Ahorro en instrumentos reajustables

**Dado** el ahorro en el mediano plazo, **cuando** el lead revise la proyección, **entonces** se debe mostrar una estimación de cómo ahorrar en instrumentos reajustables (cuentas en UF o depósitos a plazo) protege el poder adquisitivo frente al encarecimiento de la propiedad expresada en UF.

### E4 - Meta fijada en el seguimiento

**Dado** que el lead tenga activo el seguimiento del plan de mejora ([[HU13-seguimiento-mensual|HU 13]]), **cuando** fije su meta de pie en verde, **entonces** el monto mensual debe quedar fijado como meta de ahorro periódica en su dashboard personal.

---

## Notas

- Se apoya en el plan de ahorro existente (`HousingSavingsPlan.jsx`, `services/housingSavingsPlanService.js`) y en los valores UF de `backend/app/market_data/`.
- E2 requiere que el catálogo guarde la fecha de entrega y las condiciones de pie en cuotas de cada proyecto; hoy no están. Coordinar con [[HU25-carga-masiva-proyectos|HU 25]] para que la plantilla las incluya.
- E3 es orientativo: no es asesoría de inversión ni recomienda instrumentos específicos.
