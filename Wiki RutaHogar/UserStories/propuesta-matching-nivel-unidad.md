# Propuesta — Matching a nivel de unidad

> **Propuesta sin numerar.** Hoy el matching compara al lead contra el *rango de precios* del proyecto. Esta historia lo baja a la unidad concreta: qué departamento específico puede comprar, no en qué edificio podría estar.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 8 |
| **Actor** | Lead |
| **Sprint** | — *(fuera del backlog numerado)* |
| **Estado** | Propuesta |

---

## Historia de usuario

> **Como** lead, **quiero** que el matching me muestre las unidades concretas que puedo pagar dentro de un proyecto, **para** saber qué departamento comprar y no solo que el proyecto "me calza".

---

## Criterios de aceptación

### E1 - Selección sobre unidades disponibles

**Dado** que un proyecto tiene unidades cargadas, **cuando** se calcule la afinidad del lead con ese proyecto, **entonces** el componente de holgura debe resolverse contra la mejor unidad **disponible** y asequible, y no interpolando el rango del proyecto.

### E2 - Identificación de la unidad

**Dado** que el lead revisa un proyecto compatible, **cuando** vea el resultado, **entonces** debe identificarse la unidad concreta que sostiene esa compatibilidad.

### E3 - Proyectos sin unidades

**Dado** que un proyecto no tiene unidades cargadas, **cuando** se calcule su afinidad, **entonces** debe usarse su rango de precios digitado a mano, con el mismo resultado que hoy.

### E4 - Recalibración declarada

**Dado** que cambia la definición del componente de holgura, **cuando** se libere la historia, **entonces** los pesos de afinidad de `ALG-10` deben revisarse y el cambio quedar registrado en el algoritmo.

---

## Notas

- Origen: `docs/stories/UNIDADES-PROYECTO/PLAN.md:53`, que deja el matching a granularidad de
  **proyecto** en [[HU10-matching-lead-proyecto|HU 10]] y marca la granularidad de unidad como
  follow-up, con la confianza declarada *"Baja — se puede argumentar que el punto entero es el
  matching por unidad"*.
- **Es un cambio real de algoritmo, no de UI.** Pasar la holgura de `ALG-10` de "interpolar dentro del
  rango" a "encontrar la mejor unidad asequible" toca pesos que el propio spike reconoce como **no
  calibrados** (§5.2, ítem 3 de §11, asignado a [[HU27-revision-antecedentes|HU 27]]). De ahí E4.
- **Precondición: [[propuesta-carga-proyectos-por-unidad|Carga de proyectos por unidad y tipología]]**, que es quien captura las tipologías.
  Sin ella no hay unidades contra las cuales matchear.
- Depende del modelo de unidades de `docs/stories/UNIDADES-PROYECTO/PLAN.md`: tabla hija de
  `proyectos`, con `precio_min_uf`/`precio_max_uf` mantenidos por trigger para no romper el contrato
  congelado ni los 26 tests de catálogo.
- E3 es la ruta de migración: los proyectos existentes y las inmobiliarias pequeñas que no quieran
  detalle por unidad siguen funcionando sin cambios.
- Impacta también el ranking de [[HU30-ranking-proyectos-brecha|HU 30]] y la cotización de
  [[HU9-cotizacion-orientativa|HU 9]], que pasarían a poder citar una unidad.

---

## Estado frente al código

Propuesta sin implementación. Bloqueada por [[propuesta-carga-proyectos-por-unidad|Carga de proyectos por unidad y tipología]], que tampoco está en el backlog numerado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ❌ | `ALG-10` R-holgura interpola el rango; no existe `disponible` a nivel de unidad. |
| `E2` | ❌ | El resultado no nombra unidades. |
| `E3` | — | Es el comportamiento actual; se verifica como no-regresión. |
| `E4` | ❌ | Pendiente de la recalibración de pesos. |
