# PLAN — HU30: Participación y consentimiento de co-deudor

- **Sprint:** 3. **Estimación del backlog:** 3 SP; la ampliación acordada debe hacerse visible en la planificación del Sprint, sin cambiar unilateralmente sus puntos.
- **Responsable:** Persona A. **Método:** Scrum con SDD acotado para consentimiento, procedencia, privacidad y comparación financiera.
- **Estado:** T1–T9B y cierre técnico/documental final completos localmente. Lista para PR/revisión; revisión por otra persona, homologación hospedada y aplicación coordinada de migraciones pendientes. No equivale a aprobación de producción. Ver [HU30-CIERRE.md](HU30-CIERRE.md).
- **Branch de trabajo:** `feat/hu30-capacidad-bipersonal`, desde el `develop` remoto verificado en T1 y revalidado al comenzar T3.
- **Base técnica inspeccionada:** `origin/develop`, commit `14738e185c4d77794d4fa2c9e57dcbeffc47dcca`. Branch y base revalidadas en T3; no se trabaja desde `main`.
- **Fuente funcional:** [HUs para Sprint 3](https://docs.google.com/document/d/1oOCtiaJKWpw1eGR1Jhr_RgzsN2ESnjLuqG2b2CQcmDs/edit?tab=t.0), HU30, y decisiones 1–35 acordadas en esta conversación. HU27 está pendiente, no disponible.

> **Lectura del estado actual:** las secciones de diseño T2, hallazgos iniciales y cierres T3–T9B conservan su contexto temporal. Sus frases de autorización limitada o etapas pendientes describen ese momento; el estado consolidado y las dependencias de entrega actuales están en HU30-CIERRE.md. No se cambian reglas funcionales ni evidencia histórica.

## 1. Objetivo y ficha SDD

Cuando una evaluación haya utilizado válidamente antecedentes confirmados de un co-deudor, el titular y el ejecutivo autorizado deben identificarla como bipersonal y comprender el aporte del complemento. Se reutiliza HU18 y se amplía la participación para exigir una cuenta de usuario/lead y registrar confirmaciones sucesivas.

| Pregunta | Respuesta |
| --- | --- |
| Problema | Los datos confirmados, los declarados y la participación actual pueden confundirse con los efectivamente usados por una evaluación. Falta explicar el aporte financiero. |
| Actores | Titular, co-deudor con cuenta de usuario/lead, ejecutivo y administradores según permisos existentes. |
| Reglas afectadas | Procedencia, confirmación desde cuenta, aceptación de relación, disponibilidad de recálculo, exposición tras revocación y comparación con/sin complemento. |
| Datos sensibles | Identificador de cuenta, correo, RUT, relación, cinco antecedentes financieros, consentimiento y snapshots históricos. |
| Contratos | Ampliar servicios de participación y proyecciones existentes; mantener compatible `POST /score`. Backend decide participación y autorización. |
| Fuera de alcance | Verificación externa de identidad, implementación completa de HU27, Google obligatorio, documentos de HU23, nuevas reglas bancarias, recálculo automático o eliminación de históricos. |
| Verificación | Matriz de estados, comparación financiera determinista, pruebas de API/RLS, regresión HU18, frontend y revisión de otra persona. |

RutaHogar no aprueba créditos, no reemplaza evaluación bancaria formal ni garantiza beneficios. Los resultados son referenciales. Confirmar desde una cuenta con correo y RUT coincidentes no acredita externamente la titularidad del RUT.

## 2. Criterios originales y ampliación acordada

Se conservan los dos criterios originales, sin agregar otro criterio de aceptación numerado:

- **E1:** tarjeta «Capacidad Bipersonal» en resultados: ingresos separados, deuda individual y consolidada, capacidad adicional en UF y pesos, relación declarada.
- **E2:** badge y filtro en la bandeja; expediente con titular (ingreso, deuda, contrato) y co-deudor (ingreso, deuda, contrato, morosidad), aporte y riesgos específicos según reglas existentes.

Exigir cuenta, confirmar relación, actualizar participaciones y gestionar la consulta durante 30 días son reglas de la ampliación de HU30 acordada por el usuario. Deben implementarse y probarse, aunque no se agregue un E3. La ampliación excede una tarea exclusivamente visual.

El backlog local y parte de la wiki tienen numeración anterior: `docs/BACKLOG_HUS_RUTAHOGAR.md` deja HU30 pendiente y la wiki del commit inspeccionado asigna HU30 a ranking de proyectos. No modificar esas historias ni otras HUs como efecto lateral; para este trabajo prevalecen la fuente enlazada y los acuerdos de este plan.

## 3. Base existente que se reutiliza

Rutas relativas a la base `develop` inspeccionada; pueden no existir en el `main` del directorio donde se redacta este archivo.

| Área | Archivos o entidades | Uso |
| --- | --- | --- |
| Selección de antecedentes | `backend/app/scoring_engine/co_debtor_consent.py`, `co_debtor_inputs.py` | ALG-17, estados y selección conjunta de los cinco campos. |
| Evaluaciones | `backend/app/tracking/service.py`, `repository.py`, `routes.py`, `scoring_adapter.py` | Evaluaciones explícitas, linaje, idempotencia y persistencia. |
| Finanzas | `backend/app/scoring_engine/indicators.py`, `purchase_capacity.py`, `components.py`, `blockers.py` | Aceptación financiera, ingresos/deudas, ALG-9 y riesgos existentes. |
| Proyección comercial | `backend/app/tracking/staff.py` | Autorización por rol/inmobiliaria, listado y detalle. |
| Participación | `supabase/functions/co-debtor-consent/` | Invitación, correo, token de un uso, expiración, rechazo, revocación y evidencia. |
| Persistencia HU18 | `co_debtor_invitations`, `co_debtor_confirmations`, `co_debtor_consent_events` | Extender entidades existentes; no duplicarlas. |
| Resultados activos | `frontend/src/components/Recommendations.jsx`, `CoDebtorSection.jsx` | Tarjeta y gestión de participación. `Result.jsx` no estaba montado en el flujo activo inspeccionado. |
| Bandeja y ficha | `DashboardLeads.jsx`, `LeadDetailModal.jsx`, `ExecutiveCoDebtorSection.jsx` | Filtro, badge y desglose. |
| Servicios frontend | `evaluationService.js`, `trackingService.js`, `coDebtorService.js`, `auth.js`, `profileService.js` | Normalización, llamadas y autenticación existente. |
| Roles | `frontend/src/lib/roles.js` y autorización backend | Conservar alcance de ejecutivo, admin inmobiliario y admin global. |

HU18 ya contempla `pending`, `confirmed`, `declined`, `revoked`, `expired`, `replaced`, consentimiento separado y actualización explícita con motivo `confirmacion_codeudor`. No rehacer esos flujos ni cambiar pesos, umbrales o clasificaciones financieras.

## 4. Reglas de participación y acceso

1. El co-deudor debe tener cuenta de rol `usuario`/lead; no necesita una precalificación personal completa. Las cuentas comerciales no aceptan participaciones en este alcance.
2. Para confirmar se exige sesión auténtica, correo confirmado y coincidencia backend del correo y RUT normalizados con la invitación. Un token por sí solo deja de autorizar confirmaciones nuevas. No confiar en rol, RUT ni estado de correo enviados por el navegador.
3. La invitación dirige a ingreso o registro sin informar al titular si el destinatario tiene cuenta. Conservar el contexto de invitación al volver de acceso/verificación; no exponer datos financieros antes de autorizar al destinatario.
4. Si la cuenta no coincide, bloquear confirmación y ofrecer cambiar de cuenta. Si los datos de invitación son incorrectos, el titular debe reemplazarla; no reasignarla desde el enlace.
5. Precargar antecedentes propios disponibles; si faltan, completar los cinco campos de HU18. El co-deudor los revisa/corrige y confirma una copia específica para esa participación. No copiar información de otros titulares ni modificar su evaluación personal.
6. Mantener consentimiento de participación separado de registro, login y consentimiento general. Registrar versión, fecha, actor y confirmación utilizada.
7. Mostrar la relación declarada por el titular y exigir aceptación expresa inicial. Si discrepa, no confirma: puede rechazar; el titular corrige y reemplaza la invitación.
8. El titular puede cambiar después la relación sin nueva aceptación. Conservar la relación inicialmente aceptada, autor/fecha del cambio y marcar la nueva como modificación posterior no aceptada por el co-deudor. La próxima evaluación usa la relación modificada bajo las reglas financieras existentes.
9. Una cuenta puede participar con varios titulares; las autorizaciones, datos confirmados, revisiones y revocaciones son independientes. Esto no prueba viabilidad bancaria simultánea ni añade penalización al score.
10. El co-deudor consulta sus participaciones. Un ejecutivo autorizado para el expediente ve solo la señal «Tiene otras participaciones confirmadas vigentes», sin cantidad, identidades, proyectos ni datos de otros expedientes. El titular no recibe esa señal. No incluir participaciones revocadas o reemplazadas como vigentes ni contar la participación del expediente como «otra».
11. Crear una nueva invitación que reemplaza una participación confirmada excluye inmediatamente la anterior de futuros cálculos. Conservar su consulta histórica durante 30 días exactos desde el reemplazo; después ocultar el desglose y datos reconstructivos, sin borrar snapshots ni esperar a que confirme el nuevo destinatario.

## 5. Procedencia, clasificación y actualización explícita

Separar tres hechos: confirmación actual de la participación, confirmación efectivamente usada en la evaluación y autorización actual para mostrar antecedentes.

- **Bipersonal confirmada:** la evaluación registra procedencia confirmada y el motor consideró ingreso complementario mayor que cero. No basta `complemento_renta`, ingreso declarado positivo ni una confirmación actual posterior.
- **Individual:** la evaluación tiene evidencia suficiente de que no incorporó ingreso complementario. No usar esta categoría como destino por defecto de registros dudosos.
- **Complemento declarado/no confirmado:** puede existir resultado referencial por HU18; no presentarlo como bipersonal confirmado ni como individual comprobado.
- **Origen no verificable:** falta evidencia para determinar la procedencia del complemento. Conservar resultado, advertirlo y permitir futura evaluación explícita, sin reconstrucción ni backfill automático.

| Situación | Comportamiento |
| --- | --- |
| Confirmación posterior con cambios | Mantener evaluación anterior; mostrar confirmación pendiente de incorporar y habilitar la acción explícita de recalcular. |
| Confirmación posterior con los mismos antecedentes | No habilitar recálculo por esa confirmación. Mostrar «Antecedentes coincidentes confirmados posteriormente»; no alterar procedencia ni convertir retrospectivamente la evaluación en confirmada. |
| Dato financiero personal modificado | No actualizar participaciones automáticamente. El co-deudor selecciona para cuáles revisa y confirma nuevos antecedentes. |
| Nueva revisión confirmada con cambios | Titular puede revisar pendientes; el ejecutivo conserva la vista de los antecedentes usados por la evaluación vigente. |
| Recálculo explícito exitoso | Crear evaluación normal e inmutable usando la revisión confirmada correspondiente. Si el score no cambia, informar que incorporó los antecedentes y mantuvo el resultado. |
| Confirmación con ingreso no admisible o cero | Mostrar su estado sin afirmar incorporación de renta ni aporte positivo; aplicar reglas existentes. |
| Confirmación ya incorporada | No repetir aplicación ni ofrecer recálculo por la misma revisión sin cambios pertinentes. |

Comparar en backend los cinco antecedentes normalizados contra los efectivamente utilizados, sin diferencias artificiales de formato, timestamps o IDs. La aceptación/identidad por sí sola no habilita el botón. Un cambio de datos puede justificar recálculo aunque el score final coincida. La actualización normal del titular sigue siendo explícita y debe considerar la relación vigente.

El código inspeccionado decide `score_update_required` según confirmación pendiente de aplicar y protege su consumo único, incluso si los valores coinciden. Adaptar esa condición y sus pruebas: la regla acordada no está completamente implementada. Conservar idempotencia y control de concurrencia.

## 6. Aporte financiero

Calcular y guardar el resumen al generar nuevas evaluaciones verificables. Reutilizar el cálculo puro existente, separándolo de autenticación, presentación, escritura y generación de IA.

Comparar el escenario evaluado con un contrafactual del mismo titular sin ingreso ni deuda complementarios. Mantener iguales ahorro, edad, plazo, tasa, UF y demás supuestos efectivos de cálculo, incluidos los overrides registrados. No comparar con una evaluación anterior que pudo usar otros datos.

- **Aporte efectivo:** capacidad de compra estimada con complemento menos capacidad de compra estimada del titular solo.
- **Aporte por renta:** capacidad por renta con complemento menos capacidad por renta del titular solo.
- Mostrar ambos en UF y pesos, convirtiendo con la UF del snapshot de esa evaluación e identificando su referencia temporal.
- Respetar la precisión del motor y redondear para presentación al final; no introducir otra fórmula hipotecaria en frontend.
- Mostrar valores positivos, «Sin aumento de capacidad» para cero y «Reducción de capacidad» para negativos. Explicar pie limitante, carga de deuda u otras condiciones según resultados existentes.
- La evaluación sigue siendo bipersonal cuando cumple su procedencia y admisibilidad, aunque el aporte efectivo sea cero o negativo.
- Mostrar ingreso titular/co-deudor, deuda mensual de cada persona y total consolidado; distinguir deuda mensual de carga con dividendo si se expone esta última.
- Reutilizar riesgos y reglas existentes. No inventar riesgos, umbrales, penalizaciones ni atribuir al co-deudor todos los riesgos generales del titular.
- Sin snapshot o procedencia suficiente, informar «Desglose/aporte no disponible». No reconstruir históricos automáticamente con tasas o reglas actuales.

Registrar el resumen nuevo y las referencias de confirmación en los JSONB existentes de resultado/procedencia. La comparación no crea otra evaluación, no modifica el score principal y no dispara I/O externo ni IA adicional.

## 7. Revocación, exposición e históricos

La revocación excluye antecedentes de cualquier nueva evaluación desde que se registra. El plazo siguiente autoriza solamente consulta de una evaluación histórica que ya los utilizó; no permite seleccionarlos nuevamente, ni aplicar una revisión pendiente.

| Momento | Titular y staff autorizado |
| --- | --- |
| Antes de revocar | Consulta según permisos y distinción entre evaluación y pendientes. |
| Desde `revoked_at` hasta antes de `revoked_at + 30 días` | Mantener desglose histórico completo y aporte, con «Evaluación bipersonal histórica — consentimiento revocado» y fecha de ocultamiento. |
| En el instante de corte y después | Ocultar desglose del co-deudor, aporte y totales/comparaciones que permitan reconstruir sus antecedentes. Mantener score, clasificación e identificación histórica con advertencia. |

Usar timestamp y reloj de servidor: 30 períodos de 24 horas, no mes calendario. El acceso debe cambiar por evaluación de la condición temporal aunque no se ejecute un cron. Revalidar al consultar/refrescar y al alcanzar el corte en una vista abierta; no reutilizar datos de otro usuario o una caché anterior como autorización.

La ocultación abarca respuestas backend, lecturas directas, historial, relaciones y cifras individuales del co-deudor, indicadores derivados, narrativas y otras rutas que pudieran reconstruir esos datos. No basta esconder un componente. Los datos propios del titular y resultados generales que se conserven no deben combinarse con totales que revelen el complemento oculto.

**HU30 nunca borra ni reescribe los snapshots históricos por revocación o por vencer el plazo.** La conservación interna no autoriza exposición mediante consultas de tablas ni redefine procesos ARCO ajenos a esta HU. La condición temporal corresponde a la participación de origen; una nueva invitación de otra persona no vuelve visibles los datos de la anterior.

Para una participación confirmada reemplazada, aplicar la misma ventana de 30 días desde el reemplazo, con advertencia «Evaluación bipersonal histórica — participación reemplazada». El evento de reemplazo no se registra como revocación. Si después existe revocación expresa, el vencimiento se determina desde el primer hecho que inició el cierre de acceso; ninguna transición renueva el plazo.

Las participaciones antiguas sin vinculación a cuenta conservan sus evaluaciones. Exigir vinculación y nueva confirmación para usos futuros, sin inferir identidad por coincidencias parciales, sin borrar fixtures y sin migrar evaluaciones como confirmadas. Priorizar transición mínima y explícita.

## 8. Presentación

### Titular

- Incorporar tarjeta en `Recommendations.jsx`, pantalla activa de resultados.
- Conservar `CoDebtorSection` para invitación, estado, pendientes y actualización; evitar formularios o botones duplicados.
- Relacionar las cifras con la evaluación mostrada y explicar confirmación posterior, revisión pendiente, relación aceptada/modificada y revocación.
- Mantener estados de carga, error, origen no verificable y aporte no disponible sin presentar ceros inventados.

### Ejecutivo y administradores autorizados

- Badge asociado a la evaluación mostrada, no a la existencia de una invitación o cuenta.
- Filtro de tres opciones: «Todos», «Titular individual», «Con co-deudor». Esta última incluye evaluaciones bipersonales históricas revocadas o reemplazadas, con advertencia del motivo. Declaradas y no verificables aparecen solo en «Todos».
- Combinar con los filtros existentes y ranking por proyecto sin cambiar las reglas de priorización.
- Ficha con bloques titular/co-deudor y aporte/riesgos, usando los antecedentes de la misma evaluación. No mezclar confirmación actual con evaluación anterior.
- Corregir el texto de `declined` en `ExecutiveCoDebtorSection.jsx`; actualmente cae en el texto genérico de no confirmado.
- Conservar alcance por inmobiliaria y distinción admin global/admin inmobiliario. Sin privilegios nuevos por ser co-deudor.

## 9. T2 — Contrato de datos y migración conceptual

**Estado de T2: contrato de diseño cerrado; P1/P2 respondidas por el usuario e incorporadas (§9.10). Listo para revisión e inicio de T3 únicamente mediante una instrucción posterior.** Contraste efectuado en `feat/hu30-capacidad-bipersonal`, base `14738e185c4d77794d4fa2c9e57dcbeffc47dcca`. Esta sección sustituye la propuesta preliminar de datos; no contiene SQL ejecutable ni modifica contratos en producción. Los prerrequisitos de autenticación, protección de rol y RLS continúan pendientes de implementación/verificación.

Hace falta migración con la ampliación acordada. La conclusión inicial de que bastaba JSONB aplicaba al alcance visual/financiero, antes de exigir cuentas y revisiones. Se conservan las tres tablas HU18: no existe una necesidad técnica de una cuarta tabla de participaciones.

### 9.1. Invitación y participación: una fila, conceptos distintos

`co_debtor_invitations.id` será también el identificador estable de participación. Antes de confirmar, la fila representa una invitación; después, conserva su origen y pasa a contener el estado de esa participación. Las revisiones no generan invitaciones nuevas, no renuevan el token inicial ni cambian el destinatario.

- Titular: `lead_id` existente, FK a `profiles.id`.
- Co-deudor: nuevo `participant_user_id`, FK nullable a `profiles.id`, con eliminación restringida. Es null mientras no se vincule expresamente una cuenta; una vez vinculado no se reasigna a otra persona.
- `recipient_email` y `recipient_rut` se mantienen como destinatario declarado original. No sustituyen al ID de cuenta ni se actualizan silenciosamente al editar un perfil. El RUT no se convierte en PK ni en prueba externa de identidad.
- La vinculación ocurre en una operación autenticada: usuario Auth verificado, correo confirmado, rol de usuario y coincidencia normalizada de correo/RUT. La migración no busca ni asigna cuentas por coincidencia de datos.
- Mantener los seis estados existentes. `confirmed` es estado de participación; no prueba que la evaluación mostrada haya utilizado la última revisión. `revoked` impide futuras confirmaciones y usos de esa participación; las filas anteriores se conservan.
- Una invitación confirmada no expira por haber transcurrido el TTL de su token: la expiración de siete días sigue aplicándose a la invitación pendiente. El enlace consumido no autoriza nuevas revisiones.
- `declined`, `expired` y `replaced` no admiten nuevas revisiones. Una nueva participación requiere otra invitación. Al crear la invitación sustituta, la participación confirmada objetivo pasa atómicamente a `replaced`, se registra el evento y su `replaced_at`, y la nueva fila referencia su ID mediante `replacement_of_invitation_id`. La anterior queda excluida de futuro desde esa transacción, sin esperar nueva confirmación.
- Conservar el índice de una pendiente por titular. No confundirlo con una unicidad de confirmadas históricas: HU18 puede contener varias y no se alterarán sus estados mediante backfill.

### 9.2. Entidades: campos y restricciones propuestos

Los nombres siguientes fijan el contrato conceptual; los nombres físicos de constraints y RPC se concretan al escribir SQL en T3, una vez cerrado T2.

| Tabla | Existentes reutilizados | Nuevos | Restricciones |
| --- | --- | --- | --- |
| `co_debtor_invitations` | `id`, `lead_id`, destinatario, cinco campos declarados, digests, estado, expiración/consumo/reemplazo y FK de reemplazo. | `participant_user_id uuid NULL`. | FK a perfil, `ON DELETE RESTRICT`; unicidad auxiliar `(id, participant_user_id)` para FK compuesta de revisiones; identidad/titular/destinatario inmutables una vez vinculados. Mantener estados, digests únicos, índice de pendiente y checks existentes. |
| `co_debtor_confirmations` | `id` como `confirmation_id`, `invitation_id`, cinco campos, `treatment_consent_version`, `treatment_consented_at`, `confirmed_at`. | `revision_number integer NOT NULL`; `participant_user_id uuid NULL`; `accepted_relation_event_id uuid NULL`; `request_id uuid NULL`. | Retirar solo `UNIQUE(invitation_id)`; añadir `UNIQUE(invitation_id, revision_number)` y CHECK de número positivo; FK compuesta `(invitation_id, participant_user_id)` a la participación; `UNIQUE(invitation_id, request_id)` para reintentos, permitiendo null legado; claves auxiliares `(id, invitation_id)` y FK de relación aceptada a evento de la misma participación. |
| `co_debtor_consent_events` | `id`, `invitation_id`, `event_type`, `actor_type`, `invitation_status`, `occurred_at`, FK y protección append-only. | `actor_user_id uuid NULL`; `confirmation_id uuid NULL`; `relation_value text NULL`; `relation_revision integer NULL`. | FK de actor a perfil, restrict; FK compuesta `(confirmation_id, invitation_id)` a confirmación; clave auxiliar `(id, invitation_id)`; unicidad `(invitation_id, relation_revision)` para cambios de relación; checks de tipo/valor/ordinal; mantener append-only. |
| `evaluations` | `id`, `user_id`, `financial_data.input/result/provenance`; inmutabilidad HU13. | Ninguna columna relacional nueva en esta propuesta. Ampliar el contrato JSONB indicado en §9.5. | Validación de referencia en la escritura transaccional y protección de INSERT descritas en §9.6. |
| `scoring_history`, `tracking_events`, `tracking_plans` | Snapshots/procedencia y referencias de evaluación existentes. | Ninguna columna nueva para duplicar la confirmación. | Las copias que HU13 ya genera deben conservar la misma procedencia de la evaluación; no son otra fuente de selección vigente. |

`participant_user_id` de la revisión identifica tanto la cuenta participante como al actor que confirmó: no agregar otro actor idéntico en esa fila. La cuenta de la participación es una vinculación estable; conservarla en cada revisión permite FK compuesta y prueba inequívoca del actor histórico.

**Nullabilidad y nuevas escrituras:** los campos de cuenta, aceptación y request admiten null para conservar filas antiguas. Después de activar HU30, toda revisión nueva exige cuenta y `request_id` no nulos; el actor debe coincidir con esa cuenta. `accepted_relation_event_id` es obligatorio en la primera confirmación desde cuenta de esa participación; en revisiones posteriores puede ser null porque no se exige otra aceptación de relación. No se copia una aceptación anterior como si hubiese ocurrido nuevamente. El consentimiento de tratamiento sí se registra en cada revisión con los campos existentes.

Los triggers/operaciones de INSERT pueden exigir datos para nuevas filas sin invalidar nulls de las filas antiguas. No usar un CHECK global `participant_user_id IS NOT NULL` ni una fecha de corte arbitraria para identificar legado. Los eventos antiguos conservan actor/confirmación/relación null donde no existía evidencia. Las nuevas confirmaciones, revisiones y declaraciones de relación exigen actor autenticado. Eventos de sistema y operaciones de rechazo/revocación que sigan autorizadas mediante un token HU18 válido pueden conservar `actor_user_id` null; no atribuirles una cuenta inexistente ni impedir revocar un consentimiento legado. Esto no habilita confirmar antecedentes con el token consumido.

### 9.3. Historia específica de relación

La relación declarada se representa mediante eventos tipados `relation_declared` y `relation_changed` en el log existente, sin JSON libre ni valores financieros. Se añaden únicamente `relation_value` (enum vigente de `ScoreRequest`) y `relation_revision` (ordinal positivo por participación). No se crea un versionador genérico de campos ni una columna mutable duplicada para la relación actual.

1. El titular declara la relación; se registra `relation_declared`, ordinal 1, su ID y timestamp servidor.
2. Cada cambio posterior añade `relation_changed`, ordinal anterior + 1, bajo lock de participación. No se registra cambio si el valor normalizado no cambió.
3. La relación declarada actual es el evento de mayor `relation_revision`; el ordinal evita depender de empates de timestamps o de ordenar UUID al azar.
4. La primera revisión autenticada referencia en `accepted_relation_event_id` el evento de relación mostrado y expresamente aceptado. Si hubo un cambio mientras se revisaba el formulario, se devuelve conflicto antes de confirmar una relación distinta de la mostrada.
5. La relación inicialmente aceptada se obtiene de la primera revisión con cuenta y referencia de aceptación; su valor/autor/fecha se resuelven mediante ese evento inmutable y la fecha de confirmación. La fecha del evento declarado no se presenta como fecha de aceptación.
6. Cambiar después la relación no exige nueva aceptación (decisión 19B/23A). Se conservan ambos eventos; el siguiente cálculo usa la declaración actual y explica que hubo un cambio posterior no aceptado. No inferir ausencia de cambios porque el valor haya vuelto a coincidir con el original.
7. Un cambio en una evaluación del titular debe pasar por la misma declaración autorizada y quedar asociado al evento efectivo de relación; no introducir dos fuentes competidoras entre el formulario y la participación. La evaluación guarda su propio valor utilizado y la referencia al evento correspondiente.

Checks de eventos: `relation_*` requiere valor permitido, ordinal positivo, actor titular y sin `confirmation_id`; otros tipos llevan los dos campos de relación null. Los eventos `consent_granted`/`confirmed` de nuevas revisiones identifican `confirmation_id` y actor participante. La FK compuesta de aceptación asegura la misma participación; la validación de INSERT comprueba además que el evento referenciado sea de relación, no cualquier evento del log.

`relation_revision` es un orden específico de declaraciones de parentesco dentro del log existente, no una versión del perfil ni de sus campos financieros. No se agrega un segundo contador mutable en invitaciones: se asigna bajo el mismo lock y su UNIQUE ya sirve como índice de consulta.

### 9.4. Revisión vigente y concurrencia

No agregar `is_current`, `current_confirmation_id`, contador mutable de revisiones ni una versión global de perfil. La revisión documental más reciente es el máximo `revision_number` de esa participación, independientemente de que su uso financiero esté habilitado hoy.

**Selección exacta para uso futuro:**

1. Determinar una sola participación objetivo del titular. Como compatibilidad HU18, priorizar la fila con estado persistido `pending`; si no hay, elegir la más reciente por `(created_at DESC, id DESC)`. Aplicar esta selección en base, sin truncar antes a diez filas y sin buscar hacia atrás otra confirmada si la seleccionada está excluida. La creación de una sustituta deja a la anterior en `replaced`; una expiración, rechazo o fallo de envío de la nueva no reactiva automáticamente a la anterior.
2. Resolver expiración de pendiente con reloj servidor. Una pendiente expirada no se convierte en una confirmación anterior ni reactiva otra participación.
3. Exigir estado `confirmed`, cuenta vinculada y autorizada, y ausencia de revocación. De lo contrario no hay revisión confirmada elegible para un nuevo cálculo; pueden subsistir las declaraciones referenciales de HU18, correctamente etiquetadas.
4. Seleccionar una sola revisión mediante `revision_number DESC LIMIT 1` para ese `invitation_id`. El UNIQUE por participación/número impide empates. No seleccionar por fecha, orden implícito del embed, ni `confirmations[0]`.
5. Exigir cuenta de revisión igual a cuenta vinculada, cinco campos completos y evidencia de aceptación inicial. Si falla la integridad, devolver dato no disponible/conflicto; nunca tomar otra revisión como fallback silencioso.
6. La admisibilidad financiera sigue separada: `confirmed` no garantiza ingreso considerado positivo.

**Escrituras y carreras:** cada confirmación/revisión es una transacción corta. Verificar actor en servidor, bloquear primero el perfil del titular y luego la fila de invitación, en el mismo orden que `hu13_commit`. Dentro del lock comprobar estado, cuenta, revisión esperada y evento de relación esperado; asignar `max(revision_number)+1`, insertar la revisión y sus eventos atómicamente. En selección de varias participaciones, ordenar los locks por IDs de titular/participación para evitar interbloqueos; no mantener locks mientras se envía correo o se calcula fuera de base.

El comando incluye `request_id`, revisión esperada y, cuando se acepta relación, ID del evento mostrado. La identidad de actor nunca se toma del body. Un reintento con mismo request y contenido normalizado devuelve la revisión ya creada; reutilizarlo con contenido distinto devuelve conflicto. Dos comandos diferentes basados en la misma revisión no se pisan: uno confirma y el otro recibe conflicto, sin reintento automático que acepte datos no revisados por la persona.

Para evaluación, calcular fuera de la transacción con una revisión y evento de relación fijados. En el commit HU13, bajo los mismos locks, revalidar estado, revisión vigente e ID de evento de relación. Si se revocó, cambió la relación o apareció otra revisión antes del commit, abortar sin persistir ni recalcular automáticamente; solicitar actualización/reintento explícito. Si la evaluación se confirma primero y la revocación ocurre después, la evaluación queda histórica y la revocación afecta los usos posteriores. No se necesita un lock distribuido ni una tabla nueva de comandos.

### 9.5. Revisión utilizada y contrato de lectura

Conservar el identificador ya existente como referencia canónica: `financial_data.provenance.co_debtor_confirmation_id`. **No moverlo ni duplicarlo con otro `confirmation_id` dentro de result.** Hacerlo obligatorio en todas las evaluaciones nuevas que seleccionen datos confirmados, no solo en la acción `confirmacion_codeudor`.

| Ruta persistida | Contenido |
| --- | --- |
| `financial_data.input` | Snapshot completo utilizado: incluye los cinco antecedentes seleccionados y la relación declarada efectiva. No se rehidrata desde la revisión vigente al consultar históricos. |
| `financial_data.provenance.co_debtor_confirmation_id` | UUID de la revisión realmente utilizada; null/ausente si no se seleccionó una confirmación. La participación y cuenta se obtienen mediante esa revisión, sin copiar RUT/correo/actor en el resultado. |
| `financial_data.provenance.co_debtor_consent` | Conservar los campos actuales de fuente/estado/regla. Añadir `revision_number` y `relation_declaration_event_id` para la revisión y relación efectivamente utilizadas; null cuando no aplican. Es procedencia al calcular, no consentimiento actual. |
| `financial_data.result.bipersonal_summary` | Objeto nuevo con `version = hu30-bipersonal-v1`, `evaluation_type`, `availability`, comparación sin complemento y deltas financieros. No repetir ID de confirmación, cuenta ni datos personales. |

`evaluation_type` usa `individual`, `bipersonal_confirmed`, `declared_complement` o `unverifiable_origin`. `availability` distingue `complete` y `insufficient_data`; la ocultación por permisos se añade en la proyección de lectura, no se persiste cambiando el resultado.

Para una comparación disponible, guardar `without_complement.purchase_capacity_uf` y `without_complement.income_capacity_uf`, más `delta.purchase_capacity_uf`, `delta.purchase_capacity_clp`, `delta.income_capacity_uf` y `delta.income_capacity_clp`. Las capacidades con complemento, UF y supuestos ya están en `result.financial_indicators`; no duplicar un segundo snapshot de mercado. Los importes CLP se obtienen del delta sin redondeo prematuro y UF de esa evaluación. Si faltan datos, los valores no disponibles son null, no cero. La estructura no recalcula score ni cambia sus umbrales.

El historial HU13 ya copia input/result/provenance a `scoring_history.snapshot` y a eventos: conservar esas copias existentes de forma consistente. La versión de revisión en procedencia es una comprobación del registro inmutable identificado, no otra fuente editable de versión. Una evaluación que usó v1 sigue apuntando a v1 aunque exista v3.

La respuesta backend añade, fuera del snapshot persistido, una proyección `co_debtor` con `participation_id`, `status`, `current_revision` (ID/número o null), `used_revision` (ID/número o null), `update_required`, `revoked_at`, `replaced_at`, `historical_visible_until`, `visibility` y estado de relación. Los tiempos se derivan de los eventos de la participación usada; el motivo distingue reemplazo y revocación. El origen de estos campos siempre es servidor; al titular se ofrecen pendientes autorizados, mientras que el desglose comercial se resuelve por `used_revision`. Los importes ocultos se omiten/nullifican en todas las rutas, incluidas narrativas e indicadores derivados.

Para registros antiguos sin resumen no se guarda uno al leer: la proyección devuelve disponibilidad/participación verificables con los datos existentes y aporte no disponible. Una referencia HU18 explícita puede resolver su revisión histórica sin atribuir cuenta; la falta de referencia no se suple mediante importes coincidentes, última invitación o timestamps aproximados.

### 9.6. Integridad y operaciones privilegiadas

- **Duplicación de versión:** UNIQUE `(invitation_id, revision_number)` y número positivo; RPC bajo lock verifica secuencia consecutiva. El índice de este UNIQUE permite obtener la mayor revisión sin otro índice duplicado.
- **Cuenta incorrecta:** FK de participante a perfil y FK compuesta de revisión a participación. En nuevas escrituras, operación autenticada comprueba Auth/correo/RUT/rol y actor; una FK por sí sola no prueba autenticación. Cuenta/titular/destinatario no se reasignan tras vinculación.
- **Aceptación de otra participación:** FK compuesta `(accepted_relation_event_id, invitation_id)` a `(id, invitation_id)` de eventos; guard de INSERT comprueba tipo y relación esperada. El evento de relación se inserta antes de la primera revisión, y el evento de confirmación después de ella; no hace falta un ciclo de inserts diferidos.
- **Eventos de otra revisión:** FK compuesta `(confirmation_id, invitation_id)`; `actor_user_id` coincide con el participante para eventos de confirmación. No guardar cinco valores financieros en el log.
- **Inmutabilidad:** extender la protección de UPDATE/DELETE a confirmaciones, incluida cuenta, consentimiento, número y referencias, también frente a escritura accidental de `service_role`. Mantener protección existente de eventos. FK con eliminación restringida preserva referencias; no agregar borrado en cascada ni `SET NULL` de identidad histórica.
- **Referencia JSONB de evaluación:** JSONB no admite una FK relacional ordinaria. Se elige conservar la ruta HU18 y evitar columnas espejo; por eso es necesaria validación de INSERT en base, además de validación del commit controlado. Resolver ID de confirmación → invitación y comprobar `lead_id = evaluations.user_id`, cuenta válida para nuevo uso, estado, versión coincidente, campos utilizados y evento de relación de la misma participación. Rechazar referencia inválida/faltante cuando la fuente declara confirmación. La validación no modifica filas históricas ni exige que su revisión siga siendo vigente al leerlas.
- **Carrera entre cálculo y persistencia:** `hu13_commit` revalida la revisión/relación bajo lock (§9.4). El guard de INSERT cubre rutas de escritura distintas del RPC; no sustituye esa comprobación temporal ni RLS.
- **Idempotencia:** índice UNIQUE por participación/request; no duplicar confirmaciones por doble clic ni cambiar el contenido asociado al mismo request.
- **Estados y eventos:** cambios de estado/eventos/cuenta en una sola operación. No permitir que el navegador escriba confirmaciones, acepte relación o altere estado directamente. Los overloads antiguos no podrán seguir creando confirmaciones anónimas después de activar el contrato HU30; compatibilidad de filas no implica mantener el bypass de autenticación.

No agregar un sistema de identidad paralelo. Los hallazgos T1 de protección de rol, lectura de snapshots y acceso autenticado son prerrequisitos de implementación, no quedan resueltos por estas FK ni por documentar este diseño.

### 9.7. Revocación: comparar derivación y columna

| Aspecto | A: derivar desde eventos | B: columna `revoked_at` adicional |
| --- | --- | --- |
| Consistencia | Una fuente temporal append-only; estado y evento se escriben en la misma transacción. | Dos representaciones que deben sincronizarse siempre. |
| Rendimiento | Agregación por participación; usar índice existente `(invitation_id, occurred_at, id)` y consulta en lote. | Lectura directa más simple; evita el join/agregado. |
| Duplicación | No copia timestamp. | Duplica un hecho ya registrado y exige backfill validado. |
| Auditoría | Fecha y actor se resuelven en el evento original. | La auditoría sigue necesitando el evento. |
| Listado/detalle | Agregar para el conjunto de participaciones ya autorizado; no una consulta HTTP por fila. | Proyección más sencilla, pero con obligación de mantenerla. |

**Recomendación técnica: A.** `revoked_at` es el menor `occurred_at` de un evento `revoked` de esa participación. La revocación repetida es idempotente y no reinicia el plazo. Estado `revoked` sin evento trazable se informa como fecha desconocida: se excluye de futuro y no se inventa una ventana visible de 30 días. Evento de revocación con estado inconsistentemente confirmado impide uso nuevo y se reporta como inconsistencia.

Para una participación confirmada revocada o reemplazada, `closure_at` es el menor timestamp verificable entre su primer evento `revoked` y su primer evento `replaced` que cerró esa participación. `historical_visible_until = closure_at + 30 días exactos`; comparar con reloj servidor, ocultando al llegar al instante de corte. `closure_at` y vencimiento son derivados, no columnas nuevas. El `replaced_at` ya existente se mantiene consistente con el evento de reemplazo en la misma transacción; el log es la fuente temporal canónica.

La visibilidad se resuelve con la participación de la revisión utilizada, nunca con la última invitación del titular. Una participación nueva o revocación posterior al reemplazo no renueva el plazo de la anterior. Para legado terminal sin evento temporal suficiente, no inventar una ventana de acceso. No guardar el vencimiento ni programar un borrado. Si mediciones posteriores justificaran materializar el timestamp, hacerlo en otra decisión técnica con conservación de esta fuente canónica; no añadirlo preventivamente en T2.

### 9.8. Compatibilidad y migración conceptual

**Datos existentes:** asignar únicamente `revision_number = 1` a cada confirmación HU18, porque la unicidad actual demuestra que hay una sola por invitación. Es un ordinal estructural; no acredita cuenta, identidad ni nueva aceptación. Conservar IDs, cinco valores, versiones de consentimiento, fechas, estados y snapshots. No actualizar evaluaciones/historial ni completar referencias faltantes por inferencia.

- Confirmación sin cuenta: permanece como revisión histórica sin cuenta; no elegible para nuevas evaluaciones bajo HU30. Una nueva confirmación explícita desde cuenta coincidente puede vincular una participación todavía confirmada y añadir v2, sin modificar v1. Debe existir declaración explícita de relación por el titular; no inventarla desde su última evaluación. Una participación terminal requiere nueva invitación.
- Invitación antigua pendiente: mantener datos y vencimiento; la nueva aceptación requiere cuenta coincidente y declaración/aceptación de relación. Si faltan RUT o relación, no adivinar: pedir al titular completar o reemplazar mediante flujo autorizado.
- Revocadas: conservar evento y fecha original, aplicar exclusión inmediata y corte histórico conocido. Rechazadas/expiradas/reemplazadas: conservar estado y no reabrir por migración. En confirmadas que posteriormente fueron reemplazadas, usar su evento de cierre verificable para la ventana de 30 días; no atribuir confirmaciones a una invitación pendiente que solo fue sustituida. Si la evidencia no permite reconstruir el momento de cierre, no inventar fecha.
- Evaluaciones con referencia explícita a confirmación antigua: preservar esa evidencia histórica sin afirmar autenticación nueva. Sin evidencia suficiente, `unverifiable_origin`; sin resumen de aporte, no disponible. No backfill financiero ni recomputación al leer.

**Secuencia propuesta para T3 y despliegue posterior, sin ejecutar ahora:**

1. Preflight de constraints reales, duplicados/inconsistencias de eventos, cuentas/permisos y consumidores; registrar diagnóstico, no reparar identidad ni estados automáticamente.
2. Añadir campos inicialmente compatibles con nulls legado. Asignar ordinal 1 a confirmaciones existentes; establecer positivo/NOT NULL y unicidad por invitación/número antes de retirar la unicidad anterior.
3. Añadir claves auxiliares y FK compuestas. Ampliar tipos/checks de eventos con campos específicos de relación; conservar append-only. No cambiar tipos ni dominios de los cinco antecedentes financieros.
4. Añadir índices de vínculo a cuenta para sus participaciones y de selección de relación: `(participant_user_id, status)` en invitaciones y UNIQUE parcial `(invitation_id, relation_revision)` en eventos de relación. Reutilizar los índices de revisión/request y de eventos existentes; no añadir índices iguales con otro nombre.
5. Preparar operaciones autenticadas, guards de inmutabilidad/integridad y revalidación de commit; coordinar activación con consumidores adaptados. Orden de locks común. No abrir escrituras múltiples mientras existan lectores que eligen arbitrariamente el primer registro.
6. Activar el contrato HU30 y retirar autorización de inserción anónima en firmas anteriores. Preservar lectura histórica compatible, pero no mantener firmas que permitan esquivar los controles nuevos. Si hace falta ventana de mantenimiento, declararla; no desplegar una migración que deje a medias un flujo público activo.
7. Reconciliar RLS/grants y accesos alternativos mediante corrección incremental coordinada; verificar también lectura propia y ventana de 30 días. Sin corrección de rol/correo y exposición, no declarar seguro el despliegue.
8. Sincronizar `schema.sql`, pruebas SQL de secuencia completa/bootstrap y documentación de contratos. El responsable de integración aplica y registra las migraciones alojadas cuando corresponda, fuera de T2.

**Rollback:** antes de nuevas escrituras HU30, se puede recuperar la unicidad anterior solo tras comprobar que todas las participaciones siguen teniendo una revisión y que no se pierde evidencia nueva. Después de registrar v2, vínculo, aceptación o eventos nuevos, no volver a un lector HU18 ni eliminar columnas/eventos para hacer entrar los datos en el esquema anterior. Deshabilitar nuevas operaciones manteniendo lectores compatibles y aplicar corrección hacia adelante; un downgrade estructural queda bloqueado si perdería evidencia. No deduplicar, truncar, borrar revisiones ni restaurar el bypass anónimo como rollback.

### 9.9. Consumidores afectados

| Consumidor | Actual | Contrato al implementar | Riesgo que debe cubrirse |
| --- | --- | --- | --- |
| `TrackingRepository.load_co_debtor_consent()` | Selecciona hasta diez invitaciones y `confirmations[0]`. | Participación única explícita, revisión por ordinal, cuenta/evidencia y relación actual; devolver ID/número fijados para commit. | Elegir revisión vieja o resucitar confirmación de otra participación. |
| `select_current_co_debtor_invitation()` y `staff_co_debtor_invitation()` | Priorizan pending sobre lista limitada; embed sin orden de revisiones. | Selección determinista en base y estados de sustitución acordados; histórico se resuelve por ID usado. | Desacuerdo entre titular, listado y detalle; resultado condicionado por el límite diez. |
| `staff._confirmation_for()` / `StaffLeadService` | Primer elemento y cinco campos de confirmación actual. | Desglose de revisión utilizada en evaluación; estado/visibilidad actual separados y otras participaciones solo como señal. | Mezclar v3 actual con evaluación v1 o filtrar datos después del corte. |
| `coDebtorService.confirmationFor()` / `getLeadCoDebtorInvitation()` | Elige primer embed y usa reloj cliente para expiración. | Consumir proyección backend con actual/usada/pendiente y visibilidad; no deducir validez desde el embed o reloj cliente. | CTA incorrecto, exposición por lectura directa y revisión equivocada. |
| Edge Function `co-debtor-consent` y RPC HU18 | Confirmación con token, sin cuenta; solo pending; una inserción por invitación. | Autenticación, vinculación explícita, aceptación inicial, request/revisión esperada, append de revisiones y eventos; no reusar token consumido. | Mantener bypass público, duplicar revisiones o reasignar identidad. |
| `TrackingService._co_debtor_update_state()` y actualización explícita | Confirmación no consumida habilita CTA incluso con valores idénticos. | Comparar cinco datos normalizados con los usados, conservar coincidencia posterior como evidencia separada y fijar revisión en evaluación nueva. | Recálculos sin efecto, consumo duplicado, negar revisión posterior o alterar procedencia histórica. |
| `TrackingService.execute()`, `co_debtor_inputs.py`, `hu13_commit` | ID solo en camino explícito; procedencia mínima; sin validación de revisión actual al commit. | ID en todo uso confirmado, número/evento de relación, resumen, validación de dueño y revalidación transaccional. | Evaluación con revisión ajena, retirada o cambiada durante el cálculo. |
| `evaluationService.normalizeEvaluation()` y `currentTrackingEvaluation()` | Se pierde procedencia explícita o se reconstruye solo input/result. | Preservar la procedencia y proyección autorizada de la misma evaluación, incluido fallback. | Badge/CTA inferidos por frontend o ausencia del vínculo histórico. |
| HU13: historia, correcciones, `scoring_history` | Copias inmutables de los snapshots. | Conservar referencias de la evaluación correspondiente; nuevas evaluaciones validan fuente, consulta histórica no usa max actual. | Reescribir el pasado o perder evidencia al corregir/anular otro evento. |
| `useLeads`, historial directo, lecturas del titular | Realtime con filas crudas y fallbacks a tablas. | Proyecciones autorizadas y redacción temporal coherentes. | Saltarse RLS/proyección y reconstruir datos ocultos. |
| Pruebas de contratos/fixtures HU18 | Objeto/array de una confirmación y CTA por ID nuevo. | Varias revisiones desordenadas, legado, cuentas y carreras; revisar aserciones que el contrato amplía. | Tests verdes con fixtures que no ejercitan el nuevo modelo. |

Las FK compuestas nuevas pueden hacer ambiguos los embeds automáticos de PostgREST, porque pasan a existir varias relaciones entre las mismas tablas. Los lectores adaptados deben usar una relación explícita o una proyección/RPC que devuelva actual/usada; no depender de que el nombre `co_debtor_confirmations(...)` siga resolviéndose sin indicación de FK.

### 9.10. Decisiones de reemplazo confirmadas y transiciones

El código HU18 actual reemplaza invitaciones `pending`; HU30 amplía esa operación a la participación `confirmed` seleccionada. El usuario confirmó ambas decisiones:

- **P1:** excluir la participación anterior al crear la nueva invitación; no esperar a que la nueva persona confirme.
- **P2:** permitir consulta histórica durante 30 días desde el reemplazo y después ocultar datos, sin borrarlos. Mantener motivo de reemplazo separado de revocación.

La transición nueva `confirmed → replaced` se realiza junto con la creación de la sustituta, bajo locks de titular y participación. Conservar `replacement_of_invitation_id`, registrar actor titular y timestamp único de servidor para evento/`replaced_at`. No alterar las revisiones ni las evaluaciones de la anterior. No imponer un índice de una confirmada por titular que invalide filas históricas; la participación seleccionada y sus transiciones son explícitas.

Un fallo de envío posterior al commit puede dejar la nueva invitación como entrega fallida/reemplazada para reintento, pero no deshacer el cierre ya registrado de la participación confirmada anterior. La recuperación HU18 que restaura una invitación pendiente por fallo de correo no se debe extender para reactivar una confirmada cerrada. Tampoco reactivar por rechazo o expiración del nuevo destinatario.

Conservar la posibilidad de revocación expresa de una participación antes confirmada y ahora reemplazada, mediante su autorización válida; `replaced → revoked` añade evidencia real de revocación sin habilitar revisiones ni reiniciar el plazo histórico. Un `replaced` procedente únicamente de una invitación no confirmada no equivale a consentimiento otorgado.

Cubrir concurrencia de reemplazo con revisión, revocación o commit de evaluación: se serializan bajo los mismos locks; un cálculo pendiente basado en la participación excluida falla al revalidar antes del commit. No modificar historias almacenadas ni cambiar silenciosamente la fuente al nuevo destinatario.

**Sin preguntas de producto pendientes en T2.** Los problemas técnicos T1 siguen registrados como prerrequisitos; aquí solo se cierra el contrato. No se generan SQL, fixtures ejecutables o cambios funcionales en T2.

### 9.11. Contrato de T2 consolidado

**Entidades:** invitación/participación existente con cuenta nullable; confirmaciones existentes con ordinal, actor-cuenta, request y aceptación inicial por referencia a evento; log existente con actor, revisión objetivo e historia específica de relación. Evaluación conserva su JSONB y referencias existentes. Sin cuarta tabla, sin `is_current` y sin `revoked_at` duplicado.

**Revisión vigente:** máximo `revision_number` de la participación seleccionada; es elegible solo si participación confirmada, vinculada, no revocada/reemplazada y con aceptación inicial demostrable. Crear una invitación sustituta excluye la anterior inmediatamente. No hay fallback a otra revisión o participación por datos incompletos o por fracaso de la nueva invitación.

**Revisión utilizada:** UUID canónico en `financial_data.provenance.co_debtor_confirmation_id`, ordinal comprobado en `co_debtor_consent.revision_number` y relación utilizada en input con su evento de procedencia. Nunca sustituir ese UUID por el de la revisión vigente al leer un histórico.

**Legado:** ordinal estructural 1, IDs/fechas/valores intactos y nuevos datos de identidad/evidencia null; ninguna vinculación o procedencia inventada. Reconfirmación autenticada explícita para futuro; origen insuficiente se informa como no verificable. Revocación/reemplazo conocidos conservan su momento original: ventana histórica de 30 días desde el primer cierre verificable, sin reinicio.

**Invariantes:**

1. Un número de revisión identifica como máximo una confirmación por participación; una confirmación identifica exactamente una participación.
2. Una revisión nueva es completa, autenticada, consentida e inmutable; nunca mezcla campos de varias revisiones.
3. Todas las revisiones autenticadas de una participación corresponden a su misma cuenta vinculada; no reasignar personas.
4. La primera aceptación de relación tiene evidencia propia e inmutable; un cambio posterior del titular no se presenta como aceptación del co-deudor.
5. Cada evaluación nueva que usa confirmación identifica la revisión real, pertenece al titular correcto y se valida de nuevo al commit.
6. Nueva revisión, login o aceptación sin cambios financieros no recalculan ni reetiquetan evaluaciones anteriores.
7. Revocar impide inmediatamente uso futuro; el plazo de 30 días solo regula consulta histórica y no se reinicia.
8. La revisión vigente no sustituye la revisión utilizada; visibilidad actual no reescribe procedencia histórica.
9. Ninguna revisión, evento o snapshot se borra para migrar o hacer rollback; null legado nunca significa identidad comprobada.
10. Los consumidores no deciden validez con el primer embed, importes positivos, localStorage o reloj cliente; los datos sensibles solo salen por una proyección autorizada.
11. Autenticación/correo, protección de rol y RLS son controles necesarios además de FK/checks; HU27 pendiente no se da por implementada.
12. Reemplazar una participación confirmada la excluye desde la creación de la sustituta; permite consulta histórica por 30 días desde el primer cierre y nunca se reactiva ni renueva el plazo automáticamente.

## 10. Dependencias y hallazgos previos

### HU27 pendiente

HU27 contempla acceso con correo/contraseña o Google, verificación de correo y gestión de acceso. **No está implementada ni es una capacidad disponible para HU30. Google no es requisito ni se implementará toda HU27 dentro de esta historia.**

La base inspeccionada dispone de Supabase Auth con `signInWithPassword`, `signUp` y RUT en perfil/metadata. Esto no demuestra que el recorrido de confirmación de correo y retorno a invitación esté completo en el despliegue. Antes de construir, verificar configuración y flujo real de verificación/callback, fuente autorizada del RUT y normalización/unicidad existentes.

Si el mecanismo existente no permite cumplir correo confirmado, documentar el mínimo prerrequisito y coordinarlo con HU27. No simular que Google está listo, no debilitar el control de correo y no expandir silenciosamente HU30 a recuperación de cuentas, proveedores o administración general del acceso.

### Permisos y redacción

- `20261004120000_hu18_staff_projection.sql` restringe lectura directa de evaluaciones; `20261005130000_restore_evaluations_staff_select.sql` la reabre para staff. El `schema.sql` inspeccionado mantiene la versión restrictiva.
- La secuencia de migraciones y bootstrap discrepan. No se verificó la política real del servidor alojado. Probar ambos y resolver mediante nueva migración correctiva, verificando consumidores para no dejar vacía la bandeja.
- `redact_co_debtor_data()` elimina campos originales, pero conserva indicadores como ingreso/deuda complementarios considerados. Revisar también totales, narrativas, realtime y lecturas alternativas de historial.
- Incorporar la ventana histórica de 30 días a las proyecciones y políticas correspondientes; no reabrir lecturas amplias de snapshots para implementarla.

### Pruebas de base

En la copia del commit inspeccionado se ejecutaron diez archivos backend relacionados: **94 pruebas aprobadas y 1 fallida**. Falla existente: `tests/tracking/test_co_debtor_confirmation.py::test_insufficient_down_payment_is_identical_before_and_after_confirmation`; espera `property_value_uf == 2200`, pero obtiene aproximadamente `2737.185`. El motor usa una referencia vinculada a capacidad por renta donde el test espera precio objetivo. Revisar contrato/fixtures y reglas vigentes antes de modificar test o motor; no cambiar la fórmula para satisfacer la aserción sin justificación.

Las pruebas frontend seleccionadas no arrancaron en Node `18.19.1`: las dependencias instaladas requieren una versión más reciente y usan `node:util.styleText`. Usar una versión compatible con los manifiestos y lockfile de la base al verificar; no afirmar que frontend está aprobado.

### Coordinación

- HU18 y HU13: conservar estados, consentimiento, linaje, correcciones, historial e idempotencia; ampliar las reglas señaladas expresamente por HU30.
- HU23: confirmación personal no equivale a respaldo documental. No implementar carga ni validación documental aquí.
- HU27: acordar acceso/verificación y retorno a invitación, sin depender de Google.
- Superficies comerciales y exportaciones (HU22): mantener contrato de exposición; la ampliación de exportación pertenece a su HU y debe respetar el corte de acceso.
- Coordinar ediciones de `DashboardLeads`, ficha y servicios con sus responsables; no atribuir personas concretas sin asignación vigente.
- Mantener identificadores heredados `scoreleads_*` donde existan por compatibilidad; no renombrarlos ni convertir esta HU en un refactor de marca.

## 11. Tareas pequeñas y orden de ejecución

| Tarea | Entregable | Dependencia |
| --- | --- | --- |
| T1. Revalidar base y prerrequisitos | Branch propia desde `develop` actualizado; inventario de diferencias, verificación de acceso/correo y diagnóstico de RLS/test fallido. | Plan validado e instrucción de implementar. |
| T2. Diseñar contrato y migración | Cuenta, versiones, relación aceptada/modificada, procedencia y corte de exposición; fixtures de estados y legado. | T1. |
| T3. Persistencia y autorización | Migración incremental, bootstrap/rollback, RLS/RPC y selección explícita de revisión. | T2. |
| T4. Participación desde cuenta | Retorno de invitación a login/registro, coincidencia de identidad declarada, aceptación de relación, revisiones por participaciones seleccionadas. | T3; prerrequisito mínimo de correo resuelto. |
| T5. Evaluación y comparación | Condición de botón por datos cambiados, referencia de revisión usada y aporte puro con/sin complemento guardado en nuevas evaluaciones. | T3–T4. |
| T6. Proyecciones seguras | Listado/detalle/titular coherentes, señal de otras participaciones, ventana de 30 días y redacción tras corte; consultas en lote. | T3–T5 y corrección de accesos alternativos. |
| T7. Resultados del titular | Tarjeta, pendientes, confirmación coincidente y feedback del recálculo aun con score idéntico. | T4–T6. |
| T8. Bandeja y expediente | Badge/filtro, desglose paralelo, riesgos y revocación; compatibilidad con filtros/proyectos existentes. | T6. |
| T9. Regresión y revisión | Pruebas backend/frontend/SQL, recorrido completo, evidencia de despliegue de migraciones y revisión por otra persona. | T7–T8. |

En la autorización inicial de implementación esta división habilitó únicamente T3; las instrucciones posteriores autorizaron T4A–T9B y este cierre documental. La tabla conserva los entregables originales y no autoriza avances a otras HUs. Si los prerrequisitos de seguridad/acceso exceden lo asumido en 3 SP, informar el impacto al equipo sin omitirlos ni cambiar la estimación unilateralmente.

## 12. Matriz de pruebas y trazabilidad

| Grupo | Casos mínimos |
| --- | --- |
| Estados/procedencia | Sin invitación, pendiente, expirada, reemplazada, confirmada, rechazada y revocada; ingreso admisible/no admisible; origen verificable/desconocido; confirmación posterior nunca reescribe evaluación anterior. |
| Cuenta | Destinatario sin cuenta, retorno de registro/login, correo no confirmado, sesión vencida, RUT/correo no coincidentes, rol comercial y acceso de otra cuenta. Ningún token consumido confirma una revisión nueva. |
| Relación | Aceptación inicial obligatoria, discrepancia/rechazo, reemplazo, cambio posterior del titular no aceptado y conservación de valor originalmente aceptado. |
| Revisiones | Precarga propia, campos faltantes, actualización personal sin propagación, selección de participaciones, versión vigente y utilizada inequívocas; ninguna mezcla de cinco campos entre revisiones. |
| Recálculo | Diferencia de dato habilita acción; normalización no crea cambios falsos; confirmación idéntica sin botón; nuevos datos pueden mantener score; consumo/idempotencia/carrera con nueva revisión o revocación. |
| Comparación financiera | Aporte positivo, cero por pie, negativo por deuda; ingreso cero, morosidad y relación excluyente; misma UF/tasa/plazo/ahorro; CLP consistente; datos insuficientes; sin writes/IA/I/O adicionales ni mutación de snapshots. |
| Revocación temporal | No uso futuro inmediato; histórico visible antes del corte; ocultación exacta a los 30 días; reloj servidor; refresco/caché/vista abierta; no reconstrucción por totales/narrativas; sin borrar filas. |
| Reemplazo de confirmada | Exclusión atómica al crear sustituta; enlace de reemplazo y actor/fecha trazables; 30 días de consulta desde el reemplazo; fallo de correo/rechazo/expiración de la nueva no reactivan la anterior; revocación posterior no reinicia el plazo; carrera con evaluación o revisión aborta al revalidar. |
| Permisos | Titular propio, co-deudor propio, ejecutivo autorizado, otro tenant, admin inmobiliario/global; API y acceso directo; señal de otras participaciones sin detalles ni filtración al titular. |
| Histórico/legado | Sin cuenta exige nueva vinculación/confirmación para futuro; no inferir origen; conservar evaluaciones; una nueva participación no rehabilita la anterior; coherencia de evaluación vigente frente a correcciones. |
| Frontend | Tarjeta en ruta activa, badge/filtro y combinaciones, estados vacío/carga/error, pendientes solo para titular, revocación, datos desconocidos sin clasificación falsa. |
| SQL | Bootstrap y secuencia completa de migraciones, grants/RLS/RPC, versiones, integridad de evidencia, rollback sin pérdida; fixtures realistas con indicadores completos. |
| Flujo completo | Invitar → registrar/ingresar/verificar → revisar/aceptar relación/consentir → recalcular si cambió → tarjeta/bandeja/ficha → actualizar participación → revocar → corte temporal. |

Ampliar las suites existentes de `test_alg17_cases.py`, `test_co_debtor_scoring_inputs.py`, `tracking/test_co_debtor_confirmation.py`, `tracking/test_staff_co_debtor_projection.py`, `tracking/test_staff_co_debtor_api.py`, seguridad de Edge Function, capacidad y permisos; pruebas de `CoDebtorSection`, `PublicCoDebtorPages`, `ExecutiveCoDebtorSection`, `Recommendations` y servicios frontend. Añadir pruebas conductuales de bandeja/ficha y SQL donde no existan. Las pruebas actuales de redacción usan resultados simplificados: incluir resultados completos, no solo ausencia de nombres de campos.

| Criterio original | Tareas | Evidencia |
| --- | --- | --- |
| E1 — Capacidad Bipersonal | T2, T5–T7, T9 | Procedencia de evaluación, desglose correcto, aporte en UF/CLP positivo/cero/negativo, pantalla activa, históricos y corte de acceso. |
| E2 — Bandeja y expediente | T2, T6, T8–T9 | Badge/filtro coherentes, datos paralelos de la misma evaluación, riesgos existentes, permisos por inmobiliaria y revocación. |
| Ampliación acordada, sin nuevo E | T1–T6, T9 | Cuenta/correo/RUT, relación aceptada, revisiones explícitas, confirmación idéntica, otras participaciones y ventana de 30 días. |

## 13. Condiciones de cierre

- Cumplir E1/E2 y la ampliación acordada, sin presentar una cuenta o un correo como verificación externa de identidad.
- HU27 sigue identificada como pendiente salvo evidencia posterior; HU30 no requiere Google ni implementa toda la gestión de cuentas.
- No alterar pesos, umbrales ni contratos financieros para corregir presentación o una prueba aislada.
- No recalcular históricos automáticamente, borrar snapshots ni mostrar antecedentes fuera de su autorización temporal.
- Resolver y verificar RLS y rutas alternativas; evidencia tanto de API como de acceso directo a base.
- Registrar pruebas ejecutadas, limitaciones de entorno y resolución del fallo previo; no declarar aprobación por inspección estática.
- Documentar y aplicar las nuevas migraciones mediante el proceso del equipo; no modificar las históricas.
- Actualizar documentación de reglas/contrato solo donde cambie el comportamiento implementado, mantener disclaimers y obtener revisión de otra persona.


## 15. Cierre técnico local de T3 (2026-10-21)

Se implementó el contrato cerrado de §9 mediante tres migraciones incrementales, rollbacks que conservan evidencia, selección explícita compartida, referencia canónica en nuevas evaluaciones y corrección del acceso a snapshots/privilegios de perfil. No se modificaron migraciones históricas ni el motor financiero. Las adaptaciones del cliente se limitan a sus lecturas de datos; no hay componentes visuales nuevos o modificados.

El detalle de archivos, restricciones, consumidores, pruebas, limitaciones y secuencia de despliegue está en [T3-PERSISTENCIA.md](T3-PERSISTENCIA.md). No se aplicó SQL remoto ni se inició T4.

**Condición de despliegue:** no aplicar estas migraciones aisladas al entorno activo. Al activarse, la firma HU18 anónima deja de poder confirmar: T4 debe conectar el flujo autenticado y su aceptación de relación al contrato de persistencia en la misma entrega coordinada. Las filas antiguas permanecen legibles; su cuenta o aceptación no se inventan. La seguridad restaurada no debe revertirse a las políticas vulnerables para volver al flujo antiguo.


## 16. T4A — Acceso y retorno autenticado (2026-10-21)

La instrucción posterior divide T4: **T4A** conecta acceso/registro/verificación/retorno y vincula cuenta sin consentimiento financiero; **T4B** deberá conectar relación, antecedentes y confirmación/revisiones. No se adelanta T4B.

Se conserva la ruta `/co-deudor/invitacion`, que reutiliza AuthPanel y Supabase Auth. El retorno admite exclusivamente esa ruta con un identificador aleatorio de contexto; el token no se envía como redirect de Auth. La sesión y el destinatario se revalidan en servidor antes de vincular la cuenta. La RPC nueva usa columnas/locks T3 sin cambiar el modelo ni crear revisiones.

La inspección pública deja de entregar antecedentes financieros. La firma anónima de confirmación también queda bloqueada en Edge; el único resultado de éxito T4A es acceso autorizado, todavía sin consentimiento ni uso financiero.

Ver [T4A-ACCESO.md](T4A-ACCESO.md) para inventario, pruebas y límites: confirmar configuración de correo/redirect en el entorno de despliegue y ejecutar E2E real antes de liberar. No se aplica SQL remoto ni se desarrolla T4B.

## 17. T4B — Revisión y confirmación financiera autenticada (2026-10-21)

Se completa exclusivamente T4B: lectura por cuenta vinculada, prefill propio acotado, edición de cinco antecedentes, aceptación inicial de relación, consentimiento separado y revisión inmutable mediante las operaciones T3. Cada petición revalida identidad/estado; el acceso posterior utiliza participación vinculada sin reutilizar el token consumido. La confirmación no recalcula evaluaciones.

Se conecta a la invitación la relación que el titular ya declaraba. Se conserva la aceptación original al cambiar después la relación. Confirmaciones explícitas coincidentes quedan registradas sin reescribir procedencia histórica ni activar innecesariamente la actualización existente; ese cotejo no implementa scoring ni la comparación de capacidad de T5.

Detalle, inventario, migración incremental sin cambios de tablas, rollback conservador, pruebas y fallas preexistentes: [T4B-CONFIRMACION.md](T4B-CONFIRMACION.md). Cierre técnico local; pendiente E2E integrado y despliegue coordinado. No se aplicó SQL remoto ni se inició T5.

## 18. T5 — Evaluación y aporte financiero (2026-10-21)

Se completa exclusivamente T5 sobre la base limpia f9a0344. La acción explícita HU18 incorpora la revisión vigente y registra complemento_renta=true en su evento; las nuevas evaluaciones guardan clasificación y bipersonal_summary versionado junto con la procedencia canónica T3.

La comparación utiliza dos invocaciones puras de capacity_limits del motor actual, bajo el mismo snapshot de mercado/input efectivo/overrides. Solo se anulan ingreso y deuda complementarios en el escenario individual. Se conservan deltas positivos, cero o negativos en UF/CLP sin redondeo anticipado. No se crea evaluación contrafactual ni hay IA/I/O adicional. Las filas antiguas no se recalculan ni reclasifican al leer.

T3 ya valida revisión/relación/cierre dentro de hu13_commit: no hace falta migración nueva. Verificación: 221 pruebas backend aprobadas y el fallo financiero previo; frontend 850 aprobadas y 2 fallos previos; integración PostgreSQL T3/T4A/T4B/T5 y concurrencia aprobadas. Detalle de contratos, archivos, evidencia y limitaciones en [T5-EVALUACION.md](T5-EVALUACION.md).

Cierre local, sin push/PR o migraciones remotas. T6 continúa pendiente; no se implementan sus proyecciones completas ni pantallas comerciales/tarjeta visual.


## 19. T6 — Proyecciones seguras titular/staff (2026-10-22)

Se implementa un contrato común versionado en co_debtor, derivado de la revisión realmente usada. Titular recibe pendientes/coincidencia; staff recibe datos usados y únicamente has_other_active_participations, nunca detalles o cantidades de otros expedientes. La clasificación, procedencia, aporte persistido, relación y cutoff se resuelven en servidor sin scoring/IA.

Se unifican listado, detalle, historial y seguimiento; se retira el fallback comercial de confirmación actual sin referencia y se cierra el uso de proyección del titular desde la ruta histórica staff. Se refuerza la redacción al instante exacto del primer cierre + 30 días y se añaden respuestas privadas sin caché. Las lecturas se agrupan y paginan sin consultas por lead.

Una prueba local reprodujo un bypass del detector RLS anterior con aliases legacy. La nueva migración 20261022090000_hu30_legacy_snapshot_guard.sql amplía solo ese predicado, reutiliza las políticas T3 y tiene rollback que no restaura la vulnerabilidad. No hay columnas/tablas nuevas ni migraciones históricas editadas o SQL remoto.

Ver contrato, inventario y límites en [T6-PROYECCIONES.md](T6-PROYECCIONES.md). Pruebas: backend 258 aprobadas/1 falla previa; frontend 850/2 previas; PostgreSQL T3–T6, concurrencia y rollback aprobados. Cierre local sin push/PR, fórmulas ni frontend modificados. T7 y T8 continúan pendientes.


## Cierre de T7 — resultados del titular (2026-10-22)

Se implementa únicamente la UI del titular en Recommendations, consumiendo co_debtor/hu30-projection-v1 preservado por la normalización y el fallback de seguimiento. La sección distingue las cuatro clasificaciones de servidor, presenta ingresos/deudas considerados, relación, capacidades y aporte UF/CLP positivo/cero/negativo sin cálculos financieros frontend. Los datos ausentes permanecen desconocidos.

Pendientes/coincidencia se consumen del backend; una sola acción explícita reutiliza la incorporación HU18, bloquea doble envío, refresca la evaluación y muestra éxito/error, incluido score sin cambios. La gestión de invitaciones no duplica el desglose ni atribuye a la evaluación una revisión aún no incorporada.

La vista revalida al abrir/foco y periódicamente; usa el corte temporal entregado por T6, conserva el temporizador durante lecturas lentas e invalida respuestas previas al corte. Ante carga/error no reutiliza datos anteriores; histórico oculto no se reconstruye. Se limpian sesiones/listeners y se descartan respuestas de otra cuenta o superadas. No se modifican fórmulas, backend, RLS, migraciones ni pantallas comerciales.

Ver contrato, inventario y límites en [T7-TITULAR.md](T7-TITULAR.md). Validación: 41 casos nuevos, 62 pruebas enfocadas aprobadas; frontend completo 891 aprobadas/2 fallas previas; build aprobado y Chromium sintético de escritorio/móvil aprobado. Cierre local sin push/PR. T8 y revisión integral T9 quedan pendientes.


## Cierre de T8 — bandeja y detalle staff (2026-10-22)

Se implementa únicamente T8: badge y filtro de participación en DashboardLeads y desglose de titular/co-deudor en LeadDetailModal/ExecutiveCoDebtorSection. La clasificación se consume literalmente de hu30-projection-v1. Solo individual y bipersonal_confirmed entran en sus filtros específicos; declaradas/no verificables quedan en Todos. Bipersonales históricas conservan Con co-deudor, con advertencias de servidor.

Lista y ficha utilizan exclusivamente los endpoints staff T6, sin completar datos financieros desde confirmaciones actuales ni snapshots previos. La ficha consume evaluación/proyección/historial de una misma respuesta autorizada. Aportes UF/CLP, relación, revisión legible, riesgos/severidades y señal estrictamente booleana de otras participaciones se presentan sin cálculos nuevos. El contexto y temporizador de refresco evitan mezclar leads o restaurar datos tras el corte; no se cambia autorización ni el flujo del titular.

Detalle, inventario y límites en [T8-STAFF.md](T8-STAFF.md). Verificación: 52 pruebas T8 aprobadas; frontend completo 937 aprobadas/2 fallas previas/0 omitidas; build y Chromium sintético de escritorio/móvil aprobados. Sin backend, motor, RLS o migraciones modificados, sin push/PR. La validación integral siguiente, referida por el usuario como T9A y agrupada todavía en T9, permanece pendiente; no se inicia aquí.


## Cierre de T9A — validación integral local (2026-10-23)

Se valida únicamente T9A sobre la base limpia ec2fdf0. Se agrega un recorrido reproducible con GoTrue/Auth, correo de verificación, PostgREST/RLS, PostgreSQL, servicios FastAPI/motor y rutas reales de la SPA en Chromium desktop/móvil. Mercado y reloj de proyección son adaptadores de prueba explícitos; el handler Edge se ejecuta con transporte Node, por lo que no acredita Deno/función hospedada. No se usa el entorno remoto.

Se corrigen cinco regresiones HU30 y un riesgo heredado necesario para integrar T8: retorno de invitación sobrescrito por otra pestaña, callbacks financieros tardíos tras desmontar, promise staff compartida entre cuentas, pérdida del enriquecimiento de contacto en T8, upsert de perfil staff bloqueado por el trigger de inserción T3 y relación PostgREST ambigua al consultar otras participaciones. Cada corrección tiene regresión; se conserva la protección de roles y la proyección financiera autorizada.

La prueba real cubre registro/verificación/login/cambio de cuenta, revisión y consentimiento, pérdida de respuesta tras commit/retry sin duplicación, revisión coincidente/modificada/concurrente, incorporación explícita, aportes positivo/cero/negativo, legado, aislamiento financiero, todos los estados, revocación/reemplazo y cutoff al microsegundo sin modificar snapshots. Backend: 260 aprobadas/1 falla previa; frontend: 945/2 previas; SQL y rollback aprobados; build aprobado; trece etapas E2E funcionales aprobadas, sin pageerrors/warnings React. Helpers Edge mantienen 11/1 previo y schema drift 8 diferencias previas.

Se reproduce por separado una deuda anterior a HU30: list_lead_contacts permite consultar metadatos de otro tenant por UUID. Los endpoints financieros sí deniegan ese acceso. Se documenta como bloqueo de liberación; no se amplía T9A a corregir el RPC histórico ni se afirma aislamiento global aprobado. No hay cambios de fórmulas, SQL/RLS/migraciones, push o PR.

Detalle de bugs, archivos, comandos, resultados, adaptadores y límites: [T9A-REGRESION.md](T9A-REGRESION.md). T9A cerrada como validación/corrección local con hallazgos explícitos, sin iniciar T9B. El PLAN mantiene T9 como agrupación: siguen pendientes revisión por otra persona, resolución de deudas con sus responsables y homologación/despliegue coordinado del runtime, orígenes y correo cuando se autorice. No se declara lista la liberación.


## T9B — hardening y preparación local de release (2026-10-23)

Se completa solo T9B sobre base limpia fd334bc. La migración incremental 20261023090000_hu30_staff_contact_isolation.sql alinea list_lead_contacts y lecturas de historial/reportes administrativos con el alcance por lead de T6. El actor y tenant provienen del servidor; solo admin sin tenant es global. No se revelan contactos ajenos/inexistentes con diferencias innecesarias de error. Se protegen derivados de evaluaciones con complemento que salían por el reporte crudo y se agregan cabeceras privadas a las RPC. Rollback conservador deshabilita esas lecturas, sin restaurar fugas ni borrar evidencia.

La función Edge restringe Origin, aplica no-store a respuestas/errores/preflight y fija el SDK ya homologado localmente. Tracking conserva cabeceras privadas también en denegaciones explícitas. No hay fórmulas/UI/históricos modificados ni migraciones históricas editadas. Se resuelven dos diferencias del esquema relacionadas con HU30; las seis restantes de catálogo/roles/HU19 se clasifican y no se sincronizan a ciegas.

Pruebas: backend 261/1 previa; frontend 945/2 previas; SQL/rollback 12 etapas PASS; seguridad Edge nueva 4/0 y helpers combinados 15/1 previa; build aprobado. Se repite el recorrido real T9A con aislamiento de contactos obligatorio: 15 etapas PASS tanto en adaptador Node como en Supabase Edge Runtime/Deno nativo local, con dependencias offline y los límites explicitados. No se afirma homologación del ambiente hospedado, grafo remoto ni entregabilidad real.

Ver [T9B-HARDENING.md](T9B-HARDENING.md) para scope, clasificación individual de drift, archivos, configuración y release/rollback. T9B cerrada como preparación local; el cierre final HU30, revisión por otra persona y despliegue/homologación autorizados siguen pendientes. Sin SQL remoto, push/PR ni avance a HU23.


## Cierre final técnico y documental (2026-10-23)

Se contrastaron PLAN, informes T3–T9B y contratos/artefactos actuales, sin modificar código ni comportamiento. El inventario consolidado, DoD por criterio original, siete pares migración/rollback, dependencias de activación, configuración, cifras finales, límites de validación y checklists de revisión/release se encuentran en [HU30-CIERRE.md](HU30-CIERRE.md).

| Etapa | Estado actual |
| --- | --- |
| T1 — Base/prerrequisitos | Cerrada: base develop 14738e185c4d77794d4fa2c9e57dcbeffc47dcca y branch propia. |
| T2 — Contrato | Cerrada: decisiones de participación/revisiones/relación/historia acordadas. |
| T3 — Persistencia/autorización | Cerrada localmente; entrega coordinada obligatoria con adaptador autenticado. |
| T4A — Acceso/retorno | Cerrada y recorrida con Auth real local en T9A/T9B. |
| T4B — Confirmación | Cerrada: revisión autenticada, relación/consentimiento y concurrencia. |
| T5 — Evaluación/aporte | Cerrada: incorporación explícita, procedencia y comparación pura. |
| T6 — Proyecciones | Cerrada: contrato común y redacción/alcance de servidor. |
| T7 — Titular | Cerrada: tarjeta/pendientes/feedback y privacidad. |
| T8 — Staff | Cerrada: badge/filtro/ficha; contactos aislados en T9B. |
| T9A — Regresión integral | Cerrada con evidencia local y bugs corregidos; hallazgo de contactos resuelto posteriormente en T9B. |
| T9B — Hardening | Cerrada localmente: contactos/history/reportes, no-store/orígenes y runtime Deno nativo. |
| Cierre final solicitado | Completo en documentación y preparación para revisión, sin despliegue ni aprobación externa. |
| T9 — Revisión/entrega externa originalmente agrupadas | Pendiente externo: revisión por otra persona, homologación y aplicación de migraciones por proceso del equipo. |

Última evidencia funcional T9B: backend relacionado 261 aprobadas/1 previa; frontend completo 945/2 previas; SQL/concurrencia/rollback 12 etapas PASS; E2E Node y Deno local 15 etapas PASS cada uno; build aprobado. Se mantienen seis diferencias externas de esquema y 20 advertencias históricas de rollback. No se declaran suites globales verdes ni producción certificada.

Este cierre sólo requiere sanity documental/inventario y git diff --check, sin repetir batería pesada/build/E2E porque no modifica código. T1–T9B y documentación quedan listos para revisión/PR; las condiciones externas de §13 se identifican sin marcarlas cumplidas. No hay SQL remoto, push, PR, merge ni avance a HU23.
