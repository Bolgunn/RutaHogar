# HU30 — T9B: hardening y preparación local de release

Fecha: 2026-10-23. Branch `feat/hu30-capacidad-bipersonal`; base inicial limpia `fd334bc`. Leídos PLAN, T8-STAFF y T9A-REGRESION, más instrucciones generales/backend/DevOps. Exclusivamente T9B: no cierre final de HU30, HU23, despliegues, SQL remoto, push o PR.

## Correcciones y límite de auditoría

Se revisaron las lecturas de contactos, ficha, evaluaciones, historial y proyección comercial reutilizadas por HU30. No se realizó una auditoría global ni se cambiaron fórmulas, UI o datos históricos.

La nueva migración `20261023090000_hu30_staff_contact_isolation.sql` agrega `hu30_staff_can_read_lead(uuid)` y reutiliza `lead_belongs_to_inmobiliaria`. El actor proviene de `auth.uid()` y su perfil protegido; el navegador no suministra rol ni tenant:

- Ejecutivo, admin scoped y admin inmobiliario necesitan tenant no nulo y pertenencia del **lead sujeto** a esa inmobiliaria.
- Solo `admin` sin tenant conserva acceso global.
- Usuario, actor sin perfil, ejecutivo/admin inmobiliario sin tenant y lead inexistente no obtienen contactos. Para callers autenticados, IDs ajenos e inexistentes producen la misma lista vacía, sin error que distinga existencia.
- `list_lead_contacts(uuid[])` conserva su firma y las nueve columnas vigentes, incluido email. Se elimina/recrea de manera transaccional para tolerar instalaciones con el retorno anterior de ocho columnas. No cambia la identidad de perfiles ni se hace backfill.
- El snapshot `schema.sql` recibe la misma definición final y las tres columnas de nombres ya existentes en la migración histórica de perfiles: son prerrequisito del contrato de contactos, no un modelo nuevo.

Variantes demostradas antes de aplicar la corrección, en SQL local:

1. La política `Staff select lead_status_history` permitía historial de otro sujeto por rol o por `changed_by` automático. Ahora comprueba el sujeto mediante el helper común, no la inmobiliaria del actor del evento.
2. `get_reported_leads_for_admin()` y `get_lead_status_history_for_admin()` permitían a `admin` scoped consultar fuera de su tenant. Mantienen su contrato admin-only y agregan el mismo predicado por sujeto.
3. El reporte administrativo podía devolver `fraud_score_probability`/`shap_top_factors` directamente de una evaluación con complemento. Ambos campos se devuelven nulos cuando `hu30_has_complement` detecta complemento, sin borrar ni actualizar el snapshot. Los derivados financieros de esos casos deben provenir de la proyección autorizada HU30. El reporte crudo no se convierte en otra proyección financiera.

Estas tres RPC devuelven además `Cache-Control: private, no-store`, `Pragma: no-cache` y `Vary: Authorization` mediante las cabeceras de respuesta de PostgREST. La operación corre igualmente cuando no hay filas autorizadas.

Las rutas financieras conservan la autorización T6: listado por tenant fijado por backend; ficha e historial autorizan antes de exponer snapshots; se mantienen los guards/RLS de acceso directo de T3/T6. No se encontró otro bypass de contenido financiero en esas rutas bajo las pruebas revisadas. Esto no certifica endpoints ajenos al área inspeccionada.

## HTTP, Auth y runtime

`security.ts` envuelve **todas** las respuestas del handler de participación, incluidos preflight, errores y rechazos:

- `private, no-store`, `Pragma: no-cache`, `Vary: Origin`.
- Origin exacto de `APP_PUBLIC_URL`; orígenes adicionales solo desde `CO_DEBTOR_ALLOWED_ORIGINS`, separados por comas, sin paths, credenciales ni wildcards.
- Origin externo, parecido o `null`: 403 genérico antes de ejecutar la operación, sin reflejar ACAO.
- Configuración inválida: 503 genérico; no expone valores ni nombres de secretos. Peticiones servidor/cron sin Origin siguen admitidas y conservan sus verificaciones de Auth/secreto.
- CORS es protección de transporte, **no autorización**. Auth y RPC vuelven a comprobar cuenta/rol/RUT/email/estado; se mantiene `verify_jwt=false` porque existen acciones públicas limitadas y cron, sin habilitar confirmación anónima.

La dependencia Edge se fija en **supabase-js 2.106.2**, la versión instalada y usada por la prueba, en lugar del tag móvil `@2`. No se cambian dependencias/lockfiles frontend. El harness comprueba esa coincidencia.

También se reprodujo que los HTTPException de tracking perdían las cabeceras de la dependencia de respuesta en FastAPI. Las denegaciones explícitas ahora incluyen las mismas cabeceras privadas; regresión específica para 401 y 403. No se alteran status/códigos funcionales ni la autorización. No se afirma haber sustituido los handlers globales de validación/errores de toda la aplicación.

### Evidencia real local

Se ejecutó nuevamente el recorrido de T9A con Supabase Auth/GoTrue, SMTP capturado, PostgREST, PostgreSQL, FastAPI, motor real con mercado fijo y rutas reales de la SPA en Chromium desktop/móvil. **El hallazgo de contactos ahora es una aserción estricta de aislamiento, no un hallazgo tolerado.** El gateway de prueba deja de sobrescribir CORS de la función; respeta la decisión real del handler.

Se repitió además con el binario oficial de **Supabase Edge Runtime v1.77.4 / Deno 2.1.4**, extraído de la imagen disponible localmente. Ya no se usa el adaptador Node para ese recorrido. Limitaciones explícitas:

- Para ejecutar offline, el SDK instalado 2.106.2 se empaqueta con Rolldown y el import std `serve` se conecta a `Deno.serve`. Se ejecuta el mismo handler y sus módulos de autorización/seguridad bajo el runtime Deno real; no se simulan Auth/RPC/respuestas de autorización. **No acredita descargar/resolver el grafo CDN de producción ni desplegar la función hospedada.**
- Resend se captura localmente; GoTrue envía su verificación mediante SMTP real al buzón aislado. No se envían correos a personas ni se prueba entregabilidad de un dominio real.
- La fixture conserva las adaptaciones de bootstrap/pgvector/mercado/reloj descritas en T9A. Las migraciones antiguas de contacto se cargan antes de las HU30: no se reaplican después de la corrección.
- Las claves son aleatorias locales, configuración temporal 0600, servicios loopback, sin usar credenciales hospedadas ni modificar `.env`. No se versionan binarios ni secretos.

### Configuración para la entrega autorizada posterior

| Componente | Configuración necesaria | Estado |
| --- | --- | --- |
| Frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` del ambiente; nunca service role | Ejercitado con equivalentes locales reales; build aprobado. |
| Backend | URL y clave privada Supabase; `RUTAHOGAR_ALLOWED_ORIGINS` con el frontend correcto | Autenticación, expiración, tenant y cabeceras probadas localmente. Revisar valores del hosting antes de liberar. |
| Edge | Variables Supabase del runtime, `APP_PUBLIC_URL`, Resend/remitente, TTL=7 y secreto cron; `CO_DEBTOR_ALLOWED_ORIGINS` opcional | Configuración local probada. APP_PUBLIC_URL debe coincidir con el Origin real, incluido localhost frente a 127.0.0.1/puerto. La variable opcional adicional requiere configuración explícita si se usa. |
| Supabase Auth | Confirmación de correo habilitada, Site URL y allowlist de retorno a `/co-deudor/invitacion` con su contexto | Registro sin sesión, correo/verificación, retorno en otra pestaña, login/cambio de cuenta y token expirado/logout probados con GoTrue real local. Validar reglas/plantillas/allowlist del proyecto hospedado; la fixture local no certifica sus glob patterns. |
| Email | SMTP Auth operativo; dominio/remitente Resend verificados y enlaces HTTPS correctos | SMTP/captura y contenido de enlaces locales probados; proveedor, dominio, spam/entrega y enlaces públicos reales pendientes del ambiente autorizado. |
| Runtime/SDK | Edge Runtime y SDK de la entrega; resolver imports remotos fijados | Deno nativo local con dependencias offline aprobado; runtime/grafo remoto desplegado pendiente de homologación. |

La función frontend construye únicamente la ruta interna fija de invitación y un nonce aleatorio; no envía el token como redirect de Auth. No se implementa Google, HU27 completa ni verificación externa de identidad por RUT.

## Matriz de seguridad final

| Control | Resultado |
| --- | --- |
| Cross-tenant/contactos | SQL con ejecutivo A/B, admin scoped, admin inmobiliario/global, usuario, actor sin tenant e IDs ajenos/inexistentes. PostgREST real: A recibe contacto; B y usuario reciben `[]`; respuesta privada. |
| Variantes de history/reportes | Preflight reproduce los caminos antiguos; post-migración denegados por sujeto, incluido actor automático/ajeno. Derivados co-deudor del reporte crudo redactados. |
| Cuenta/sesión | Otro participante/rol bloqueado; cambio de RUT bloquea; login/cambio de cuenta retorna; token expirado y logout real denegados. Guards de perfil T3 siguen activos. |
| Privacidad/cache | Titular/staff siguen proyección T6; respuesta Edge y RPC privadas; errores de tracking protegidos. Corte exacto sin reconstrucción por UI ni mutación del snapshot. |
| Redirecciones | Contexto por nonce y ruta fija, pruebas de redirects externos; Origin estricto y preflight real en Edge. |
| Logs/errores | No se agregan logs de tokens, cuerpos, email/RUT ni secretos. Resend registra solo status; errores funcionales conservan códigos/mensajes acotados. Se conserva la prueba existente de logging seguro. |
| Revocación/reemplazo | Excluyen uso futuro, preservan histórico y primer cutoff. Revalidación en lectura/escritura/commit permanece vigente. |
| Replay/concurrencia | Respuesta perdida tras commit y retry UI recuperan la misma revisión; dos operaciones concurrentes no duplican versión/evaluación; recálculo explícito único. |
| Stale/account switching | Regresión frontend completa y recorrido T9A, sin reconstruir datos ocultos ni aceptar contexto anterior como autorización. |

## Schema drift: clasificación de las ocho diferencias iniciales

| Objeto inicial | Clasificación y riesgo | Acción T9B |
| --- | --- | --- |
| `list_lead_contacts` | Preexistente, directamente relacionada con HU30 y peligrosa: contratos distintos más fuga cross-tenant. El detector anterior tomaba la versión de octubre 5 porque la de octubre 8 usa CREATE sin OR REPLACE. | Corregida mediante migración nueva y definición final equivalente en schema. Sin editar las históricas ni cambiar el detector para esconder diferencias. |
| `Staff select lead_status_history` | Preexistente, relacionada con las lecturas staff; peligrosa por sujeto fuera de tenant, incluso changed_by=null. | Corregida junto al RPC; scope común por sujeto. |
| `Proyectos select tenant` | Preexistente de catálogo/roles; schema incluye admin_inmobiliario, migración anterior solo admin. Relevante para permisos/compatibilidad de un bootstrap nuevo. | No es una regla HU30; no sincronizada. Requiere revisión del responsable de roles/catálogo antes de provisionar desde schema. |
| `Proyecto ejecutivos select tenant` | Preexistente; misma evolución admin_inmobiliario frente a admin, ambos conservan gate de tenant del ejecutivo. Sensible a permisos de catálogo. | Sin cambios fuera del alcance. No se vuelve a la versión anterior a ciegas. |
| `can_admin_inmobiliaria` | Preexistente; schema admite admin_inmobiliario y migración vieja solo admin. Afecta administración del catálogo. | Sin cambios; revisión externa de rol/permisos para bootstrap, no usado como autorización HU30. |
| `assign_admin` | Preexistente y sensible para release global: migración vieja asigna `admin` scoped; schema usa `admin_inmobiliario`. No son equivalentes semánticamente. | No se corrige en HU30 ni se revierte rol automáticamente. Requiere reconciliación por responsables de administración. |
| `proyecto_favoritos_validar_proyecto` | Ausente en schema, preexistente HU19. Necesaria para favoritos de proyectos/RAG; riesgo de integridad/compatibilidad en entorno nuevo. | No se agrega HU19/RAG a esta HU; pendiente del bootstrap del catálogo. |
| `proyecto_favoritos_borrar_huerfanos` | Ausente, preexistente HU19; diferencia de limpieza/cascade de favoritos entre catálogo y RAG. | Sin cambios; no se interpreta como fallo nuevo de HU30. |

Resultado: **6 diferencias residuales (2 ausentes, 4 divergentes)**, ninguna definición HU30 nueva divergente. El comando continúa saliendo con error y conserva 20 advertencias previas de migraciones sin rollback; no hay un gate de esquema global verde. Son un riesgo de bootstrap/release global que debe resolver o validar el responsable; no impiden afirmar la corrección local HU30 sobre la base migrada conocida, ni autorizan desplegar todo el schema de forma indiscriminada.

## Migración y rollback

No hay tablas/modelos financieros nuevos, nuevas fórmulas, índices preventivos ni cambios de filas históricas. Prerrequisitos: base T1–T8 y migración existente de nombres `20260922000000` aplicada. Orden: migraciones históricas anteriores → T3/T4A/T4B/T6 → `20261023090000_hu30_staff_contact_isolation.sql`. No volver a ejecutar `20261008150000_lead_contacts_email.sql` después de la nueva corrección.

El rollback `20261023090000_hu30_staff_contact_isolation_rollback.sql` **deshabilita** las tres RPC afectadas para cliente y deja falsa la política de historial; retiene funciones, helper y toda la evidencia. No restaura la fuga ni borra datos. Contacto/historial administrativo pueden quedar temporalmente sin lectura de cliente; las proyecciones backend conservan su alcance. Recuperar servicio mediante reapply/corrección hacia adelante, no mediante una función antigua vulnerable. La suite verifica permisos/política tras todos los rollbacks y huellas de evidencia idénticas.

## Pruebas ejecutadas

| Suite | Resultado |
| --- | --- |
| Backend relacionado completo | **261 aprobadas, 1 falla previa**, 0 omitidas. Incluye tracking/HU18/T3–T6/scoring/grants/Edge security/routes y el nuevo caso de denegación privada. |
| Backend enfocado final | **9 aprobadas**, seguridad Edge/proyección HTTP. |
| Frontend completo | **945 aprobadas, 2 fallas previas**, 947 casos/88 archivos, 0 omitidas. Sin cambios de UI. |
| SQL HU30 y rollback | **12 etapas PASS**, incluidos preflight de bypass, roles, cabeceras/RPC, contratos HU18/T3–T6, concurrencia y rollback seguro. |
| Seguridad HTTP Edge nueva | **4 aprobadas**: éxito/error privado, origen externo/null/parecido, preflight/cron y configuración inválida. |
| Helpers Edge combinados, adaptador Node | **15 aprobadas, 1 falla previa**; las 4 nuevas incluidas. No se maquilla el helper legacy. |
| Recorrido T9A actualizado | **15 etapas PASS** con adaptador Node; aislamiento estricto de contactos y CORS. |
| Recorrido nativo Edge Runtime/Deno | **15 etapas PASS**, además cabecera privada PostgREST comprobada. Registro/verificación/retorno/confirmación/incorporación/titular/staff, estados, privacy/cutoff, idempotencia, aporte positivo/cero/negativo y legado. Sin pageerrors/warnings React; 403 y pérdida de respuesta son fallos provocados esperados. |
| Build Vite | Aprobado; advertencias previas de tamaño y favoritesService estático/dinámico. |
| Schema drift | 6 diferencias externas residuales; salida no cero preservada. |

Comandos principales: los de T9A, con logs de esta etapa `/tmp/hu30-t9b-*`; seguridad nueva mediante `node --experimental-strip-types scripts/test-hu18-helpers.mjs supabase/functions/co-debtor-consent/security.test.ts`. Para el runtime nativo, usando el ejecutable oficial extraído de la imagen local:

```bash
HU30_EDGE_RUNTIME=/tmp/hu30-edge-runtime python3 scripts/test-hu30-e2e.py
```

El binario no se instala/versiona en el repositorio. El harness conserva el camino Node cuando no se configura esa variable y comprueba la versión SDK fijada. No se requiere conectar un proyecto remoto para repetir estas pruebas.

## Fallas previas y dependencias

Se mantienen sin editar el test de 2200 UF vs 2737.185…, la fecha fija de invitación, la fixture RUT inválida y el helper HU18 dependiente de fecha. El recorrido autenticado real usa datos/RUT válidos, reloj y estados reales/fixtures explícitas, y el motor existente: HU30 no depende de aprobar esas expectativas antiguas para funcionar. El helper legacy sigue siendo una deuda, no una certificación de todos los enlaces de gestión antiguos; HU30 usa la decisión autenticada cubierta por SQL/Edge.

Persisten las seis deudas externas de esquema, rollbacks históricos faltantes, lecturas redundantes App/useLeads y limitaciones de despliegue/entregabilidad. No se rediseñan esas áreas.

## Archivos y cierre de etapa

- Migración/rollback nuevos, `supabase/schema.sql` y dos fixtures SQL de preflight/aislamiento.
- `supabase/functions/co-debtor-consent/index.ts`, nuevos `security.ts`/`security.test.ts`, `.env.example` de funciones.
- `backend/app/tracking/routes.py` y `backend/tests/tracking/test_hu30_projection_api.py`.
- Harness: `scripts/test-hu30-persistence.py`, `scripts/test-hu30-e2e.py`, `scripts/hu30-e2e/browser.mjs`, nuevo `edge-native.mjs`.
- Documentación: PLAN y este informe. No se modifican migraciones históricas.

T9B queda cerrada en hardening y preparación **local**. El bloqueo de contactos de T9A queda resuelto; las homologaciones hospedadas y deudas externas están delimitadas. El cierre final HU30 sigue pendiente: revisión por otra persona, decisiones de integración sobre la deriva externa y aplicación/homologación coordinada en un ambiente autorizado con evidencia de configuración, runtime y entrega de correo. No se marca HU30 finalizada ni se avanza a HU23.

## Commits locales de código y pruebas

- `17d48b0` — fix(hu30): scope staff contacts and history by tenant
- `0171da8` — fix(hu30): protect participation responses and origins
- `82fa718` — test(hu30): homologate native Edge runtime and tenant isolation

El informe y PLAN se registran en un commit documental posterior. Todos permanecen locales.
