# HU30 — T4A: acceso autenticado y retorno a la invitación

Base de inicio: `9cd3aca`, rama `feat/hu30-capacidad-bipersonal`, árbol limpio. T1–T3 cerrados y leídos nuevamente. T4A mantiene el contrato T3: únicamente vinculación de cuenta, sin confirmación, consentimiento financiero, revisión ni evaluación nueva.

## Rutas y flujo

- Invitación: `/co-deudor/invitacion`; gestión HU18: `/co-deudor/gestion` y `/co-deudor/consentimiento`.
- Login y registro generales: `/login` y `/registro`, con AuthPanel. En invitaciones se reutiliza ese mismo componente dentro de su ruta, evitando el redirect general por perfil o migración de una evaluación anónima.
- Auth existente: `signInWithPassword`, `signUp`, `getSession`, `getUser`. El cliente instalado usa retorno implícito y detección de sesión en URL por defecto. No se rediseña Auth ni se agrega Google/recuperación de contraseña.
- RUT y rol: `profiles.rut` y `profiles.role`; email confirmado: `auth.users.email_confirmed_at`. El registro conserva el RUT de metadata hasta completar el perfil en una sesión auténtica. Metadata enviada por el navegador no autoriza participación.

1. Abrir enlace: guardar contexto mínimo y retirar el token de la barra de dirección.
2. Consultar estado actual sin devolver finanzas/identidad del destinatario.
3. Si falta sesión, mostrar AuthPanel con contexto conservado; permite login o registro.
4. Si Auth registra sin sesión, mostrar correo pendiente y no intentar escribir perfil bajo RLS. Login rechazado por `email_not_confirmed` también muestra esa situación.
5. El correo de verificación vuelve a la ruta fija de invitación con un nonce. Supabase completa su sesión; entonces se obtiene usuario mediante Auth, se completa el perfil propio y se revalida la invitación.
6. Edge valida la sesión con `admin.auth.getUser(jwt)`; una RPC del servidor comprueba destinatario y estado nuevamente bajo locks.
7. Si corresponde, vincular cuenta y mostrar acceso autorizado. No aparece formulario financiero ni botón de confirmar antecedentes. Ese siguiente paso pertenece a T4B.

El consumidor general de `signUp` en App contempla también la respuesta sin sesión para no asumir un perfil inexistente. Es una adaptación de contrato de cuatro líneas, sin modificar dashboard ni detalle comercial.

## Contexto y retorno

`coDebtorAuthContext.js` conservaba al cierre T4A una sola entrada en localStorage: token original, nonce UUID aleatorio y fecha. No guarda correo, RUT, lead, finanzas o destino arbitrario. Tiene TTL técnico de 24 horas; si vence al leer se elimina. No renueva la invitación ni sustituye su expiración de servidor.

**Actualización integrada T9A:** el contrato final guarda una entrada por nonce, conserva lectura compatible del formato anterior y purga contextos vencidos sin invalidar otras pestañas. Otra invitación ya no reemplaza un contexto vigente. La entrada única descrita aquí corresponde a la implementación inicial T4A; ver [T9A-REGRESION.md](T9A-REGRESION.md) y [HU30-CIERRE.md](HU30-CIERRE.md).

LocalStorage permite abrir la verificación en otra pestaña del mismo navegador. En el contrato final, cada contexto se resuelve con su nonce exacto y otra invitación abierta conserva los contextos vigentes anteriores. Un retorno perdido, vencido, manipulado o abierto en otro navegador/perfil requiere volver a abrir el enlace original. No se recupera por email/RUT ni se adivina otra invitación.

La URL de verificación contiene únicamente `/co-deudor/invitacion?context=<nonce>` del origin actual. No se admite `next`, `redirect`, URL externa, esquema javascript, backslash o destino provisto por el usuario. El nonce nunca autoriza por sí solo: cualquier token leído se valida con la sesión y destinatario en base.

Las rutas de co-deudor no cargan analytics; se fija `no-referrer`. Los errores de perfil dejan de registrar message/detail/hint que podrían incluir filas sensibles; solo conservan códigos permitidos. Los nuevos errores de acceso son genéricos y no incluyen email/RUT/token.

## Backend y persistencia

Nueva acción Edge: `authorize_invitation`, body limitado a action/token. No acepta actor, destinatario, rol, RUT, ID de participación ni URL de retorno. La identidad sale de Auth, nunca de esos campos.

Nueva migración: `20261021130000_hu30_authenticated_access.sql`. Solo agrega una función, **sin modificar tablas/columnas/modelo T3**:

`hu30_authorize_invitation(p_token_digest, p_actor)`:

- Exclusiva de service_role. Su actor procede de la sesión verificada en Edge.
- Resuelve token digest, bloquea perfil titular y participación mediante el helper T3.
- Revalida estado pending, expiración, token no consumido y ausencia de cierre; confirmed también rechaza reutilizar el token inicial.
- Obtiene cuenta/email/confirmación desde Auth y rol/RUT del perfil persistido.
- Exige usuario, email normalizado coincidente y RUT válido/coincidente. RUT faltante legado no se infiere. Cuenta ya vinculada distinta produce la misma denegación genérica que los otros desacuerdos de identidad.
- Exige correo confirmado. Si coincide la identidad pero falta verificación, indica únicamente ese estado de la cuenta propia.
- Escribe participant_user_id solo si es null; misma cuenta puede repetir sin actualizar estado ni generar filas adicionales.
- Devuelve autorización, ID de participación, estado pending y expiración; no entrega finanzas ni destinatario.

Estados expired/replaced/revoked/declined/confirmed, token desconocido o consumido impiden continuar. Un estado que cambió durante login se rechaza aunque la inspección inicial fuera válida. El enlace no reactiva ni cambia estados automáticamente.

El wrapper frontend revalida en retorno, cambio de sesión, al recuperar foco y mientras muestra autorización. No reinicia formularios durante escritura o espera de correo. Toda operación posterior de T4B deberá revalidar nuevamente; el indicador visual de acceso no es una credencial.

`schema.sql` refleja la función. Su rollback revoca ejecución sin borrar vínculos ya establecidos ni evidencia. Nunca restaura confirmaciones anónimas.

## Compatibilidad y alcance

Se mantienen tablas, estados, invitaciones, historial, expiración, rechazo y revocación HU18; gestión de consentimiento conserva su ruta/contrato. Las filas antiguas no se vinculan automáticamente ni cambian sus evaluaciones. Una invitación pendiente antigua con email/RUT suficientes puede vincularse; identidad incompleta debe corregirse/reemplazarse según el PLAN.

Cambio deliberado de privacidad: inspect_invitation ya no entrega los cinco datos declarados ni habilita can_submit. Se actualizan sus expectativas de test por esta regla, sin cambiar fechas, scoring ni expectativas financieras anteriores. Las vistas/parsers financieros HU18 se conservan para reutilizar en T4B, pero no se montan en la ruta T4A.

El adaptador anónimo de submit_confirmation se retira y devuelve conflicto explícito incluso si aún no se aplicó SQL T3. Todavía no se ofrece un reemplazo financiero autenticado: esa implementación requiere T4B y aceptación de relación. T3/T4A no constituyen por sí solos una entrega liberable del flujo de confirmación completo.

No se modifican DashboardLeads, LeadDetailModal, Recommendations, motor financiero ni dependencias.

## Verificación

Pruebas nuevas:

- `coDebtorAuthContext.test.js`: retorno fijo, contexto opaco, otra pestaña, vencimiento, corrupción y redirects externos.
- `coDebtorAuthenticatedAccess.test.js`: sesión existente, login/verificación, estados terminales, sesión expirada, cuenta incorrecta y cierre durante autenticación.
- `coDebtorEdgeAccess.test.js`: actor de Auth, digest, campos manipulados, sesión inválida y errores sin información sensible. Ejecuta el adaptador Edge sin servidor remoto.
- `invitationAuthSession.test.js`: registro con/sin sesión, callback, perfil solo después de autenticar y correo pendiente en login.
- `AuthenticatedCoDebtorInvitationPage.test.jsx`: estados de UI sin formularios financieros.
- `AuthPanel.invitation.test.jsx`: submit real del componente, espera de correo sin onAuth y retorno después de login; usa el harness de hooks ya empleado en el proyecto.
- `hu30_authenticated_access.sql`: identidad/RUT/rol/cuenta, email confirmado, idempotencia, token consumido/manipulado, estados, sustitución durante acceso y cero revisiones/consentimientos nuevos.
- Guardia estática backend adicional contra fallback anónimo.

Comandos desde raíz:

```bash
# Regresión backend: mismo conjunto documentado en T3-PERSISTENCIA.md.
backend/.venv/bin/python -m pytest backend/tests/tracking \
 backend/tests/test_co_debtor_scoring_inputs.py backend/tests/test_alg17_cases.py \
 backend/tests/test_evaluations_grants.py backend/tests/test_hu18_decline_migration.py \
 backend/tests/test_hu18_edge_function_security.py backend/tests/test_hu13_deployment_routes.py -q
python3 scripts/test-hu30-persistence.py
node scripts/check-schema-drift.js
# Node 22.23.2, desde frontend:
npm test
npm run build
# Helpers Edge sin instalar Deno (harness compatible con los dos archivos):
node --experimental-strip-types scripts/test-hu18-helpers.mjs \
 "$PWD/supabase/functions/co-debtor-consent/helpers.test.ts" \
 "$PWD/supabase/functions/co-debtor-consent/email.test.ts"
```

Resultados finales:

- Backend relacionado: **183 aprobados, 1 fallo previo**, cero omitidos/errores de colección.
- Frontend completo: **794 aprobados, 2 fallos previos**, cero omitidos; incluye **39 pruebas nuevas** de T4A.
- PostgreSQL 16 local: pasan T3, acceso T4A, concurrencia y rollback; el fingerprint incluye cuentas vinculadas y evidencia financiera/eventos. Contenedores exclusivos eliminados al terminar.
- Build: aprobado, conservando avisos existentes de bundle/imports.
- Helpers/email con harness Node: **11 aprobados y 1 fallo previo** en el test de gestión HU18. No es una ejecución del runtime Deno.
- Deriva de esquema: permanecen las ocho diferencias ajenas anteriores; ningún objeto HU30 nuevo divergente.

Fallos conservados: financiero 2200 frente a 2737.185; frontend invitación con fecha vencida; frontend RUT 17.493.972-k. Al ejecutar por primera vez el harness de helpers se observó además el test de management que pasa Date donde su contrato espera estado. Se reprodujo con los archivos de 9cd3aca: allí fallaban tres pruebas, incluidas las dos de inspección pública cuyo contrato T4A sí cambia. Gestión permanece intacta; no se maquilla su expectativa.

## Cierre y siguiente paso

**T4A queda cerrada en código y verificación local.** No se aplican migraciones remotas, ni se hace push/PR. No se ejecutó un correo real o sesión real contra el despliegue Supabase. Se mantienen las limitaciones del bootstrap SQL T3: primitivas Auth de test y adaptaciones explícitas de la base core, no validación íntegra de toda la cadena histórica.

Antes de liberar deben comprobarse configuración de correo y aceptación del callback de invitación en los redirects permitidos del entorno Supabase, plantilla de verificación y prueba E2E real. El config.toml actual solo configura verify_jwt de la Edge Function; no prueba la configuración de correo/redirect alojada. No se modifica esa configuración remotamente.

T4B debe implementar: revisión/aceptación de relación, carga autorizada de antecedentes propios/de participación, confirmación financiera autenticada con consentimiento explícito e idempotencia mediante hu30_append_confirmation, revisiones sucesivas seleccionadas por participación y adaptación de los enlaces de gestión/participaciones. Debe revalidar sesión/estado en cada operación y mantener fuera los datos de otros titulares. La comparación financiera, tarjeta, badge/filtro y nuevo criterio del botón siguen fuera de T4A.

## Archivos de T4A

- `backend/tests/test_hu18_edge_function_security.py`
- `docs/stories/HU30-capacidad-bipersonal/PLAN.md`
- `frontend/index.html`
- `frontend/src/App.jsx`
- `frontend/src/components/AuthPanel.jsx`
- `frontend/src/components/PublicCoDebtorPages.jsx`
- `frontend/src/services/auth.js`
- `frontend/src/services/coDebtorService.js`
- `frontend/src/services/profileService.js`
- `scripts/test-hu30-persistence.py`
- `supabase/functions/co-debtor-consent/helpers.test.ts`
- `supabase/functions/co-debtor-consent/helpers.ts`
- `supabase/functions/co-debtor-consent/index.ts`
- `supabase/schema.sql`
- `docs/stories/HU30-capacidad-bipersonal/T4A-ACCESO.md`
- `frontend/src/components/AuthPanel.invitation.test.jsx`
- `frontend/src/components/AuthenticatedCoDebtorInvitationPage.jsx`
- `frontend/src/components/AuthenticatedCoDebtorInvitationPage.test.jsx`
- `frontend/src/services/__tests__/coDebtorAuthContext.test.js`
- `frontend/src/services/__tests__/coDebtorAuthenticatedAccess.test.js`
- `frontend/src/services/__tests__/coDebtorEdgeAccess.test.js`
- `frontend/src/services/__tests__/invitationAuthSession.test.js`
- `frontend/src/services/coDebtorAccess.js`
- `frontend/src/services/coDebtorAuthContext.js`
- `scripts/test-hu18-helpers.mjs`
- `supabase/functions/co-debtor-consent/access.ts`
- `supabase/migrations/20261021130000_hu30_authenticated_access.sql`
- `supabase/rollback/20261021130000_hu30_authenticated_access_rollback.sql`
- `supabase/tests/hu30_authenticated_access.sql`
