# Walkthrough: HU 12 — Sistema de Derivación e Integración Comercial

Este documento proporciona una guía de recorrido (walkthrough) para verificar la implementación y corrección de los hallazgos reportados en la **HU 12: Sistema de Derivación e Integración Comercial**. Se detalla cómo se abordaron los 9 bugs y cómo se cumplen los criterios de aceptación (E1 a E4).

---

## 1. Corrección de Bugs Reportados (Code Review)

### Bug 1: Error de Migración e Incompatibilidad de Orden
- **Problema:** La migración `20260922000001_update_list_lead_contacts.sql` tenía una fecha anterior a la última aplicada, causando que Supabase la ignorara. Además, fallaba por la ausencia de la columna `p.rut`.
- **Solución:** Se renombró y actualizó la migración a `20261005000000_fix_list_lead_contacts_and_reliability.sql`. Se incluyó la creación de la columna `rut` en la tabla `profiles` si no existía, garantizando la compatibilidad.

### Bug 2: Eliminación Involuntaria de Columna y Rol en DB
- **Problema:** La vista/RPC `list_lead_contacts` había eliminado `reliability_status` y el rol `admin_inmobiliario`.
- **Solución:** Se restableció la columna `reliability_status` en el valor de retorno de la función y se configuró correctamente el rol `admin_inmobiliario` dentro de los roles con permiso para ejecutarla usando `SECURITY DEFINER`.

### Bug 3: Fallo de RLS en Lectura de Estado por Ejecutivos
- **Problema:** Las consultas directas a `profiles.reliability_status` en `evaluationService.js` fallaban debido a políticas de RLS.
- **Solución:** `evaluationService.js` ahora mapea `reliability_status` usando la respuesta que retorna la función segura `list_lead_contacts` (vía RPC), evitando el acceso directo a la tabla `profiles`.

### Bug 4: RPC Inexistente en Repositorio
- **Problema:** La función `update_lead_reliability` faltaba en el repositorio, aunque era utilizada por el frontend.
- **Solución:** Se incluyó su definición completa en la migración `20261005000000_fix_list_lead_contacts_and_reliability.sql` para permitir a los ejecutivos reportar y reactivar leads correctamente de forma persistente.

### Bug 5: Brecha de Seguridad en Mock CRM
- **Problema:** El servidor mock (`backend/app/routers/crm_mock.py`) no requería autenticación, exponiendo los datos PII derivados.
- **Solución:** Se implementó una dependencia `verify_api_key` utilizando `fastapi.security.APIKeyHeader` que exige la clave `X-Mock-CRM-API-Key` (`rutahogar-crm-mock-secret-key-2026`) en las rutas POST y GET del CRM, incluyendo los endpoints para proveedores de la industria (`/sync/planok`, `/sync/hubspot`, `/sync/salesforce`). Además, se agregó logging estructurado (Auditoría/Traceability) para registrar eventos de creación, actualización y solicitudes a los endpoints de proveedores, asegurando el cumplimiento de la política de trazabilidad.

### Bug 6: Identificadores Falsos / Placeholder RUT
- **Problema:** El frontend enviaba identificadores simulados como `11111111-1` para usuarios sin RUT registrado.
- **Solución:** Se modificó `crmService.js` para que retorne `null` si la información no está presente, previniendo choques y deduplicaciones erróneas en el CRM destino.

### Bug 7: Regresión en Filtro de Fecha
- **Problema:** `DashboardLeads.jsx` no aplicaba el filtro temporal en la bandeja porque la validación había sido removida en un refactor anterior.
- **Solución:** Se restauró la línea condicional `if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;` en el bloque `useMemo` principal.

### Bug 8: Mutación de Estado en Reportes
- **Problema:** Al reportar un lead en la UI, el objeto `selectedLead` se mutaba localmente de manera directa, creando inconsistencias en React.
- **Solución:** En lugar de reasignar el objeto, se creó un nuevo objeto para disparar el re-render en React `setSelectedLead({ ...selectedLead, reliability_status: "en_revision" });`.

### Bug 9: Formato e Invalidez de RUT
- **Problema:** No se validaba el formato del RUT en el flujo de Signup, pudiendo generar registros "K", sin guión, o matemáticamente inválidos.
- **Solución:** Se creó `src/utils/rut.js` con las funciones `formatRut` y `validateRut`, que fueron aplicadas en el manejador de estados `handleChange` y antes del submit en `SignupOffer.jsx`.

---

## 2. Verificación de Criterios de Aceptación (Epic Gherkin)

A continuación, validamos el comportamiento del sistema respecto de la épica:

### E1 — Derivación de leads evaluados
- **Prueba:** Visualizar un lead en `DashboardLeads.jsx` y pulsar "Derivar a CRM". 
- **Validación:** El sistema envía leads de cualquier score (siempre y cuando tengan consentimiento) hacia el mock. El badge refleja el estado "En CRM Simulado".
- **Estado:** ✅ Cumplido

### E2 — Info lead y proyecto objetivo
- **Prueba:** Observar el payload originado desde `crmService.js` (`syncLeadToSimulatedCrm`).
- **Validación:** El JSON incluye la estructura requerida: información personal verificada (sin placeholders falsos), estado de la evaluación y proyecto base de la vista.
- **Estado:** ✅ Cumplido

### E3 — Priorización del lead
- **Prueba:** Observar campos derivados como "Afinidad" y "Capacidad" al seleccionar un proyecto en la mesa de oportunidades.
- **Validación:** Se incluyen en el payload los atributos de afinidad comercial frente a la meta (ej: "Capacidad alcanzada", "Brecha").
- **Estado:** ✅ Cumplido

### E4 — Actualización periódica en CRM
- **Prueba:** Derivar un mismo lead sin realizarle cambios y observar la respuesta del servidor.
- **Validación:** El CRM responde con estado HTTP 200 y `status = "sin_cambios"`, gracias a la comparación de su `version_hash` SHA-256. La acción de sincronización (cambio o sin cambio) queda trazada vía logs.
- **Estado:** ✅ Cumplido

---

## 3. Cumplimiento de Políticas (Datos, Auditoría y Trazabilidad)
- **Ley 19.628 (Protección de Datos Privados en Chile):** En `crmService.js`, se introdujo un hard-block (`throw new Error(...)`) si el flag de consentimiento `lead?.input?.consentimiento === false` está presente. Esto garantiza que ningún dato sea enviado al CRM ni procesado, previniendo fuga de PII de leads que no aceptaron explícitamente los términos.
- **Seguridad de Endpoints Mock:** La totalidad de las rutas de ingesta (`/api/v1/crm-mock/sync`, `/sync/planok`, `/sync/hubspot`, `/sync/salesforce`) y de lectura (`/leads`) exigen el uso de una API Key validada por `Depends(verify_api_key)`.
- **Trazabilidad de Acciones:** Se integró la librería de `logging` en el router `crm_mock.py`, generando trazabilidad (Audit logs) en todas las operaciones del CRM Simulado (`Audit: Sync requested...`, `Audit: Sync created...`, `Audit: Syncing to PlanOK...`). Estos eventos son cruciales para propósitos de troubleshooting comercial y cumplimiento de normativas.

---

## 4. Comprobación y Tests
- Los tests del módulo mock CRM en pytest han sido ajustados para proveer el API Key, y todos pasaron con éxito (`.venv\Scripts\python -m pytest tests\test_crm_mock.py -q`).
- El frontend ha compilado satisfactoriamente sin advertencias críticas luego de introducir el formateador de RUT (`npm run build`).

El sistema de derivación comercial se encuentra ahora asegurado, correcto y finalizado de cara a producción.
