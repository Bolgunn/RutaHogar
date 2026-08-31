# HU 15 - Evolución financiera del lead

> **🗓 Planificada - Sprint 2.** Da al ejecutivo comercial la evolución financiera historica de un lead, para detectar oportunidades de contacto y seguimiento.

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

> **Como** ejecutivo comercial, **quiero** visualizar la evolución financiera de un lead, **para** detectar oportunidades de contacto y seguimiento comercial.

---

## Criterios de aceptación

### E1 - Historial de evaluaciones

**Dado** que un lead ha realizado más de una evaluación, **cuando** el ejecutivo acceda a su perfil, **entonces** debe ver el historial de evaluaciones registradas.

### E2 - Visualización de evolución

**Dado** que existen evaluaciones históricas, **cuando** el ejecutivo revise el perfil del lead, **entonces** el sistema debe mostrar cambios en score, capacidad de compra o bloqueador principal.

### E3 - Oportunidad de seguimiento

**Dado** que el lead mejora su situación financiera, **cuando** el sistema detecte un avance relevante, **entonces** debe permitir identificarlo como oportunidad de contacto.

### E4 - Comparador entre evaluaciones

**Dado** que quiero comparar evaluaciones de un mismo o diferente lead, **cuando** selecciono dos evaluaciones distintas, **entonces** el sistema me muestra las diferentes comparaciones que hay entre los perfiles, indicando claramente cuáles son las fortalezas y debilidades de cada evaluación.

---

## Notas

- Se apoya en el historial versionado de [[../RNF/RNF5-historial-inmutable|RNF 5]] y en la tabla [[../Database/evaluations|evaluations]].
