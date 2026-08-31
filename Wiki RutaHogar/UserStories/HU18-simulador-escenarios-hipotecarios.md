# HU 18 - Simulador de escenarios hipotecarios referenciales

> **🗓 Planificada - Sprint 2.** Permite al lead modificar pie, plazo, valor de vivienda o tasa referencial y ver como cambia su dividendo estimado y su compatibilidad financiera.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** lead, **quiero** modificar variables como pie, plazo, valor de vivienda o tasa referencial, **para** entender cómo cambia mi dividendo estimado y mi compatibilidad financiera.

---

## Criterios de aceptación

### E1

**Dado** que el usuario modifica pie, plazo, tasa o valor de vivienda, **cuando** simula, **entonces** el sistema debe recalcular el dividendo referencial.

### E2

**Dado** que existe un escenario base, **cuando** el usuario genera un nuevo escenario, **entonces** debe mostrar la diferencia frente al escenario inicial.

### E3

**Dado** que el dividendo supera un umbral prudente, **cuando** se muestre el resultado, **entonces** debe advertir riesgo de carga financiera.

### E4

**Dado** que se muestran resultados, **cuando** el usuario los revise, **entonces** debe indicarse que son referenciales y no reemplazan una evaluación bancaria formal.

---

## Notas

- El handbook lista la simulación de estres de tasas y UF como límite de alcance salvo que se encargue explícitamente; esta historia se mantiene dentro de lo referencial y documentado.
- El umbral prudente de E3 es un número de negocio: pertenece a un `ALG-N` con su registro de supuestos, no a un literal en una función.
- Complementa [[HU29-comparador-costo-credito|HU 29]], que compara el costo total del crédito entre plazos.
