# HU30 — T4B: confirmación autenticada

Inicio: rama feat/hu30-capacidad-bipersonal y árbol limpio, desde da72dae. PLAN, T3 y T4A revalidados.

Antes de implementar se identificaron estas conexiones pendientes:

- T4A solo autoriza pending mediante token inicial. Las revisiones posteriores deben usar sesión y participación vinculada, sin reutilizar el token consumido.
- La UI del titular ya dispone de relación declarada, pero no la envía al crear invitaciones. Se conectará ese valor explícito al evento relation_declared en la misma transacción de creación. No se inferirá desde la última evaluación ni se implementará una nueva UI del titular.
- T3 activa el botón por UUID nuevo. T4B necesita impedir recálculos innecesarios al confirmar los mismos cinco valores. Se añadirá únicamente esa comprobación de compatibilidad en servidor; no se cambia scoring, ni se implementan evaluación/comparación/tarjeta de T5.

No hace falta ampliar las tablas de T3. Se agregan contratos RPC, adaptadores autenticados y pantalla de revisión propia. No se aplica SQL remoto.

## Flujo y contratos implementados

T4B queda implementada y verificada localmente. El acceso T4A monta la revisión autenticada. Las posteriores visitas usan `/co-deudor/invitacion?participation=<uuid>`; el UUID selecciona, nunca autoriza. `/co-deudor/invitacion?participaciones=1` lista solamente identificador, estado y fecha de las participaciones vinculadas a esa cuenta y permite gestionar su revocación. El token inicial consumido no se reutiliza.

La Edge resuelve la sesión con Auth en cada acción y aporta el actor a funciones exclusivas de service_role. La base vuelve a comprobar cuenta vinculada, rol usuario, correo confirmado y coincidente, RUT válido y coincidente, estado y cierre. Pending exige vigencia; confirmed permite revisar nuevamente sin tratar el vencimiento del token inicial como vencimiento de la participación. Revoked/replaced/declined/expired impiden lectura y confirmación. Revocar una participación confirmada reemplazada permanece permitido, sin reiniciar su cierre histórico.

`hu30_review_participation` retorna exclusivamente cinco antecedentes de esa participación, revisión/estado, relación declarada vigente y aceptación inicial, necesidad de aceptación, origen del prefill y cinco campos propios disponibles. No retorna correo, RUT, identidad ni información financiera personal del titular. Prefiere la revisión propia de esa participación cuando existe; en la primera revisión usa campos principales disponibles de la evaluación personal de la cuenta sobre los declarados en la invitación. No utiliza totales ni otras participaciones, no inventa campos ausentes ni escribe en la evaluación personal.

La UI permite editar los cinco campos, aplicar voluntariamente datos propios disponibles y confirmar la copia visible. La relación es de solo lectura: la primera aceptación autenticada es obligatoria y separada del consentimiento de participación. Rechazar la relación utiliza el rechazo de participación pendiente y pide al titular corregir/reemplazar. Tras una aceptación inicial, una declaración posterior del titular se muestra preservando lo aceptado originalmente; no exige una nueva aceptación inmediata.

`hu30_confirm_participation` utiliza `hu30_append_confirmation` de T3: UUID inmutable, versión secuencial, cuenta, cinco valores, relación aceptada cuando corresponde, consentimiento `hu30-participation-v1`, fechas de servidor y eventos con actor/revisión. No crea ni actualiza evaluaciones. Los dos checkboxes comienzan desmarcados.

Ingreso/deuda deben ser números JSON finitos no negativos, hasta 9007199254740991; cero es válido. Se exigen exactamente los cinco campos. Contrato: indefinido, plazo_fijo, independiente, honorarios_variable. Continuidad: menos_6_meses, entre_6_y_12_meses, entre_1_y_3_anios, mas_3_anios. Morosidad: si/no. Se rechazan campos extra, strings numéricos en el contrato servidor, null/bool, enums arbitrarios, IDs de actor/titular, cambios de cuenta y fechas/versiones de consentimiento del cliente.

## Reintentos, concurrencia y coincidencia

Cada operación lleva request_id UUID y revisión/evento de relación esperados. La UI conserva la misma operación al reintentar un fallo transitorio y bloquea doble clic. La base bloquea perfil titular y participación en el orden T3, comprueba estado nuevamente y asigna el número dentro de la transacción. Mismo request y mismo contenido retorna la revisión original; contenido distinto produce conflicto. Dos operaciones con la misma revisión esperada no pueden crear dos versiones: una tiene éxito y la otra debe volver a leer/revisar. El sondeo/foco no sobrescribe borradores editados; un cambio de revisión/relación bloquea el submit hasta recargar.

Una confirmación posterior explícita puede crear una revisión nueva aunque sus cinco antecedentes coincidan. `matches_previous` indica coincidencia con la revisión anterior. `matches_evaluated` compara únicamente los cinco valores con el input de la última evaluación del titular que habilitó complemento: true/false o desconocido si falta evidencia. No acredita ni modifica procedencia histórica y no clasifica capacidad bipersonal. Se aplica solo como guardia mínima al botón/endpoint de actualización ya existente para evitar un recálculo sin cambios. T5 conserva la evaluación y comparación financiera pendientes. Los correos de coincidencia tampoco prometen una actualización innecesaria.

Las notificaciones se envían después del commit y solo para una revisión nueva, sin importes ni tokens. Un fallo de correo no deshace consentimiento ni provoca duplicación al reintentar. No existe outbox/reintento durable de correos en este alcance.

## Persistencia, autorización y compatibilidad

Migración nueva: `20261021140000_hu30_authenticated_confirmation.sql`. No añade tablas/columnas ni cambia el modelo T3. Añade helpers de validación, acceso/cotejo y RPCs de lectura, confirmación, decisión, listado y creación con relación explícita. `schema.sql` refleja exactamente esas funciones. Rollback: revoca los comandos nuevos de creación/confirmación conservando datos, lecturas y revocación; no restaura escrituras anónimas.

La acción anónima submit_confirmation continúa bloqueada. Se conservan rechazo y gestión segura HU18, estados e históricos. Confirmaciones legacy no reciben identidad/relación inventadas. Un pending antiguo solo puede continuar si satisface identidad T4A y tiene declaración explícita de relación; de faltar, la pantalla pide corregir/reemplazar y no confirma. Las revisiones antiguas permanecen inmutables y las evaluaciones mantienen sus referencias originales.

No se modificaron motor financiero, DashboardLeads, LeadDetailModal, dependencias ni migraciones históricas. En CoDebtorSection solo se conecta la relación ya disponible a la petición de invitación; no se añade UI del titular para editar relación.

## Archivos

- Base: `supabase/migrations/20261021140000_hu30_authenticated_confirmation.sql`, `supabase/rollback/20261021140000_hu30_authenticated_confirmation_rollback.sql`, `supabase/schema.sql`.
- Edge: `supabase/functions/co-debtor-consent/{participation.ts,index.ts,helpers.ts,email.ts}`.
- Señal existente de actualización: `backend/app/tracking/{repository.py,service.py}`.
- Cliente: `frontend/src/components/{AuthenticatedCoDebtorInvitationPage.jsx,CoDebtorParticipationReview.jsx,CoDebtorSection.jsx}` y `frontend/src/services/{coDebtorAccess.js,coDebtorService.js,coDebtorReview.js}`.
- Pruebas: `supabase/tests/hu30_authenticated_confirmation.sql`, `scripts/test-hu30-persistence.py`, `backend/tests/tracking/test_hu30_persistence_contract.py`, `frontend/src/components/CoDebtorParticipationReview.test.jsx`, `frontend/src/services/__tests__/{coDebtorFinancialReview.test.js,coDebtorParticipantEdge.test.js}`.
- Documentación: este informe y PLAN.md.

## Verificación local

- PostgreSQL 16 desechable: migraciones sobre fixture HU18, suites T3/T4A/T4B aprobadas; identidad/roles/RLS, lectura aislada, relación, cinco campos, consentimiento/actor/fecha, revisiones/legado, mismos datos/cambios, rechazo/revocación, reemplazo y expiración entre lectura y envío. Carrera con dos transacciones: exactamente una v1. Rollbacks conservan fingerprint de invitaciones, revisiones, eventos y evaluaciones. Contenedor eliminado al terminar. Ninguna migración remota aplicada.
- Backend relacionado: **185 aprobadas, 1 fallida, 0 omitidas**. Falla preexistente `test_insufficient_down_payment_is_identical_before_and_after_confirmation`: 2200 vs 2737.1852638989135 UF. No se cambió test ni motor. Advertencia preexistente de operation ID duplicado.
- Frontend completo con Node 22.23.2: **849 aprobadas, 2 fallidas, 0 omitidas (851)**. Permanecen la fecha fija vencida de coDebtorService y el RUT inválido esperado como válido en chileanRut. Las 55 pruebas nuevas de pantalla/formulario/adaptador pasaron; después se añadió un test de correo coincidente y la suite afectada volvió a pasar (**34/34**). Total nuevo: 56 pruebas aprobadas. No se alteraron las expectativas anteriores para ocultar fallas.
- Build Vite aprobado; avisos existentes de tamaño de bundle/importación dinámica.
- Helpers/correos Edge mediante harness Node: **11 aprobadas, 1 fallida** por el contrato preexistente de managementPublicContext (test pasa Date donde se espera estado). Deno no está instalado; adaptador y parser TypeScript se ejercitaron con Vitest, no con un servidor Deno real.
- Schema drift: permanecen **8 objetos ajenos** (2 ausentes/6 divergentes), sin nuevas divergencias HU30. `git diff --check` sin errores.

Comandos principales desde la raíz (Vitest/Vite desde frontend):

```bash
python3 scripts/test-hu30-persistence.py
backend/.venv/bin/python -m pytest backend/tests/tracking backend/tests/test_co_debtor_scoring_inputs.py backend/tests/test_alg17_cases.py backend/tests/test_evaluations_grants.py backend/tests/test_hu18_decline_migration.py backend/tests/test_hu18_edge_function_security.py backend/tests/test_hu13_deployment_routes.py -q
/home/icart/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run
/home/icart/.nvm/versions/node/v22.23.2/bin/node node_modules/vite/bin/vite.js build
```

## Cierre y siguiente etapa

T4B cerrada en implementación/verificación local; no equivale a despliegue ni prueba E2E real de Auth/correos/Edge. Antes de liberar se necesita entrega coordinada de migraciones T3/T4A/T4B y funciones/cliente, configuración de Auth/correos y E2E integrado con Supabase. No hubo push ni PR.

T5 queda pendiente: integración completa de revisión/relación vigente al commit de evaluación, comparación financiera pura con/sin complemento, aporte UF/CLP y resumen inmutable con procedencia. La clasificación y proyecciones históricas completas, corte de 30 días y tarjeta/badge/filtro siguen en las etapas acordadas posteriores. No se avanzó a ellas.
