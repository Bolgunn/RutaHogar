# HU 10 - Matching lead-proyecto para ejecutivos comerciales

> **✅ Implementada - Sprint 1.** El sistema sugiere al ejecutivo comercial los leads compatibles con los proyectos que vende, ordenados por afinidad y capacidad de compra.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Importante |
| **Puntos de Historia** | 5 |
| **Actor** | Ejecutivo comercial |
| **Sprint** | Sprint 1 |
| **Estado** | ✅ Implementada |

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
| `E1` | ✅ | Selector de proyecto en `DashboardLeads.jsx`, alimentado por `getAvailableProjects({ inmobiliariaId, ejecutivo })`, con lista rankeada por afinidad y orden alternativo por capacidad. Casos de orden en `ALG-10-cases.json` y `leadRanking.test.js`. **Falta la pasada del revisor contra un entorno hosteado**: el recorte por ejecutivo es RLS y no corre en local. |
| `E2` | ✅ | `leadProjectMatching.test.js`: un `Medio` holgado gana a un `Alto` justo — **88.6 contra 56.4**. Acotado como invariante 8 de ALG-10 para que un retuneo no lo cruce en silencio. En el panel, el filtro de clasificación cae a "todos" con proyecto seleccionado, sin lo cual la UI anulaba el criterio. |
| `E3` | ✅ | Fila y zona 2 del modal muestran capacidad, pie disponible, clasificación, restricción vinculante y bloqueador principal con su brecha en CLP, más `plazo_anios` y `plazo_origen`, que ALG-9 R2 declara no opcionales. Números en `ALG-9-cases.json`. |
| `E4` | ✅ | Anotación reorientable en fila y modal, con `ALG-10-cases.json` cubriendo las dos ramas de R4 y sus dos negativos. La copia distingue qué rama disparó vía `comunasDeclaradas()`, para no escribir "puede comprar en Ñuñoa aunque declaró Ñuñoa". |

**Motor.** `ALG-9` (capacidad de compra, `purchase_capacity.py`) y `ALG-10` (afinidad lead-proyecto,
`lib/matching/leadProjectMatching.js`), con 30 casos versionados. `ALGORITHM_VERSION` no se movió: las
nueve claves nuevas son aditivas dentro de `financial_indicators` y no cambian ninguna regla existente.

**Pendiente de despliegue, no de código.** La migración `20260831090000` y la corrida del backfill
contra el Supabase hosteado — ver "Still open" en
[el plan](../../docs/stories/HU10-matching-lead-proyecto/PLAN.md).

**Nota de dependencia.** El catálogo del que depende esta historia ya está construido en `feature/sprint1/HU7` ([PR #69](https://github.com/nonmeeeeeeeeeeeeeee/RutaHogar/pull/69)); las citas de arriba describen `develop`, donde todavía no está.

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
