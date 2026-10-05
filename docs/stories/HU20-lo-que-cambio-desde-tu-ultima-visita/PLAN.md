# HU20 - Lo que cambio desde tu ultima visita

## Start here

HU20 se implementa por fases. El MVP prioriza una base tecnica segura: eventos de cambio, preferencias por tipo, job diario protegido y una futura pantalla de Inicio centrada en deltas. El email real queda preparado pero desactivado por defecto para no bloquear la implementacion con proveedor, dominio o keys.

No se debe modificar el scoring base ni reespecificar matching. El job puede recalcular/comparar para detectar cambios, pero solo el update rapido iniciado por el lead debe persistir una nueva evaluacion en el MVP.

## Goal

Como lead que ya se evaluo una vez, quiero enterarme cuando algo relevante cambia en mi situacion o en lo que puedo alcanzar, para volver a la plataforma cuando hay una novedad real y no solo cuando alguien me lo recuerda.

## Scope

- Registrar eventos relevantes asociados al lead.
- Ejecutar un job diario backend protegido con Bearer token.
- Preparar email real con Resend para una fase final.
- Respetar frecuencia maxima de un email HU20 semanal por lead.
- Permitir desactivar avisos por tipo de evento.
- Preparar Inicio para mostrar timeline de cambios no vistos y resumen de perfil.
- Permitir update rapido contextual desde Inicio en una fase posterior del MVP.

## Out of scope for MVP

- WhatsApp, push u otros canales.
- Vista de eventos HU20 para ejecutivos.
- Historial de eventos vistos.
- Antiguedad laboral automatica hasta contar con fecha precisa.
- Nuevas reglas de scoring.
- Notificar por email deterioros; esos cambios pueden mostrarse en Inicio con tono neutral.

## Event types

| Type | Email | Persist new evaluation | Notes |
| --- | --- | --- | --- |
| `project_compatible_unlocked` | Yes | No | Usa matching existente. No repetir mismo proyecto ya comunicado. |
| `score_band_improved` | Yes | No | Indicio referencial: con mercado vigente, una nueva evaluacion podria mejorar el tramo si los datos siguen igual. |
| `monthly_plan_summary` | Yes | No | Resumen mensual concreto. |
| `uf_reachability_crossed` | Improvement only | No | Email solo si pasa a alcanzar; deterioro queda visible en Inicio. |
| `quick_update_submitted` | No | Yes | Lo inicia el lead desde Inicio. |

## Notification rules

- Canal externo planificado: email.
- Proveedor planificado: Resend.
- En MVP, `LEAD_CHANGES_EMAIL_ENABLED` queda desactivado por defecto y las notificaciones se registran como `skipped/email_disabled`.
- Remitente visible: RutaHogar.
- Asunto: mixto concreto, por ejemplo `Algo cambio para tu proyecto {nombre}`.
- Tope: maximo un email HU20 cada 7 dias por lead.
- Opt-out: por tipo de evento.
- Si no hay proyecto objetivo, usar mejor match.
- Si hay proyecto objetivo y aparece mejor proyecto compatible, el mensaje debe comparar ambos.
- Siempre incluir CTA, link de desactivacion, resumen de perfil, dato anterior cuando aplique y disclaimer breve.

## Landing UX

- El link del email usa login normal y abre Inicio con parametro de evento.
- Inicio debe mostrar primero cambios no vistos si existen.
- El timeline debe ser explicativo, visual y organizado; no una lista plana.
- Cada evento tiene boton `Entendido` para marcarlo visto.
- Sin cambios no vistos, Inicio muestra resumen de perfil.
- Resumen de perfil: score/tramo, capacidad estimada, proyecto objetivo o mejor match, brecha principal y ultima evaluacion.

## Quick update UX

- Mostrar una card especifica de actualizacion de datos, separada de cada novedad.
- Permitir preseleccionar uno o mas datos agrupados por etapa: financiero, laboral, vivienda objetivo, riesgo/antecedentes.
- Antes de guardar, abrir una ventana con valor anterior y nuevo valor por campo seleccionado.
- Al guardar, actualizar preferencias del perfil, recalcular y persistir una nueva evaluacion para refrescar ultima evaluacion y plan de mejora.

## Data model

- `lead_change_events`: eventos de cambio detectados o generados por el lead.
- `lead_change_notifications`: intentos y envios de email por evento.
- `lead_notification_preferences`: opt-out por tipo de evento.

Los eventos guardan `materiality_key` para idempotencia y `payload` JSONB para que nuevos tipos puedan agregarse sin migrar columnas por cada senal.

## Implementation phases

1. Base tecnica: migracion, RPCs minimos, backend repository, endpoint cron protegido y cliente Resend configurable pero apagado por defecto. Implementado.
2. Detector MVP: `monthly_plan_summary`, `score_band_improved`, `project_compatible_unlocked` y `uf_reachability_crossed`. Implementado con la salvedad de que `score_band_improved` es una senal referencial por recalculo vigente, no una nueva evaluacion persistida, y `project_compatible_unlocked` usa alcance por capacidad contra catalogo disponible como aproximacion backend inicial; portar ALG-10 completo a Python queda como refinamiento.
3. Inicio/timeline: leer eventos no vistos, destacar evento por URL y marcar `Entendido`. Implementado.
4. Update rapido: preseleccionar datos, editar valores con referencia anterior, actualizar preferencias del perfil, recalcular y persistir nueva evaluacion. Implementado para campos agrupados por etapa.
5. Email real: activar `LEAD_CHANGES_EMAIL_ENABLED`, configurar Resend y probar entregabilidad. Pendiente al final.

## Acceptance mapping

- E1: job diario detecta eventos sin accion del usuario y los registra.
- E2: email Resend contiene dato concreto, proyecto, frecuencia, deduplicacion y opt-out por tipo.
- E3: Inicio prioriza delta cuando se abre desde email o hay cambios no vistos.
- E4: update rapido contextual desde Inicio, sin formulario completo ni gestion de hitos.
