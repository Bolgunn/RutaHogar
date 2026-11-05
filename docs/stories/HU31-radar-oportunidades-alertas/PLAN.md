# PLAN — HU 31: Radar de oportunidades y alertas por variación de condiciones de mercado

- **Story:** `Wiki RutaHogar/UserStories/HU31-radar-oportunidades-alertas.md` · **Actor:** Lead (`usuario`)
- **Status:** In Progress · Sprint 3 · 3 SP · **Depends on / Required by:** Depends on HU 7 (Catálogo de proyectos, implemented), HU 9 (Favoritos de proyectos, implemented), HU 20 (Lo que cambió desde tu última visita, implemented), HU 25 (Carga masiva de proyectos, implemented). Required by: Retorno del lead ante oportunidades de catálogo en `Inicio`.
- **Branch:** `feature/hu-31-radar-oportunidades-alertas`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build session"); only what is specific to this story goes here.

- Read first:
  - `backend/app/lead_changes/service.py` — detector de cambios para leads (`_project_compatible_event`, `_detect_events`); HU 31 lo extiende, no lo rehace.
  - `frontend/src/services/favoritesService.js` — persistencia de favoritos en `public.proyecto_favoritos` y proveedor local.
  - `frontend/src/lib/simulation/compatibility.js` — evaluación pura de compatibilidad lead–proyecto (`evaluateScenario`).
  - `supabase/migrations/20261006120000_lead_change_events.sql` y `supabase/migrations/20261103210000_hu25_importar_proyectos.sql` — contrato de eventos de novedades y RPC de carga masiva de proyectos.
- Stop and report if:
  - Se intenta incluir alertas por baja de tasas bancarias o subsidio a la tasa (explícitamente fuera del alcance comprometido de los criterios E1 y E2 en la HU).
  - Se intenta modificar el contrato de `POST /score`, los pesos de `backend/app/scoring_engine/` o mutar filas existentes de `public.evaluations`.

## Goal

Permitir que un lead con proyectos guardados en favoritos active la campana de **"Notificar cambios"** registrando su interés y los umbrales actuales de precio en UF y bono pie del proyecto (`E1`), de modo que cuando la inmobiliaria actualice su catálogo —ya sea por edición individual o mediante la carga masiva de HU 25— reduciendo el precio en UF o aplicando una promoción de bono pie (5 % u otro), RutaHogar recalcule automáticamente la compatibilidad referencial del lead y le notifique la oportunidad con el delta exacto en su próximo ingreso a la plataforma (`E2`).

## Approach & decisions

La implementación sigue la arquitectura de dos capas de `docs/HANDBOOK.md` y extiende el circuito de eventos de HU 20 (`lead_changes`). La suscripción y foto de umbrales (`E1`) vive en `public.proyecto_favoritos`, mientras que la detección de variaciones comerciales (`E2`) converge tanto en la base de datos (trigger `AFTER UPDATE` sobre `public.proyectos`, que cubre simultáneamente la edición individual y el upsert masivo de `importar_proyectos` de HU 25) como en el servicio `LeadChangeService` del backend y un módulo puro en `frontend/src/lib/simulation/opportunityRadar.js`.

| Decision | Rationale |
| :------- | :-------- |
| Extender `public.proyecto_favoritos` con `notificar_cambios` y columnas de umbral (`umbral_precio_min_uf`, `umbral_precio_max_uf`, `umbral_bono_pie_pct`) | E1 exige registrar el interés y los umbrales actuales sobre un proyecto ya guardado como favorito. Mantenerlo en la misma fila vincula el ciclo de vida de la alerta al favorito (`ON DELETE CASCADE`). |
| Columna aditiva `bono_pie_pct numeric not null default 0` en `public.proyectos` | E2 menciona explícitamente *"reduciendo el precio de las unidades o aplicando un bono pie del 5 % u otro"*. Con `default 0` y validación `0..30`, no altera el contrato congelado de lectura de HU 7 y permite informar bonos pie en edición manual y carga masiva. |
| Captura de umbrales vía RPC `configurar_alerta_favorito(p_proyecto_id, p_activar)` (`SECURITY INVOKER`) | Garantiza que los umbrales registrados en `E1` correspondan exactamente al precio y bono pie vigentes en `public.proyectos` al momento de activar la campana, respetando RLS `usuario_id = auth.uid()`. |
| Doble cobertura en `E2`: Trigger `AFTER UPDATE` en `public.proyectos` + detector en `LeadChangeService` | La nota 3 de la HU exige que tanto la edición de un proyecto como la carga masiva de HU 25 generen el evento, y `E2` pide notificar al lead en su **próximo ingreso** (sin depender de que haya corrido el cron de mediodía). El trigger sobre `public.proyectos` captura ambas vías al instante, y `LeadChangeService` asegura consistencia en el job diario y digest semanal. |
| Actualización del umbral base tras emitir evento + deduplicación por `materiality_key` | Evita notificar dos veces la misma baja de precio o el mismo bono pie; una nueva alerta solo se emite si la inmobiliaria vuelve a mejorar las condiciones frente al nuevo umbral registrado. |
| Fuera de alcance: baja de tasas bancarias y avisos de `proyectos_rag` | La nota 1 de la HU excluye explícitamente las tasas bancarias por no estar en E1/E2. Los avisos externos del portal (`proyectos_rag`) no pertenecen a una inmobiliaria administrada en RutaHogar. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No. No modifica `backend/app/scoring_engine/` ni ningún `ALG-*`. El recálculo de compatibilidad usa la capacidad e indicadores ya calculados en la última evaluación del lead. |
| 2 | Needs RLS / multi-tenant scoping? | Sí. Se añade política `UPDATE` en `public.proyecto_favoritos` acotada a `usuario_id = auth.uid()`. El trigger de catálogo registra eventos en `public.lead_change_events`, donde cada lead solo lee sus propios eventos (`user_id = auth.uid()`). |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Sí: `supabase/migrations/20261105120000_hu31_radar_oportunidades_alertas.sql` (+ rollback y sincronización en `supabase/schema.sql`). Se aplica con `supabase db push` tras el merge. |
| 4 | Changes the `POST /score` contract? | No. El contrato de `POST /score` permanece intacto (`S2`). |
| 5 | Consent / privacy impact? | Ninguno adverso. La campana es un opt-in explícito del lead sobre sus propios favoritos y sigue cubierta por la eliminación en cascada (ARCO). |

## Entities

- **`public.proyectos` (modificada, aditiva):**
  - Nueva columna `bono_pie_pct numeric not null default 0` con `check (bono_pie_pct >= 0 and bono_pie_pct <= 30)`.
- **`public.proyecto_favoritos` (modificada, aditiva):**
  - `notificar_cambios boolean not null default false`
  - `umbral_precio_min_uf numeric`
  - `umbral_precio_max_uf numeric`
  - `umbral_bono_pie_pct numeric not null default 0`
  - `alerta_activada_at timestamptz`
  - Nueva policy RLS `"Proyecto favoritos update propio"` (`for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid())`).
- **RPC `public.configurar_alerta_favorito(p_proyecto_id uuid, p_activar boolean) returns jsonb`** (`SECURITY INVOKER`, `authenticated`):
  - Registra el favorito si no existía, activa/desactiva `notificar_cambios` y congela `umbral_precio_min_uf`, `umbral_precio_max_uf` y `umbral_bono_pie_pct` leyendo de `public.proyectos`.
- **RPC `public.importar_proyectos(p_proyectos jsonb)` (actualizada, retrocompatible):**
  - Acepta opcionalmente `bono_pie_pct numeric` en cada fila del archivo; si no viene en el archivo, conserva el valor actual del proyecto (`coalesce(excluded.bono_pie_pct, p.bono_pie_pct, 0)`).
- **`public.lead_change_events` y `public.lead_notification_preferences`:**
  - Se amplía el check de `event_type` con `'favorite_project_opportunity'` y el de `source` con `'catalog_update'`.
- **Trigger `proyectos_evaluar_alertas_favoritos` (`AFTER UPDATE ON public.proyectos`):**
  - Detecta rebaja en `precio_min_uf` o incremento en `bono_pie_pct` respecto a los umbrales de `public.proyecto_favoritos` con `notificar_cambios = true`, recalcula la compatibilidad referencial con la última evaluación del lead y registra el evento en `public.lead_change_events`.

## Algorithms

Ningún `ALG-*` modificado.

**Local logic** (story-local en `frontend/src/lib/simulation/opportunityRadar.js`, `backend/app/lead_changes/service.py` y trigger SQL):
- **Condición de disparo (`E2`):**
  - `rebaja_precio_uf = umbral_precio_min_uf - precio_min_uf_actual` (`> 0`)
  - `aumento_bono_pie_pct = bono_pie_pct_actual - umbral_bono_pie_pct` (`> 0`)
  - Se dispara si `rebaja_precio_uf > 0` o `aumento_bono_pie_pct > 0`.
- **Recálculo de compatibilidad con Bono Pie y nuevo precio en UF:**
  - El bono pie (`bono_pie_pct`, entre `0` y `30`) reduce el porcentaje de pie exigido al ahorro propio del lead:
    - `pie_minimo_efectivo_rate = max(0, 0.10 - bono_pie_pct / 100)`
    - `pie_recomendado_efectivo_rate = max(0, 0.20 - bono_pie_pct / 100)`
    - Para capacidad `ALG-9` cuando la restricción vinculante o el tope está limitado por pie, o al evaluar la brecha de pie (`gapMinimoUf`, `gapRecomendadoUf`) y la capacidad efectiva con bono pie (`capacidad_efectiva_uf`), se evalúa el estado antes (`umbral_precio_min_uf`, `umbral_bono_pie_pct`) y después (`precio_min_uf`, `bono_pie_pct`), produciendo el veredicto referencial (`Compatible`, `Cercano` o `Requiere ajuste`).

## Scope

**In:**
- Criterios `E1` y `E2` de HU 31.
- Migración SQL, rollback, actualización de `schema.sql` y pruebas SQL (`supabase/tests/hu31_radar_oportunidades_alertas.sql`).
- Lógica pura de radar de oportunidades y recálculo de compatibilidad (`frontend/src/lib/simulation/opportunityRadar.js`).
- Extensión de `favoritesService.js`, `projectService.js`, `projectValidation.js` y `projectImport.js`.
- UI de campana `"Notificar cambios"` en `ProjectsCatalog.jsx` y `ProjectEvaluationModal.jsx`.
- Campo `Bono pie (%)` en `AdminProjectCatalog.jsx` y soporte opcional en carga masiva HU 25.
- Renderizado de la alerta en `Inicio` (`App.jsx` -> `LeadChangeTimeline` / `LeadChangeDetail`) y switch de preferencia en `ProfilePage.jsx`.
- Extensión de `LeadChangeService` en `backend/app/lead_changes/service.py` y tests en `backend/tests/test_lead_changes_hu31.py`.

**Out:**
- Alertas por baja de tasas bancarias o subsidio a la tasa (fuera de los criterios E1 y E2 según nota 1 de la HU).
- Alertas sobre avisos externos de Portal Inmobiliario (`public.proyectos_rag`).

## Steps

1. **Migración y Trigger SQL:** Crear `supabase/migrations/20261105120000_hu31_radar_oportunidades_alertas.sql`, rollback en `supabase/rollback/`, sincronizar `supabase/schema.sql` y crear `supabase/tests/hu31_radar_oportunidades_alertas.sql`.
2. **Módulo Puro de Radar y Compatibilidad:** Crear `frontend/src/lib/simulation/opportunityRadar.js` y extender `frontend/src/lib/simulation/compatibility.js`, `frontend/src/services/projectValidation.js` y `frontend/src/lib/catalog/projectImport.js` para soportar `bono_pie_pct` y el cálculo de delta de oportunidad.
3. **Servicios Frontend (`favoritesService.js` y `projectService.js`):** Añadir `getFavoriteAlerts`, `setFavoriteAlert`, soporte en `localProvider` (incluyendo evaluación local de alertas al actualizar catálogo en modo sin Supabase) y propagación de `bono_pie_pct`.
4. **Backend (`lead_changes`):** Extender `backend/app/lead_changes/repository.py`, `backend/app/lead_changes/service.py` y `backend/app/lead_changes/email.py` con `_favorite_opportunity_events` y `recalculate_favorite_compatibility`.
5. **Componentes UI:**
   - Agregar botón de campana `"Notificar cambios"` en tarjetas de favoritos de `ProjectsCatalog.jsx` y en `ProjectEvaluationModal.jsx`.
   - Agregar campo `Bono pie (%)` en el formulario de proyecto de `AdminProjectCatalog.jsx`.
   - Renderizar `favorite_project_opportunity` en `App.jsx` (`LeadChangeDetail`, `leadChangeGroupSummary`) con navegación directa al proyecto y en `ProfilePage.jsx`.
6. **Pruebas Automatizadas:** Implementar `backend/tests/test_lead_changes_hu31.py` y `frontend/src/components/__tests__/hu31OpportunityRadar.test.jsx`.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — Activar alertas sobre un favorito registrando interés y umbrales actuales | 1, 2, 3, 5, 6 | `hu31OpportunityRadar.test.jsx` (`registra el interés y los umbrales de precios actuales al activar la campana Notificar cambios`) y `supabase/tests/hu31_radar_oportunidades_alertas.sql` |
| `E2` — Recalcular compatibilidad y notificar en próximo ingreso ante rebaja de precio o bono pie (edición manual y carga masiva HU 25) | 1, 2, 3, 4, 5, 6 | `test_lead_changes_hu31.py`, `hu31OpportunityRadar.test.jsx` y `supabase/tests/hu31_radar_oportunidades_alertas.sql` |
