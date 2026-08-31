# HU 19 - Ranking de proyectos por brecha mínima

> **🗓 Planificada - Sprint 2.** Ordena los proyectos alternativos según qué tan cerca están de la capacidad actual del lead, para encontrar opciones realistas sin partir de cero.

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

> **Como** lead, **quiero** ver proyectos alternativos ordenados según qué tan cerca están de mi capacidad actual, **para** encontrar opciones más realistas sin partir desde cero.

---

## Criterios de aceptación

### E1

**Dado** que existen proyectos cargados, **cuando** el usuario revise alternativas, **entonces** el sistema debe ordenarlos por compatibilidad financiera.

### E2

**Dado** que un proyecto no sea compatible, **cuando** aparezca en el ranking, **entonces** debe mostrar su brecha principal.

### E3

**Dado** que el usuario indicó una comuna alternativa, **cuando** se genere el ranking, **entonces** debe priorizar proyectos en esa zona.

### E4

**Dado** que el usuario selecciona un proyecto alternativo, **cuando** lo revise, **entonces** debe poder compararlo con su objetivo inicial.

---

## Notas

- Extiende la cotización por proyecto de [[HU9-cotizacion-orientativa|HU 9]] de uno a muchos proyectos.
- Depende del catálogo de [[HU7-catalogo-de-proyectos|HU 7]].
