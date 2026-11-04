# HU30 — T8: bandeja y detalle staff

Cierre local: 2026-10-22. Branch `feat/hu30-capacidad-bipersonal`, base inicial `ee573cd`, árbol inicialmente limpio. Leídos PLAN, T6-PROYECCIONES, T7-TITULAR e instrucciones generales/frontend. Se implementa únicamente T8.

## Badge y filtro

La clasificación y el desglose financiero de la bandeja utilizan exclusivamente `co_debtor`, contrato `hu30-projection-v1`, de GET /tracking/staff/evaluations. El tipo se toma literalmente de `evaluation_type`; no se deriva de ingresos, invitación, relación, consentimiento actual o campos antiguos del snapshot.

| Tipo backend | Badge | Filtro específico |
| --- | --- | --- |
| individual | Titular individual | Titular individual |
| bipersonal_confirmed | Bipersonal confirmado | Con co-deudor |
| declared_complement | Complemento declarado | Solo Todos |
| unverifiable_origin | Origen no verificable | Solo Todos |
| Contrato ausente/desconocido | Participación no disponible | Solo Todos |

El filtro tiene exactamente **Todos / Titular individual / Con co-deudor**. Todos conserva todas las clasificaciones dentro de los demás filtros vigentes; no elimina la prioridad, comuna, fecha, confiabilidad, búsqueda o proyecto seleccionados. Restablecer vista también reinicia este filtro. No cambian ranking ni reglas de compatibilidad.

Bipersonales históricas revocadas/reemplazadas permanecen en Con co-deudor aun si su detalle está oculto: la clasificación corresponde a esa evaluación histórica. Las advertencias históricas enviadas por backend se traducen en una leyenda adicional del badge; el estado actual no reclasifica retrospectivamente la evaluación.

**Actualización integrada T9A/T9B:** el consumidor pasa por getEvaluations para conservar los metadatos de contacto existentes mediante list_lead_contacts, aislada por inmobiliaria en T9B. Ese enriquecimiento no añade otra fuente financiera ni decide clasificación. El cierre T8 describe las pruebas de esa etapa; el estado final y la evidencia integrada están en [HU30-CIERRE.md](HU30-CIERRE.md).

## Detalle y procedencia

`LeadDetailModal` consulta GET /tracking/staff/leads/{lead_id} y consume juntos evaluation, co_debtor e history. La evaluación se normaliza con el normalizador existente. Del listado se reutilizan únicamente nombre, correo, teléfono y confiabilidad del titular; no input/result, snapshots ni proyecciones financieras anteriores.

Se retira la carga parcial que conservaba el resultado viejo mientras traía otra confirmación y el fallback que reconstruía historial desde evaluaciones del listado. Un error/denegación mantiene la ficha sin datos financieros y ofrece reintentar/cerrar. Una respuesta de otro lead no se presenta. No se consultan tablas crudas ni rutas del titular para completar campos.

`ExecutiveCoDebtorSection` se adapta al contrato T6:

- Titular: ingreso/deuda considerados y contrato.
- Co-deudor: estado de participación, ingreso/deuda considerados (sin sustituirlos por montos declarados o confirmados no considerados), contrato, morosidad y relación usada.
- Procedencia traducida desde source; número de revisión si viene entregado, sin UUIDs ni objetos técnicos de provenance.
- Capacidades titular solo/evaluación y aporte efectivo UF/CLP; aporte por renta si está disponible. Se conservan aportes positivos, cero y negativos. No se ejecutan conversiones o diferencias financieras frontend.
- Relación modificada después de la aceptación inicial solo cuando backend entrega modified_after_acceptance.
- Riesgos exclusivamente de risks, con etiquetas legibles y el ámbito suministrado. info/low se presentan como informativo/leve; medium/high/critical como advertencia, manteniendo su severidad. Valores desconocidos permanecen neutrales, sin inventar gravedad o mostrar códigos internos. No se atribuye un riesgo general al co-deudor.
- «Posee otras participaciones confirmadas vigentes» únicamente con has_other_active_participations === true y detalle visible; se etiqueta como señal del co-deudor. No se muestran cantidades, IDs, proyectos, nombres o datos de otras participaciones ni se transforma la señal en penalización/riesgo.

La versión ausente/desconocida no activa el antiguo renderer basado en confirmed. Una confirmación actual no sustituye la revisión usada. Los datos ausentes aparecen como No disponible, nunca cero inventado. En estados declared/unverifiable no se promueve la clasificación aunque exista status=confirmed.

## Histórico y ciclo de lectura

El nuevo hook compartido useStaffProjectionRead carga la fuente autorizada al abrir, revalida al recuperar foco y cada 30 segundos en pestaña visible. Lista y ficha usan sus propios endpoints T6. El sondeo general de useLeads del padre sigue existiendo para sus consumidores; la vista T8 no usa sus snapshots como respaldo. No se agregan endpoints, tablas o llamadas por cada lead del listado.

El hook programa el primer historical_visible_until visible entregado por backend, incluyendo los históricos de la ficha. No calcula 30 días ni decide autorización. Al vencer retira los datos mientras solicita una nueva respuesta. Conserva ese temporizador durante lecturas lentas y descarta respuestas superadas, evitando que una lectura anterior al corte restituya datos visibles. Los plazos largos se programan en tramos.

Con visibility=hidden el nuevo detalle no muestra antecedentes del co-deudor, relación, capacidades/aportes, riesgos ni señal de otras participaciones, incluso ante valores residuales en el payload. Conserva advertencias e información propia del titular según T6. No recupera valores desde props, confirmaciones, totales o estados locales anteriores.

Las consultas de foco/sondeo son de fondo para conservar filtros y formularios comerciales en curso. Si fallan se retiran los datos; no mantienen una vista financiera anterior como alternativa. Al corte y al cambiar lead/cuenta/contexto se muestra carga sin expediente anterior. Los estados están acotados al contexto, con invalidación de respuestas tardías y limpieza de timers/listeners al desmontar. App asigna clave de montaje por cuenta/rol/inmobiliaria únicamente a DashboardLeads; no cambia el flujo del titular ni las reglas de acceso.

Solo se mantienen en memoria las modificaciones locales de confiabilidad existentes, sin mezclar snapshots financieros viejos con las filas reconsultadas. La autorización, alcance inmobiliario, visibilidad, clasificación y redacción siguen en backend; no se cambian Auth, RLS ni permisos.

## UX

Se conserva el diseño del dashboard, la ficha y las operaciones comerciales. Badge legible junto a los estados existentes; filtro adicional en la misma barra. El detalle usa bloques titular/co-deudor, CLP principal cuando el servidor lo entrega y UF como referencia. Si solo hay UF no se fabrica CLP. En móvil los bloques y filas financieras se apilan; la advertencia histórica evita confundir confirmación utilizada con consentimiento vigente.

No se implementan nuevas acciones comerciales, filtros adicionales, recálculos o cambios de score. El formulario/modal restante no se rediseña.

## Archivos

Implementación:

- frontend/src/App.jsx (solo montaje/contexto staff)
- frontend/src/components/DashboardLeads.jsx
- frontend/src/components/LeadDetailModal.jsx
- frontend/src/components/ExecutiveCoDebtorSection.jsx
- frontend/src/components/StaffParticipationBadge.jsx (nuevo)
- frontend/src/hooks/useStaffProjectionRead.js (nuevo)
- frontend/src/lib/commercial/bipersonalProjection.js (nuevo)
- frontend/src/styles.css

Pruebas:

- frontend/src/components/DashboardLeads.test.jsx (nuevo)
- frontend/src/components/LeadDetailModal.test.jsx (nuevo)
- frontend/src/components/ExecutiveCoDebtorSection.test.jsx
- frontend/src/components/StaffParticipationBadge.test.jsx (nuevo)
- frontend/src/hooks/useStaffProjectionRead.test.js (nuevo)

Documentación: PLAN.md y este informe.

## Verificación

Node 22.23.2, sin cambios de dependencias:

- **52 casos T8 aprobados** en cinco archivos: badge/filtro, integración en bandeja, detalle, aislamiento y ciclo temporal. Incluyen primera clasificación, histórico revocado/reemplazado, origen declarado/no verificable, aportes positivo/cero/negativo, opcionales, riesgos/severidades, booleano estricto, redacción residual, carga/error y cambio de lead/cuenta con respuestas tardías.
- Frontend completo: **937 aprobadas, 2 fallas previas, 0 omitidas** (939 casos, 86 archivos). Incremento neto de 46 casos respecto a T7; se sustituyen las seis expectativas de la vieja vista HU18 por el contrato T6 que ahora consume, sin habilitar un fallback inseguro.
- Se conservan las dos fallas previas: coDebtorService.test.js (fecha fija de pendiente vencida) y chileanRut.test.js (17.493.972-k inválido esperado válido). No se modifican esos archivos.
- Build Vite aprobado. Persisten avisos de tamaño de bundle, import estático/dinámico de favoritesService y tiempos de plugins.
- Chromium local con API y datos sintéticos interceptados: las tres opciones reales de filtro, búsqueda combinada, restablecimiento, tres evaluaciones bipersonales en Con co-deudor, incluidas dos históricas, estado declarado/no verificable fuera de ese filtro, aportes negativos, riesgos, señal booleana, cambio de lead pendiente sin datos anteriores y ocultación histórica. Escritorio y móvil 390 px, sin desborde del bloque financiero nuevo. Capturas solo temporales fuera del repositorio.
- git diff --check sin errores. No se ejecutan suites backend/SQL: esas capas no cambian y la validación integral no se adelanta a T9.

La falla financiera 2200 vs 2737.185... y los demás hallazgos previos de T6 permanecen documentados; no se corrigen ni se afirma haberlos reejecutado. No se aplica SQL remoto ni se accede a datos reales durante las pruebas de navegador.

Comandos desde frontend (Node de .nvmrc):

```bash
node node_modules/vitest/vitest.mjs run
node node_modules/vitest/vitest.mjs run src/components/ExecutiveCoDebtorSection.test.jsx src/components/StaffParticipationBadge.test.jsx src/components/DashboardLeads.test.jsx src/components/LeadDetailModal.test.jsx src/hooks/useStaffProjectionRead.test.js
node node_modules/vite/bin/vite.js build
```

## Commits de implementación y pruebas

- 0409e71 — feat(hu30): show staff bipersonal badges filters and detail
- 03373b9 — test(hu30): cover staff projections filters and privacy

## Cierre y siguiente validación

T8 cerrada en implementación/verificación local. Sin cambios de backend, motor, roles/permisos, RLS, migraciones ni funcionalidad del titular; sin push o PR.

Pendiente la validación integral referida por el usuario como T9A; el PLAN agrupa todavía esa etapa como T9, sin subdivisión técnica adicional aprobada. Corresponde verificar el recorrido completo de participación/revisiones/incorporación/consulta, aislamiento real por roles e inmobiliaria, privacidad histórica y carreras, regresión backend/frontend/SQL y revisión por otra persona. Registrar entorno, fallas previas y evidencia de despliegue coordinado cuando se autorice. El navegador sintético de T8 no acredita Auth/RLS remotos. No se inicia esa etapa ni se aplican migraciones aquí.
