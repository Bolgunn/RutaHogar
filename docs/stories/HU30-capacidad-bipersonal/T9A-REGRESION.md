# HU30 — T9A: validación integral y regresión local

Fecha: 2026-10-23. Branch `feat/hu30-capacidad-bipersonal`, base inicial limpia `ec2fdf0` (cierre de T8). Leídos PLAN, T6-PROYECCIONES, T7-TITULAR, T8-STAFF e instrucciones generales/QA/backend/frontend. Se trabaja exclusivamente en T9A; no se inicia T9B.

## Alcance y entorno

Se añade un recorrido reproducible con usuarios, inmobiliarias, proyectos, correo y datos financieros **sintéticos**, en recursos locales desechables. No se usan las credenciales del proyecto hospedado, no se envían correos externos, no se aplica SQL remoto y no se cambian dependencias, fórmulas, RLS ni migraciones.

`python3 scripts/test-hu30-e2e.py` levanta PostgreSQL 16, GoTrue v2.177.0 (Supabase Auth real, confirmación de correo activada), PostgREST v12.2.12, SMTP/captura de correos, FastAPI y Vite. Chromium visita las rutas reales de la SPA para invitación, resultados y bandeja. El único HTML auxiliar expone los servicios de autenticación reales para preparar cambios de sesión; no reemplaza esas pantallas ni sus respuestas. Se eliminan contenedores, red y procesos al terminar.

Adaptadores explícitos, que limitan lo acreditado:

- El handler Edge de producción se ejecuta con Node 22.23.2 y un transporte HTTP compatible; se sustituyen solamente imports de `serve` y del SDK por los instalados localmente. **No es ejecución en Deno/Edge Runtime ni despliegue de la función hospedada.** Auth, RPC, RLS y SQL sí se ejecutan realmente; no se interceptan sus respuestas para simular autorización. La única inyección de fallo descarta una respuesta después de comprobar que la confirmación real ya quedó guardada, para verificar su reintento idempotente.
- Resend se dirige al buzón local; el correo de verificación lo envía GoTrue por SMTP real a ese mismo buzón. Fuentes/recursos externos de la SPA se sustituyen por respuestas estáticas vacías para evitar red externa.
- Mercado/UF usan la fixture determinista existente de tracking, manteniendo el motor real. No se consulta BCCh ni IA. El reloj de las proyecciones puede fijarse para probar el cutoff sin esperar 30 días; no se altera el reloj de Auth ni se simula una sesión válida.
- El bootstrap parte de la misma fixture HU18 de `test-hu30-persistence.py`, excluye RAG/pgvector y agrega `housing_plan` para la función histórica. Aplica además las migraciones existentes de nombres del perfil, campos comerciales del catálogo y contactos, y las seis HU30. GoTrue proporciona su esquema Auth; las ACL de tablas públicas equivalen al bootstrap habitual Supabase y las políticas RLS siguen vigentes. **No acredita ejecutar toda la cadena histórica desde cero ni resolver la deriva conocida del schema.**

La configuración temporal tiene permisos 0600, claves locales aleatorias y endpoints loopback. Las capturas y logs quedan únicamente en `/tmp`; no se versionan tokens, contraseñas, correos reales ni archivos `.env`.

## Bugs de integración HU30 reproducidos y corregidos

| Hallazgo | Causa y corrección mínima | Evidencia de regresión |
| --- | --- | --- |
| Dos pestañas invalidaban el retorno de la primera invitación | Un único registro localStorage se sobrescribía. Se guarda por nonce, se mantiene lectura del formato anterior y se purgan contextos vencidos sin invalidar otro vigente. | Prueba fallida antes del cambio; unitarios y dos pestañas Chromium con recarga/registro/verificación. |
| Confirmación tardía ejecutaba callbacks después de salir de la revisión | El submit no comprobaba el ciclo de vida. Lecturas manuales, confirmación y decisiones descartan resultados/callbacks de un montaje anterior. | Prueba fallida antes del cambio; resolución de escritura después del cleanup no llama `onConfirmed`. |
| Una consulta staff en vuelo podía compartirse entre cuentas diferentes | Riesgo heredado del servicio reutilizado (767696f), incorporado al camino T8 al restaurar contactos: promise global única. Se agrupa por user_id autenticado y se pasa `expectedUserId` al transporte antes de enviar. | Prueba fallida antes del cambio; A/B aislados, misma cuenta sigue agrupando, cambio de sesión impide el request. |
| Bandeja T8 perdía correo/confiabilidad y el enriquecimiento de contacto existente | Normalizaba directamente la proyección sin pasar por el servicio de evaluaciones. Usa `getEvaluations`, conservando la misma proyección financiera staff y el RPC existente para metadatos del contacto. | Test del consumidor y listado real con `owner@hu30.invalid`; búsqueda/filtros no dependen del email nulo en evaluations. |
| Completar un perfil staff existente activaba la prohibición T3 de insertar privilegios | `upsert` ejecuta BEFORE INSERT incluso con ON CONFLICT. Los perfiles existentes se actualizan; los nuevos conservan el camino de alta y la protección del servidor. Se preserva created_at del existente. | 403 real en PostgREST antes del cambio; unitario y sesión staff real después. El intento de autoescalar rol sigue bloqueado. |
| Listado staff fallaba al consultar otras participaciones | El embed de confirmaciones/eventos era ambiguo tras agregar las FK de revisión. PostgREST respondía 300/PGRST201 y el repositorio lo interpretaba como filas, produciendo AttributeError/500. Se nombran las dos FK y las respuestas no exitosas desde 300 se tratan como error de persistencia. | Fallo real FastAPI/PostgREST antes del cambio; dos tests backend y listado/detalle reales, señal booleana false/true. |

Cinco hallazgos corresponden a cambios HU30; el agrupamiento global es anterior y se corrige mínimamente porque el consumidor T8 restaurado reutiliza ese servicio y no puede introducir el cruce de cuentas. No se aborda una limpieza global del módulo.

No se debilitan restricciones para hacer pasar las pruebas. No se cambian contratos financieros, se recalculan históricos ni se corrige deuda ajena mediante migraciones.

## Recorrido y matriz de evidencia

| Área | Verificado |
| --- | --- |
| Flujo principal real | Titular con evaluación individual → invitación/mail → registro UI → sin sesión mientras falta verificar → correo GoTrue abierto en otra pestaña → retorno/identidad/RUT/vínculo → cinco antecedentes/relación/consentimiento → doble click crea una revisión → titular pendiente → acción explícita → nueva evaluación → resultados SPA → bandeja/ficha SPA. |
| Auth | Cuenta equivocada bloqueada sin detalle; cambio de cuenta y login por contraseña retornan a la misma participación. Correo sin verificar no obtiene sesión. Logout real invalida la reutilización del token aún firmado. Un token firmado con la clave local, cuyo exp se adelanta al pasado partiendo de una sesión válida, es rechazado por Auth real. No se afirma haber esperado una hora ni probado correos/redirects del proyecto remoto. |
| Identidad/aislamiento | Otro titular obtiene lista propia vacía; otro co-deudor y rol staff no leen/usan la participación; cambiar el RUT del perfil sintético bloquea la lectura y restaurarlo permite continuar. Staff de otra inmobiliaria y rol usuario no acceden al endpoint financiero. Staff no lee snapshots crudos; el usuario no puede cambiar su propio rol a admin. SQL cubre también admin inmobiliario/global. **El RPC histórico de contactos tiene una deuda separada descrita abajo.** |
| Revisiones | Misma request concurrente/retry registra una sola revisión posterior coincidente; no crea evaluación ni activa actualización. Dos operaciones distintas desde la misma versión: una confirma, otra recibe conflicto; no hay versión repetida. La evaluación conserva la referencia a v1 aunque aparezcan v2/v3. Además, se pierde deliberadamente la primera respuesta exitosa de confirmación: la UI muestra error, reintenta la misma operación y obtiene la misma revisión, sin duplicarla. |
| Estados | Pending y confirmed en el recorrido; decline autenticado y posterior lectura bloqueada; expire mediante rutina existente y enlace bloqueado; revocación y reemplazo excluyen nuevas incorporaciones inmediatamente. Se conserva legado sin inventar cuenta/procedencia. |
| Clasificación/aporte | Individual, bipersonal confirmado, declarado y snapshot legacy sin provenance no verificable. Positivo, cero y negativo pasan por motor → SQL → proyección titular/staff; no se fuerza cero ni se inventa procedencia. Capacidades iguales en ambas proyecciones y UF/CLP del snapshot coherentes. Otras participaciones se exponen solo como booleano, sin IDs de la otra participación/persona. |
| Histórico | Huellas MD5 del snapshot anterior y del bipersonal permanecen idénticas tras confirmaciones, lectura y revocación. Detalle visible un microsegundo antes del cutoff y oculto exactamente en él. Reemplazo seguido de revocación no cambia el primer cierre ni su cutoff. No se borra/rewrite la evidencia. |
| Privacidad UI | El foco vuelve a consultar el detalle; al corte desaparecen ingreso/deuda/relación del co-deudor. No se reconstruyen desde el listado o props anteriores. Backend y tests de componentes cubren derivados, narrativas y valores residuales. |
| Carreras SQL | Confirmaciones concurrentes, incorporación concurrente/retry, revisión o relación cambiada y revocación/reemplazo antes del commit se validan con PostgreSQL real en la suite SQL. Una evaluación/evento de incorporación y una revisión por operación lógica. |
| UI | Invitación/resultados/bandeja/ficha en Chromium desktop 1280×960 y móvil 390×844, las tres opciones exactas de filtro, vacío individual, contacto, carga/actualización, refresco y redacción. Unitarios cubren errores, opcionales, cambio de lead/cuenta y respuestas tardías. Las notificaciones existentes se cierran mediante sus botones antes de abrir una tarjeta móvil; no se fuerza el click ni se elimina el overlay por DOM. |

## Suites y resultados

| Suite | Resultado |
| --- | --- |
| Backend relevante completo (tracking/HU18/T3–T6, scoring complementario/ALG17, grants/Edge security/deployment routes, score profesional) | **260 aprobadas, 1 falla previa, 0 omitidas**. Dos casos nuevos. Advertencia previa de Operation ID duplicado. |
| Frontend completo, Node 22.23.2 | **945 aprobadas, 2 fallas previas, 0 omitidas**; 947 casos, 88 archivos. Ocho casos nuevos respecto de T8. |
| PostgreSQL T3–T6 y contratos T4A/T4B/T5 | Diez etapas PASS: fixture legacy, migraciones, RLS/roles, guard de aliases T6, vínculo, confirmación, concurrencia de revisión, guard de commit y concurrencia de incorporación, rollback sin perder evidencia. T7/T8 no agregan SQL. |
| Chromium + Auth/PostgREST/FastAPI/SQL reales locales | Trece etapas funcionales PASS y matrices anteriores, con hallazgo externo de contactos explícito; sin pageerrors ni warnings de React. El 403 provocado por cuenta incorrecta y el fallo de red deliberado aparecen en consola como resultados esperados. |
| Build Vite | Aprobado. Persisten advertencias previas de bundle/import estático-dinámico de favoritesService/tiempos de plugins. |
| Helpers Edge bajo adaptador Node | **11 aprobadas, 1 falla previa** en `managementPublicContext` (fecha fija/estado). Deno no instalado. |
| `check-schema-drift.js` | Mantiene **8 diferencias previas: 2 objetos ausentes, 6 divergentes**, y advertencias de rollbacks históricos faltantes. No se modifica schema/migraciones para maquillarlas. |

Comandos desde la raíz, usando Node de `.nvmrc` (o su ruta absoluta cuando el PATH local difiere):

```bash
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest backend/tests/tracking backend/tests/test_co_debtor_scoring_inputs.py backend/tests/test_alg17_cases.py backend/tests/test_evaluations_grants.py backend/tests/test_hu18_decline_migration.py backend/tests/test_hu18_edge_function_security.py backend/tests/test_hu13_deployment_routes.py backend/tests/test_score_professional.py -q -o cache_dir=/tmp/hu30-t9a-pytest
node frontend/node_modules/vitest/vitest.mjs run --root frontend
python3 scripts/test-hu30-persistence.py
python3 scripts/test-hu30-e2e.py
node --experimental-strip-types scripts/test-hu18-helpers.mjs supabase/functions/co-debtor-consent/helpers.test.ts supabase/functions/co-debtor-consent/email.test.ts
node scripts/check-schema-drift.js
# Desde frontend:
node node_modules/vite/bin/vite.js build
```

Requisitos del recorrido: Docker y sus imágenes locales `postgres:16-alpine`, `supabase/gotrue:v2.177.0`, `postgrest/postgrest:v12.2.12`, `python:3.13-slim`; dependencias frontend y Chromium Playwright instalados, venv backend existente. El script no instala ni actualiza dependencias y no carga `.env` para elegir destinos. Fuerza todos los servicios Supabase locales antes de iniciar procesos que puedan leer dotenv.

## Fallas previas conservadas

- `test_insufficient_down_payment_is_identical_before_and_after_confirmation`: espera 2200 UF y obtiene aproximadamente 2737.185; no se toca test ni motor.
- `coDebtorService.test.js`: fecha fija de invitación pending ya vencida.
- `chileanRut.test.js`: trata `17.493.972-k`, inválido, como válido.
- Helper HU18 de gestión con fecha fija y las ocho diferencias del schema ya documentadas.

## Deuda externa y límites de liberación

**Hallazgo reproducido de autorización anterior a HU30:** `supabase/migrations/20261008150000_lead_contacts_email.sql` permite al staff llamar `list_lead_contacts(uuid[])` con IDs de otra inmobiliaria; comprueba rol comercial, pero no tenant. En el entorno local un ejecutivo ajeno obtiene el contacto sintético aunque `/tracking/staff/leads/{id}` lo rechaza con 403 y la lectura directa de evaluations no devuelve snapshots. Afecta nombre/email/RUT/teléfono/confiabilidad del RPC existente, no se presenta como aislamiento global aprobado. Requiere corrección acotada independiente y regresión por inmobiliaria **antes de liberar**, sin ensanchar T9A a un refactor global. Restaurar el enriquecimiento de T8 no crea este bypass: ya era una capacidad directa del RPC anterior y sigue siendo auditada como deuda.

Se observan lecturas redundantes del contenedor App/useLeads además de las revalidaciones de las vistas, ya descritas en T8. Conteo final del navegador: 8 GET de evaluaciones propias, 2 GET de gestión del co-deudor, 2 GET del listado staff y 2 GET de ficha, incluyendo inicio, retorno, foco y refresco; **1 POST de incorporación**. Las lecturas solapadas no se presentan como cero requests redundantes y no son confirmaciones/evaluaciones duplicadas. Las notificaciones flotantes existentes pueden cubrir una tarjeta en móvil y son descartables; no se rediseñan aquí. Los rechazos por cuenta incorrecta y la respuesta de confirmación perdida son fallos controlados esperados, no una consola sin ningún error de red/4xx.

Falta comprobar el runtime Deno/Edge desplegado, allowlist y plantillas/SMTP reales de Supabase, origen público/HTTPS y transporte del correo en el ambiente autorizado. No se acredita Google/HU27. La fixture local no reemplaza la revisión de deriva/bootstrap ni la homologación de despliegue. No se aplicó SQL remoto, push o PR.

## Archivos

Producción (solo correcciones reproducidas): `backend/app/tracking/repository.py`; frontend `CoDebtorParticipationReview.jsx`, `DashboardLeads.jsx`, `coDebtorAuthContext.js`, `evaluationService.js`, `trackingService.js`, `profileService.js`.

Pruebas: `backend/tests/tracking/test_hu30_safe_projections.py`; frontend `CoDebtorParticipationReview.test.jsx`, `DashboardLeads.test.jsx`, `coDebtorAuthContext.test.js`, `trackingServiceRevokedSession.test.js`, `staffEvaluationIsolation.test.js`, `profilePersistence.test.js`.

Harness nuevo: `scripts/test-hu30-e2e.py`, `scripts/hu30-e2e/backend.py`, `scripts/hu30-e2e/edge-transport.mjs`, `scripts/hu30-e2e/browser.mjs`. Documentación: PLAN y este informe.

## Cierre y T9B

T9A queda cerrada **como validación y corrección local**, con fallas previas y deuda externa identificadas; no equivale a autorización de liberación ni aprobación de aislamiento de contactos. Las cinco regresiones HU30 y el riesgo del servicio heredado necesario para integrar T8 quedan corregidos con cobertura. No hay migraciones nuevas ni cambios financieros.

El PLAN agrupa todavía la revisión final en T9 y no define un contrato técnico separado para T9B. Quedan la revisión por otra persona, tratar el hallazgo de contactos y la deriva con sus responsables, y preparar/verificar el despliegue coordinado/runtime/orígenes/correos cuando se autorice. T9B no se inicia ni se declara completada aquí.


## Commits locales de implementación y pruebas

- `c65c1fc` — fix(hu30): isolate invitation tabs and pending callbacks
- `b6a4245` — fix(hu30): restore isolated staff projection integration
- `29f7d6f` — fix(hu30): update existing profiles without privileged insert
- `8a9db6f` — test(hu30): validate authenticated local end-to-end regression

El cierre documental se registra en un commit posterior. Sin push/PR.
