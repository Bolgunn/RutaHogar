# HU30 — T3: persistencia y autorización

Fecha: 2026-10-21. Base revalidada: `origin/develop` y HEAD inicial en `14738e185c4d77794d4fa2c9e57dcbeffc47dcca`; branch `feat/hu30-capacidad-bipersonal`. El único archivo previo era el PLAN aprobado, todavía sin seguimiento en Git. No se cambió la base ni se trabajó desde `main`.

## Alcance realizado

T3 implementa el contrato de T2. No se implementan login/registro, callbacks, UI, tarjeta, badge/filtro, comparación financiera, otras participaciones ni nuevo criterio del botón de recálculo. No se modifican archivos de `scoring_engine`, `scoring.py` ni migraciones históricas. No se ejecutó SQL contra Supabase remoto; solo PostgreSQL desechable local. No hay push ni PR.

Los cambios en servicios/hooks del cliente responden a la excepción de T3 para mantener consumidores al restringir snapshots: únicamente acceso a datos. Ningún componente visual fue modificado.

## Migraciones y esquema

| Migración nueva | Responsabilidad |
| --- | --- |
| `20261021120000_hu30_confirmation_revisions.sql` | Vínculo de cuenta, revisiones, relaciones en eventos, integridad, idempotencia, validación de procedencia al insertar evaluaciones. |
| `20261021121000_hu30_participation_closure.sql` | Reemplazo al crear sustituta, no reactivación de confirmadas, revocación idempotente, orden común de bloqueos y cierre de la firma anónima anterior. |
| `20261021122000_hu30_secure_snapshot_access.sql` | RLS/grants de snapshots, RPC de lectura de escenarios/metas y protección de role/inmobiliaria en perfiles. |

`supabase/schema.sql` contiene las mismas definiciones incrementales finales. No se agregan tablas ni columnas espejo de procedencia en evaluaciones.

### Participación

Se mantiene `co_debtor_invitations.id` como participación y su `lead_id` como titular. Única columna nueva: `participant_user_id uuid NULL`, FK a `profiles` con eliminación restringida. Un índice único auxiliar `(id, participant_user_id)` respalda la FK compuesta de revisiones; otro índice permite consultar cuenta/estado. Después de vincularse no se pueden reasignar cuenta, titular, correo o RUT destinatarios.

Se reutilizan estados, campos declarados, `replaced_at` y `replacement_of_invitation_id`. El reemplazo y la creación de la nueva pendiente ocurren en una misma transacción; el correo se sigue enviando fuera de ella.

### Revisiones

`co_debtor_confirmations` conserva UUID y cinco antecedentes, consentimiento/versiones/fechas. Nuevas columnas:

- `revision_number integer NOT NULL`, positivo.
- `participant_user_id uuid NULL` para legado, obligatorio para nuevas inserciones.
- `accepted_relation_event_id uuid NULL`.
- `request_id uuid NULL` para legado, obligatorio en escrituras nuevas.

Se retira `co_debtor_confirmations_invitation_id_key`; se agregan UNIQUE `(invitation_id, revision_number)`, `(invitation_id, request_id)` y `(id, invitation_id)`, más FK compuesta de cuenta/participación y de relación aceptada/participación. Las revisiones no admiten UPDATE/DELETE, tampoco accidentalmente desde service_role.

`hu30_append_confirmation` es un contrato de persistencia exclusivo del servidor. Exige actor obtenido de sesión por el futuro adaptador T4, correo confirmado de Auth, correo/RUT coincidentes y rol usuario. No demuestra externamente la titularidad del RUT. La primera revisión autenticada acepta la declaración vigente de relación; las posteriores pueden omitir nueva aceptación. Verifica revisión esperada, estado y cierre. Request repetido con mismo contenido devuelve la revisión original; distinto contenido produce conflicto.

### Relación

En `co_debtor_consent_events` se agregan `actor_user_id`, `confirmation_id`, `relation_value`, `relation_revision`, todos nullable para evidencia antigua. UNIQUE por participación/ordinal de relación; FK del evento a confirmación de la misma participación y clave auxiliar `(id, invitation_id)`.

`relation_declared` inicia la serie; `relation_changed` conserva cambios siguientes del titular. `hu30_declare_relation` valida actor, ordinal esperado y valores existentes permitidos. La aceptación inicial permanece referenciada desde la revisión; no se sobreescribe cuando cambia la declaración del titular. No se implementa aún su formulario/flujo.

### Revisión vigente y utilizada

La regla Python reutilizable es `tracking/co_debtor.py::select_confirmation`: UUID explícito para histórico; en otro caso mayor ordinal positivo y único. Un único registro legado sin ordinal sigue siendo legible en adaptadores antiguos; varias filas sin orden inequívoco producen conflicto. No se usa orden implícito ni `confirmations[0]`.

Para nuevo uso se selecciona primero una participación: pendiente prioritaria; si no hay, mayor `(created_at, id)`. No se limita antes a diez filas ni se recupera otra confirmada por descarte. Se exige confirmación elegible, cuenta enlazada, aceptación inicial y ausencia de cierre. El catálogo financiero sigue determinando la admisibilidad de los cinco antecedentes.

La evaluación conserva `financial_data.input` utilizado y la referencia canónica `financial_data.provenance.co_debtor_confirmation_id`; agrega `revision_number` y `relation_declaration_event_id` en `provenance.co_debtor_consent`. Participación/cuenta se resuelven mediante la revisión, sin duplicarlas. HU13 conserva sus copias habituales en historial/eventos. Una lectura nunca reemplaza v1 con v2 ni recalcula históricos.

El trigger de INSERT valida UUID, titular, estado, cuenta, revisión vigente, relación efectiva y cinco valores del snapshot. Fuente confirmada sin referencia, revisión ajena/antigua, campos distintos o participación cerrada se rechazan. Se bloquea primero perfil del titular y después participación, igual que `hu13_commit`; una revisión/revocación/reemplazo concurrente debe serializarse o invalidar el commit. No se mantiene un lock durante el cálculo o el envío de correo.

## Legado, revocación y reemplazo

Único backfill: ordinal 1 de confirmaciones anteriores. UUID, antecedentes, fechas y snapshots se conservan. Cuenta, aceptación, actor y procedencia desconocidos continúan null/ausentes. Una referencia histórica HU18 explícita sigue resolviéndose; sin procedencia suficiente la proyección oculta datos sensibles y no inventa una evaluación bipersonal.

Una confirmación antigua sin cuenta no se reutiliza como confirmación autenticada en un cálculo nuevo. La futura reconfirmación conserva v1 y agrega otra revisión con evidencia real; si la invitación carece de RUT/relación, T4 debe pedir completar/reemplazar según el PLAN.

No se añade `revoked_at` ni un vencimiento materializado. `hu30_closure_at` y su equivalente de lectura usan el primer evento verificable de revocación o reemplazo posterior a una confirmación. La ventana termina exactamente a los 30 días, con reloj servidor. Un reemplazo antiguo de pendiente restaurada por fallo de entrega no se interpreta como cierre posterior de una confirmación que aún no existía.

La nueva invitación excluye inmediatamente a la confirmada anterior, incluso si falla su envío. Se conserva `replaced_at` y vínculo de sustitución. Se permite `replaced → revoked` cuando existía confirmación, sin reiniciar plazo. Un cierre sin fecha verificable no inventa una ventana visible. No hay cron ni borrado de evidencia.

## Autorización y consumidores

Se elimina el bypass comercial directo a `evaluations`, incluyendo el permitido por la política restaurada en octubre. Su SELECT final permite únicamente filas propias sin snapshot complementario; staff usa el backend con alcance de rol/inmobiliaria existente. `scoring_history` sigue el mismo criterio. Se retiran grants de lecturas crudas de tracking, planes, anotaciones y entidades HU18 al navegador. Service_role permanece exclusivamente en servidor.

La detección incluye aliases históricos `input_snapshot`/`result_snapshot` y campos complementarios conservados aunque el flag esté desactivado. Las proyecciones excluyen antecedentes, narrativas e indicadores reconstructivos al vencer el acceso o carecer de procedencia. Conservan identificadores, score y clasificación históricos. La lectura comercial resuelve la revisión usada por la evaluación, no la confirmación actual.

También se cierran copias indirectas: escenarios HU17 y metas generadas leen mediante RPC de alcance propio. Los snapshots de escenarios ocultos se vacían y las metas ocultan narrativa/progreso. El cliente no restaura progreso sensible desde caché después de redacción. El resumen tracking oculta metas derivadas de un baseline cerrado; la proyección temporal devuelve indisponibilidad si dependía de históricos ocultos. Esta proyección es conservadora y no cambia el motor.

| Consumidor | Adaptación en T3 |
| --- | --- |
| `TrackingRepository.load_co_debtor_consent()` | Embeds desambiguados por FK, revisión explícita, relación efectiva, comprobación de evidencia/cierre para uso nuevo. |
| `staff._confirmation_for()` y detalle/listado | Selector compartido y proyección por revisión histórica utilizada, tras autorización comercial. |
| `TrackingService` / HU13 | Registra referencia canónica en cualquier evaluación confirmada y evita usar participaciones excluidas. |
| `routes.py`, `owner_reads.py`, `co_debtor_access.py` | Lecturas propias autenticadas y redacción coherente de snapshots/anotaciones/tracking. |
| `evaluationService.js` | Titular lee `/tracking/owner/evaluations`; conserva procedencia y anotaciones autorizadas. Staff conserva su endpoint seguro. |
| `getScoringHistory.js` | Feed propio seguro; fallback por evaluación verifica titular o staff autorizado en backend. Sin fallback a tabla cruda. |
| `coDebtorService.js` | Recibe singleton proyectado por servidor; rechaza embed ambiguo. |
| `useLeads.js` | Sustituye payloads crudos realtime por recarga de feed seguro cada 30 segundos y al recuperar foco; puede existir esa latencia en nuevos avisos. |
| `mortgageScenarioService.js`, `goalsService.js` | RPC propios para evitar copias financieras fuera de su ventana. |
| Edge Function de consentimiento | No seleccionaba embeds de confirmaciones; no se modifica ni se implementa login. Sus operaciones heredadas de estado siguen usando RPC. La confirmación anónima queda explícitamente bloqueada al activar migración; conexión autenticada pendiente de T4. |

El trigger de `profiles` impide insertar un perfil propio privilegiado y modificar `role` o `inmobiliaria_id` propios sin autorización. Nombre, teléfono, RUT y demás operaciones ordinarias siguen funcionando. Mantiene escrituras privilegiadas del servidor y administración global de otros perfiles. Conserva la asignación de ejecutivos dentro del tenant, y la resolución de asignaciones pendientes ya creadas por administrador sin permitir convertir un lead en ejecutivo ni escoger tenant arbitrario.

## Pruebas y reproducción

Nuevos tests:

- `backend/tests/tracking/test_hu30_persistence_contract.py`: selección, legado, procedencia, referencia usada, exclusión de cuentas desconocidas, ventana exacta, narrativas y proyección comercial.
- `backend/tests/tracking/test_hu30_owner_api.py`: autenticación, ocultación propia y fallback de historial con autorización de ejecutivo/admin inmobiliario/global, denegando ámbito ajeno.
- `frontend/src/services/__tests__/hu30PersistenceAccess.test.js`: caché después de ocultación, escenarios, denegación de fallback y rechazo de revisión ambigua.
- `supabase/tests/hu30_legacy_seed.sql`, `hu30_persistence.sql`: migración sobre fila antigua, v1/v2, identidad, idempotencia, conflictos, inmutabilidad, referencias, estados, RLS y protección del perfil en PostgreSQL real.
- `scripts/test-hu30-persistence.py`: contenedor exclusivo sin puertos publicados, migraciones, assertions, dos transacciones concurrentes y fingerprint de evidencia antes/después del rollback. Elimina exclusivamente su contenedor.

Tests existentes adaptados: dos expectativas de orden/límite en `test_co_debtor_scoring_inputs.py`, expectativas de política final en `test_evaluations_grants.py`, mocks de lecturas autorizadas en `coDebtorService.test.js` y `evaluationPlanAcceptance.test.js`. No se alteraron las fechas problemáticas ni las expectativas financieras previas.

Comandos (desde raíz, salvo frontend):

```bash
backend/.venv/bin/python -m pytest backend/tests/tracking \
  backend/tests/test_co_debtor_scoring_inputs.py backend/tests/test_alg17_cases.py \
  backend/tests/test_evaluations_grants.py backend/tests/test_hu18_decline_migration.py \
  backend/tests/test_hu18_edge_function_security.py backend/tests/test_hu13_deployment_routes.py -q
python3 scripts/test-hu30-persistence.py
node scripts/check-schema-drift.js
# En frontend, Node 22.23.2 (.nvmrc):
npm test
npm run build
```

| Validación final | Resultado |
| --- | --- |
| Backend relacionado con HU18/tracking/evaluaciones/ALG17/permisos/despliegue | 182 aprobados, 1 fallido previo, 0 omitidos, 0 errores de colección/entorno. Incluye 32 casos nuevos T3 aprobados. |
| Frontend completo, Node 22.23.2 | 755 aprobados, 2 fallidos previos, 0 omitidos; 69 archivos. Los 4 casos nuevos T3 pasan. |
| PostgreSQL 16 local | Pasa migración sobre legado, assertions de persistencia/identidad/estados/RLS/roles, carrera real y rollback con evidencia idéntica. |
| Build frontend | Pasa; advertencias existentes de tamaño de bundle/imports dinámicos. |
| Deriva de esquema | 8 diferencias ajenas permanecen (2 funciones ausentes y 6 divergencias). En la base había 11; las 3 definiciones afectadas por HU30 quedan sincronizadas. Ningún objeto nuevo HU30 divergente. |
| Backend completo adicional | Se intentó, pero se interrumpió al bloquearse en `test_academy_news_route_is_registered` con TestClient/ASGI. No se afirma haber completado esa suite; el conjunto relacionado anterior sí terminó. |

Fallos anteriores conservados:

1. Backend `test_insufficient_down_payment_is_identical_before_and_after_confirmation`: espera `property_value_uf == 2200`, obtiene `2737.1852638989135`. No se cambió test/motor.
2. Frontend `coDebtorService` espera pending para invitación vencida el 12 de octubre; fecha del entorno posterior. Solo cambió el mock de transporte requerido por RLS.
3. Frontend `chileanRut` espera aceptar `17.493.972-k`; la función del commit base ya devuelve vacío. Se comprobó con la fuente intacta de HEAD; no se cambió validador/test.

Límites: Auth/RLS SQL usa primitivas de identidad de test, no una sesión real contra Supabase. Los permisos comerciales se prueban en API con repositorios controlados y acceso directo con roles SQL; falta E2E del despliegue real. El bootstrap core de pruebas explicita defectos anteriores: orden de funciones/tablas, extensión pgvector no incluida y columna housing_plan ausente para un trigger anterior. No se corrige esa deuda en esta HU ni se presenta esto como prueba de toda la cadena histórica o bootstrap íntegro sin adaptaciones. La advertencia OpenAPI de Operation ID duplicado de lead_changes también es previa.

## Rollback y paso siguiente

Cada migración tiene su archivo correspondiente en `supabase/rollback/`. El rollback no vuelve a UNIQUE(invitation_id), no borra columnas, no destruye v2, no reactiva participaciones y no restaura el bypass de RLS/rol. Deshabilita los contratos nuevos de escritura y creación, conserva revocación/lecturas/evidencia y requiere corrección progresiva. No es un downgrade estructural a HU18 una vez que existen revisiones múltiples.

En T4 debe verificarse también el recorrido completo de fallo de entrega/restauración de pendiente: la selección definida no hace fallback a confirmadas antiguas y la UI no debe ofrecer como aplicable una participación excluida por esa selección.

La base local queda preparada para desarrollar T4. **No desplegar T3 aislado:** al aplicar las migraciones se deshabilita la confirmación anónima anterior y se requieren sus adaptadores autenticados, correo verificado y aceptación de relación. T4 debe conectarlos en la misma entrega coordinada y probar el retorno de invitación. HU27 permanece pendiente y no se presupone Google. No hay decisiones de producto nuevas; no se avanza a T4 en esta tarea.

## Inventario de archivos de esta entrega

- `backend/app/tracking/repository.py`
- `backend/app/tracking/routes.py`
- `backend/app/tracking/service.py`
- `backend/app/tracking/staff.py`
- `backend/tests/test_co_debtor_scoring_inputs.py`
- `backend/tests/test_evaluations_grants.py`
- `frontend/src/hooks/useLeads.js`
- `frontend/src/services/__tests__/coDebtorService.test.js`
- `frontend/src/services/__tests__/evaluationPlanAcceptance.test.js`
- `frontend/src/services/coDebtorService.js`
- `frontend/src/services/evaluationService.js`
- `frontend/src/services/getScoringHistory.js`
- `frontend/src/services/goalsService.js`
- `frontend/src/services/mortgageScenarioService.js`
- `supabase/schema.sql`
- `backend/app/tracking/co_debtor.py`
- `backend/app/tracking/co_debtor_access.py`
- `backend/app/tracking/owner_reads.py`
- `backend/tests/tracking/test_hu30_owner_api.py`
- `backend/tests/tracking/test_hu30_persistence_contract.py`
- `docs/stories/HU30-capacidad-bipersonal/PLAN.md`
- `docs/stories/HU30-capacidad-bipersonal/T3-PERSISTENCIA.md`
- `frontend/src/services/__tests__/hu30PersistenceAccess.test.js`
- `scripts/test-hu30-persistence.py`
- `supabase/migrations/20261021120000_hu30_confirmation_revisions.sql`
- `supabase/migrations/20261021121000_hu30_participation_closure.sql`
- `supabase/migrations/20261021122000_hu30_secure_snapshot_access.sql`
- `supabase/rollback/20261021120000_hu30_confirmation_revisions_rollback.sql`
- `supabase/rollback/20261021121000_hu30_participation_closure_rollback.sql`
- `supabase/rollback/20261021122000_hu30_secure_snapshot_access_rollback.sql`
- `supabase/tests/hu30_legacy_seed.sql`
- `supabase/tests/hu30_persistence.sql`
