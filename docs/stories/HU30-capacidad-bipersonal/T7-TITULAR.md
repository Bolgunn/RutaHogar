# HU30 — T7: UI del titular

Cierre local: 2026-10-22. Rama `feat/hu30-capacidad-bipersonal`, base inicial `94bee56`, árbol inicialmente limpio. Leídos PLAN, T5-EVALUACION y T6-PROYECCIONES, además de instrucciones generales/frontend.

## Pantalla y contrato

Se incorpora `BipersonalCapacityCard` en **Recommendations**, pantalla activa de resultados, antes de la gestión de invitaciones. No se rediseña el resultado ni se modifican Result, DashboardLeads o LeadDetailModal.

`normalizeEvaluation` conserva una copia de `row.co_debtor`; el fallback del seguimiento también conserva su proyección. Solo se presenta `hu30-projection-v1`. No se reconstruye una proyección desde input, financial_indicators, provenance, invitaciones, snapshots o almacenamiento local. Si falta el contrato o su versión es desconocida se informa indisponibilidad, sin atribuir clasificación.

| Clasificación backend | Presentación |
| --- | --- |
| individual | Evaluación individual, sin tarjeta que afirme capacidad bipersonal. |
| bipersonal_confirmed | Capacidad Bipersonal; desglose únicamente si visibility=visible. |
| declared_complement | Complemento declarado sin confirmación utilizada; sin comparación bipersonal confirmada. |
| unverifiable_origin | Origen no verificable; no se inventan identidad, consentimiento o aporte. |

Se muestran estado de participación y advertencias traducidas. En el desglose visible: ingreso titular, ingreso **considerado** del co-deudor, deudas consideradas individuales y consolidada, relación usada, capacidad titular solo/bipersonal y aporte efectivo UF/CLP. El aporte por renta se presenta cuando está disponible. El contrato conserva bipersonal_summary; la UI consume los campos de capacity preparados por T6, sin volver a interpretar el resumen financiero.

CLP es principal cuando el backend entrega ese valor, UF es referencia. Titular solo permanece en UF cuando el servidor no entrega CLP; no se convierte usando UF local. Ausencias/null son «No disponible», nunca cero. Se conservan cero y signos negativos, con texto explicativo. No se muestran IDs, fuentes técnicas o nombres internos. Se reutilizan formato monetario, etiquetas de relación y estilos existentes; en móvil el desglose ocupa una columna.

## Actualización explícita

`update_required` habilita una única acción. `matching_confirmed_later` muestra exactamente «Antecedentes coincidentes confirmados posteriormente» y no ofrece actualización, incluso ante flags contradictorios. La UI no compara antecedentes para decidir pendientes.

El controlador de la vista reutiliza POST /tracking/evaluations/co-debtor-confirmation únicamente tras clic. Bloquea doble envío mientras la operación está en curso; no hay recálculo automático ni reintento automático de escritura. Después consulta seguimiento y evaluaciones para mostrar la evaluación nueva y su proyección. La vista indica envío, éxito, error y permite reintentar lecturas fallidas. Si el score devuelto coincide con el anterior muestra «Los antecedentes fueron incorporados; tu score se mantuvo sin cambios». Comparar scores para ese feedback no calcula score/aporte ni determina consentimiento.

Ante un conflicto/error de escritura se relee autoridad antes de volver a ofrecer una acción. Si se guardó una evaluación pero falla el refresco, se conserva la confirmación de guardado y se ocultan los datos anteriores, con reintento de lectura. Nunca se intenta una segunda escritura para resolver un fallo de lectura.

La gestión HU18 se conserva en modo managementOnly: no duplica el botón ni presenta la revisión más reciente de la invitación como si ya hubiera sido usada. Sus textos pending/expired tampoco afirman qué datos utilizó el score. La gestión histórica no se carga cuando el servidor indica histórico oculto/cierre desconocido.

## Privacidad y ciclo de vida

- La vista persistida consulta datos autorizados al abrirse. Mientras carga o falla el refresco no muestra la evaluación anterior como respaldo.
- Se revalida al recuperar foco y cada 60 segundos mientras la pestaña está visible, para actualizar estados y pendientes.
- Un temporizador usa **historical_visible_until entregado por servidor**. No calcula 30 días ni decide si una participación tiene derecho a consulta. Al llegar ese instante retira la vista y solicita una respuesta nueva; consume visibility/warnings del backend.
- El temporizador se conserva aunque haya una lectura lenta en curso. El corte fuerza una lectura posterior y las respuestas anteriores quedan invalidadas, evitando que una respuesta visible tardía sustituya una proyección redactada. Plazos superiores al máximo de setTimeout se programan en tramos.
- visibility=hidden impide mostrar desglose, relación, capacidades y aportes incluso si un payload conserva valores residuales. Se muestran las advertencias de revocación, reemplazo, detalles ocultos o fecha desconocida autorizadas por T6. No se reconstruyen valores desde otra respuesta.
- Se evita despachar una escritura encolada después del desmontaje y se comprueba que la sesión de envío sigue correspondiendo a la cuenta que inició la acción; es una protección de contexto cliente, no autorización. Se desmonta la vista al cambiar de cuenta; se ignoran resultados asíncronos de sesiones desmontadas. El refresco compartido de App descarta respuestas de otra cuenta o superadas por una lectura más reciente. La selección descarta filas explícitamente ajenas.
- Estado solo en memoria de la vista; no se añade caché financiera a localStorage/sessionStorage. Los temporizadores/listeners se eliminan al desmontar.

La autorización efectiva, el plazo y la redacción continúan exclusivamente en backend. Las protecciones frontend no sustituyen Auth/RLS/proyecciones T6.

## Archivos

Implementación:

- frontend/src/App.jsx
- frontend/src/components/BipersonalCapacityCard.jsx (nuevo)
- frontend/src/components/CoDebtorSection.jsx
- frontend/src/components/Recommendations.jsx
- frontend/src/constants/bipersonal.js (nuevo)
- frontend/src/hooks/useOwnerResult.js (nuevo)
- frontend/src/lib/tracking/currentEvaluation.js
- frontend/src/services/evaluationService.js
- frontend/src/services/ownerResultSession.js (nuevo)
- frontend/src/services/trackingService.js
- frontend/src/styles.css

Pruebas:

- frontend/src/components/BipersonalCapacityCard.test.jsx (nuevo)
- frontend/src/components/Recommendations.test.jsx
- frontend/src/hooks/useOwnerResult.test.js (nuevo)
- frontend/src/services/__tests__/ownerResultSession.test.js (nuevo)
- frontend/src/services/__tests__/ownerResultTransport.test.js (nuevo)

Documentación: PLAN.md y este informe.

## Verificación

Node 22.23.2, sin cambios de dependencias:

- Suites enfocadas de tarjeta, Recommendations, CoDebtorSection, currentEvaluation y controladores: **62 aprobadas**, sin fallas/omitidas. Se añaden **41 casos T7**.
- Frontend completo: **891 aprobadas, 2 fallas previas, 0 omitidas** (893 casos, 82 archivos). Fallas conservadas: fecha fija de invitación vencida en coDebtorService.test.js y RUT inválido 17.493.972-k esperado válido en chileanRut.test.js. No se modifican esos tests.
- Build Vite: aprobado. Persisten advertencias de tamaño de bundle e import dinámico/estático de favoritesService.
- Chromium headless local con respuestas/datos sintéticos interceptados: tarjeta en escritorio y móvil 390 px sin desborde, aporte negativo, redacción sin reconstrucción y acción real de actualización con feedback de score idéntico; una sola escritura. Capturas temporales fuera del repositorio. No prueba Auth/DB remotos.
- git diff --check: sin errores.

Los casos nuevos cubren las cuatro clasificaciones, signos del aporte, campos opcionales, versión desconocida, pendientes/coincidencia, uso de montos considerados, éxito/error/fallo de refresco, doble envío, cambio de cuenta, histórico visible/oculto, foco/temporizadores, carrera de lectura que cruza el corte y limpieza al desmontar.

No se ejecutan suites backend/SQL porque no cambian esas capas. La falla financiera 2200 vs 2737.185... y demás límites previos de T6 siguen documentados; no se toca el motor ni se afirma corregirlos.

Comandos de verificación (desde frontend, usando Node de .nvmrc):

```bash
node node_modules/vitest/vitest.mjs run
node node_modules/vite/bin/vite.js build
```

## Commits de implementación y pruebas

- fbb98c3 — feat(hu30): present authorized bipersonal capacity to owner
- 786fb68 — test(hu30): cover owner result updates and privacy cutoff

## Cierre y siguiente paso

T7 cerrada en implementación y verificación local. No hay cambios backend, RLS, migraciones, aplicación remota, push o PR. La validación integral con Auth/servicios reales continúa en la entrega posterior T9.

T8 pendiente: badge/filtro comercial y expediente con desglose, relación/procedencia legible, aporte, riesgos permitidos y señal booleana de otras participaciones, consumiendo exclusivamente el contrato staff T6 y conservando filtros/proyectos existentes. No se implementa T8 aquí.
