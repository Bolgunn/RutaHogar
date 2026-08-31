# HU 10 - Matching lead-proyecto para ejecutivos comerciales

> **⚠️ Parcial - Sprint 1.** El sistema sugiere al ejecutivo comercial los leads compatibles con los proyectos que vende, ordenados por afinidad y capacidad de compra.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 1 |
| **Estado** | ⚠️ Parcial |

---

## Historia de usuario

> **Como** ejecutivo comercial, **quiero** que el sistema sugiera leads compatibles con los proyectos que vendo, **para** priorizar prospectos con mayor probabilidad de conversión.

---

## Criterios de aceptación

### E1 - Lista priorizada por proyecto

**Dado** que el ejecutivo selecciona un proyecto, **cuando** accede a su panel de leads, **entonces** el sistema debe mostrar usuarios compatibles ordenados por afinidad y capacidad de compra.

### E2 - Matching por capacidad

**Dado** que un usuario tiene capacidad suficiente para un proyecto, **cuando** el motor de matching lo evalua, **entonces** debe poder aparecer recomendado aunque su clasificación general no sea Alta.

### E3 - Evidencia para el ejecutivo

**Dado** que un lead aparece recomendado, **cuando** el ejecutivo revisa su tarjeta, **entonces** debe ver capacidad estimada, pie, clasificación y bloqueador principal.

### E4 - Lead reorientable

**Dado** que un usuario puede comprar un proyecto distinto a su objetivo declarado, **cuando** el sistema lo detecta, **entonces** debe mostrarlo como oportunidad reorientable.

---

## Notas

- Los criterios de matching (capacidad estimada, comuna, rango de precio, pie, clasificación, bloqueador principal) están definidos en [Spike 1 - E4](../../docs/research/spike1-e4-lead-project-matching-criteria.md), que lleva el contrato congelado contra el que se debe programar.
- Requiere el catálogo de [[HU7-catalogo-de-proyectos|HU 7]] para saber qué proyectos están disponibles.
- Complementa el dashboard priorizado [[HU2-priorizacion-leads|HU 2]] agregando una vista centrada en proyecto.

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | No hay selector de proyecto en el panel del ejecutivo ni lista de leads por proyecto. |
| `E2` | ⚠️ | `backend/app/scoring_engine/commercial_priority.py` calcula prioridad comercial a partir del ajuste por proyecto, que es la pieza que este criterio necesita, pero no se expone como recomendación por proyecto. |
| `E3` | ⚠️ | La tarjeta del lead en `DashboardLeads.jsx` muestra clasificación y score; no muestra capacidad estimada, pie ni bloqueador principal juntos. |
| `E4` | ❌ | No existe la noción de oportunidad reorientable en la UI. |

**Nota de dependencia.** El catálogo del que depende esta historia ya está construido en `feature/sprint1/HU7` ([PR #69](https://github.com/nonmeeeeeeeeeeeeeee/RutaHogar/pull/69)); las citas de arriba describen `develop`, donde todavía no está.

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
