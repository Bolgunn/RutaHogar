# HU 8 - Detector de beneficios habitacionales aplicables

> **🗓 Planificada - Sprint 1.** Indica al lead si su perfil podría ser compatible con beneficios habitacionales como subsidios o FOGAES, siempre de forma referencial y sin dar a entender aprobación.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 1 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** lead interesado en comprar una vivienda, **quiero** saber si mi perfil podría ser compatible con beneficios habitacionales como subsidios, FOGAES u otros apoyos, **para** entender caminos alternativos de financiamiento sin asumir que ya estoy aprobado.

---

## Criterios de aceptación

### E1

**Dado** que el usuario tiene una evaluación financiera, **cuando** revise su resultado, **entonces** el sistema debe indicar si existe una posible ruta de beneficio habitacional aplicable.

### E2

**Dado** que los beneficios dependen de requisitos externos, **cuando** se muestre una sugerencia, **entonces** debe aclararse que es referencial y no garantiza aprobación.

### E3

**Dado** que el usuario tiene una vivienda objetivo, **cuando** se evalue la sugerencia, **entonces** debe considerar valor, tipo de vivienda y condición nueva/usada.

### E4

**Dado** que existe contenido educativo relacionado, **cuando** aparezca una sugerencia de beneficio, **entonces** debe enlazar a la sección Academia.

---

## Notas

- E2 es una expresión directa de la salvaguarda S7 del handbook: el sistema no aprueba créditos.
- Los parámetros FOGAES ya documentados están en [Spike 1 - E4](../../docs/research/spike1-e4-lead-project-matching-criteria.md).
- El enlace de E4 apunta a [[HU5-academia-financiera|HU 5]]. La simulación avanzada del impacto es [[HU26-simulacion-subsidios|HU 26]].
