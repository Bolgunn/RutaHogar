# PLAN - HU20: Lo que cambio desde tu ultima visita

- **Story:** HU20 - Lo que cambio desde tu ultima visita · **Actor:** Lead/usuario comprador
- **Status:** Built parcial · Sprint 2 · **Depends on / Required by:** HU13 seguimiento mensual, evaluaciones persistidas, `market_data`, catalogo de proyectos
- **Branch:** feat/hu20-lo-que-cambio-desde-tu-ultima-visita

## Start here

Para una sesion de build. Las instrucciones permanentes estan en `docs/HANDBOOK.md` ("Starting a build session"); aqui solo va lo especifico de esta historia.

- Leer primero: `backend/app/lead_changes/service.py`; contiene los detectores automaticos, el cooldown semanal, preferencias por canal y armado del digest.
- Leer primero: `backend/app/lead_changes/routes.py`; expone `GET|POST /lead-changes/daily-digest`, protegido por Bearer token compatible con `LEAD_CHANGES_CRON_TOKEN` y `CRON_SECRET`.
- Leer primero: `backend/app/lead_changes/email.py`; contiene cliente Resend y plantilla digest agrupada.
- Leer primero: `frontend/src/App.jsx`; contiene Inicio, resumen de perfil, novedades agrupadas, popup de detalle y actualizacion rapida.
- Leer primero: `frontend/src/components/ProfilePage.jsx`; contiene switches por tipo/canal para Inicio y Correo.
- Leer primero: `frontend/src/services/leadChangeService.js`; contiene lectura de eventos no vistos, preferencias y registro de update rapido.
- Leer primero: `supabase/migrations/20261003120000_lead_change_events.sql`; define tablas, RPCs e indices de eventos/notificaciones/preferencias.
- Detenerse y reportar si el build requiere cambiar scoring base, pesos financieros, RLS, autenticacion, permisos o hacer updates sobre `evaluations` existentes.
- Detenerse y reportar si un cambio pretende enviar emails individuales por evento; la decision vigente es digest semanal por lead.
- Detenerse y reportar si se quiere incluir `quick_update_submitted` en email; la decision vigente es excluir actualizaciones manuales del digest.

## Goal

Permitir que un lead que ya se evaluo vea rapidamente que cambio desde su ultima visita y vuelva a RutaHogar cuando existe una novedad real: cambio de alcance, senal referencial de mejora, proyecto compatible, resumen mensual o datos actualizados por el mismo usuario.

HU20 no aprueba creditos, no garantiza beneficios habitacionales, no reemplaza evaluacion bancaria formal y no persiste recalculos automaticos como evaluaciones nuevas. Los resultados son referenciales.

## Acceptance criteria

### E1 - Deteccion diaria de cambios relevantes sin accion del usuario

Dado que un lead ya tiene evaluacion previa, cuando el job diario se ejecuta, entonces el sistema debe detectar novedades relevantes sin que el usuario intervenga y registrarlas como eventos deduplicados para Inicio.

### E2 - Correo digest semanal opcional

Dado que el lead tiene novedades no vistas y activo el canal Correo para esos tipos, cuando corresponda enviar comunicacion externa, entonces el sistema debe enviar un unico correo semanal agrupado por tipo, con CTA a Inicio, disclaimer y sin repetir eventos ya enviados.

### E3 - Inicio prioriza novedades no vistas

Dado que el lead entra a Inicio, cuando existan novedades no vistas, entonces el sistema debe mostrarlas agrupadas por tipo; si hay una sola novedad de un tipo se muestra directa, y si hay varias se muestra resumen con popup de detalle.

### E4 - Actualizacion rapida de datos desde Inicio

Dado que el lead identifica que sus datos cambiaron, cuando use Actualizar mi perfil, entonces puede seleccionar uno o mas campos, revisar valores anteriores, guardar cambios, recalcular y persistir una nueva evaluacion sin repetir el formulario completo.

## Approach & decisions

| Decision | Rationale |
| :------- | :-------- |
| Eventos bajo `lead_changes`, no `hu20` tecnico | Evita nombres de historia en codigo runtime y facilita evolucion funcional |
| `evaluations` sigue inmutable | HU13 depende de historial confiable; solo update rapido crea nueva evaluacion |
| `score_band_improved` es senal referencial | Compara ultima evaluacion guardada vs recalculo con mercado vigente sin persistir score automatico |
| Email es digest semanal, no por evento | Reduce ruido y refleja el resumen de Inicio |
| Email es opt-in por tipo | `email` queda apagado por defecto; el lead lo activa en Perfil |
| Inicio queda activo por defecto | `in_app` muestra novedades salvo preferencia explicita en contra |
| `quick_update_submitted` no se envia por email | Es accion manual del usuario, no novedad en ausencia del usuario |
| Digest incluye eventos no vistos | Usa `seen_at is null`, filtrado por preferencias y eventos no enviados antes |
| `project_compatible_unlocked` usa capacidad vs precio minimo | Aproximacion backend MVP; portar `ALG-10` completo a Python queda como refinamiento |
| Cron Vercel usa GET | `GET /lead-changes/daily-digest` existe para Vercel Cron; POST queda para ejecucion manual/API |

## Algorithms

- **Deteccion de resumen mensual**: `monthly_plan_summary` si la ultima evaluacion tiene al menos 30 dias. No recalcula score.
- **Senal de mejora referencial**: `score_band_improved` recalcula con `resolve_market_snapshot_from_environment()` y `calculate_score(..., include_ai=False)`; registra solo si el tramo podria mejorar (`Bajo < Medio < Alto`).
- **Proyecto compatible**: `project_compatible_unlocked` compara `capacidad_compra_estimada_uf` contra `proyectos.precio_min_uf` disponibles/no agotados. MVP aproximado.
- **Cruce de alcance UF**: `uf_reachability_crossed` recalcula capacidad con snapshot vigente y registra si cruza el umbral del proyecto objetivo (`false -> true` o `true -> false`).
- **Update rapido**: `quick_update_submitted` lo inicia el usuario; recalcula por `/score`, crea una nueva evaluacion y registra evento de trazabilidad.

## Scope

**Dentro:**

- Tablas `lead_change_events`, `lead_change_notifications`, `lead_notification_preferences`.
- RPCs de eventos, notificaciones, leads pendientes y update rapido.
- Endpoint cron protegido `GET|POST /lead-changes/daily-digest`.
- Cron Vercel diario en `vercel.json`.
- Detectores MVP: resumen mensual, mejora referencial, proyecto compatible y cruce de alcance.
- Inicio con resumen de perfil, card de actualizacion rapida y novedades agrupadas.
- Popup de detalles con scroll interno y cierre por backdrop.
- Perfil con switches por tipo para `Inicio` y `Correo`.
- Digest semanal Resend agrupado por tipo.

**Fuera:**

- WhatsApp, push u otros canales.
- Emails individuales por evento.
- Incluir actualizaciones manuales en correo.
- Vista ejecutiva de eventos HU20.
- Historial de eventos vistos.
- Cambios de scoring base, pesos financieros o aprobacion bancaria.
- Port completo de `ALG-10` a Python para matching backend.

## UX rules

### Inicio

- Con evaluacion existente, ordenar secciones asi: resumen de perfil, actualizacion de datos, novedades.
- Sin evaluacion existente, mostrar solo la card introductoria `Prepara tu compra con informacion clara`.
- Mostrar novedades no vistas (`seen_at is null`).
- Si un tipo tiene una sola novedad, mostrar titulo, resumen y detalle directo.
- Si un tipo tiene varias novedades, mostrar resumen por tipo y boton `Ver detalles`.
- `Entendido` sobre una card agrupada marca todas las novedades del tipo como vistas.
- `Resumen mensual` no muestra bloque Antes/Ahora.
- Proyecto compatible sin proyecto previo no muestra referencia previa; solo nueva opcion/recomendacion.

### Actualizacion rapida

- Mostrar una card especifica separada de cada novedad.
- Permitir seleccionar uno o mas datos por etapa: finanzas, laboral, vivienda objetivo y antecedentes.
- No preseleccionar campos cuando se abre desde la card general.
- Mostrar valores actuales con etiquetas legibles para selects.
- Abrir modal de confirmacion con valor anterior y nuevo valor por campo seleccionado.
- Al guardar, actualizar `profiles.onboarding_data`, crear una evaluacion nueva, refrescar resumen/plan y registrar `quick_update_submitted`.

### Preferencias

- En Perfil, mostrar switches por tipo y canal: Inicio (`in_app`) y Correo (`email`).
- Inicio activo por defecto si no hay preferencia guardada.
- Correo apagado por defecto si no hay preferencia guardada.
- Apagar Inicio filtra ese tipo en la UI.
- Encender Correo habilita ese tipo para el digest semanal, sujeto a cooldown y deduplicacion.

### Email digest

- Maximo un email cada 7 dias por lead.
- Incluir novedades no vistas y no enviadas antes.
- Filtrar por preferencias `email` activas.
- Excluir `quick_update_submitted`.
- No mostrar bloques Antes/Ahora.
- Incluir resumen de perfil, grupos por tipo, CTA a `/inicio` y disclaimer.

## Entities

| Surface | Contract |
| :------ | :------- |
| `lead_change_events` | Eventos por lead, tipo, `materiality_key`, valores opcionales, `seen_at` e idempotencia |
| `lead_change_notifications` | Intentos/envios por evento, canal, estado, provider, subject y payload |
| `lead_notification_preferences` | Preferencias por `user_id`, `event_type`, `channel` (`in_app`, `email`) |
| `evaluations` | Historial inmutable; update rapido inserta nueva evaluacion, no modifica anteriores |
| `profiles.onboarding_data` | Preferencias/ contexto declarado actualizado por update rapido |
| `proyectos` | Catalogo usado por detector MVP de proyectos compatibles |
| `market_data` | Snapshot vigente usado para recalculos referenciales |
| `vercel.json` | Cron diario `0 12 * * *` y rewrite `/lead-changes/(.*)` a FastAPI |

## Risks and follow-ups

| Risk | Follow-up |
| :--- | :-------- |
| `project_compatible_unlocked` usa aproximacion por capacidad/precio minimo | Portar `ALG-10` completo a backend si se requiere precision comercial |
| Digest consulta hasta 50 eventos no vistos por lead | Ajustar limite/paginacion si el volumen crece |
| Email opt-in puede dejar bajo uso inicial | Medir activacion y ajustar onboarding de preferencias |
| Eventos manuales de prueba pueden entrar al digest si quedan no vistos y elegibles | Limpiar datos `test-%` antes de pruebas productivas |
| Snapshot de mercado no disponible impide senales de score/alcance | Monitorear errores de `market_data` y fallback operacional |
| Emails dependen de dominio Resend verificado | Validar SPF/DKIM/DMARC antes de activar `LEAD_CHANGES_EMAIL_ENABLED=true` |

## Change log

| Date | Change |
| :---- | :----- |
| 2026-10-03 | Creado plan HU20, base tecnica de eventos, preferencias, cron y timeline. |
| 2026-10-06 | Actualizado plan a estado built: Inicio agrupado, update rapido, preferencias por canal, digest semanal Resend opt-in y cron Vercel. |
