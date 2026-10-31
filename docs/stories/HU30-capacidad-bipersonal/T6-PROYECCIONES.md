# HU30 — T6: proyecciones autorizadas

Cierre técnico local: 2026-10-22, branch `feat/hu30-capacidad-bipersonal`, base `668fee2`, árbol inicialmente limpio. Se leyeron PLAN y los cierres T3/T4A/T4B/T5. No se implementa T7/T8 ni se modifica frontend o motor financiero.

## Contrato común

Las filas de evaluación e historial incorporan `co_debtor`, con `version=hu30-projection-v1`. La proyección se calcula al leer desde el snapshot de esa evaluación y su referencia explícita; nunca desde la primera confirmación o sustituyendo la revisión usada por la actual.

| Campo | Contenido |
| --- | --- |
| evaluation_type | individual / bipersonal_confirmed / declared_complement / unverifiable_origin. |
| participation_id, status | Participación usada y estado efectivo; si no hay referencia usada, estado de la participación actual sin atribuirle la evaluación. |
| used_revision | UUID/número de la revisión usada, o null. |
| source, provenance | Fuente registrada, revisión resuelta, evento de relación y versión de scoring. Sin cuenta, RUT o correo del co-deudor. |
| relation | Relación utilizada, evento, relación aceptada inicialmente y modified_after_acceptance. Null si está oculta/no disponible. |
| holder | income, debt, contract propios del titular. |
| co_debtor | income, debt, contract, employment_continuity, delinquency del snapshot usado; income_considered y debt_considered del motor. Null al ocultar. |
| financial_totals | Ingreso y deuda consolidados considerados, solo mientras son visibles. |
| bipersonal_summary | Copia del resumen T5 verificable y de versión conocida; null si falta evidencia, se oculta o el formato es desconocido. |
| capacity | without_complement, capacidades reales with_complement, delta UF/CLP y UF/fecha de evaluación. No calcula un nuevo aporte. |
| availability | complete / insufficient_data; no sustituye falta de datos por ceros. |
| visibility | visible / hidden, resuelto en servidor. |
| revoked_at, replaced_at, historical_visible_until | Tiempos verificables de eventos y primer corte. Null cuando no hay evidencia temporal suficiente. |
| warnings | historical_consent_revoked, historical_participation_replaced, historical_details_hidden, closure_time_unknown, unverifiable_origin cuando corresponden. |
| risks | Solo códigos/severidades existentes permitidos y su scope; sin textos financieros libres. |

`confirmed` conserva como alias de compatibilidad HU18 los cinco valores del snapshot **usado**, únicamente durante visibilidad autorizada. Ya no representa la última confirmación sin incorporación. Ingresos/deudas confirmados y efectivamente considerados permanecen diferenciados, por ejemplo ante morosidad o relación no admisible.

Las capacidades/deltas se copian del resumen/indicadores persistidos. No se llama a calculate_score, capacity_limits, IA, correo o servicios de mercado en la proyección. Conserva aportes positivos, cero y negativos. El frontend debe consumir `co_debtor`; no reconstruir clasificación, consentimiento o aporte desde raw input, invitación o renta positiva.

## Titular

Rutas existentes:

- GET /tracking/owner/evaluations: cada fila incluye co_debtor y anotaciones autorizadas.
- GET /tracking/owner/scoring-history y /tracking/evaluations/{id}/history para su propio expediente: proyección sobre el snapshot histórico.
- GET /tracking y lecturas/respuestas HU13: mantienen el linaje y enriquecen los nodos con evaluación conocida. La proyección superior refleja la evaluación activa.
- GET /tracking/owner/co-debtor: singleton HU18 por invitación, con campos permitidos; sin tokens, cuenta, request ni payloads de auditoría. Después del corte también omite destinatario/RUT y confirmaciones financieras.

Campos exclusivos del titular: current_participation, current_revision, update_required, matching_confirmed_later y message. La lectura de seguimiento mantiene score_update_required como alias compatible de update_required. Los cinco valores se comparan en servidor con la evaluación vigente: coincidencia posterior no habilita actualización ni altera procedencia histórica. Datos cambiados y revisión utilizable dejan pendiente la incorporación explícita. Los pendientes financieros siguen disponibles al titular mediante la lectura de su participación; no se incorporan al contrato comercial.

No se incluye has_other_active_participations en ninguna proyección del titular. Las respuestas filtran por el user_id obtenido de Auth; IDs de otros titulares no cambian ese ámbito.

## Staff

- GET /tracking/staff/evaluations: filas ya acotadas por la RPC de inmobiliaria, con contrato común.
- GET /tracking/staff/leads/{lead_id}: devuelve evaluation, co_debtor e history, todos coherentes con la revisión usada.
- GET /tracking/evaluations/{id}/history: si el solicitante es staff de otro titular autorizado, utiliza la proyección staff; ya no recorre la proyección del titular con sus campos exclusivos.

Ejecutivo y admin inmobiliario conservan alcance de su inmobiliaria; admin global sin inmobiliaria mantiene el alcance global existente. Perfil/rol/inmobiliaria salen de servidor. Se autoriza el detalle antes de consultar antecedentes. Las tablas/RPCs de snapshots crudos continúan sin acceso comercial directo.

Se retira el fallback comercial que mostraba cinco valores actuales cuando no había referencia en la evaluación. Estado confirmed actual no acredita que esa confirmación se haya utilizado. Una evaluación legacy sin evidencia presenta origen no verificable y no toma datos financieros de una confirmación posterior.

## Otras participaciones

Campo exclusivo staff: has_other_active_participations, booleano. Se resuelve para la cuenta de la revisión usada y verificada, mientras el detalle es visible. Solo considera otras participaciones confirmed vinculadas, con aceptación y sin cierre; excluye la participación y el titular del expediente. Las revocadas/reemplazadas no se consideran vigentes.

La consulta interna selecciona únicamente IDs de enlace, estado, referencias y fechas mínimas. No obtiene renta/deuda, RUT, correo o proyectos de terceros. La respuesta no devuelve cantidad, IDs ni filas de esas otras participaciones. No se convierte la señal en un riesgo financiero o penalización nueva.

Se consultan participaciones por lotes de hasta 100 identificadores para acotar URLs, con páginas de 1000 filas; no hay una llamada por lead en el repositorio de producción. La selección/visibilidad se resuelve en memoria sobre los lotes ya autorizados. No hay tablas/contadores nuevos ni cron.

## Histórico y redacción

La revisión, relación y clasificación histórica proceden de la evaluación original. Una nueva revisión/participación no modifica esa evidencia ni reabre datos de la anterior.

Se utiliza historical_visibility compartido: primera revocación o reemplazo verificable posterior a confirmación + 30 períodos exactos de 24 horas. El instante de corte ya está oculto; transiciones posteriores no lo reinician. Un cierre sin fecha verificable queda oculto sin inventar un mes de gracia. Un evento de revocación impide considerar vigente la participación aunque su estado legacy sea inconsistente.

Durante la ventana se mantienen datos del snapshot usado y advertencia con fecha de corte. Después:

- Co-deudor: se omiten antecedentes, relación, identidad/vínculos sensibles y destinatario en las rutas de invitación.
- Derivados: se eliminan ingresos/deudas totales, ratios, capacidades/aportes, componentes de score y datos de los que pueda reconstruirse el complemento.
- Narrativas: se eliminan recomendaciones, bloqueadores/textos, planes/metas derivados, beneficios, SHAP/fraude, anotaciones y payloads financieros.
- El resultado oculto usa una whitelist de score, clasificación, versión y, cuando existen, ingreso/deuda principales. También se aplican las reglas a result_snapshot, current_evaluation y evaluation del linaje, incluyendo futuros campos derivados del resultado.
- La proyección mantiene identificación histórica propia, clasificación verificada, advertencias y datos del titular. co_debtor, relation, totals, summary y capacity quedan null; risks queda vacío. La señal de otras participaciones es false y no dispara esa consulta tras ocultarse el detalle.

Se devuelve Cache-Control: private, no-store, Pragma: no-cache y Vary: Authorization en las rutas tracking. T7 debe refrescar al alcanzar historical_visible_until y consumir la nueva respuesta; un objeto previamente mostrado no constituye autorización para seguir presentándolo. No se añaden componentes ni timers frontend en T6.

No se borra ni actualiza ningún snapshot. La clasificación de registros con referencia HU18 puede resolverse conservadoramente, sin atribuir una cuenta/aceptación inexistentes. Sin evidencia suficiente: unverifiable_origin y aporte no disponible, sin recalcular o backfill.

## Migración mínima justificada

Se reprodujo con el predicado T3 anterior:

`hu30_has_complement({"input":{"complemento_renta":false,"complemento_ingreso_mensual":1500000}}) = false`.

Esto permitía que una lectura directa del propio snapshot legacy evitara la proyección. También faltaba detectar snapshots parciales cuya única evidencia era procedencia o resumen.

Nueva migración: `20261022090000_hu30_legacy_snapshot_guard.sql`. Amplía únicamente hu30_has_complement para recorrer estructuras/aliases conocidos y marcadores de procedencia, sin nuevas tablas/columnas/políticas. Las políticas T3 existentes la reutilizan. Restablece explícitamente el grant SELECT sometido a RLS para permitir replay después del rollback; no da acceso a snapshots comerciales.

schema.sql refleja la función. El rollback conserva el predicado estricto y revoca SELECT directo de evaluations/scoring_history a authenticated/anon; el backend sigue accediendo por proyecciones. No restaura el bypass ni borra evidencia. Reaplicar la migración devuelve la lectura individual propia bajo RLS. No se aplicó SQL remoto ni se editaron migraciones históricas.

## Archivos modificados

- backend/app/tracking/co_debtor.py
- backend/app/tracking/co_debtor_access.py
- backend/app/tracking/co_debtor_projection.py (nuevo)
- backend/app/tracking/owner_reads.py
- backend/app/tracking/repository.py
- backend/app/tracking/routes.py
- backend/app/tracking/staff.py
- backend/tests/tracking/test_hu30_safe_projections.py (nuevo)
- backend/tests/tracking/test_hu30_projection_api.py (nuevo)
- backend/tests/tracking/test_staff_co_debtor_projection.py
- backend/tests/tracking/test_staff_co_debtor_api.py
- scripts/test-hu30-persistence.py
- supabase/migrations/20261022090000_hu30_legacy_snapshot_guard.sql (nuevo)
- supabase/rollback/20261022090000_hu30_legacy_snapshot_guard_rollback.sql (nuevo)
- supabase/tests/hu30_safe_projections.sql (nuevo)
- supabase/schema.sql
- docs/stories/HU30-capacidad-bipersonal/PLAN.md
- Este informe.

## Verificación

- Backend relacionado HU18/T3–T6, ALG-17, scoring profesional y rutas/grants: **258 aprobadas, 1 falla previa, 0 omitidas**; incluye **37 casos nuevos T6** de servicio/HTTP. Falla conservada: test_insufficient_down_payment_is_identical_before_and_after_confirmation, 2200 frente a 2737.1852638989135 UF. Advertencia previa de operation ID duplicado.
- PostgreSQL 16 desechable: preflight demuestra el bypass viejo, la migración lo cierra, y pasan lecturas RLS de aliases/snapshots parciales y suites T3/T4A/T4B/T5, carreras de confirmación/incorporación y rollback que conserva fingerprint. Roles/tenant y cortes se verifican entre SQL y HTTP. Contenedor eliminado, sin conexiones remotas.
- Frontend completo con Node 22.23.2: **850 aprobadas, 2 fallas previas, 0 omitidas**. Permanecen fecha fija vencida y RUT inválido esperado como válido. No cambia ningún archivo frontend.
- Helpers/correos Edge mediante harness Node: **11 aprobadas, 1 falla previa** de managementPublicContext (Date vs estado). No se ejecuta runtime Deno real.
- Deriva de esquema: las mismas **8 diferencias ajenas** (2 ausentes, 6 divergentes), sin divergencia HU30 nueva. git diff --check sin errores.

Se actualizan expectativas de dos archivos de pruebas comerciales HU18 porque su fallback financiero sin referencia es precisamente la conducta insegura retirada por T6. Ahora exigen origen no verificable y ausencia de cifras actuales; no se cambian las fallas previas documentadas, fechas de fixtures frontend ni reglas financieras.

Comandos principales desde raíz:

```bash
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest backend/tests/tracking backend/tests/test_co_debtor_scoring_inputs.py backend/tests/test_alg17_cases.py backend/tests/test_evaluations_grants.py backend/tests/test_hu18_decline_migration.py backend/tests/test_hu18_edge_function_security.py backend/tests/test_hu13_deployment_routes.py backend/tests/test_score_professional.py -q -o cache_dir=/tmp/hu30-t6-pytest
python3 scripts/test-hu30-persistence.py
node scripts/check-schema-drift.js
```

## Cierre

T6 cerrada en implementación/verificación local. No hubo push/PR, migraciones remotas, cambios de fórmulas o recálculos desde lecturas. Se mantienen los límites del bootstrap SQL documentados en T3 y la necesidad de despliegue coordinado/E2E real antes de liberar.

T7 debe adaptar la normalización/consumo del contrato del titular y construir la tarjeta en la pantalla activa: desglose, capacidades/aporte, cero/negativo, advertencias, pendientes/coincidencia y feedback del recálculo explícito. Debe limpiar/refrescar datos al cambiar cuenta o llegar al corte y no decidir elegibilidad, procedencia o clasificación localmente. Badge/filtro y detalle comercial siguen siendo T8. No se implementan en T6.
