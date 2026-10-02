# PLAN - HU14: Analisis Y evolucion comercial de leads

- **Story:** HU14 - Analisis Y evolucion comercial de leads · **Actor:** Ejecutivo comercial
- **Status:** Built · Sprint 2 · 5SP **Depends on / Required by:** HU 7 catalogo de proyectos, HU 10 matching lead-proyecto, `ALG-10`
- **Branch:** feat/hu14-analisis-evolucion-comercial-leads

## Start here

Para una sesion de build. Las instrucciones permanentes estan en `docs/HANDBOOK.md` ("Starting a build session"); aqui solo va lo especifico de esta historia.

- Leer primero: `docs/algorithms/ALG-10-lead-project-affinity.md` y `docs/algorithms/ALG-10-cases.json`; son la autoridad para afinidad, compatibilidad, evidencia de capacidad, bloqueadores y senales de reorientacion por proyecto consumidas por HU14.
- Leer primero: `docs/algorithms/ALG-14-contact-opportunities.md` y `docs/algorithms/ALG-14-cases.json`; son la autoridad para deteccion automatica de oportunidades de contacto, tipos de trigger y ordenamiento.
- Leer primero: `docs/algorithms/ALG-15-commercial-contact-questions.md` y `docs/algorithms/ALG-15-cases.json`; son la autoridad para preguntas comerciales sugeridas, triggers contextuales y preguntas especificas por proyecto.
- Leer primero: `docs/algorithms/ALG-16-lead-project-comparison.md` y `docs/algorithms/ALG-16-cases.json`; son la autoridad para comparar dos leads contra un proyecto seleccionado.
- Leer primero: `frontend/src/components/DashboardLeads.jsx`, `frontend/src/components/ExecutiveHome.jsx`, `frontend/src/components/NotificationToast.jsx` y `frontend/src/styles.css`; contienen las superficies de UX ejecutiva tocadas por esta historia.
- Leer primero: `frontend/src/services/evaluationService.js` y `frontend/src/services/getScoringHistory.js`; exponen las formas actuales de evaluacion e historial inmutable usadas por la linea temporal de la ficha del lead.
- Detenerse y reportar si el build requiere cambiar scoring backend, umbrales financieros, pesos de matching de proyecto, esquema de base de datos, RLS, autenticacion o permisos.
- Detenerse y reportar si una metrica dependiente de proyecto se mostraria sin proyecto seleccionado o contra un proyecto fuera del contexto visible para el ejecutivo.
- Detenerse y reportar si oportunidades de contacto, preguntas sugeridas o comparacion de leads requieren una segunda implementacion de scoring, capacidad o `ALG-10` en vez de consumir salidas existentes.
- Detenerse y reportar si E2 debe interpretarse estrictamente como el `project_goal` persistido del lead en vez de proyectos visibles para el ejecutivo; esa es una decision de producto, no un detalle de implementacion.

## Goal

Dar al ejecutivo un flujo comercial mas claro alrededor de la evolucion de leads: entender como cambio un lead en el tiempo, detectar quien se volvio contactable, comparar dos leads contra un proyecto seleccionado y preparar mejores preguntas para el primer contacto.

HU14 no aprueba creditos, no garantiza beneficios habitacionales, no modifica scoring y no reemplaza evaluacion bancaria formal. Todos los resultados son orientacion comercial basada en datos declarados y persistidos.

## Acceptance criteria

### E1 - Visualizacion mejorada del historial de evolucion

Dado que un lead posee registros historicos de su informacion y evaluaciones, cuando el ejecutivo acceda al apartado de historial, entonces el sistema debe presentar la evolucion de forma clara y ordenada mediante una visualizacion temporal, destacando cambios relevantes, tendencias de mejora o deterioro y las variaciones en ingreso, situacion laboral, deuda, ahorro, score, capacidad de compra y compatibilidad con el proyecto.

### E2 - Deteccion automatica de oportunidad de contacto

Dado que la evaluacion de un lead cambia, cuando alcance una prioridad general Alta o pase a estado Compatible con su proyecto por capacidad de compra o afinidad, entonces el sistema debe identificarse automaticamente como una oportunidad de contacto e indicar que cambio produjo dicha oportunidad.

### E3 - Comparacion de leads para un proyecto

Dado que el ejecutivo desea comparar dos leads, cuando los seleccione para un proyecto determinado, entonces el sistema debe mostrar comparativamente su score, compatibilidad por capacidad de compra, compatibilidad por afinidad y los principales factores que favorecen o dificultan a cada uno.

### E4 - Recomendaciones de preguntas para el abordaje comercial

Dado que el sistema dispone de informacion financiera y contextual de un lead, cuando el ejecutivo prepare su contacto con el, entonces debe mostrar preguntas sugeridas orientadas a obtener informacion relevante que no pueda inferirse unicamente de los datos financieros y que pueda influir en la decision de compra.

## Approach & decisions

| Decision | Rationale |
| :------- | :-------- |
| Mantener HU14 dentro del dashboard ejecutivo | El ejecutivo ya gestiona leads ahi; una pagina nueva duplicaria contexto |
| E1 no crea ALG nuevo | Ordena hechos historicos y deltas, pero no toma una decision comercial normativa |
| E2 se documenta como `ALG-14` | Crea senal comercial y dispara notificaciones |
| E4 se documenta como `ALG-15` | Genera preguntas deterministicas y testeables |
| E3 se documenta como `ALG-16` | Resume evidencia comparativa contra proyecto |
| Metricas de proyecto solo aparecen con proyecto seleccionado | Evita sugerir compatibilidad contra un proyecto fuera del contexto actual |
| La comparacion se limita a dos leads | Cumple el criterio y evita saturar la UX |
| Preguntas sugeridas muestran cinco primero | Facilita preparar contacto sin abrumar |
| Descartar oportunidades es estado local | No existe integracion CRM/tareas persistentes en esta historia |

## Algorithms

- **`ALG-14` - Deteccion de oportunidades de contacto** (`docs/algorithms/ALG-14-contact-opportunities.md`). Implementado en `frontend/src/lib/matching/contactOpportunities.js`; probado por `contactOpportunities.test.js`; casos en `ALG-14-cases.json`.
- **`ALG-15` - Preguntas sugeridas para abordaje comercial** (`docs/algorithms/ALG-15-commercial-contact-questions.md`). Implementado en `frontend/src/lib/commercial/contactQuestions.js`; probado por `contactQuestions.test.js`; casos en `ALG-15-cases.json`.
- **`ALG-16` - Comparacion de leads para un proyecto** (`docs/algorithms/ALG-16-lead-project-comparison.md`). Implementado en `frontend/src/lib/matching/leadComparison.js`; probado por `leadComparison.test.js`; casos en `ALG-16-cases.json`.
- **`ALG-10` - Afinidad lead-proyecto** sigue siendo la fuente de compatibilidad, afinidad y evidencia de bloqueadores. HU14 lo consume, no lo redefine.

## Scope

**Dentro:**

- Historial temporal en la ficha del lead.
- Bandeja deduplicada por ultima evaluacion, manteniendo historial completo en ficha.
- Deteccion automatica de oportunidades y toast/modal de oportunidades.
- Preguntas sugeridas para abordaje comercial en la ficha.
- Comparacion de dos leads para un proyecto seleccionado.
- Tarjeta de calificaciones recientes en home ejecutivo con score y filtro de tiempo.
- Tests frontend para helpers deterministas.

**Fuera:**

- Cambios de scoring backend.
- Migraciones de base de datos.
- Cambios de autenticacion, permisos o RLS.
- Creacion de tareas CRM o asignacion persistente de oportunidades.
- Aprobacion hipotecaria, preaprobacion bancaria o garantia de beneficios.
- SDD pesado para cambios puramente visuales.

## UX rules

### Historial del lead

- Mostrar linea temporal con evaluacion mas reciente primero.
- Mostrar resumen de tendencia: `Mejora`, `Deterioro` o `Estable`.
- Mostrar score, clasificacion, ingreso, deuda, ahorro y situacion laboral cuando existan.
- Mostrar capacidad, compatibilidad y afinidad solo si hay proyecto seleccionado.
- Si el proyecto seleccionado coincide con la meta declarada del lead, destacarlo visualmente.

### Oportunidades

- Mostrar tarjeta compacta sobre filtros solo cuando existan oportunidades activas.
- Las notificaciones deben apilarse y nunca superponerse.
- El modal muestra lista acotada/carrusel y permite descartar una o todas.

### Preguntas sugeridas

- Mostrar categoria, pregunta y motivo.
- Priorizar preguntas contextuales por sobre las base.
- Incluir accion para copiar preguntas.
- No presentar preguntas como requisitos crediticios formales.

### Comparacion de leads

- Requiere proyecto seleccionado.
- Permite maximo dos leads.
- Muestra score, capacidad, afinidad y pocos factores favorables/dificiles.
- No muestra todos los indicadores crudos; el detalle queda en la ficha del lead.
- En movil, las tarjetas se apilan.

## Entities

| Surface | Contract |
| :--------- | :------- |
| `evaluations` | Filas existentes con `input`, `onboarding`, `result`, `created_at` |
| `scoring_history` | Historial inmutable existente via `getScoringHistoryByEvaluation` |
| `projects` | Contrato de proyecto HU 7 desde `projectService.js` |
| `matchLeadToProjects` | Funcion pura de `ALG-10`; no hace fetch |
| `localStorage` | Solo oportunidades descartadas; key `RutaHogar_dismissed_contact_opportunities` |


## Risks and follow-ups

| Risk | Follow-up |
| :--- | :-------- |
| E2 dice "su proyecto" y podria interpretarse solo como `project_goal` del lead | Decision de producto pendiente; hoy se usa universo visible para el ejecutivo |
| Descartes de oportunidades son locales | Persistir en CRM/tareas cuando exista integracion |
| Prioridades de preguntas son heuristicas | Ajustar con uso real y conversion |
| Factores de comparacion estan acotados | Agregar drill-down solo si ejecutivos necesitan mas evidencia |
| Pueden aparecer nuevos aliases de preferencias | Extender `ALG-15`/`ALG-16` cuando cambie intake/contexto |

## Change log

| Date | Change |
| :---- | :----- |
| 2026-09-22 | Creado plan y vinculados `ALG-14`, `ALG-15`, `ALG-16` para HU14. |
