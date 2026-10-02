# PLAN — HU 12: Sistema de Derivación e Integración Comercial

- **Story:** HU 12 — Sistema de Derivación e Integración Comercial
- **Actor:** Ejecutivo comercial · Administrador inmobiliario
- **Source story:** `Wiki RutaHogar/UserStories/HU12-derivacion-comercial.md`
- **Status / Sprint:** 🗓 Planificada · Sprint 2 · 5 SP
- **Depends on / Required by:** Spike 2 E3 (crm-integrations-chile.md)
- **Branch:** `feat/hu12-derivacion-comercial`

---

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No. |
| 2 | Needs RLS / multi-tenant scoping? | No additional RLS, but the sync process accesses tenant data. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Yes. Se agregará una tabla para registrar el estado de sincronización. Desarrollador aplica `supabase db push`. |
| 4 | Changes the `POST /score` contract? | No. La sincronización ocurre de forma asíncrona post-scoring. |
| 5 | Consent / privacy impact? | Alto. Solo se derivan leads que han dado su `consentimiento`. La integración simula el traspaso de datos personales (PII) a un tercero. |

> CI checks these against the diff. An answer contradicted by the files touched fails the build.

## Goal

Enviar automáticamente los leads evaluados (junto con su nivel de prioridad y compatibilidad con el proyecto objetivo) hacia un CRM simulado externo, manteniendo dicho registro actualizado ante cambios, para que los ejecutivos comerciales puedan gestionarlos en su flujo natural sin duplicar plataformas.

## Approach

Implementar el "Patrón Adapter" sugerido en el Spike 2 conectando Supabase con el backend de mock (que ya expone `/api/v1/crm-mock/sync`). Se utilizará un **Database Webhook** en la tabla `scoreleads_leads` que gatillará una nueva Edge Function (`sync-crm-lead`) cada vez que un lead se inserte o actualice. Esta función mapeará los datos relevantes del lead y hará el push hacia el endpoint del CRM simulado. Para llevar la trazabilidad y evitar re-envíos innecesarios o pérdidas, se agregará una tabla `crm_sync_status` que guardará el resultado de la última sincronización.

## Entities

- **Nueva Edge Function:** `sync-crm-lead`. Maneja el webhook de DB y hace la llamada HTTP al CRM.
- **Nueva tabla:** `crm_sync_status` para llevar el registro de qué leads fueron sincronizados, cuándo, y el hash o versión de los datos enviados. 
- **Endpoint simulado (existente):** `/api/v1/crm-mock/sync` en el backend FastAPI.
- **Migración requerida:** Sí, para crear la tabla `crm_sync_status` y el trigger/webhook sobre `scoreleads_leads`.

## Algorithms

Ninguno afectado.

## In scope

- Push al endpoint CRM simulado existente cuando un lead termina su evaluación.
- Actualización de los datos del lead en el CRM ante cualquier cambio (re-evaluación).
- Envío de atributos requeridos: datos de contacto, proyecto objetivo, score y prioridad comercial, compatibilidad.
- Trazabilidad del envío en Supabase (`crm_sync_status`).

## Out of scope

- Implementación de un adaptador real para PlanOK, HubSpot o Salesforce (solo simulado en esta HU).
- Sincronización bidireccional (RutaHogar -> CRM -> RutaHogar).
- Endpoint del backend FastAPI (ya implementado en mock CRM).

## Assumptions / unmet dependencies

- Se asume que el backend FastAPI estará disponible y será alcanzable por la Edge Function de Supabase.
- El CRM simulado asume como identificador del lead el ID interno (`lead_id`).

## Steps

1. **Migración DB:** Crear archivo en `supabase/migrations/` para la tabla `crm_sync_status` (columnas: `lead_id`, `sync_status`, `last_sync_at`, `payload_hash`, `error_message`).
2. **Migración DB (Webhook):** Añadir en la migración el trigger (webhook) en `scoreleads_leads` para llamadas a la Edge Function tras un `INSERT` o `UPDATE`.
3. **Edge Function:** Crear `supabase/functions/sync-crm-lead/index.ts`. Leer el payload del trigger, construir la estructura requerida (según test_crm_mock.py), enviar al backend (`/api/v1/crm-mock/sync`) y registrar el resultado en `crm_sync_status`.
4. **Verificación local:** Añadir pruebas verificando la generación del payload y revisando logs.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — Derivación de leads evaluados | 2, 3 | test_crm_mock.py (existente) + pruebas manuales Edge Function |
| `E2` — Info lead y proyecto objetivo | 3 | Verificación del payload generado en la Edge Function |
| `E3` — Priorización del lead | 3 | Verificación de inclusión de score y nivel_accion en el payload |
| `E4` — Actualización periódica en CRM | 2, 3 | Trigger `UPDATE` de DB llama a Edge Function y mock responde "actualizado" |

## Safeguards

- **No tocar backend/scoring_engine:** Esta historia es puramente asíncrona a nivel de DB/Edge Functions y no afecta el core de algoritmos.
- **Privacidad y Consentimiento:** La Edge Function validará el booleano de `consentimiento` antes de ejecutar el push hacia el CRM, en línea con el Spike 2.

## Definition of done

- Tier 1 green: pytest (incl. golden + ALG cases) · eslint · vitest · Playwright journeys.
- Tier 2 confirmed by a reviewer who is not the author, with evidence per criterion.
- This plan and any `ALG-*` changes committed in the same PR as the code.
- No criterion silently dropped.

## Resolved decisions

| Decision | Rationale |
| :------- | :-------- |
| Usar DB Webhook + Edge Function | Desacopla la sincronización del flujo síncrono del usuario final, evitando que una falla en el CRM rompa el precalculo y la UI. |
| Endpoint CRM | Se utilizará el endpoint mock existente en el backend FastAPI (`/api/v1/crm-mock/sync`) en lugar de levantar otro servicio. |
