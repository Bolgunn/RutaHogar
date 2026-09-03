# HU 29 - Comparador de costo total referencial del crédito

> **🗓 Planificada - Sprint 3.** Muestra el costo referencial de un crédito bajo distintos plazos, para que el lead entienda que bajar el dividendo mensual puede aumentar el costo total.

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

> **Como** lead, **quiero** visualizar el costo referencial de un crédito bajo distintos plazos, **para** entender que reducir el dividendo mensual puede aumentar el costo total en el tiempo.

---

## Criterios de aceptación

### E1

**Dado** que el usuario simula distintos plazos, **cuando** se generen los resultados, **entonces** el sistema debe mostrar el dividendo referencial de cada escenario.

### E2

**Dado** que se comparan plazos distintos, **cuando** el usuario revise el resultado, **entonces** debe mostrar la diferencia de carga mensual.

### E3

**Dado** que un plazo mayor reduce el dividendo mensual, **cuando** se muestre el resultado, **entonces** debe advertir que el costo total puede aumentar.

### E4

**Dado** que se muestran resultados financieros, **cuando** el usuario los revise, **entonces** debe indicarse que son referenciales.

---

## Notas

- Comparte el motor de calculo de dividendo con [[HU18-simulador-escenarios-hipotecarios|HU 18]]; debe existir una sola fórmula, no dos.
