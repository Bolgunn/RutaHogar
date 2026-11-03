# HU 21 - Configuración comercial y priorización por inmobiliaria

> **🗓 Planificada - Sprint 3.** El administrador inmobiliario ajusta los criterios con que se priorizan los leads de su inmobiliaria, sin tocar el score financiero del usuario.

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | *(sin definir en el tablero)* |
| **Puntos de Historia** | 5 |
| **Actor** | Administrador inmobiliario |
| **Sprint** | Sprint 3 |
| **Estado** | 🗓 Planificada |
| **Responsable** | Benjamín — ver [[../Sprint3-Division\|División del Sprint 3]] |

---

## Historia de usuario

> **Como** administrador inmobiliario, **quiero** configurar los criterios comerciales utilizados para priorizar los leads de mi inmobiliaria, **para** adaptar la gestión de los ejecutivos a los proyectos y objetivos comerciales de la organización sin modificar el score financiero del usuario.

---

## Criterios de aceptación

### E1 - Consulta de la configuración vigente

**Dado** que el administrador accede a la configuración comercial, **cuando** consulte la sección, **entonces** debe visualizar los criterios actualmente utilizados para priorizar leads, tales como capacidad de compra, afinidad, proyectos prioritarios y condiciones de oportunidad comercial.

### E2 - Modificación sin afectar el score

**Dado** que el administrador desea ajustar la estrategia comercial, **cuando** modifique los criterios permitidos y guarde la configuración, **entonces** el sistema debe validar y persistir los cambios sin modificar el score financiero ni las evaluaciones históricas de los leads.

### E3 - Previsualización antes de confirmar

**Dado** que el administrador ha modificado una configuración, **cuando** todavía no la haya confirmado, **entonces** el sistema debe previsualizar los cambios realizados en los criterios.

### E4 - Aplicación e historial

**Dado** que una nueva configuración comercial fue aplicada, **cuando** se prioricen leads posteriormente, **entonces** el sistema debe utilizar la configuración vigente y conservar un historial que indique qué se modificó, cuándo y por quién.

---

## Notas

- Reemplaza a la antigua [[HU23-parametros-scoring|HU 23 — Configuración de parámetros de scoring]]. La diferencia es de fondo: aquella dejaba al administrador mover el score; esta solo toca la **prioridad comercial**, y el score sigue saliendo de reglas auditables.
- Punto de partida en el código: `backend/app/scoring_engine/commercial_priority.py` y el orden de `DashboardLeads.jsx`.
- Comparte con [[HU28-gestion-equipo-inmobiliaria|HU 28]] (mismo responsable) la bitácora de auditoría, que también necesitan [[HU22-centro-exportacion-dossier|HU 22]] y [[HU27-gestion-acceso-cuentas|HU 27]].
