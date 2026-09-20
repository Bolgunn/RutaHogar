# HU 14 - Análisis y evolución comercial del lead

> **🗓 Planificada - Sprint 2.** Evolución, prioridad y contexto del lead en una sola vista, con detección de oportunidades de contacto, comparación entre prospectos y preguntas sugeridas para el abordaje.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 2 |
| **Estado** | 🗓 Planificada |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** visualizar la evolución, prioridad y contexto de los leads, **para** detectar oportunidades de contacto, comparar prospectos y preparar mejor el abordaje comercial.

---

## Criterios de aceptación

### E1 - Visualización mejorada del historial de evolución

**Dado** que un lead posee registros históricos de su información y evaluaciones, **cuando** el ejecutivo acceda al apartado de historial, **entonces** el sistema debe presentar la evolución de forma clara y ordenada mediante una visualización temporal, destacando cambios relevantes, tendencias de mejora o deterioro y las variaciones en ingreso, situación laboral, deuda, ahorro, score, capacidad de compra y compatibilidad con el proyecto.

### E2 - Detección automática de oportunidad de contacto

**Dado** que la evaluación de un lead cambia, **cuando** alcance una prioridad general Alta o pase a estado Compatible con su proyecto por capacidad de compra o afinidad, **entonces** el sistema debe identificarse automáticamente como una oportunidad de contacto e indicar qué cambio produjo dicha oportunidad.

### E3 - Comparación de leads para un proyecto

**Dado** que el ejecutivo desea comparar dos leads, **cuando** los seleccione para un proyecto determinado, **entonces** el sistema debe mostrar comparativamente su score, compatibilidad por capacidad de compra, compatibilidad por afinidad y los principales factores que favorecen o dificultan a cada uno.

### E4 - Recomendaciones de preguntas para el abordaje comercial

**Dado** que el sistema dispone de información financiera y contextual de un lead, **cuando** el ejecutivo prepare su contacto con él, **entonces** debe mostrar preguntas sugeridas orientadas a obtener información relevante que no pueda inferirse únicamente de los datos financieros y que pueda influir en la decisión de compra.

## Notas

- Se apoya en el historial versionado de [[../RNF/RNF5-historial-inmutable|RNF 5]] y en la tabla [[../Database/evaluations|evaluations]].
