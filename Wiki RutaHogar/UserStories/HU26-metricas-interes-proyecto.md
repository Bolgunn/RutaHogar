# HU 26 - Métricas de interés por proyecto

> **🗓 Planificada - Sprint 3.** El administrador ve qué proyectos generan más tracción (visualizaciones, simulaciones, favoritos) y cuántos interesados quedan fuera por no alcanzar el score requerido, agrupados por motivo.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Mauro — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** visualizar las métricas de interacción, interés y viabilidad financiera que genera cada proyecto (visualizaciones, favoritos, simulaciones y rechazos), **para** evaluar si nuestra oferta inmobiliaria está alineada con la demanda y la capacidad de compra real de los leads, permitiendo ajustar estrategias comerciales.

---

## Criterios de aceptación

### E1 - Ranking de tracción

**Dado** que el administrador accede al dashboard de métricas, **cuando** seleccione la vista por proyectos, **entonces** el sistema debe mostrar un ranking ordenado de las propiedades que generan mayor tracción, detallando la cantidad de visualizaciones, simulaciones realizadas y veces que fueron guardadas como favoritas.

### E2 - Leads incompatibles por proyecto

**Dado** que existen proyectos siendo evaluados por los leads, **cuando** el administrador analice su desempeño, **entonces** el sistema debe mostrar cuántos de los leads interesados resultaron incompatibles o fueron rechazados por no alcanzar el score financiero requerido para ese proyecto en particular.

### E3 - Motivos de rechazo agrupados

**Dado** que un proyecto presenta leads calificados como incompatibles, **cuando** el administrador consulte el detalle de sus métricas de rechazo, **entonces** el sistema debe agrupar y mostrar claramente cuáles son los motivos principales que están frenando la compra para ese proyecto específico.

---

## Notas

- Hoy existen favoritos (`favoritesService.js`), pero **no se registran visualizaciones ni simulaciones**: hay que empezar a capturar esos eventos antes de poder contarlos.
- Los motivos de rechazo pueden salir de los bloqueadores del motor (`scoring_engine/blockers.py`) y de la compatibilidad por proyecto (`scoring_engine/project_fit.py`).
- Se suma a las métricas comerciales de [[HU15-dashboard-conversion-tiempos|HU 15]] (`CommercialMetrics.jsx`). La exportación de estas métricas la cubre [[HU22-centro-exportacion-dossier|HU 22]].
