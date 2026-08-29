# HU 7 - Gestión del catálogo de proyectos inmobiliarios

> **⚠️ Implementada, pendiente de merge - Sprint 1.** Permite al administrador inmobiliario registrar y mantener un catálogo de proyectos y vincularlos con ejecutivos, para que el sistema recomiende leads según los proyectos realmente disponibles.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Esencial |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 1 |
| **Estado** | ⚠️ Implementada, pendiente de merge ([PR #69](https://github.com/nonmeeeeeeeeeeeeeee/RutaHogar/pull/69)) |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** registrar y mantener un catálogo de proyectos inmobiliarios y vincularlos con ejecutivos, **para** que el sistema pueda recomendar leads según los proyectos realmente disponibles.

---

## Criterios de aceptación

### E1 - Creación de proyecto

**Dado** que el administrador accede al panel de proyectos, **cuando** ingresa nombre, inmobiliaria, comuna, tipo, rango de precio y estado, **entonces** el sistema debe guardar el proyecto en el catálogo.

### E2 - Validación de datos

**Dado** que el administrador inmobiliario crea o edita un proyecto, **cuando** ingresa datos obligatorios incompletos o precios inconsistentes, **entonces** el sistema debe impedir guardar hasta corregirlos.

### E3 - Vinculación con ejecutivos

**Dado** que existe un proyecto en el catálogo, **cuando** el administrador asigna ejecutivos, **entonces** esos ejecutivos deben quedar vinculados al proyecto.

### E4 - Estado del proyecto

**Dado** que un proyecto está marcado como agotado, **cuando** se ejecute el matching, **entonces** no debe generar nuevas recomendaciones.

---

## Notas

- Plan de implementación: `docs/stories/HU7-catalogo-de-proyectos/PLAN.md`.
- Este catálogo es la fuente de datos del motor de matching ([[HU10-matching-lead-proyecto|HU 10]]) y de la cotización por proyecto ([[HU9-cotizacion-orientativa|HU 9]]).
- Los atributos de proyecto (comuna, rango de precio, tipo) se alinean con `PRECIOS_REFERENCIA_UF` del motor de scoring.

---

## Estado frente al código

Implementada en la rama `feature/sprint1/HU7`, **pendiente de merge** en
[PR #69](https://github.com/nonmeeeeeeeeeeeeeee/RutaHogar/pull/69). Las citas de abajo apuntan a esa
rama, no a `develop`: en `develop` el catálogo todavía no existe.

| Criterio | Estado | Evidencia (rama `feature/sprint1/HU7`) |
| :------- | :----- | :------------------------------------ |
| `E1` | ✅ | `frontend/src/components/AdminProjectCatalog.jsx` es el panel de proyectos; `services/projectService.js:347` `createProject` persiste en la tabla `proyectos` (`supabase/migrations/20260729_project_catalog.sql:29`). |
| `E2` | ✅ | `services/projectValidation.js:13` `validateProject` exige cada campo obligatorio y rechaza rangos de precio invertidos, cero o no numéricos. Cubierto por `services/__tests__/projectCatalog.test.js`. |
| `E3` | ✅ | `projectService.js:530` `assignExecutive` y `:574` `unassignExecutive`, sobre la tabla `proyecto_ejecutivos` (`migration:64`). |
| `E4` | ✅ | `projectService.js:342` `getAvailableProjects` filtra con `filterAvailable`, que excluye el estado `agotado` (`constants/proyectos.js`). Cubierto por el test `filterAvailable`. |

**Más allá de los criterios:** la implementación es multi-tenant. La migración crea `inmobiliarias`,
`proyectos` y `proyecto_ejecutivos` con políticas RLS por inmobiliaria
(`migration:314` en adelante), lo que satisface la salvaguarda **S6** del handbook para estas tablas.
Existe rollback en `supabase/rollback/20260729_project_catalog_rollback.sql`.

**En `develop` hoy:** solo `frontend/src/data/mockProjects.js`, 8 proyectos fijos usados por la
simulación de [[HU6-simulacion-compatibilidad|HU 6]]. Cuando PR #69 entre, esta sección pasa a
✅ Implementada y las citas dejan de necesitar la advertencia de rama.

> Esta tabla se revisa cuando cambia el código de la historia. Un criterio sin evidencia citable
> es un criterio no verificado, no un criterio cumplido.
