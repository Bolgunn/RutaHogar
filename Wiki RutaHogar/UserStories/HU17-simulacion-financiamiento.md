# HU 17 - Simulación configurable de financiamiento hipotecario

> **🗓 Planificada - Sprint 2.** Configuración referencial sugerida de pie, plazo, monto y complemento de renta, personalizable por el lead, con alternativa recomendada cuando el escenario no resulta compatible.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 3 |
| **Actor** | Lead |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** usuario interesado en un proyecto objetivo, **quiero** explorar y personalizar distintas configuraciones referenciales de financiamiento, **para** identificar qué combinación de pie, plazo, monto financiado y complementación de renta se ajusta mejor a mi situación.

---

## Criterios de aceptación

### E1 - Configuración sugerida de financiamiento

**Dado** que el usuario posee una evaluación y un proyecto objetivo, **cuando** acceda al simulador, **entonces** el sistema debe proponer una configuración referencial recomendada considerando el valor del proyecto, su situación financiera, pie disponible, plazo, tasa referencial y posibilidad de complementar renta.

### E2 - Personalización del escenario

**Dado** que existe una configuración sugerida, **cuando** el usuario modifique variables como pie, plazo, monto a financiar, tasa referencial o complementación de renta, **entonces** el sistema debe recalcular el escenario y clasificar su compatibilidad como Compatible, cercano o requiere ajuste, explicando las principales razones del resultado.

### E3 - Alternativa recomendada ante incompatibilidad

**Dado** que una configuración resulte cerca o requiere ajuste, **cuando** el sistema evalúe el resultado, **entonces** debe sugerir una configuración alternativa que acerque al usuario a una situación compatible, indicando qué variables deberían modificarse.

### E4 - Guardado de escenarios

**Dado** que el usuario obtiene una configuración que desea conservar, **cuando** seleccione guardar el escenario, **entonces** el sistema debe almacenarlo asociado a su proyecto objetivo para que pueda consultarlo posteriormente y compararlo con nuevas simulaciones.

## Notas

- El handbook lista la simulación de estres de tasas y UF como límite de alcance salvo que se encargue explícitamente; esta historia se mantiene dentro de lo referencial y documentado.
- El umbral prudente de E3 es un número de negocio: pertenece a un `ALG-N` con su registro de supuestos, no a un literal en una función.
- Complementa [[HU29-comparador-costo-credito|HU 29]], que compara el costo total del crédito entre plazos.
