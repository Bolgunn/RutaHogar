# HU30 — cierre técnico y preparación para revisión

> **Auditoría de integración 2026-10-25:** el diff productivo fue separado del tooling local. El despliegue de BD/Edge HU30 manteniendo el frontend/backend antiguo de `main` es **incompatible y está bloqueado**; el workflow existente también despliega Edge al integrar en `develop`. Ver [AUDITORIA-INTEGRACION.md](AUDITORIA-INTEGRACION.md) antes de merge o despliegue. El cierre local no certifica esa transición.

Fecha: 2026-10-23. Branch: `feat/hu30-capacidad-bipersonal`. Base de develop: `14738e185c4d77794d4fa2c9e57dcbeffc47dcca`. Implementación revisada hasta `9d98b12` (cierre T9B).

**Estado final: implementación, validación integrada local y cierre documental completos; lista para PR/revisión.** La revisión de otra persona, homologación hospedada y aplicación coordinada de migraciones siguen pendientes. Esta entrega no declara producción certificada ni autorización de despliegue. Sólo modifica documentación; no aplica SQL remoto, hace push, abre PR, merge ni avanza a HU23.

## Lectura y consistencia

Contrato: [PLAN](PLAN.md). Evidencia por etapa: [T3](T3-PERSISTENCIA.md), [T4A](T4A-ACCESO.md), [T4B](T4B-CONFIRMACION.md), [T5](T5-EVALUACION.md), [T6](T6-PROYECCIONES.md), [T7](T7-TITULAR.md), [T8](T8-STAFF.md), [T9A](T9A-REGRESION.md) y [T9B](T9B-HARDENING.md).

Los informes conservan resultados y pendientes **al cierre de su etapa**. Para el estado actual prevalece esta consolidación: T9A resolvió el contexto de invitación entre pestañas y restauró los metadatos comerciales; T9B cerró el bypass de contactos/historial/reportes, redujo la deriva de ocho a seis diferencias y probó Deno nativo local. No se reinterpretan esas pruebas como validación del despliegue hospedado. Las restricciones de cada etapa en el PLAN son antecedentes de autorización, no pendientes actuales de implementación.

## Resumen funcional y arquitectura final

Se reutilizan HU18 y sus tres tablas. `co_debtor_invitations.id` identifica invitación/participación; `participant_user_id` la vincula a una cuenta sin reasignación. `co_debtor_confirmations` conserva UUID por revisión, cinco antecedentes, consentimiento y versión secuencial única por participación. El log `co_debtor_consent_events` conserva actor, confirmación y declaraciones/cambios de relación. No hay cuarta tabla, `is_current` ni timestamp de revocación duplicado.

La revisión documental vigente es el mayor `revision_number` inequívoco de la participación seleccionada. Para uso nuevo se exige participación confirmada, vínculo de cuenta, aceptación inicial y ausencia de cierre; no se vuelve a otra confirmación antigua si la participación seleccionada no es utilizable. Las revisiones son inmutables, incluidas escrituras accidentales de servicio. Locks, revisión esperada y `request_id` protegen concurrencia y retries.

Cada evaluación nueva que usa confirmación conserva `financial_data.provenance.co_debtor_confirmation_id`, ordinal y evento de relación en `provenance.co_debtor_consent`, y su input efectivo. La validación transaccional vuelve a comprobar titular, revisión, relación y cierre. Una nueva revisión nunca sustituye la referencia histórica.

T5 calcula el aporte con dos escenarios puros del motor existente: mismas condiciones, UF y overrides; sólo elimina ingreso/deuda complementarios del contrafactual. No crea otra evaluación, IA, correo o consulta de mercado. Guarda `financial_data.result.bipersonal_summary` (`hu30-bipersonal-v1`), capacidades sin complemento y deltas efectivos/por renta UF y CLP; indicadores y UF permanecen en su snapshot existente. Se conservan aportes positivos, cero y negativos, sin fórmulas nuevas ni redondeo prematuro.

T6 produce `co_debtor.version=hu30-projection-v1`: clasificación, estado, revisión usada, relación, antecedentes considerados, capacidades/aporte, riesgos permitidos y visibilidad. Frontend presenta la proyección; no determina procedencia, permisos, cutoff o matemáticas financieras.

| Actor | Flujo implementado |
| --- | --- |
| Titular | Invita con correo/RUT/relación → ve confirmación pendiente sólo si cambiaron antecedentes → incorpora expresamente → nueva evaluación → Capacidad Bipersonal en Recommendations. La anterior permanece intacta. |
| Co-deudor | Enlace → contexto por nonce → login/registro/verificación de correo → autorización de cuenta → revisión/prefill propio acotado → cinco campos → aceptación inicial de relación y consentimiento separados → revisión inmutable. Revisiones posteriores usan cuenta/participación, sin reutilizar el token consumido. |
| Staff | Bandeja con badge y filtro Todos / Titular individual / Con co-deudor → ficha autorizada con titular/co-deudor, aporte, capacidades y riesgos del servidor. Metadatos de contacto se enriquecen mediante RPC aislada por tenant. |

Una confirmación coincidente posterior se registra y muestra «Antecedentes coincidentes confirmados posteriormente» sin recálculo ni reclasificación histórica. Un cambio puede justificar nueva evaluación aunque el score quede igual; se informa la incorporación exitosa. No hay actualización automática.

## Seguridad, privacidad y legado

- Auth obtiene cuenta/email verificado; perfil persistido aporta RUT/rol. Se exige rol usuario y coincidencia normalizada de correo y RUT. Cuenta/correo/RUT **no equivalen a verificación externa de identidad**. HU27 completa/Google no son dependencias implementadas ni requisitos nuevos.
- El retorno sólo admite `/co-deudor/invitacion?context=<nonce>` del origen de la SPA. El token original se retira de la URL y se conserva en localStorage por nonce, TTL técnico 24 horas, sin datos financieros; varias pestañas no se sobrescriben. El nonce no autoriza. Un navegador sin contexto debe reabrir el enlace original.
- Edge comprueba sesión y la base revalida identidad, vínculo y estado en cada operación. No hay confirmación financiera anónima. La inspección pública no entrega los cinco antecedentes ni identidad del destinatario. RUT/correo/tokens no se añaden a logs ni errores.
- La primera relación se acepta expresamente; posteriores declaraciones válidas del titular conservan esa aceptación original y su historia. La persistencia/commit soportan cambios; no se agrega una nueva pantalla general de edición de relación.
- Titular sólo accede a lo propio. Ejecutivo/admin inmobiliario y admin con tenant se limitan a su inmobiliaria; sólo admin sin tenant es global. RLS/grants bloquean snapshots sensibles crudos y rutas alternativas; perfiles impiden autoescalamiento de rol/tenant.
- `list_lead_contacts`, historial de estados y reportes administrativos comprueban el **lead sujeto** en servidor. Ajeno/inexistente recibe el mismo resultado vacío para callers autenticados sin acceso. Los derivados crudos de fraude/SHAP del reporte se anulan en evaluaciones con complemento.
- Staff recibe únicamente `has_other_active_participations`, booleano; no cantidades, IDs, proyectos o datos de terceros. Titular no recibe esa señal. No agrega penalización al score.
- Revocar/reemplazar excluye inmediatamente usos futuros. El detalle histórico se permite antes de **primer cierre verificable + 30 períodos de 24 horas**; exactamente al corte se oculta. Otra transición no reinicia el plazo. Una confirmada no expira por el TTL del token inicial; las pendientes sí. Cierre terminal sin fecha verificable se oculta conservadoramente.
- Redacción elimina antecedentes/relación del co-deudor, totales, ratios, capacidades, aportes, riesgos, narrativas y derivados reconstructivos, también en historial, tracking, metas y escenarios afectados. Mantiene score/clasificación histórica y datos propios permitidos. No borra ni reescribe snapshots.
- HTTP privado `no-store` en tracking, handler Edge y RPC afectadas; Edge restringe orígenes exactos. Las vistas refrescan con el cutoff enviado por servidor, invalidan lecturas tardías y limpian contexto al cambiar cuenta/lead. CORS y guards cliente no sustituyen autorización.
- Legado conserva UUID, cifras, fechas y estados; sólo se asigna ordinal estructural 1 a la antigua confirmación única. Identidad, aceptación y procedencia desconocidas quedan null/ausentes. Sin respaldo suficiente: `unverifiable_origin`, sin aporte inventado ni backfill/recomputación.

## Definition of Done: criterios existentes

Se evalúan E1/E2, la ampliación acordada y §13 del PLAN; no se agrega E3 ni otros criterios de aceptación.

| Criterio del PLAN | Estado | Evidencia/límite |
| --- | --- | --- |
| E1: tarjeta, ingresos/deudas separados y consolidados, relación y aporte UF/CLP | Cumplido localmente / pendiente homologación | T7 y recorridos T9A/T9B; clases verificadas, opcionales, aporte positivo/cero/negativo. |
| E2: badge/filtro, ficha titular/co-deudor, contratos, morosidad, aporte y riesgos | Cumplido localmente / pendiente homologación | T8 y T9A/T9B; misma evaluación, scope por tenant y privacidad. |
| Ampliación: cuenta/correo/RUT, retorno y autorización | Cumplido localmente / pendiente homologación | GoTrue real local, correo pendiente/verificación, cuenta errónea y sesión vencida; no identidad externa. |
| Ampliación: relación aceptada/modificada y revisiones inmutables | Cumplido | T3–T5, SQL y carreras; aceptación original preservada. |
| Ampliación: incorporación explícita, coincidencia posterior, sin actualización automática | Cumplido | T4B/T5/T7 y recorrido real; una revisión/evaluación por operación lógica. |
| Ampliación: señal de otras participaciones sin detalles | Cumplido | Proyección/SQL/UI, booleano exclusivo staff. |
| Ampliación: ventana 30 días, exclusión inmediata y no reconstrucción | Cumplido localmente / pendiente homologación | Corte exacto, transición posterior y fingerprint histórico; T6–T9B. |
| §13: cumplir E1/E2 y ampliación sin prometer identidad externa | Cumplido localmente / pendiente homologación | Evidencia anterior y textos orientativos. |
| §13: identificar HU27 pendiente, sin requerir Google | Cumplido | Mínimo Auth reutilizado y delimitado. Implementar Google/HU27 completa: No aplica a HU30. |
| §13: no alterar pesos, umbrales o contratos financieros | Cumplido | Comparación pura; falla previa financiera conservada. |
| §13: no recalcular históricos, borrar snapshots o exponer fuera de plazo | Cumplido localmente / pendiente homologación | SQL, redacción de respuestas, cutoff y UI. |
| §13: resolver/verificar RLS y caminos alternativos en API/base | Cumplido localmente / pendiente homologación | T3/T6/T9B, lecturas directas y cross-tenant reales locales. |
| §13: registrar pruebas, límites y resolución del fallo previo | Cumplido en registro; Pendiente externo en corrección del fallo previo | Diagnóstico 2200 vs 2737.185 documentado, sin cambiar contrato para forzar verde. Las suites globales no están verdes. |
| §13: documentar y aplicar migraciones mediante proceso del equipo | Cumplido en documentación; Pendiente externo en aplicación | Siete migraciones y rollbacks locales probados; ninguna aplicada remotamente. |
| §13: actualizar documentación y mantener disclaimers | Cumplido | PLAN, cierres por etapa y este inventario; resultado orientativo, sin aprobación crediticia. |
| §13: obtener revisión de otra persona | Pendiente externo | Checklist siguiente; este cierre no la sustituye. |

T1, T2, T3, T4A, T4B, T5, T6, T7, T8, T9A y T9B están cerrados en su alcance local. El cierre técnico/documental queda completo; la DoD de entrega hospedada y revisión no se marca íntegramente cumplida mientras persistan esos pendientes externos.

## Inventario exacto de migraciones y rollback

Aplicar sobre la base histórica conocida, en este orden. Directorios: `supabase/migrations/` y `supabase/rollback/`. Cada nombre de rollback se lista completo; ninguno elimina evidencia para volver a HU18.

| Orden | Migración | Rollback | Alcance |
| --- | --- | --- | --- |
| 1 | `20261021120000_hu30_confirmation_revisions.sql` | `20261021120000_hu30_confirmation_revisions_rollback.sql` | Cuenta nullable, revisiones/relaciones, constraints/índices, inmutabilidad y guard del INSERT de evaluación. |
| 2 | `20261021121000_hu30_participation_closure.sql` | `20261021121000_hu30_participation_closure_rollback.sql` | Sustitución inmediata/cierre, estados, revocación y cierre de firma anónima. |
| 3 | `20261021122000_hu30_secure_snapshot_access.sql` | `20261021122000_hu30_secure_snapshot_access_rollback.sql` | RLS/grants, protección de perfil, lecturas propias seguras de metas/escenarios. |
| 4 | `20261021130000_hu30_authenticated_access.sql` | `20261021130000_hu30_authenticated_access_rollback.sql` | Autorización y vínculo autenticados sin confirmación financiera. |
| 5 | `20261021140000_hu30_authenticated_confirmation.sql` | `20261021140000_hu30_authenticated_confirmation_rollback.sql` | Revisión/confirmación/decisión/listado y creación con relación explícita. |
| 6 | `20261022090000_hu30_legacy_snapshot_guard.sql` | `20261022090000_hu30_legacy_snapshot_guard_rollback.sql` | Detector de aliases/JSONB parcial; cierra lecturas crudas legacy. |
| 7 | `20261023090000_hu30_staff_contact_isolation.sql` | `20261023090000_hu30_staff_contact_isolation_rollback.sql` | Contactos, historial/reportes por sujeto, derivados redactados y cabeceras RPC. |

Prerrequisitos: esquema histórico HU13/HU18 existente y migraciones previas de perfiles/contactos, incluida `20260922000000_add_name_fields_to_profiles.sql`. No ejecutar otra vez `20261008150000_lead_contacts_email.sql` después de la corrección 7. `supabase/schema.sql` representa los objetos HU30 finales; **no sustituye esta secuencia sobre una base existente** ni acredita bootstrap global sin deriva.

**Dependencia de entrega obligatoria T3:** no aplicar 1–3 aisladamente sobre una aplicación activa antigua. Deshabilitan confirmación anónima y lecturas crudas; requieren adaptadores autenticados T4A/T4B y consumidores seguros de backend/frontend en la misma entrega coordinada. Preparar artefactos/configuración primero; usar una ventana controlada sin tráfico incompatible si no se puede activar el conjunto atómicamente. No volver a abrir políticas para mantener un cliente viejo.

Rollback: seleccionar el conjunto afectado y ejecutar sus archivos en orden inverso de aplicación, con tráfico de escritura detenido y clientes compatibles. El rollback 7 deshabilita las tres RPC cliente y la política de historial; el 6 revoca SELECT crudo; el 3 retiene RLS/guard de rol; 5/4/2/1 cierran comandos nuevos y conservan evidencia. No recuperan automáticamente una aplicación HU18 antigua ni aseguran disponibilidad de todas las pantallas. No eliminar v2, columnas, vínculos o eventos para reinstalar UNIQUE(invitation_id). Recuperación mediante corrección hacia adelante/reaplicación autorizada, con verificación de permisos y huellas históricas. La suite comprueba ese rollback conservador, no un downgrade destructivo.

## Inventario de contratos y artefactos afectados

### Backend HTTP

Prefijo `/tracking`; Auth y alcance se resuelven en servidor. Estas rutas existentes reciben proyección/redacción o sus cabeceras/contratos relacionados:

| Método | Rutas |
| --- | --- |
| GET | `/tracking`, `/tracking/history`, `/tracking/projection` |
| GET | `/tracking/owner/evaluations`, `/tracking/owner/scoring-history`, `/tracking/owner/co-debtor` |
| GET | `/tracking/evaluations/{evaluation_id}/history`, `/tracking/staff/evaluations`, `/tracking/staff/leads/{lead_id}` |
| POST | `/tracking/events`, `/tracking/events/{target_event_id}/corrections`, `/tracking/goals/{goal_id}/confirmations` |
| POST | `/tracking/evaluations/co-debtor-confirmation`, `/tracking/evaluations/{evaluation_id}/events` |

Se conserva `POST /score`; no se cambia su fórmula ni se añade endpoint de evaluación contrafactual. Implementación principal: `backend/app/tracking/{repository,service,routes,staff,owner_reads,co_debtor,co_debtor_access,co_debtor_projection,bipersonal}.py`.

### Edge

Única función modificada: `co-debtor-consent` (`/functions/v1/co-debtor-consent`, POST/OPTIONS). Módulos: `index.ts`, `access.ts`, `participation.ts`, `helpers.ts`, `email.ts`, `security.ts`. `supabase/config.toml` conserva `verify_jwt=false` para las acciones públicas limitadas/cron; las financieras verifican Auth dentro del handler/RPC, no quedan anónimas por esa configuración.

Acciones: `create_invitation`, `inspect_invitation`, `authorize_invitation`, `review_participation`, `confirm_participation`, `decline_participation`, `revoke_participation`, `list_participations`, `decline_invitation`, `inspect_management`, `revoke_management`, `process_expirations`. `submit_confirmation` anterior permanece explícitamente bloqueada (409), sin fallback. Mantener cron existente de expiración con `HU18_CRON_SECRET`; no hay cron nuevo de privacidad.

### RPC y funciones SQL

Inventario de funciones creadas/redefinidas por las siete migraciones; los helpers/guards no son endpoints financieros públicos:

| Grupo | Funciones |
| --- | --- |
| Persistencia interna T3 | `hu30_normalize_rut`, `hu30_lock_participation`, `hu30_guard_participation`, `hu30_guard_confirmation`, `hu30_guard_event`, `hu30_declare_relation`, `hu30_append_confirmation`, `hu30_closure_at`, `hu30_guard_evaluation` |
| Estados HU18 redefinidos | `hu18_create_invitation`, `hu18_revert_invitation_after_delivery_failure`, `hu18_revoke_consent`, `hu18_expire_invitation`, `hu18_expire_invitations`, `hu18_decline_invitation`, `hu18_confirm_invitation` (firma anónima bloqueada) |
| Lecturas/privilegios | `hu30_has_complement` (reforzada en 6), `hu30_owner_can_view_evaluation`, `hu30_owner_has_evaluation_consent`, `hu30_list_mortgage_scenarios`, `hu30_list_owner_goals`, `hu30_guard_profile_privileges` |
| Acceso T4A | `hu30_authorize_invitation` |
| T4B | `hu30_financial_values`, `hu30_safe_amount`, `hu30_valid_financial_values`, `hu30_participant_access`, `hu30_matches_evaluated`, `hu30_review_participation`, `hu30_confirm_participation`, `hu30_participant_decision`, `hu30_list_participations`, `hu30_create_invitation` |
| Aislamiento T9B | `hu30_staff_can_read_lead`, `list_lead_contacts`, `get_reported_leads_for_admin`, `get_lead_status_history_for_admin` |

`hu13_commit` existente se reutiliza para la evaluación y sus eventos/snapshots; el guard HU30 valida la referencia JSONB y sus carreras. Los grants de operaciones que aceptan actor se limitan al servidor; el cliente nunca decide el actor. Metas/escenarios propios y RPC comerciales conservan sus controles de `auth.uid()`/rol/tenant.

### Frontend

Rutas: `/co-deudor/invitacion` (token/contexto, participación vinculada o listado propio), `/co-deudor/gestion`, `/co-deudor/consentimiento`; acceso reutilizado `/login` y `/registro`; resultado activo `/recomendaciones` y dashboard `/dashboard` (aliases existentes `/ejecutivo/leads` y `/admin` según rol).

Componentes modificados/nuevos: `frontend/src/App.jsx`; `frontend/src/components/AuthPanel.jsx`, `PublicCoDebtorPages.jsx`, `AuthenticatedCoDebtorInvitationPage.jsx`, `CoDebtorParticipationReview.jsx`, `CoDebtorSection.jsx`, `Recommendations.jsx`, `BipersonalCapacityCard.jsx`, `DashboardLeads.jsx`, `LeadDetailModal.jsx`, `ExecutiveCoDebtorSection.jsx`, `StaffParticipationBadge.jsx`; `frontend/src/styles.css`. No se añade otro resultado sobre Result.

Soporte afectado: hooks `useLeads.js`, `useOwnerResult.js`, `useStaffProjectionRead.js`; servicios `auth.js`, `profileService.js`, `coDebtorService.js`, `coDebtorAccess.js`, `coDebtorAuthContext.js`, `coDebtorReview.js`, `evaluationService.js`, `trackingService.js`, `getScoringHistory.js`, `goalsService.js`, `mortgageScenarioService.js`, `ownerResultSession.js`; `constants/bipersonal.js`, `lib/tracking/currentEvaluation.js`, `lib/commercial/bipersonalProjection.js`; `frontend/index.html` (privacidad de ruta). Revisión de contratos necesaria también para consumidores de datos aunque no tengan nueva UI.

## Configuración y dependencias de despliegue

| Componente | Variables/configuración necesarias | Verificación pendiente |
| --- | --- | --- |
| Frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` (fallback existente `VITE_BACKEND_URL`); Node 22.23.2 de `.nvmrc` | URL real de API/Auth, rewrites SPA/API/HTTPS y build del mismo commit. Nunca publicar clave privada. El modo offline no sustituye autorización HU30. |
| Backend | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`; `RUTAHOGAR_ALLOWED_ORIGINS` con frontend real | Clave sólo de servidor, conectividad Auth/PostgREST y versión compatible. CORS existente también tiene regex Vercel; T9B no lo convierte en una auditoría global de CORS. |
| Edge | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` del runtime; `APP_PUBLIC_URL`; `RESEND_API_KEY`; `CO_DEBTOR_FROM_EMAIL`; `CO_DEBTOR_INVITATION_TTL_DAYS=7`; `HU18_CRON_SECRET` | Secretos del proyecto, remitente/dominio válidos, URL pública HTTPS y TTL alineado con backend. |
| Edge opcional | `CO_DEBTOR_ALLOWED_ORIGINS` | Lista de orígenes exactos adicionales, separados por comas, sin paths/wildcards/credenciales; configurar explícitamente si se usa. APP_PUBLIC_URL ya aporta su origen. |
| Auth | Confirmación de correo habilitada, Site URL y Redirect URLs que admitan ruta fija de invitación con su contexto; plantilla y SMTP | Callback con nonce en navegador real del ambiente, registro sin sesión antes de verificar, login y cambio de cuenta. No copiar una allowlist arbitraria/global. |
| Runtime | Import std 0.168.0 y SDK remoto fijado a supabase-js 2.106.2; Edge del destino | Resolver grafo remoto y probar handler desplegado. Validación nativa offline no demuestra resolución CDN. |
| Correo/cron | SMTP Auth y Resend para invitación/gestión/notificaciones; scheduler existente autenticado | Entregabilidad real, enlaces públicos correctos y ejecución de expiraciones. No se exige outbox nuevo. |
| Entrega | Identificar proyecto/ambiente y commit; acceso del responsable autorizado | CLI/CI requiere `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`. No son variables del navegador ni nuevos secretos financieros. |

El workflow existente `.github/workflows/deploy-supabase-functions.yml` despliega también co-debtor-consent y submit-feedback en ramas configuradas, incluida develop; no aplica automáticamente estas siete migraciones ni coordina backend/frontend. Valida además los secrets compartidos de feedback. La variable opcional de orígenes adicionales no se propaga por ese workflow y requiere configuración explícita si se necesita. Revisar el disparador antes de integrar para evitar activar Edge contra una base aún antigua. No modificar/desplegar otras funciones como parte de este cierre.

Orden de entrega autorizado futuro: preparar y revisar artefactos/configuración → comprobar ledger/esquema y respaldo → bloquear tráfico incompatible durante activación → aplicar 1–7 en orden → desplegar backend y Edge autenticados compatibles → publicar frontend compatible → ejecutar smoke/cross-tenant/Auth/correo con ese conjunto → habilitar tráfico y registrar evidencia. Backend/Edge pueden prepararse previamente sin recibir tráfico; no existe garantía de compatibilidad de un estado intermedio activo. Si falla una etapa, mantener acceso restringido y usar el rollback conservador/corrección hacia adelante.

## Pruebas y cifras finales

**Última ejecución funcional: T9B, 2026-10-23, hasta 9d98b12.** No se suman resultados de etapas distintas como si fueran casos nuevos ni se repite la batería en este cierre documental.

| Suite | Resultado final registrado |
| --- | --- |
| Backend relacionado HU18/tracking/T3–T6/scoring/permisos | 261 aprobadas, 1 falla previa, 0 omitidas. No es todo el backend del repositorio. |
| Backend enfocado de seguridad/proyección HTTP | 9 aprobadas; subconjunto, no sumar a las 261. |
| Frontend completo, 88 archivos | 945 aprobadas, 2 fallas previas, 0 omitidas; 947 casos. |
| PostgreSQL HU30, concurrencia y rollback | 12 etapas PASS, incluye reproducción/cierre de bypass y huellas de evidencia idénticas. |
| Seguridad HTTP Edge nueva | 4 aprobadas, incluidas en el conjunto de helpers siguiente. |
| Helpers Edge combinados bajo Node | 15 aprobadas, 1 falla previa legacy. |
| E2E Chromium, adaptador Node | 15 etapas PASS con aislamiento de contactos obligatorio. |
| E2E Chromium, Supabase Edge Runtime nativo | 15 etapas PASS; runtime v1.77.4 / Deno 2.1.4, SDK offline 2.106.2. |
| Build Vite | Aprobado; advertencias previas de bundle/importación de favoritesService. |
| Schema drift | 6 diferencias externas (2 ausentes, 4 divergentes); salida no cero y 20 advertencias históricas de rollback. Gate global sin aprobar. |

Auth real **local**: GoTrue v2.177.0, registro sin sesión hasta confirmar, correo SMTP al buzón aislado, callback en otra pestaña, login/cambio de cuenta, logout y token vencido rechazado. PostgreSQL 16, PostgREST v12.2.12 y servicios FastAPI/motor reales locales. Chromium 1280×960 y 390×844: invitación, titular, staff, filtros/modal, corte, respuestas tardías y una sola incorporación. Se prueban revisiones/confirmaciones concurrentes, respuesta perdida tras commit/retry y revisión/relación/cierre que cambian antes del commit. Sin pageerrors ni warnings React; los 403 y el fallo de red provocados son esperados.

Límites: usuarios/tenants/datos sintéticos; mercado fijo y reloj de proyección controlable, sin BCCh/IA adicionales. SMTP entrega a captura local; Resend se captura. Deno ejecuta el handler real con std serve adaptado a Deno.serve y SDK instalado empaquetado offline: no se certifica el grafo CDN. Bootstrap de prueba omite RAG/pgvector y adapta housing_plan/orden histórico; no ejecuta íntegramente toda la cadena histórica desde cero. No se afirma producción validada ni base global limpia.

Para reproducir, usar comandos/requisitos completos en T9A/T9B: `scripts/test-hu30-persistence.py`, `scripts/test-hu30-e2e.py`, `scripts/test-hu18-helpers.mjs`, suites pytest/Vitest y build. Runtime nativo opcional mediante `HU30_EDGE_RUNTIME` apuntando al binario oficial local; no está versionado. Node de `.nvmrc`, venv backend/dependencias/Chromium e imágenes Docker documentadas deben estar disponibles. Las pruebas no requieren ni deben apuntar a credenciales hospedadas.

Validación de este cierre: contraste documental con contratos/rutas/funciones y archivos reales; comprobación aprobada de los siete pares migración/rollback, 37 funciones SQL inventariadas, 24 enlaces locales válidos, cuatro archivos exclusivamente documentales, branch correcta y `git diff --check` limpio. Sin cambios de código no se repiten build ni E2E. El commit documental y árbol limpio son la evidencia de entrega local.

## Deudas externas y efecto sobre release

| Deuda | ¿Bloquea cierre técnico/revisión HU30? | Efecto sobre producción global |
| --- | --- | --- |
| Test financiero 2200 UF esperadas vs 2737.185… | No; motor/test intactos, aporte HU30 verificado sin depender de esa expectativa | Suite no verde; responsable debe resolver contrato/fixture o registrar tratamiento explícito antes de aprobar un gate global. No asumir bug corregido. |
| Fecha fija de invitación vencida, fixture RUT inválida esperado válido | No; flujo real usa fechas/RUT válidos | Dos fallas frontend previas; mismo tratamiento explícito del gate, no maquillar. |
| Helper legacy HU18 managementPublicContext, contrato Date/estado y dependencia de fecha | No para camino HU30 autenticado probado | No certifica todos los enlaces antiguos de gestión; revisar ese camino si forma parte de la liberación y registrar deuda/decisión. |
| Proyectos select tenant; Proyecto ejecutivos select tenant | No sobre base migrada local conocida | Diferencia admin/admin_inmobiliario entre schema y migración antigua; requiere revisión de catálogo/roles antes de un bootstrap/liberación global. |
| can_admin_inmobiliaria; assign_admin | No son el gate de autorización HU30 | Semántica sensible de administración, especialmente admin scoped vs admin_inmobiliario. Bloquea declarar reconciliado el esquema/roles global sin revisión responsable. |
| proyecto_favoritos_validar_proyecto; proyecto_favoritos_borrar_huerfanos | No; ausentes en schema, anteriores HU19 | Integridad/limpieza de favoritos catálogo/RAG en una base nueva. Bloquea afirmar equivalencia del bootstrap global; no añadir HU19 a HU30. |
| 20 migraciones históricas sin rollback; orden/bootstrap/pgvector/housing_plan | No; las siete HU30 tienen rollback probado | No hay recuperación/bootstrap global acreditados. Evaluar ledger real, estrategia y respaldo antes de intervención global; no sincronizar schema completo a ciegas. |
| Lecturas redundantes App/useLeads, overlay de notificaciones móvil, warnings de build/OpenAPI | No; no duplican revisiones/evaluaciones ni se presentaron como corregidas | Deuda de rendimiento/UX/mantenimiento; no hay bloqueo funcional HU30 demostrado. |
| HU27/Google pendiente; HU23 documental | No; HU30 usa mínimo Auth existente y no acredita identidad externa/documentos | No declarar esas HUs entregadas ni hacerlas prerequisitos nuevos de HU30. |

Las seis diferencias residuales son exactamente los seis objetos listados en las tres filas de esquema anteriores; ninguna nueva definición HU30 divergente. T9B corrigió las otras dos iniciales (contactos e historial), que ya no son deuda abierta. La deriva externa impide un gate global verde; su efecto en el proyecto hospedado concreto debe determinarse mediante ledger/definiciones reales, no por inferencia de la fixture.

**Bloqueadores de despliegue actuales:** falta revisión de otra persona; no están homologados configuración/redirects/orígenes, imports/runtime desplegados, correo real ni migraciones del destino. Además, integración debe decidir/resolver con responsables el gate de pruebas previas y los riesgos externos de esquema aplicables. No se ha demostrado un bug HU30 abierto que impida su revisión; estos pendientes sí impiden autorizar producción desde esta evidencia local.

## Checklist de revisión por otra persona

- [ ] Revisar diff desde la base develop indicada, PLAN y decisiones de ampliación, sin convertir E1/E2 en criterios nuevos; reconocer límites de identidad y alcance 3 SP ampliado.
- [ ] Verificar siete migraciones/rollback, nulls legacy, ordinal 1, UNIQUE/versionado, append-only y ausencia de migraciones históricas editadas/backfill inventado.
- [ ] Comprobar Auth real, coincidencia server-side, rol, nonce/retorno, aislamiento de pestañas y bloqueo de confirmación anónima; no registrar tokens/secretos.
- [ ] Revisar locks/revisión/relación esperadas, replay de request y revalidación al commit; confirmar que histórico no cambia y sólo hay una evaluación real.
- [ ] Revisar resumen/UF y contrafactual sin ingreso ni deuda complementarios; mismas condiciones y aportes positivo/cero/negativo, sin fórmulas nuevas.
- [ ] Comprobar titular propio, staff mismo/otro tenant, admin scoped/global, RPC contactos/reportes/historial y RLS de snapshots; no confiar en filtros cliente.
- [ ] Comprobar cutoff exacto/primer cierre, cierre desconocido y redacción de derivados/metas/escenarios; UI no reconstruye datos y limpia cambios de cuenta/lead.
- [ ] Recorrer titular y staff desktop/móvil: cuatro clases, pendientes/coincidencias, error/retry, score igual, filtros y señal exclusivamente booleana.
- [ ] Contrastar cifras T9B y fallas previas, reproducir partes pertinentes en entorno aislado y registrar las limitaciones; no exigir modificar requisitos para verde.
- [ ] Firmar revisión/observaciones, asignar pendientes externos de integración y aprobar secuencia coordinada/rollback antes de liberar.

## Checklist de release autorizado posterior

- [ ] Responsable identifica ambiente/proyecto/commit y registra aprobación de revisión; comprobar automatismos CI antes de integrar.
- [ ] Revisar ledger y definiciones reales del destino; resolver o validar con responsables las seis divergencias y el gate externo que aplique. No reemplazar toda la base con schema.sql.
- [ ] Preparar respaldo/recuperación, ventana controlada y los siete rollbacks; documentar qué lecturas/escrituras se deshabilitarían y recuperación hacia adelante.
- [ ] Configurar frontend/backend/Edge/Auth/SMTP/Resend/orígenes y secretos sin exposición; verificar TTL y cron existente.
- [ ] Aplicar siete migraciones en orden, registrar resultados; desplegar backend, Edge y frontend compatibles en el mismo corte, evitando clientes HU18 antiguos activos.
- [ ] Homologar imports/runtime hospedados, HTTPS y redirects con contexto, registro/verificación/login/cambio de cuenta; probar entrega real a destinatario autorizado.
- [ ] Smoke de confirmación e incorporación explícita, titular y staff; caso cross-tenant/contactos, corte histórico, errores privados y retry sin duplicados; comprobar evidencia anterior intacta.
- [ ] Registrar versiones, resultados, responsables y decisión de habilitación/rollback; vigilar fallos sin logs sensibles.

Hasta completar estas acciones, HU30 puede pasar a revisión/PR y conserva cierre técnico local; no se declara desplegada ni certificada para producción.
