# Historias de Usuario — Cobertura de gaps del Survey

> Fecha: 2026-06-24
> Origen: `Survey Cobertura Requisitos.md` + `ScoreLeads Blueprint.md`. Formato tomado de `hus_24-06-26_v2.md`.
> Numeración desde HU34 para no chocar con el backlog vigente (HU 1–HU 30). Estas historias son una **propuesta de brechas**, no forman parte del backlog aprobado; ver [[../UserStories/index\|Historias de usuario]].
> Cubren los requisitos con score 1 (No cubierto) y score 2 (Parcial) del survey.

## Mapa HU → requisito cubierto

| HU | Requisito(s) | Score original |
|:---|:-------------|:--------------|
| HU34 | FR13 Notificaciones multicanal | 1 |
| HU35 | FR15 Agendamiento lead↔ejecutivo | 1 |
| HU36 | NFR6 Disponibilidad + NFR7 Escalabilidad | 1 |
| HU37 | NFR8 Mantenibilidad | 1 |
| HU38 | FR11 Re-engagement + FR12 Engagement scoring | 2 |
| HU39 | FR18 Historial inmutable / versionado | 2 |
| HU40 | FR17 OCR de documentos | 2 |
| HU41 | FR22 Integración CMF/Dicom real | 2 |
| HU42 | FR21 App móvil nativa (RN+Expo) | 2 |
| HU43 | NFR4 Performance + NFR5 Usabilidad | 2 |

---

| Nombre  Historia:            | HU34 \- Notificaciones multicanal (WhatsApp / email / push)                                                                                                                                                                                                                                                                                                                                            |                     |     |
| :--------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------ | :-- |
| **Categoría Historia:**      | Importante                                                                                                                                                                                                                                                                                                                                                                                             | Puntos de Historia: | 8   |
| **Descripción:**             | **Como** usuario de la plataforma (lead o ejecutivo comercial), **quiero** recibir notificaciones por WhatsApp, email o push según mi preferencia, **para** enterarme a tiempo de leads relevantes, recordatorios y confirmaciones sin depender de revisar la aplicación.                                                                                                                              |                     |     |
| **Criterios de Aceptación:** | E1 \- Aviso de lead con capacidad de compra compatible **Dado** que un lead completó su evaluación y su capacidad de compra absoluta calza con un proyecto que vende un ejecutivo, **cuando** el sistema detecta el match, **entonces** debe enviar una notificación al ejecutivo correspondiente a través del notification service, registrando canal, template y estado en la tabla `notifications`. |                     |     |
|                              | E2 \- Nudge de re-engagement al usuario **Dado** que un usuario tiene notificaciones activas, **cuando** el sistema determina que corresponde un recordatorio de re-engagement (ver HU38), **entonces** debe enviarle un nudge por su canal preferido (WhatsApp o email).                                                                                                                              |                     |     |
|                              | E3 \- Confirmación de agendamiento **Dado** que se crea, confirma o reagenda una reunión lead↔ejecutivo, **cuando** cambia el estado de la cita, **entonces** ambas partes deben recibir una notificación de confirmación por su canal preferido.                                                                                                                                                      |                     |     |
|                              | E4 \- Preferencia de canal y opt-out **Dado** que un usuario accede a sus preferencias de notificación, **cuando** elige un canal o desactiva las notificaciones, **entonces** el sistema debe respetar esa elección en todos los envíos posteriores y no enviar por canales desactivados (cumplimiento Ley 19.628).                                                                                   |                     |     |
|                              | E5 \- Abstracción del proveedor **Dado** que todo envío pasa por el notification service único, **cuando** se cambia un proveedor (Meta WhatsApp Cloud API, Resend, Expo Push), **entonces** el código de las features que disparan notificaciones no debe modificarse.                                                                                                                                |                     |     |

| Nombre  Historia: | HU35 \- Agendamiento de reuniones lead ↔ ejecutivo |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Importante | Puntos de Historia: | 5 |
| **Descripción:** | **Como** lead o ejecutivo comercial, **quiero** agendar reuniones entre ambos de forma bidireccional, **para** coordinar el contacto comercial sin intercambios manuales de correos. |  |  |
| **Criterios de Aceptación:** | E1 \- Iniciativa bidireccional **Dado** que un lead o un ejecutivo quiere reunirse, **cuando** cualquiera de los dos propone un horario desde su vista, **entonces** el sistema debe crear una cita en estado "propuesta" en la tabla `appointments`, asociada a ambos. |  |  |
|  | E2 \- Confirmación o reagendamiento **Dado** que existe una cita propuesta, **cuando** la contraparte la acepta, rechaza o propone otro horario, **entonces** el sistema debe actualizar el estado de la cita (confirmada / reagendada / cancelada) y notificar a ambas partes vía HU34. |  |  |
|  | E3 \- Prevención de choques de horario **Dado** que un ejecutivo ya tiene una cita confirmada en un bloque horario, **cuando** se intenta agendar otra que se solape, **entonces** el sistema debe impedirlo o advertir claramente el conflicto. |  |  |
|  | E4 \- Cierre de la cita **Dado** que una cita confirmada ya ocurrió, **cuando** el ejecutivo la marca como realizada o no asistida, **entonces** el sistema debe registrar el resultado para el seguimiento comercial. |  |  |

| Nombre  Historia: | HU36 \- Disponibilidad y escalabilidad del sistema |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Importante | Puntos de Historia: | 5 |
| **Descripción:** | **Como** equipo de desarrollo/DevOps, **quiero** monitorear la disponibilidad del sistema y validar su comportamiento bajo carga, **para** garantizar un uptime ≥95% y soportar ≥100 evaluaciones sin pérdida de datos durante el periodo de prueba. |  |  |
| **Criterios de Aceptación:** | E1 \- Monitoreo de uptime **Dado** que el sistema está desplegado en staging/producción, **cuando** transcurre el periodo de prueba, **entonces** un mecanismo de monitoreo debe registrar la disponibilidad evidenciando un uptime ≥95%, con alerta ante caídas. |  |  |
|  | E2 \- Smoke tests post-deploy **Dado** que se ejecuta un deploy, **cuando** finaliza el pipeline, **entonces** deben correr smoke tests que verifiquen que los endpoints críticos (incluido `POST /score`) responden correctamente. |  |  |
|  | E3 \- Prueba de carga **Dado** que se simulan ≥100 evaluaciones, **cuando** se ejecuta la prueba de carga sobre Supabase, **entonces** el sistema debe procesarlas sin pérdida de datos ni degradación que impida mostrar el score dentro del límite definido. |  |  |

| Nombre  Historia:            | HU37 \- Mantenibilidad: código modular                                                                                                                                                                                                                                                    |                     |     |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------ | :-- |
| **Categoría Historia:**      | Deseable                                                                                                                                                                                                                                                                                  | Puntos de Historia: | 3   |
| **Descripción:**             | **Como** equipo de desarrollo, **quiero** mantener el código organizado en módulos independientes (frontend / backend / scoring / notifications), **para** poder evolucionar o reemplazar cada parte sin afectar a las demás.                                                             |                     |     |
| **Criterios de Aceptación:** | E1 \- Separación de módulos **Dado** que se incorpora código nuevo, **cuando** se revisa el PR, **entonces** la lógica debe ubicarse en su módulo correspondiente (frontend, backend, scoring engine, notification service) sin mezclar responsabilidades.                                |                     |     |
|                              | E2 \- Aislamiento de proveedores externos **Dado** que se cambia un proveedor externo (IA o canal de notificación), **cuando** se realiza el cambio, **entonces** solo debe tocarse la implementación detrás de la interfaz, sin modificar el código de las features que la consumen.     |                     |     |
|                              | E3 \- Criterio en el Definition of Done **Dado** que una funcionalidad se considera terminada, **cuando** se evalúa contra el DoD, **entonces** debe cumplir el criterio de modularidad (sin dependencias cruzadas indebidas) además de pasar lint, build y los tests del scoring engine. |                     |     |

| Nombre  Historia: | HU38 \- Score de compromiso del usuario y re-engagement |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Importante | Puntos de Historia: | 8 |
| **Descripción:** | **Como** ejecutivo comercial, **quiero** que el sistema calcule un score de compromiso del usuario a partir de sus eventos y reactive automáticamente a los usuarios inactivos, **para** priorizar a los leads más comprometidos y recuperar a los que se enfrían. |  |  |
| **Criterios de Aceptación:** | E1 \- Cálculo del engagement score **Dado** que un usuario genera eventos (login, avance de plan, ahorro registrado, actualización de datos), **cuando** el sistema recomputa su compromiso, **entonces** debe calcular un engagement_score ponderado a partir de los `engagement_events` y persistirlo en `engagement_scores`. |  |  |
|  | E2 \- Exposición al ejecutivo **Dado** que un ejecutivo revisa un lead, **cuando** abre su perfil, **entonces** debe ver el engagement_score junto al score financiero como señal de probabilidad de cierre. |  |  |
|  | E3 \- Nudge automático por inactividad **Dado** que un usuario lleva más de X días inactivo o su engagement cae bajo un umbral definido, **cuando** el sistema lo detecta, **entonces** debe enviarle automáticamente un nudge de re-engagement por WhatsApp/email vía HU34, respetando sus preferencias. |  |  |
|  | E4 \- Respeto del opt-out **Dado** que un usuario desactivó las notificaciones, **cuando** corresponda un nudge, **entonces** el sistema no debe enviarlo y debe registrar la omisión. |  |  |

| Nombre  Historia: | HU39 \- Historial inmutable y versionado de evaluaciones |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Importante | Puntos de Historia: | 5 |
| **Descripción:** | **Como** administrador inmobiliario/dev, **quiero** que cada recálculo o ajuste del scoring genere una nueva evaluación versionada e inmutable enlazada a la anterior, **para** conservar un historial fiel y trazable que no pueda alterarse. |  |  |
| **Criterios de Aceptación:** | E1 \- Nueva versión por recálculo **Dado** que ocurre un recálculo o ajuste del score (pago de deuda HU8 E11, cambio de configuración HU14, ajuste por CMF HU41/HU25, simulación de subsidio HU26), **cuando** el sistema actualiza la evaluación, **entonces** debe crear un nuevo registro de evaluación versionado en vez de modificar el existente. |  |  |
|  | E2 \- Inmutabilidad y linaje **Dado** que existe una evaluación previa, **cuando** se genera su sucesora, **entonces** el registro anterior debe permanecer inmutable (sin UPDATE ni DELETE) y quedar enlazado a la nueva versión. |  |  |
|  | E3 \- Trazabilidad del registro **Dado** que se persiste una evaluación, **cuando** se guarda, **entonces** debe incluir timestamp, `scoring_version`, snapshot de los datos de entrada y el motivo del recálculo. |  |  |
|  | E4 \- Coherencia con la auditoría **Dado** que un ejecutivo/admin consulta el historial (HU15), **cuando** revisa una evaluación, **entonces** debe poder reconstruir la cadena de versiones en orden cronológico con su motivo. |  |  |

| Nombre  Historia:            | HU40 \- OCR de documentos: extracción, prellenado y cotejo                                                                                                                                                                                                                                                               |                     |     |
| :--------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------ | :-- |
| **Categoría Historia:**      | Deseable                                                                                                                                                                                                                                                                                                                 | Puntos de Historia: | 8   |
| **Descripción:**             | **Como** usuario y ejecutivo comercial, **quiero** que el sistema extraiga el contenido de los documentos cargados para prellenar el formulario y cotejarlo contra lo declarado, **para** reducir la fricción de captura y validar la veracidad de los datos.                                                            |                     |     |
| **Criterios de Aceptación:** | E1 \- Extracción OCR **Dado** que un usuario sube un documento permitido (liquidación, cartola), **cuando** el sistema lo procesa, **entonces** debe extraer por OCR los campos clave (renta, empleador, deudas) y guardar los metadatos en la tabla `documents`.                                                        |                     |     |
|                              | E2 \- Prellenado del formulario **Dado** que se extrajeron datos de un documento, **cuando** el usuario continúa su preevaluación, **entonces** el sistema debe prellenar los campos correspondientes del formulario dejándolos editables por el usuario.                                                                |                     |     |
|                              | E3 \- Cotejo declarado vs documento **Dado** que existe un valor autodeclarado y un valor extraído por OCR, **cuando** el ejecutivo revisa el lead, **entonces** el sistema debe mostrar las discrepancias entre ambos como señal de confianza, sin alterar automáticamente el score (que sigue basado en lo declarado). |                     |     |

| Nombre  Historia: | HU41 \- Integración real con CMF / Dicom |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Importante | Puntos de Historia: | 8 |
| **Descripción:** | **Como** ejecutivo comercial, **quiero** consultar los antecedentes reales de morosidad y endeudamiento del lead en CMF/Dicom, **para** evaluar su comportamiento de pago con datos oficiales en vez de una simulación. |  |  |
| **Criterios de Aceptación:** | E1 \- Consulta con consentimiento explícito **Dado** que se requiere consultar antecedentes en CMF/Dicom, **cuando** se inicia la consulta, **entonces** el sistema debe exigir el consentimiento explícito del usuario (Ley 19.628) y registrarlo antes de ejecutarla. |  |  |
|  | E2 \- Ajuste versionado del scoring **Dado** que la consulta real devuelve morosidad/deuda, **cuando** el sistema incorpora el resultado, **entonces** debe ajustar el score generando una nueva evaluación versionada (HU39) que registre el motivo y la fuente oficial. |  |  |
|  | E3 \- Manejo de error sin fallback **Dado** que la integración con CMF/Dicom no responde o falla, **cuando** se intenta la consulta, **entonces** el sistema debe informar el error y no ajustar el score (no degrada a la simulación de HU25). |  |  |
|  | E4 \- Distinción frente a la simulación **Dado** que existen tanto la consulta simulada (HU25) como la real, **cuando** el ejecutivo ve el resultado, **entonces** el sistema debe indicar claramente cuál corresponde a una consulta oficial real y cuál a la simulación interna. |  |  |

| Nombre  Historia: | HU42 \- Kickoff de la app móvil nativa (React Native + Expo) |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Esencial | Puntos de Historia: | 5 |
| **Descripción:** | **Como** equipo de desarrollo móvil, **quiero** levantar el scaffold de la app nativa en React Native + Expo con una capa de API y tipos compartida con la web, **para** iniciar el track móvil nativo reutilizando la lógica existente. |  |  |
| **Criterios de Aceptación:** | E1 \- Scaffold Expo funcional **Dado** que arranca el track móvil (Milestone 1), **cuando** se inicializa el proyecto, **entonces** debe existir un scaffold en React Native + Expo que compile y ejecute en un emulador o dispositivo. |  |  |
|  | E2 \- Capa API/tipos compartida **Dado** que la web y la móvil consumen el mismo backend, **cuando** se construye la capa de acceso a datos, **entonces** las llamadas a la API y los tipos deben compartirse entre web y móvil evitando duplicación. |  |  |
|  | E3 \- Distinción del track responsive **Dado** que ya existen las HU móviles responsive (lead y dashboard), **cuando** se valida este kickoff, **entonces** debe quedar claro que corresponde al track nativo (no a la web responsive) y que la submission a stores queda fuera de alcance (post-05-nov). |  |  |

| Nombre  Historia: | HU43 \- Performance del scoring y usabilidad del formulario |  |  |
| :---- | :---- | :---- | :---- |
| **Categoría Historia:** | Importante | Puntos de Historia: | 3 |
| **Descripción:** | **Como** equipo de QA/producto, **quiero** verificar que el score se muestra en <60 s y que ≥80% de los usuarios completa el formulario sin ayuda en <10 min, **para** asegurar que el producto cumple sus metas SMART de rendimiento y usabilidad. |  |  |
| **Criterios de Aceptación:** | E1 \- Performance del score **Dado** que un usuario envía el formulario de preevaluación, **cuando** el sistema procesa la evaluación en staging, **entonces** el score debe mostrarse en menos de 60 segundos. |  |  |
|  | E2 \- Usabilidad del formulario **Dado** que se realiza una prueba de usabilidad con una muestra representativa, **cuando** los usuarios completan el formulario sin asistencia, **entonces** al menos el 80% debe terminarlo en menos de 10 minutos. |  |  |
|  | E3 \- Bloqueo de aceptación si no se cumple **Dado** que una de las metas no se alcanza, **cuando** se evalúa la HU contra los criterios SMART, **entonces** el resultado debe registrarse y la funcionalidad no debe darse por aceptada hasta corregirlo. |  |  |
