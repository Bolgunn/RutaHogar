# HU 26 - Métricas de interés por proyecto

> **⚠️ Construida, pendiente de merge** (rama `feat/hu26-metricas-interes-proyecto`). Ranking de
> proyectos por tracción (visualizaciones, simulaciones y favoritos) y viabilidad financiera de los
> leads interesados en cada uno, con los motivos que frenan la compra.

> **Número en conflicto.** El índice del backlog asigna "HU 26" a
> [[HU26-simulacion-subsidios|Simulación avanzada de subsidios habitacionales]]. Esta historia llegó
> como "HU26 - Métricas de interés por proyecto"; quien mantiene el backlog debe decidir cuál conserva
> el número antes del merge.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | *(sin definir en la historia)* |
| **Actor** | Administrador inmobiliario |
| **Estado** | ⚠️ Construida, pendiente de merge |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** visualizar las métricas de interacción, interés y viabilidad financiera que genera cada proyecto (visualizaciones, favoritos, simulaciones y rechazos), **para** evaluar si nuestra oferta inmobiliaria está alineada con la demanda y la capacidad de compra real de los leads, permitiendo ajustar estrategias comerciales.

---

## Criterios de aceptación

### E1

**Dado** que el administrador accede al dashboard de métricas, **cuando** seleccione la vista por proyectos, **entonces** el sistema debe mostrar un ranking ordenado de las propiedades que generan mayor tracción, detallando la cantidad de visualizaciones, simulaciones realizadas y veces que fueron guardadas como favoritas.

### E2

**Dado** que existen proyectos siendo evaluados por los leads, **cuando** el administrador analice su desempeño, **entonces** el sistema debe mostrar cuántos de los leads interesados resultaron incompatibles o fueron rechazados por no alcanzar el score financiero requerido para ese proyecto en particular.

### E3

**Dado** que un proyecto presenta leads calificados como incompatibles, **cuando** el administrador consulte el detalle de sus métricas de rechazo, **entonces** el sistema debe agrupar y mostrar claramente cuáles son los motivos principales que están frenando la compra para ese proyecto específico.

## Notas

- **Dónde está.** Página `/metricas` (la de [[HU15-dashboard-conversion-tiempos|HU 15]]), pestaña
  **Interés por proyecto**. Solo la ve el administrador de una inmobiliaria (`admin_inmobiliario`, o
  `admin` con inmobiliaria); el ejecutivo conserva las dos pestañas de HU 15.
- **E1 — qué se cuenta.**
  - *Visualización*: un lead abre el detalle de un proyecto en el catálogo. Cuenta como máximo una
    vez por lead, proyecto y día, para que recargar la página no infle el ranking. Antes de HU 26 las
    visualizaciones solo llegaban a Google Analytics, así que el conteo parte con el despliegue.
  - *Simulación*: un escenario de financiamiento guardado para el proyecto
    ([[HU17-simulacion-financiamiento|HU 17]]). Elegir un proyecto en el simulador de compatibilidad
    no cuenta, porque esa pantalla preselecciona el primero del catálogo.
  - *Favorito*: el proyecto está hoy marcado como favorito; si el lead lo desmarca, deja de contar.
  - *Tracción*: el ranking ordena por leads interesados (los que vieron, simularon o guardaron el
    proyecto) y, a igualdad, por favoritos, simulaciones y visualizaciones. No usa ponderaciones.
    Aparecen todos los proyectos, también los que nadie ha mirado.
- **E2 — "incompatible".** El catálogo no tiene un score mínimo por proyecto, así que "no alcanzar el
  score financiero requerido" se lee con el matching lead–proyecto de
  [[HU10-matching-lead-proyecto|HU 10]] (ALG-10): un lead interesado es incompatible si su capacidad
  de compra está lejos del precio de entrada del proyecto o si tiene un bloqueador crítico (morosidad
  vigente o carga financiera total alta). Los leads sin precalificación suficiente se muestran aparte
  y no cuentan como incompatibles. El porcentaje se calcula sobre los leads que sí se pudieron evaluar.
- **E3 — motivos.** Cada lead incompatible aporta un motivo: morosidad vigente, carga financiera
  total alta, ahorro insuficiente para el pie, renta insuficiente para el dividendo o capacidad de
  compra insuficiente. Al elegir un proyecto en el ranking se ven sus motivos agrupados y ordenados.
- **Privacidad.** El administrador solo ve conteos: ningún nombre, email ni identificador de lead
  sale de la base. Las visualizaciones guardan solo el día y se borran con la cuenta del lead.
- **Pendiente de confirmar con el cliente.** Si la inmobiliaria quiere fijar su propio score mínimo
  por proyecto, si quiere ver los favoritos "alguna vez marcados" y si necesita filtrar por período.
  Están registrados como supuestos en ALG-19.
- Especificación de cada número: [ALG-19 — Métricas de interés por proyecto](../../docs/algorithms/ALG-19-project-interest-metrics.md).
  Implementación: `frontend/src/lib/commercial/projectInterestMetrics.js`, las funciones
  `registrar_visualizacion_proyecto()` y `project_interest_facts()` (migración `20261026120000`) y
  el plan `docs/stories/HU26-metricas-interes-proyecto/PLAN.md`.
