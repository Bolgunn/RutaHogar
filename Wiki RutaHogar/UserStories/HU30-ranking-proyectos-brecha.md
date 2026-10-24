# ~~HU 30~~ (retirada) - Ranking de proyectos por brecha mínima

> **⛔ Retirada del Sprint 3.** El tablero del Sprint 3 (octubre 2026) renumeró el sprint y esta historia no quedó en él. Vuelve a ser una propuesta sin numerar; su número ahora pertenece a otra historia.

> **Descripción original.** Ordena los proyectos alternativos según qué tan cerca están de la capacidad actual del lead, mostrando la brecha principal de cada uno.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | *(sin definir en el documento)* |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | ⛔ Retirada del backlog |

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

## Notas

- Extiende la cotización por proyecto de [[HU9-cotizacion-orientativa|HU 9]] de uno a muchos proyectos.
- Depende del catálogo de [[HU7-catalogo-de-proyectos|HU 7]].
