# HU30 — Auditoría de integración y compatibilidad

Fecha: 2026-10-25. Estado: diff preparado para revisión; despliegue escalonado sobre `main` antiguo BLOQUEADO. No certifica el ambiente hospedado.

## Referencias y alcance

- Rama: `feat/hu30-capacidad-bipersonal`.
- Base remota comprobada mediante fetch: `origin/develop` = `14738e185c4d77794d4fa2c9e57dcbeffc47dcca`.
- `origin/main` = `7e46e96c531e5730637490b05678f940ffb88a68`.
- El `develop` local apunta a `510dcff`; no se utilizó para construir el diff ni se modificó.
- Auditoría del código de esas referencias, no del artefacto que efectivamente sirve producción ni de su registro de migraciones/secrets. No se consultó Supabase remoto.
- Respaldo íntegro previo: rama LOCAL `backup/hu30-before-integration-cleanup-20261025`, punta `13be10b978dbfe35b4d73751a0f7566fa43162e6`. NO subir esta rama: conserva herramientas y credenciales sintéticas locales.
- Se consolida el historial productivo sobre `origin/develop` para que los commits a subir tampoco incluyan el tooling retirado. La rama de respaldo conserva todos los commits originales.

## Separación de cambios

Exclusivamente locales, excluidos del diff y del historial nuevo:

- `Makefile`: se restaura la versión de origin/develop; se retiran local-up/functions/doctor/kill/restart/reset y hu30-demo-*/test-hu30-local. Los comandos run originales dejan de depender de scripts locales.
- `scripts/local_supabase.py`, `local_runtime.py`, `local_kill.py`, `hu30_demo.py`, `hu30_demo_cleanup.sql`, `test-hu30-local.mjs`, `test-local-environment.py`, `test-local-form.mjs`.
- `backend/tests/test_local_runtime.py`, `test_local_kill.py`, `test_hu30_demo_guards.py`; `frontend/src/services/__tests__/localMailTransport.test.js`.
- `docs/local-development.md`, `docs/local-validation.md` y su enlace en README. Son instrucciones/evidencias del entorno de trabajo privado, no requisitos del producto.
- Las dos entradas nuevas de .gitignore se trasladan a `.git/info/exclude`, sólo local.
- Transporte Mailpit `mailTransport.ts` y rama `localMailDelivery()` dentro de `co-debtor-consent/index.ts`. El transporte productivo sigue siendo Resend, con las mismas variables existentes. No se modifica ningún contrato HU30 al retirar este adaptador exclusivamente local.
- Corrección incidental de `backend/app/market_data/service.py` y su test de HU17: provenían del bootstrap local, fuera de HU30. Se restaura develop. La discrepancia preexistente `_fixture_snapshots_allowed`/`fixture_snapshots_allowed` queda como deuda externa; no se resuelve en esta entrega.

Respaldo adicional de archivos/herramientas en `.local-supabase/integration-backup-20261025/` (ignorado): `local-tooling.tar.gz`, copia exacta de los dos archivos locales, patch e inventario. No se borraron volúmenes, cuentas ni datos demo existentes, ni se detuvieron servicios.

Archivos mixtos:

1. Edge index: sólo se elimina el transporte local; se conservan autenticación, RPC, privacidad/CORS, acciones, notificaciones y cambios HU30.
2. `supabase/schema.sql`: el contenido productivo versionado se toma de `b8f8fdd` (posterior a T9B y anterior al bootstrap). Así se excluyen el comentario local, housing_plan y la reubicación incidental del reporte hechos por `9284951`; se conserva toda la definición HU30/T9B. El archivo de trabajo del usuario permanece byte por byte igual, incluyendo sus cambios locales y CRLF. Sólo el contenido del índice/commit se separa. No se despliega schema.sql: las siete migraciones son la autoridad incremental.
3. Se conservan `scripts/test-hu30-persistence.py`, `test-hu30-e2e.py`, `hu30-e2e/*` y `test-hu18-helpers.mjs`: son regresiones de contratos productivos/seguridad con recursos desechables, no runtime/checkpoints del desarrollador. Sus cuentas sintéticas son fixtures de tests aislados, no las tres cuentas demo determinísticas.
4. `frontend/.env`: ningún cambio en el PR. Su contenido de trabajo previo se preserva y no se imprime.

## Dictamen de compatibilidad

**No existe un orden de las siete migraciones y la Edge actual que mantenga íntegro HU18 con el frontend/backend antiguo de main.** La conservación de filas no equivale a retrocompatibilidad de los contratos. No se corrige ni relaja la seguridad automáticamente.

### Riesgos bloqueantes demostrados

- **Embeds PostgREST ambiguos desde M1.** Main usa `co_debtor_confirmations(...)` sin hint en TrackingRepository.load_co_debtor_consent(), staff_co_debtor_invitation() y frontend coDebtorService. La nueva FK compuesta invitation/account agrega otra relación entre las mismas tablas. GET de sólo lectura al Supabase LOCAL migrado: consulta antigua -> HTTP 300 / `PGRST201`; misma consulta con `!co_debtor_confirmations_invitation_id_fkey` -> HTTP 200. El backend HU30 incluye ese adaptador, main no. Después de v2, su confirmations[0] tampoco seleccionaría inequívocamente.
- **Confirmación antigua bloqueada desde M1/M2.** M1 exige account/request_id/revisión/relación y referencias de evento. M2 sustituye hu18_confirm_invitation por authenticated_confirmation_required. La Edge antigua retorna 409 al fallar la RPC; la nueva retorna directamente 409 para submit_confirmation. No es recuperable sólo cambiando el orden.
- **Lecturas antiguas bloqueadas desde M3.** Main frontend getEvaluations consulta evaluations directamente y después evaluation_events. M3 filtra todo snapshot con complemento y revoca SELECT evaluation_events incluso para resultados individuales; getEvaluations lanza error si hay filas individuales. getScoringHistory pierde filas con complemento y falla al leer anotaciones para otras filas. También cambian metas/simulaciones. El frontend HU30 usa endpoints/RPC seguros; main no.
- **Perfiles comerciales.** M3 aplica un BEFORE INSERT que sólo permite usuario sin tenant para clientes. Un INSERT ON CONFLICT de main upsertProfile con role ejecutivo/admin/admin_inmobiliario ejecuta ese trigger antes del conflicto y falla, aunque ya exista la fila. Afecta actualizar/completar esos perfiles, no necesariamente cada login. El nuevo profileService usa UPDATE para filas existentes.
- **Edge nueva contra frontend viejo.** create_invitation exige ahora relacion_complementario (main no la envía -> 422). inspect_invitation devuelve can_submit:false/authentication_required:true, que main interpreta como enlace no disponible. No hay pantalla autenticada en main que pueda continuar. Respuesta submit_confirmation cambia del éxito 200 con flags de correo a 409. Los links de nuevas confirmaciones usan participation=UUID, desconocido por main.
- **Autodeploy al integrar.** `.github/workflows/deploy-supabase-functions.yml`, ya presente en main/develop, se ejecuta al push a develop o main con cambios en supabase/functions y despliega co-debtor-consent. Usa el mismo nombre de secret SUPABASE_PROJECT_REF, sin environments/selección por branch. El repositorio no prueba que sea un proyecto staging distinto; debe verificarse antes de merge. La integración puede desplegar Edge prematuramente incluso sin ejecutar migraciones manuales. No se modificó el workflow ni secrets.

### Legado operativo

No se inventan cuenta, relación ni provenance. Una participación HU18 con participant_user_id null y sin evento de relación no puede producir una revisión autenticada usando el nuevo review/confirm: primero debe existir una declaración válida y vínculo verificado. No se garantiza que una invitación antigua pendiente se complete intacta con sólo desplegar HU30; debe acordarse su tratamiento (por ejemplo reemplazo explícito). Los management_token_digest antiguos permanecen y sus endpoints de gestión siguen disponibles para estados permitidos. No se recomienda volver a main antiguo después de crear revisiones múltiples.

## Las siete migraciones, en orden

No se borran tablas ni revisiones. Varias son restrictivas/cambian comportamiento y por ello NO son puramente aditivas ni compatibles por defecto.

### M1 — 20261021120000_hu30_confirmation_revisions.sql

- Agrega invitation.participant_user_id; confirmation.revision_number/participant_user_id/accepted_relation_event_id/request_id; consent_event.actor_user_id/confirmation_id/relation_value/relation_revision; índices, FK compuestas y funciones hu30_*.
- Backfill único: revision_number=1 para confirmaciones antiguas; luego NOT NULL. Retira UNIQUE(invitation_id), agrega unicidad por participación+revisión y participación+request, CHECK revisión positiva. Amplía CHECK de event_type con relation_declared/relation_changed (no enum PostgreSQL nuevo).
- Triggers: identidad vinculada inmutable, confirmaciones append-only/secuenciales con identidad y consentimiento, eventos referenciados, evaluación referenciada/consistente. Bloquea escrituras viejas aunque service_role pueda ejecutar la RPC antigua.
- No cambia firma de RPC HU18 en este archivo, pero sí los invariantes de sus tablas; duplica las rutas FK para embeds sin hint.
- **Main: NO compatible**, incluso sin crear v2. Necesita adaptadores backend/frontend/Edge nuevos coordinados. Locks y creación de índices no concurrentes pueden bloquear escrituras; evitar operaciones en vuelo. Desplegar conjunto completo, no dejar M1 como estado operativo aislado.

### M2 — 20261021121000_hu30_participation_closure.sql

- Reemplaza hu18_create_invitation (overload de cuatro argumentos usado por el overload ampliado existente), revert_invitation_after_delivery_failure, revoke_consent, expire_invitation(s), decline_invitation y confirm_invitation. Firmas conservadas.
- Reemplazo inmediato de pending/confirmed, timestamps/eventos bajo lock de perfil -> participación. No resucita confirmadas tras fallo de envío. Revocación puede operar sobre reemplazadas confirmadas. Confirmación antigua lanza excepción siempre.
- Sin tablas/columnas/enums nuevos, pero modificación restrictiva de RPC existentes. **Main: NO compatible** para confirmar; nuevo comportamiento de reemplazo es intencional. Depende de M1 y adaptador autenticado M4/M5+Edge/UI. Durante envío fallido, la participación confirmada anterior sigue cerrada.

### M3 — 20261021122000_hu30_secure_snapshot_access.sql

- Reemplaza policies de evaluations/scoring_history; elimina lectura staff directa; owner sólo lectura raw individual; revoca tablas de tracking/anotaciones/co-deudor y escrituras directas evaluations/history para clientes.
- Cambia policies de mortgage_scenarios/improvement_goals y agrega funciones de lectura/redacción hu30_list_mortgage_scenarios/hu30_list_owner_goals y helpers de visibilidad/consentimiento.
- Agrega trigger de protección role/inmobiliaria_id en profiles, incluyendo INSERT y UPDATE; no cambia enum/check de rol.
- **Main: NO compatible**, aun para lecturas de evaluaciones individuales con anotaciones y perfiles comerciales vía upsert. Requiere backend de proyecciones, sus consumidores frontend y profileService adaptado. Depende de M1/closure y base HU13/HU17; M6 completa guardia de alias. No recuperar disponibilidad reabriendo lecturas inseguras.

### M4 — 20261021130000_hu30_authenticated_access.sql

- Nueva RPC service-only hu30_authorize_invitation: sesión verificada por Edge, email verificado, rol usuario y RUT normalizado; vinculación idempotente en pending vigente.
- Aditiva, sin cambios de constraints/enums/policies viejos. **Por sí misma no agrega ruptura a main**, pero depende de M1 y no elimina las rupturas anteriores. Requiere nueva acción authorize_invitation para ser utilizada. No crea revisión ni consentimiento financiero.

### M5 — 20261021140000_hu30_authenticated_confirmation.sql

- Nuevas RPC/helpers service-only para review/confirm/decline/revoke/list participations, comparación de cinco valores y create_invitation atómica con declaración de relación. Sin tablas/enums ni reemplazo de RPC vieja.
- Aditiva en catálogo, requiere M1/M2/M4, overload HU18 ampliado previo y nueva Edge/UI. **Main no la consume**; no restaura create/confirm antiguos. La relación es obligatoria para nueva revisión; legado sin declaración no se rellena automáticamente. No la ejecutar aisladamente como solución de compatibilidad.

### M6 — 20261022090000_hu30_legacy_snapshot_guard.sql

- Reemplaza hu30_has_complement por detector recursivo de alias/snapshots parciales; concede SELECT evaluations/scoring_history, siempre limitado por RLS.
- Sin columnas/enums/constraints; restrictiva para nuevas formas de legado antes omitidas. **Main: sigue incompatible** (más filas raw dejan de ser visibles; anotaciones siguen bloqueadas). Depende de M3; debe incluirse con sus proyecciones para no dejar bypass de privacidad.

### M7 — 20261023090000_hu30_staff_contact_isolation.sql

- Helper hu30_staff_can_read_lead; DROP/CREATE list_lead_contacts(uuid[]) con MISMAS nueve columnas efectivas que main; reemplaza policy lead_status_history y get_reported_leads_for_admin/get_lead_status_history_for_admin.
- Sin tablas/columnas/enums; cambio restrictivo de alcance por sujeto/tenant; notas Cache-Control:no-store. No es una expansión de permisos. Dependencias: migración de nombres 20260922000000, helpers tenant previos, M3/M6; aplicar después de las migraciones antiguas de contactos.
- **Contrato de payload main: compatible** para usuarios autorizados en su tenant; terceros retornan vacío, global admin conserva su alcance. Cambia intencionalmente la visibilidad antes demasiado amplia. Reportes con complemento eliminan fraude/SHAP reconstructivos. Validar casos reales de pertenencia por lead_belongs_to_inmobiliaria. No reaplicar 20261008150000 luego, reabriría el bypass.

Cada archivo tiene transacción propia: ejecutarlos ordenadamente NO constituye una única transacción de release entre backend/Edge/UI. Sus rollbacks homónimos en supabase/rollback son de contención, conservan evidencia y deshabilitan contratos/permisos; **no restauran main/HU18 antiguo**. Rollback funcional implica corrección hacia adelante o compatibilidad aprobada, nunca revertir a lectores ambiguos o reabrir fuga.

## Matriz de Edge contra main

| Acción / contrato | Estado |
| --- | --- |
| create_invitation | Incompatible: main omite relación; ahora 422 antes de crear/enviar. Éxito conserva status/expires_at/email_sent si se usa payload nuevo y M5. |
| inspect_invitation | Mismo nombre y estados/404, pero respuesta de pending cambia: sin financieros, can_submit=false y authentication_required=true; main muestra enlace no disponible. |
| submit_confirmation | Incompatible deliberadamente: siempre 409 authenticated_confirmation_required; no acepta payload antiguo como fallback. |
| decline_invitation | Conserva token y 200 declined /404 inválido /409 estado cerrado; ruta HTTP sigue pública. En UI antigua no se alcanza si inspect bloqueó pantalla. |
| inspect_management | Token antiguo y respuesta status/can_revoke conservados para estados permitidos. |
| revoke_management | Mismo token, 200 revoked/already_revoked, 404 inválido/409 rechazo; M2 requiere confirmación para revoked/replaced. No obliga a inventar cuenta legacy. |
| process_expirations | Misma acción, header cron, respuesta processed/notification_failures; sigue TTL existente. Nueva política Origin sólo afecta callers que envíen Origin no autorizado. |
| authorize_invitation / *_participation | Acciones nuevas autenticadas, imposibles de consumir por UI antigua. Errores 401/403/409/422/503; éxito confirm con confirmation_id/revisión/notifications, no flags antiguos a nivel superior. |
| Invitación / gestión | /co-deudor/invitacion?token= conserva ruta para entradas; nuevas confirmaciones enlazan /co-deudor/invitacion?participation=UUID autenticado. Legacy /co-deudor/consentimiento?token= sigue siendo gestión antigua. |
| CORS | De * pasa a Origin exacto APP_PUBLIC_URL + lista opcional; preflight ahora 204. Origin externo 403, configuración inválida 503; no basta que frontend viejo conozca la URL de Supabase. |

## Variables

NUEVA de producción: **CO_DEBTOR_ALLOWED_ORIGINS**, opcional y vacía por defecto. No hace falta si todas las llamadas llegan desde el origin de APP_PUBLIC_URL. Si staging/preview usa otro origin, debe autorizarse explícitamente (sin wildcard/ruta). El workflow actual NO la publica; uso adicional requiere configuración coordinada posterior, no hecha aquí.

APP_PUBLIC_URL y variables Supabase/Resend/remitente/TTL/cron/frontend ya existían. No se cambiaron sus valores ni se solicita reconfigurarlas. RUTAHOGAR_ALLOWED_ORIGINS backend también preexistía. LOCAL_MAILPIT_URL/DENO_DEPLOYMENT_ID usados sólo por el adaptador eliminado no son requisitos nuevos de producción. Redirect de confirmación de Auth es configuración del servicio, no una variable nueva introducida por HU30.

## Orden de integración y despliegue

La secuencia propuesta “migrar producción -> validar frontend antiguo intacto -> merge develop -> probar HU30 -> main” **no es aprobable con este diff**. La validación antigua fallaría por los contratos listados. No se aplica ni corrige automáticamente.

1. Revisar este dictamen y decidir antes de merge cómo impedir que el push a develop despliegue a la producción antigua: confirmar un proyecto remoto de staging separado o aprobar un gate explícito del workflow. No asumir que existe separación.
2. Decidir estrategia: (a) entrega coordinada en ventana de mantenimiento con backend+Edge+frontend HU30, incluyendo renovación de clientes antiguos; o (b) diseñar y aprobar primero una transición compatible (expand/contract, adaptadores/flags), con nueva auditoría. No se implementó ninguna en esta tarea.
3. En staging AISLADO, validar y registrar baseline main (frontend+backend+BD actuales) ANTES de migrar. El objetivo de validar main DESPUÉS de migrar necesita la alternativa b; actualmente no puede aprobarse. No escribir pruebas sobre producción en uso.
4. Con el destino/gate verificado, merge HU30 -> develop para revisión y build. No desplegar todavía al proyecto de producción compartido.
5. Sobre staging, detener escrituras/operaciones en vuelo del flujo durante el cambio coordinado. Aplicar exactamente M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7; no intercalar clientes antiguos ni reejecutar migraciones históricas. Verificar FKs, grants, rol guard, RLS y reload del schema cache PostgREST según el procedimiento del ambiente.
6. Activar backend HU30 (selección explícita y proyecciones), Edge co-debtor-consent completa con M1–M7 disponibles, y frontend HU30 de develop en la misma ventana. Mantener configuración existente y verificar origins/retorno Auth. No dejar Edge nueva con frontend main antiguo ni backend nuevo sin sus migraciones.
7. Probar HU30 remoto en staging: crear/confirmar/incorporar/revisión/coincidencia, histórico, Auth, enlaces legacy, tenant/roles/contactos y sesiones abiertas. Comprobar que lo excluido del PR no es necesario para esos contratos. Acordar tratamiento de invitaciones antiguas y rollbacks de contención.
8. Sólo con homologación/aprobación, promover develop -> main. Para producción repetir backup/verificación de baseline y cambio coordinado de M1–M7 + backend/Edge/frontend, con mantenimiento o transición compatible aprobada, y smoke test antes de reabrir. Usuarios con bundles viejos deberán actualizar; no afirmar ausencia de interrupción.
9. Si falla la release, contener escrituras y aplicar estrategia de corrección hacia adelante. Los rollbacks no permiten simplemente volver al frontend/backend anterior conservando servicio completo.

Si se exige que main antiguo permanezca totalmente funcional tras migrar BD o desplegar Edge, el paso 5 queda BLOQUEADO hasta diseñar la transición. No se recomienda aplicar ni siquiera M1 en producción para “adelantar trabajo”.

## Pruebas de esta limpieza

| Comprobación | Resultado |
| --- | --- |
| Backend tracking/HU18/HU30, scoring inputs, grants, seguridad Edge | 243 passed, 1 failed previo (2200 UF vs 2737.1852638989135). |
| Frontend COMPLETO, Node 22.23.2, un worker/threads | 989 passed, 2 failed previos, 90 archivos (88 pasan). Fallan fecha fija de coDebtorService y fixture 17.493.972-K de chileanRut. |
| SQL/rollbacks HU30 sobre PostgreSQL desechable | 12 etapas PASS, incluida concurrencia y evidencia intacta. Repetido sobre copia temporal del schema productivo exacto del índice (sin cambios locales): mismas 12 PASS. La fixture conserva las adaptaciones de bootstrap documentadas, no certifica replay íntegro de la cadena histórica. |
| Helpers/email/security Edge en harness Node offline | 15 passed, 1 failed previo: managementPublicContext recibe un Date en su segundo parámetro, que representa status; no demuestra un fallo de la llamada productiva de un argumento. No se ajustó el test. |
| Vite build | PASS (7,79 s), advertencias preexistentes de chunks/imports mixtos. |
| Embed PostgREST de main vs FK explícita HU30 | GET local HTTP 300/PGRST201 vs 200; sin cambios de datos. |
| Archivos locales previos | SHA-256 idéntico antes/después para frontend/.env y supabase/schema.sql; no se incorporan sus cambios locales. |
| Higiene del diff | Sin runtime/demo/credenciales determinísticas. git diff --cached --check detectó whitespace heredado en M7 y schema (select con espacio y EOF); no se alteraron migraciones sólo por estilo. |

Logs de esta ejecución sólo locales: /tmp/hu30-integration-{backend,frontend,build,sql,product-sql,edge}.log. Las fallas anteriores no se maquillan ni se interpreta el exit code del tail como éxito de las suites. El commit productivo es `51b14af`.

No se repitió E2E completo ni se cambió data local; su evidencia previa sigue en T9A/T9B. El cambio mixto de Edge sólo elimina captura local de mail: debe homologarse entrega real Resend en staging. Auditoría completa del diff por áreas: backend de tracking/proyecciones, frontend HU30/consumidores/perfil, contratos Edge, siete migraciones/rollbacks/tests, snapshots schema y documentación. Fórmulas financieras y workflow no se modifican.

## Inventario exacto del diff a revisar

Producto y sus pruebas/evidencia: **135 files changed, 10041 insertions(+), 872 deletions(-)** en `51b14af`. Esta auditoría y las notas de advertencia en PLAN/HU30-CIERRE se agregan en un segundo commit sólo documental.

```text
A	backend/app/tracking/bipersonal.py
A	backend/app/tracking/co_debtor.py
A	backend/app/tracking/co_debtor_access.py
A	backend/app/tracking/co_debtor_projection.py
A	backend/app/tracking/owner_reads.py
M	backend/app/tracking/repository.py
M	backend/app/tracking/routes.py
M	backend/app/tracking/service.py
M	backend/app/tracking/staff.py
M	backend/tests/test_co_debtor_scoring_inputs.py
M	backend/tests/test_evaluations_grants.py
M	backend/tests/test_hu18_edge_function_security.py
A	backend/tests/tracking/test_bipersonal_evaluation.py
A	backend/tests/tracking/test_hu30_owner_api.py
A	backend/tests/tracking/test_hu30_persistence_contract.py
A	backend/tests/tracking/test_hu30_projection_api.py
A	backend/tests/tracking/test_hu30_safe_projections.py
M	backend/tests/tracking/test_staff_co_debtor_api.py
M	backend/tests/tracking/test_staff_co_debtor_projection.py
A	docs/stories/HU30-capacidad-bipersonal/HU30-CIERRE.md
A	docs/stories/HU30-capacidad-bipersonal/PLAN.md
A	docs/stories/HU30-capacidad-bipersonal/T3-PERSISTENCIA.md
A	docs/stories/HU30-capacidad-bipersonal/T4A-ACCESO.md
A	docs/stories/HU30-capacidad-bipersonal/T4B-CONFIRMACION.md
A	docs/stories/HU30-capacidad-bipersonal/T5-EVALUACION.md
A	docs/stories/HU30-capacidad-bipersonal/T6-PROYECCIONES.md
A	docs/stories/HU30-capacidad-bipersonal/T7-TITULAR.md
A	docs/stories/HU30-capacidad-bipersonal/T8-STAFF.md
A	docs/stories/HU30-capacidad-bipersonal/T9A-REGRESION.md
A	docs/stories/HU30-capacidad-bipersonal/T9B-HARDENING.md
M	frontend/index.html
M	frontend/src/App.jsx
A	frontend/src/components/AuthPanel.invitation.test.jsx
M	frontend/src/components/AuthPanel.jsx
A	frontend/src/components/AuthenticatedCoDebtorInvitationPage.jsx
A	frontend/src/components/AuthenticatedCoDebtorInvitationPage.test.jsx
A	frontend/src/components/BipersonalCapacityCard.jsx
A	frontend/src/components/BipersonalCapacityCard.test.jsx
A	frontend/src/components/CoDebtorPageShell.jsx
A	frontend/src/components/CoDebtorParticipationReview.jsx
A	frontend/src/components/CoDebtorParticipationReview.test.jsx
M	frontend/src/components/CoDebtorSection.jsx
M	frontend/src/components/DashboardLeads.jsx
A	frontend/src/components/DashboardLeads.test.jsx
M	frontend/src/components/ExecutiveCoDebtorSection.jsx
M	frontend/src/components/ExecutiveCoDebtorSection.test.jsx
A	frontend/src/components/FormattedAmountInput.jsx
A	frontend/src/components/FormattedAmountInput.test.jsx
M	frontend/src/components/LeadDetailModal.jsx
A	frontend/src/components/LeadDetailModal.test.jsx
M	frontend/src/components/NotificationToast.jsx
M	frontend/src/components/NotificationToast.test.jsx
M	frontend/src/components/PublicCoDebtorPages.jsx
M	frontend/src/components/PublicCoDebtorPages.test.jsx
M	frontend/src/components/Recommendations.jsx
M	frontend/src/components/Recommendations.test.jsx
A	frontend/src/components/ScoreChangeNotice.jsx
A	frontend/src/components/ScoreChangeNotice.test.jsx
M	frontend/src/components/ScoreForm.jsx
A	frontend/src/components/StaffParticipationBadge.jsx
A	frontend/src/components/StaffParticipationBadge.test.jsx
M	frontend/src/components/financing/FinancingOverview.jsx
A	frontend/src/constants/bipersonal.js
M	frontend/src/hooks/useLeads.js
A	frontend/src/hooks/useOwnerResult.js
A	frontend/src/hooks/useOwnerResult.test.js
A	frontend/src/hooks/useStaffProjectionRead.js
A	frontend/src/hooks/useStaffProjectionRead.test.js
A	frontend/src/lib/commercial/bipersonalProjection.js
M	frontend/src/lib/tracking/currentEvaluation.js
A	frontend/src/services/__tests__/coDebtorAuthContext.test.js
A	frontend/src/services/__tests__/coDebtorAuthenticatedAccess.test.js
A	frontend/src/services/__tests__/coDebtorEdgeAccess.test.js
A	frontend/src/services/__tests__/coDebtorFinancialReview.test.js
A	frontend/src/services/__tests__/coDebtorParticipantEdge.test.js
M	frontend/src/services/__tests__/coDebtorService.test.js
M	frontend/src/services/__tests__/evaluationPlanAcceptance.test.js
A	frontend/src/services/__tests__/hu30PersistenceAccess.test.js
A	frontend/src/services/__tests__/invitationAuthSession.test.js
A	frontend/src/services/__tests__/ownerResultSession.test.js
A	frontend/src/services/__tests__/ownerResultTransport.test.js
A	frontend/src/services/__tests__/profilePersistence.test.js
A	frontend/src/services/__tests__/staffEvaluationIsolation.test.js
M	frontend/src/services/__tests__/trackingServiceRevokedSession.test.js
M	frontend/src/services/auth.js
A	frontend/src/services/coDebtorAccess.js
A	frontend/src/services/coDebtorAuthContext.js
A	frontend/src/services/coDebtorReview.js
M	frontend/src/services/coDebtorService.js
M	frontend/src/services/evaluationService.js
M	frontend/src/services/getScoringHistory.js
M	frontend/src/services/goalsService.js
M	frontend/src/services/mortgageScenarioService.js
A	frontend/src/services/ownerResultSession.js
M	frontend/src/services/profileService.js
M	frontend/src/services/trackingService.js
M	frontend/src/styles.css
A	scripts/hu30-e2e/backend.py
A	scripts/hu30-e2e/browser.mjs
A	scripts/hu30-e2e/edge-native.mjs
A	scripts/hu30-e2e/edge-transport.mjs
A	scripts/test-hu18-helpers.mjs
A	scripts/test-hu30-e2e.py
A	scripts/test-hu30-persistence.py
M	supabase/functions/.env.example
A	supabase/functions/co-debtor-consent/access.ts
M	supabase/functions/co-debtor-consent/email.ts
M	supabase/functions/co-debtor-consent/helpers.test.ts
M	supabase/functions/co-debtor-consent/helpers.ts
M	supabase/functions/co-debtor-consent/index.ts
A	supabase/functions/co-debtor-consent/participation.ts
A	supabase/functions/co-debtor-consent/security.test.ts
A	supabase/functions/co-debtor-consent/security.ts
A	supabase/migrations/20261021120000_hu30_confirmation_revisions.sql
A	supabase/migrations/20261021121000_hu30_participation_closure.sql
A	supabase/migrations/20261021122000_hu30_secure_snapshot_access.sql
A	supabase/migrations/20261021130000_hu30_authenticated_access.sql
A	supabase/migrations/20261021140000_hu30_authenticated_confirmation.sql
A	supabase/migrations/20261022090000_hu30_legacy_snapshot_guard.sql
A	supabase/migrations/20261023090000_hu30_staff_contact_isolation.sql
A	supabase/rollback/20261021120000_hu30_confirmation_revisions_rollback.sql
A	supabase/rollback/20261021121000_hu30_participation_closure_rollback.sql
A	supabase/rollback/20261021122000_hu30_secure_snapshot_access_rollback.sql
A	supabase/rollback/20261021130000_hu30_authenticated_access_rollback.sql
A	supabase/rollback/20261021140000_hu30_authenticated_confirmation_rollback.sql
A	supabase/rollback/20261022090000_hu30_legacy_snapshot_guard_rollback.sql
A	supabase/rollback/20261023090000_hu30_staff_contact_isolation_rollback.sql
M	supabase/schema.sql
A	supabase/tests/hu30_authenticated_access.sql
A	supabase/tests/hu30_authenticated_confirmation.sql
A	supabase/tests/hu30_legacy_seed.sql
A	supabase/tests/hu30_persistence.sql
A	supabase/tests/hu30_safe_projections.sql
A	supabase/tests/hu30_staff_contact_isolation.sql
A	supabase/tests/hu30_staff_contact_preflight.sql
```

Los commits a subir serán únicamente `51b14af` y el commit documental de esta auditoría. No subir la rama backup ni usar push --all/--mirror. No se hizo push, PR, merge, migración remota, deploy ni cambio de secrets.
