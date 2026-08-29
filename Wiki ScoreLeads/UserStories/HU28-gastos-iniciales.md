# HU 28 - Estimador de gastos iniciales de compra

> **🗓 Planificada - Sprint 3.** Estima los gastos iniciales asociados a la compra de una vivienda más allá del pie, separados claramente de este.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** lead, **quiero** estimar gastos iniciales asociados a la compra de una vivienda además del pie, **para** prepararme mejor antes de avanzar.

---

## Criterios de aceptación

### E1

**Dado** que el usuario tiene un valor de vivienda objetivo, **cuando** revise la estimación, **entonces** el sistema debe mostrar gastos iniciales referenciales.

### E2

**Dado** que se muestran gastos iniciales, **cuando** el usuario los revise, **entonces** deben separarse claramente del pie.

### E3

**Dado** que el usuario cambia el valor de vivienda, **cuando** se actualice la estimación, **entonces** los gastos deben recalcularse.

### E4

**Dado** que se muestran montos, **cuando** el usuario los visualice, **entonces** debe aclararse que son referenciales.

---

## Notas

- Los porcentajes y montos de gastos iniciales son números de negocio: pertenecen a un `ALG-N` con su registro de supuestos.
- Afecta la meta de ahorro de [[HU4-plan-de-mejora|HU 4]] E4, que hoy solo considera el pie.
