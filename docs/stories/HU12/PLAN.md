# PLAN — HU 12: Sistema de Derivación e Integración Comercial (Resolución de Brechas y Hallazgos)

- **Story:** HU 12 — Sistema de Derivación e Integración Comercial
- **Actor:** Ejecutivo comercial · Administrador inmobiliario
- **Source story:** `agents/tasks/ANTIGRAVITY_HU12_DERIVACION_COMERCIAL.md` & `agents/tasks/Comentarios.md`
- **Status / Sprint:** 🛠️ En Corrección y Planificación de Entrega Final · Sprint 2 · 8 SP / 5 SP
- **Depends on / Required by:** Spike 2 (`docs/crm-integrations-chile.md`), Supabase DB Migrations, FastAPI Mock Server
- **Target File:** `docs/stories/HU12/PLAN.md`

---

## 1. Preguntas Definitorias (Standing Questions)

| # | Pregunta | Respuesta |
| :- | :------- | :----- |
| 1 | ¿Toca el motor de Scoring (algoritmo / números)? | No. La integración es de consumo posterior a la evaluación. |
| 2 | ¿Requiere RLS / Scoping Multi-tenant? | Sí. Corrección de permisos RLS en funciones RPC (`list_lead_contacts`, `update_lead_reliability`) y vista `admin_inmobiliario`. |
| 3 | ¿Requiere Migración DB? ¿Quién la aplica? | Sí. Se consolidarán y corregirán las migraciones en `supabase/migrations/` en orden cronológico correcto sin romper prod ni omitir definiciones (`profiles.rut`, `update_lead_reliability`). |
| 4 | ¿Modifica el contrato `POST /score`? | No. La derivación lee evaluaciones finalizadas. |
| 5 | ¿Impacto en Consentimiento / Privacidad? | Crítico. Validación de consentimiento de acuerdo a Ley 19.628. Asegurar autenticación en endpoints de mock CRM (`crm_mock.py`) para evitar exposición pública de PII. |

---

## 2. Objetivo

Resolver exhaustivamente los 9 hallazgos identificados en la revisión de código (`agents/tasks/Comentarios.md`) y alinear la implementación técnica con la guía de ejecución de Antigravity (`agents/tasks/ANTIGRAVITY_HU12_DERIVACION_COMERCIAL.md`) para asegurar una derivación comercial robusta, segura y lista para producción en RutaHogar.

---

## 3. Diagnóstico de los 9 Hallazgos de Revisión (Code Review Breakdown)

1. **(1) Error de Migración e Incompatibilidad de Orden (DB):** `20260922000001_update_list_lead_contacts.sql` falla por fecha fuera de orden (`20260922` antecede a migraciones aplicadas `20260923+`) y referencia la columna `p.rut` que no está creada en migraciones previas.
2. **(2) Eliminación Involuntaria de Columna y Rol en DB:** La función `list_lead_contacts` eliminó `reliability_status` y el rol `admin_inmobiliario` del filtro de permisos, dejando sin datos a los administradores inmobiliarios.
3. **(3) Fallo de RLS en Lectura de Estado por Ejecutivos:** En `evaluationService.js:171`, las consultas directas a `profiles.reliability_status` por ejecutivos fallan por RLS, haciendo que todos los leads reportados se muestren como "Normales".
4. **(4) RPC Inexistente en Repositorio:** `update_lead_reliability` (usado en `leadManagementService.js:20`) solo existía en prod y no en archivos del repositorio, rompiendo la funcionalidad de reportar/reactivar/descartar leads en deployments limpios.
5. **(5) Brecha de Seguridad en Mock CRM:** Los endpoints `/api/v1/crm-mock/*` en `crm_mock.py` están desprotegidos (sin autenticación), exponiendo PII (Nombre, RUT, Email, Score) a accesos no autorizados.
6. **(6) Identificadores Falsos / Placeholder RUT:** En `crmService.js:61`, los leads sin RUT envían `11111111-1` y `sin_correo@ejemplo.cl`, provocando colisiones y consolidación errónea de leads en CRMs que deduplican por RUT (ej. PlanOK).
7. **(7) Regresión en Filtro de Fecha:** En `DashboardLeads.jsx:565`, la eliminación de la verificación del umbral de fecha provocó que el selector de fecha no filtre los registros.
8. **(8) Mutación de Estado y Manejo Inconsistente en Reportes:** En `DashboardLeads.jsx:1027`, `selectedLead` se muta en sitio en lugar de actualizar el estado `evaluations`, dejando desincronizada la UI y badges de reporte.
9. **(9) Formato e Invalidez de RUT en Registro Post-Evaluación:** En `SignupOffer.jsx:45`, no se valida ni normaliza el dígito verificador del RUT, permitiendo almacenar formatos heterogéneos y datos inválidos.

---

## 4. Plan de Acción y Tareas de Solución (Paso a Paso)

### Fase 1: Corrección de Base de Datos y Migraciones Supabase
- [x] **Tarea 1.1:** Reorganizar la migración `update_list_lead_contacts.sql` asignándole un timestamp cronológico válido (`20261005...`).
- [x] **Tarea 1.2:** Asegurar en la migración que la tabla `profiles` contenga la columna `rut` y que `list_lead_contacts` retorne `reliability_status`, incorporando `SECURITY DEFINER` e incluyendo `admin_inmobiliario` y `ejecutivo` en los roles permitidos.
- [x] **Tarea 1.3:** Crear la migración oficial para `update_lead_reliability` con la comprobación de roles requerida (`SECURITY DEFINER`, comprobación de `auth.uid()`).

### Fase 2: Seguridad y Autenticación en Backend Mock CRM
- [x] **Tarea 2.1:** Implementar autenticación/autorización mediante API Key o JWT Header en `backend/app/routers/crm_mock.py` para endpoints GET/POST `/api/v1/crm-mock/*`.
- [x] **Tarea 2.2:** Asegurar que los datos PII no queden expuestos de forma abierta.

### Fase 3: Integración de Servicios Frontend (`crmService.js`, `evaluationService.js`, `leadManagementService.js`)
- [x] **Tarea 3.1:** Modificar `crmService.js` para enviar `null` o valor no asignado cuando el RUT o email del lead no existan, en lugar de utilizar valores placeholder (`11111111-1`), permitiendo un manejo adecuado de deduplicación en el CRM.
- [x] **Tarea 3.2:** Ajustar `evaluationService.js` para consultar `reliability_status` a través de la función segura RPC `list_lead_contacts` evitando bloqueos por RLS.

### Fase 4: Corrección de Componentes UI (`DashboardLeads.jsx`, `SignupOffer.jsx`)
- [x] **Tarea 4.1:** Restablecer el filtro de fecha en `DashboardLeads.jsx` restaurando la comprobación `dateThreshold`.
- [x] **Tarea 4.2:** Corregir la actualización de estado al reportar un lead en `DashboardLeads.jsx`, actualizando la lista de estados `evaluations` en lugar de mutar `selectedLead` directamente.
- [x] **Tarea 4.3:** Integrar la validación y formateo estándar del RUT en `SignupOffer.jsx` utilizando la utilidad centralizada `validateRut` / `formatRut`.

### Fase 5: Pruebas, Verificación y Documentación
- [x] **Tarea 5.1:** Ejecutar suite de pruebas pytest para backend: `cd backend; .venv\Scripts\python -m pytest tests\ -q`.
- [x] **Tarea 5.2:** Ejecutar suite de pruebas frontend y build: `cd frontend; npm run test` y `npm run build`.
- [x] **Tarea 5.3:** Generar el artefacto de recorrido y verificación `walkthrough.md` en el directorio de artefactos con la evidencia del cumplimiento de los Criterios de Aceptación (E1 - E4).

---

## 5. Mapeo de Criterios de Aceptación

| Criterio Gherkin | Requisito Ttécnico | Estado de Planificación |
| :--- | :--- | :--- |
| **E1 — Derivación de leads evaluados** | Envío de leads con cualquier score (`Alto`, `Medio`, `Bajo`, `Requiere antecedentes`) a CRM. | Planificado / Implementado en `crmService.js`. |
| **E2 — Info lead y proyecto objetivo** | Contrato de payload estructurado con contacto, proyecto y resultados. | Planificado / Implementado (con solución a placeholders). |
| **E3 — Priorización del lead** | Registro de Prioridad Comercial, Compatibilidad por Capacidad y Afinadad por separado. | Planificado / Implementado en `buildCrmPayload`. |
| **E4 — Actualización periódica en CRM** | Idempotencia y actualización sin duplicidad por `version_hash` SHA-256. | Planificado / Implementado en backend y local fallback. |

---

## 6. Salvaguardas y Reglas Inviolables

1. **Protección de Datos Personales (Ley 19.628):** Nunca derivar leads que no posean `consentimiento === true`.
2. **Sin Placeholders Ficticios:** No inyectar RUTs ni correos falsos que vicien la base de datos comercial del CRM.
3. **Seguridad y RLS:** No consultar campos protegidos por RLS sin la adecuada función `SECURITY DEFINER` ni dejar endpoints de API desprotegidos.
4. **Build e Integridad:** Todo cambio debe mantener la compilación limpia de frontend (`npm run build`) y pasar los tests unitarios.
