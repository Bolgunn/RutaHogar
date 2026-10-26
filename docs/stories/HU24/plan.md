# PLAN — HU 24: Asistente virtual y sistema de tickets para usuarios

- **Historia:** `Wiki RutaHogar/UserStories/HU24-asistente-virtual-tickets.md` · **Actor:** administrador inmobiliario, ejecutivo, lead
- **Estado:** propuesto (alcance ampliado: incluye bandeja de admin y correo; ver Alcance — 8 SP puede quedar corto, reevaluar al estimar) · Deseable · 8 SP · **Depende de:** HU12 Academia Financiera (implementada, contenido en `frontend/src/constants/academyContent.js`) e integración Groq existente (`backend/app/ai.py`, implementada). **Requerida por:** ninguna.
- **Branch:** `feat/hu24-assistant-tickets`

## Start here

Para la sesión de build. Las instrucciones permanentes están en `docs/HANDBOOK.md` ("Starting a build
session"); aquí solo va lo específico de esta historia.

- Leer primero:
  - `backend/app/ai.py` y `backend/app/config.py` — cómo se llama a Groq, el contrato "si falla → `None`", `GROQ_MODEL`.
  - `backend/app/main.py` + `api/score.py` + `vercel.json` — **es una única función serverless de Python, no una Edge Function**; los endpoints nuevos necesitan un rewrite en `vercel.json`.
  - `backend/app/tracking/routes.py` y `repository.py` — patrón de endpoints autenticados ya existente: `HTTPBearer` + `TrackingRepository.authenticate(token)` (valida el JWT contra `/auth/v1/user` de Supabase) y `staff_actor(token)` (lee `role` e `inmobiliaria_id` de `profiles`). Reusar ese patrón; no inventar otra vía de autenticación.
  - `backend/app/lead_changes/email.py` (cliente Resend en el backend: manejo de errores sin filtrar detalle del proveedor, `html.escape`) y `supabase/functions/notify-admin-arco/index.ts` (notificación al admin por un registro creado por un usuario — el precedente más cercano a este caso). Mirar también `supabase/functions/.env.example` para las variables de correo.
  - `frontend/src/components/AdminArcoRequests.jsx` + `frontend/src/services/arcoService.js` y la migración `supabase/migrations/20260801_arco_global_admin_only.sql` — precedente exacto de una bandeja que **solo ve el admin global (equipo RutaHogar)**: lista leída con RLS desde el cliente de Supabase y policies con `is_global_admin()`.
  - `docs/stories/HU16/` (`reviewed HU16.md`, `RESOLUCION_REVIEW_HU16.md`) — lecciones de RLS: una RPC `SECURITY DEFINER` sin chequeo de rol, o una tabla sin RLS, fue bloqueante en esa revisión.
  - `frontend/src/constants/academyContent.js` (fuente de la KB), `frontend/src/components/FieldTooltip.jsx` y `GlossaryTerm.jsx` (el significado de los campos ya está escrito una vez — reutilizar, no reescribir).
  - `docs/database.md` — reglas de migración (los cambios de policy/función también van en `supabase/schema.sql`; correr `node scripts/check-schema-drift.js`).
- Detenerse y reportar si:
  - `TrackingRepository.authenticate`/`staff_actor` no se pueden reusar tal cual desde el módulo nuevo (ver Supuestos) — decidir si se extraen a un módulo compartido en un commit aparte (mover sin cambiar comportamiento), no copiar y pegar;
  - la KB supera el presupuesto de tamaño del Paso 2 — eso es una decisión, no una elección de código;
  - hay tentación de agregar `torch`, `transformers`, `sentence-transformers`, `langchain` o `llama-index` a `requirements.txt`. No hacerlo. Ver el ADR.

## Objetivo

Como usuario de la plataforma (administrador inmobiliario, ejecutivo, lead), quiero poder realizar preguntas a un asistente virtual sobre el uso de la aplicación o conceptos financieros, y poder escalar mi consulta mediante un ticket de soporte si la respuesta no es suficiente, para poder resolver mis dudas y continuar usando la plataforma sin bloqueos.

## Architecture Decision Record

### ADR-24.1 — Implementación del asistente: recuperación determinista primero, LLM solo para redactar

**Estado:** Propuesto · **Contexto:** presupuesto cero, límites de Vercel, safeguards S1/S7 y una
base de conocimiento que ya existe como contenido estático (Academia + ayuda de campos de la UI).

**Veredicto de viabilidad: viable con un diseño "RAG-lite". No viable con nada que ejecute un modelo
localmente.**

#### Límites de Vercel que condicionan la decisión

Las cifras provienen de la documentación pública de Vercel según se entendía al escribir este plan —
**verificarlas contra la documentación vigente antes del build** (cambian según plan y runtime).

| Runtime | Límite relevante | Consecuencia para nosotros |
| :------ | :--------------- | :------------------------- |
| Edge Functions | ~1–4 MB de código comprimido (según plan) | Sin librerías de ML ni Python. No sirve para esto y **no es lo que usamos**. |
| Python serverless (nuestro `api/score.py`) | ~500 MB sin comprimir; body de request ≤ ~4,5 MB; `maxDuration` configurable (usamos 60 s) | Mucho margen para *código*, pero dependencias tipo `torch` (~0,7–2 GB) no caben. El cold start crece con el tamaño del bundle. |
| Node serverless | ~250 MB sin comprimir | No lo usa el backend. |

La duda "500 MB o 50 MB" se resuelve así: 500 MB es el techo de Python serverless, ~50 MB es la
cifra comprimida que aplica a funciones serverless en general, y Edge es de un dígito de MB.
**La restricción que realmente manda no es el techo sino el cold start y el presupuesto de
cómputo**: el código nuevo debe pesar unos cientos de KB y agregar **cero** dependencias pesadas
(`groq` y `httpx` ya están en `requirements.txt`). HU19 ya lo aprendió: los embeddings pasan por la
API de Hugging Face porque `torch` no cabe.

#### Opciones evaluadas

| Opción | Impacto en bundle | Costo mensual | Calidad de respuesta | Veredicto |
| :----- | :---------------- | :------------ | :------------------- | :-------- |
| A. LLM local / sentence-transformers dentro de la función | +0,7–2 GB | $0 | buena | **Rechazada** — excede límites y destruye el cold start. |
| B. FAQ / bot de reglas puro, sin LLM | ~0 | $0 | rígida; falla con preguntas reformuladas | Útil como **nivel de respaldo**, no como producto completo. |
| **C. Recuperación léxica (BM25) sobre KB estática + llamada opcional a Groq para redactar** | **~0 (un JSON ≤ ~1 MB + ~150 líneas de Python puro)** | **$0 en el tier gratuito de Groq** | buena en preguntas del dominio, fundamentada, sin links inventados | **Elegida.** |
| D. Recuperación con pgvector (reusar `intfloat/multilingual-e5-small` de HU19 vía API de HF) + Groq | pequeño | $0 en capas gratuitas, pero suma una ida y vuelta a HF por pregunta | mejor recall ante paráfrasis | **Fase 2** — la infraestructura ya existe; solo vale la pena si los fallos de C aparecen en los tickets. |
| E. Asistente de pago (OpenAI/Anthropic, plataformas de agentes, Intercom Fin) | pequeño | $$ por conversación/asiento | la mejor | **Más adelante**, detrás del mismo contrato de endpoint, si el cliente lo financia. |

#### Decisión

1. **La recuperación es determinista y corre en el proceso.** Un scorer BM25/palabras clave
   pequeño (Python puro, sin dependencias) rankea los chunks de la KB. Los chunks están en español,
   etiquetados con `audience`, `screen_id`, `field_id` opcional y un `link` opcional **en lista
   blanca** (`{label, route}`).
2. **El LLM nunca decide nada.** Recibe la pregunta, ≤ 3 chunks recuperados y los últimos turnos, y
   se le indica responder **solo** con los chunks. Los links, botones y banderas de escalamiento
   vienen de la KB / la capa de reglas, **nunca de la salida del modelo**. Así S1 y S7 quedan
   intactos (el asistente nunca calcula ni ajusta un score, nunca promete aprobación, nunca da
   asesoría financiera personalizada).
3. **Tres niveles, del más barato al más caro**, para gastar cuota solo donde aporta valor:
   - *Nivel 0 — sin LLM:* usuarios anónimos, falta de `GROQ_API_KEY`, error/429 de Groq, o un acierto
     exacto fuerte en la KB → se devuelve el texto del mejor chunk tal cual.
   - *Nivel 1 — Groq redacta:* usuario autenticado y puntaje de recuperación sobre el umbral → Groq
     reescribe los chunks en una respuesta corta y conversacional.
   - *Nivel 2 — fuera de alcance / sin coincidencia:* recuperación bajo el umbral → **no se llama al
     LLM**; se responde "no encontré información sobre eso" y se marca `suggest_escalation = true`.
4. **El escalamiento no se deja al modelo.** Cada respuesta lleva botones "¿Te sirvió? Sí / No"
   (deterministas). Un "No" — o texto libre que coincida con las frases señal de
   `lib/assistant/escalation.js` — muestra la acción "Contactar a Soporte" (E3).
5. **Los datos personales se enmascaran antes de salir de nuestra infraestructura y antes de
   persistir.** Un `redact_pii()` puro enmascara RUT, secuencias largas de dígitos (tarjetas/cuentas)
   y correos en el texto enviado a Groq y en la transcripción guardada. El widget muestra "No
   compartas tu RUT ni claves".
6. **Los anónimos reciben solo Nivel 0** (E1 cubre el flujo anónimo de pre-evaluación sin exponer
   costos). Los tickets exigen sesión — un ticket debe identificar a su autor.

**Consecuencias.**
(+) Línea base en $0, sin dependencias nuevas, impacto de bundle despreciable, funciona con Groq caído.
(+) Las respuestas son auditables: cada una se mapea a ids de chunks, registrados en el servidor.
(−) La recuperación léxica falla con paráfrasis fuertes y errores de tipeo; se mitiga con sinónimos
en la KB y normalización de tildes y mayúsculas. Medir con los clics en "No" y los tickets antes de
pagar por D.
(−) El tier gratuito de Groq tiene límites de tasa y puede cambiar sus términos (verificar límites
vigentes); el circuit breaker hace que esto sea una degradación de calidad, no una caída.
(−) La KB es un artefacto de build y puede quedar desactualizada → chequeo en CI en el Paso 2.

**Ruta de mejora (sin cambiar el contrato):** D (pgvector) detrás de `retrieve()`; luego E detrás de
`llm.py`; luego streaming, bandeja de tickets para admin y notificación por correo.

### ADR-24.2 — Tickets: tabla en Supabase + endpoint del backend + bandeja de admin

E4 permite "registro en base de datos y/o envío de correo"; **se hacen los dos**, con roles distintos:
la **bandeja de admin es la fuente de verdad** (un ticket nunca se pierde si el correo falla) y el
**correo es el aviso** (nadie tiene que acordarse de abrir la bandeja).

El ticket se escribe mediante un endpoint del backend (no un insert directo del cliente) para que la
transcripción se **recorte y enmascare en el servidor** y los campos de identidad salgan del token
verificado, nunca del body. La identidad se resuelve reusando `TrackingRepository.authenticate`
(JWT validado contra Supabase) y el rol/inmobiliaria desde `profiles`, igual que `tracking`. La
lectura y el cambio de estado por parte del admin respetan RLS; el cambio de estado va por una RPC
`SECURITY DEFINER` con chequeo de rol (lección de HU16: una policy de `UPDATE` abierta permitiría
editar el mensaje del ticket y una RPC sin chequeo permitiría a un lead cerrar tickets ajenos).

**Audiencia (decidido el 2026-10-26):** los tickets de **todos** los roles — lead, ejecutivo y admin
inmobiliario — llegan **solo al equipo de RutaHogar** (rol "Admin. Desarrollador" de la matriz RBAC de
Spike 2, que en el código es `is_global_admin()`). Ni el ejecutivo ni el admin de la inmobiliaria
ven tickets ajenos; cada usuario ve solo los suyos. Esto sigue el patrón ya usado para ARCO
(`20260801_arco_global_admin_only.sql`) y evita que una inmobiliaria lea conversaciones de sus leads con
el soporte de la plataforma. Es coherente con Spike 2: el Admin Desarrollador tiene "Lectura global
(para soporte técnico)", y las inmobiliarias no tienen ese módulo.

### ADR-24.3 — Correo de aviso: Resend (ya integrado), best-effort

**Hallazgo en el repo:** el proyecto ya usa **Resend** en tres lugares — `backend/app/lead_changes/email.py`
(`ResendEmailClient`, `RESEND_API_KEY`, `RUTAHOGAR_EMAIL_FROM`), y las Edge Functions `notify-admin-arco`,
`submit-feedback`, `create-executive` y `co-debtor-consent`. No hay otro proveedor.

| Opción | Veredicto |
| :----- | :-------- |
| **Resend** | **Elegido.** Ya está integrado, el secreto ya existe, hay patrón de código y de manejo de errores que copiar, y su capa gratuita (del orden de 3.000 correos/mes y ~100/día — verificar vigente) sobra para un aviso por ticket. |
| "Jetmail" | No encontré ningún uso en el repo y no puedo confirmar con certeza a qué servicio se refiere (¿Mailjet, Brevo/Sendinblue?). Cualquiera de esos agrega un proveedor, un secreto y un segundo cliente HTTP para nada que Resend no haga ya. Solo tendría sentido si Resend dejara de ser gratuito para nuestro volumen o si el cliente ya tuviera cuenta en otro. |
| SMTP genérico / Gmail | Rechazado: credenciales de una cuenta personal en variables de entorno, límites bajos y peor entregabilidad. |

**Dominio:** `rutahogar.cl` ya está verificado en Resend (confirmado por el equipo), así que se puede
enviar a cualquier destinatario real. `SUPPORT_FROM_EMAIL` usa un remitente de ese dominio (por ejemplo
`RutaHogar Soporte <soporte@rutahogar.cl>`) y `SUPPORT_NOTIFICATION_EMAIL` es el buzón del equipo
(preferible un alias compartido y no una cuenta personal).

**Diseño.** Después de insertar el ticket, el backend envía el correo **dentro del mismo request**
(en Vercel las tareas en segundo plano no son confiables tras responder) con timeout corto. Si falla,
**el ticket igual se crea y el usuario igual ve la confirmación**; se guarda `notification_error`
(código, nunca el detalle del proveedor) y la bandeja muestra el ticket con la marca "sin aviso". El
correo lleva código, rol, nombre/correo del autor, asunto, mensaje y la transcripción ya enmascarada,
escapados con `html.escape`, más un enlace a la bandeja.

## Enfoque y decisiones

Construir un módulo `assistant` autocontenido a cada lado del stack, conectarlo con un par de
endpoints y un widget flotante, y agregar una tabla. El conocimiento se genera desde contenido que ya
tenemos, de modo que hay una sola fuente de verdad para una definición financiera (Academia) y una
para la ayuda de campos (`FieldTooltip`/`GlossaryTerm`).

| Decisión | Fundamento |
| :------- | :--------- |
| Corre en la FastAPI existente, no en una Edge Function nueva | Edge no aloja Python y tiene un límite de código del orden de MB; una función mantiene un solo cold start y un solo deploy. |
| BM25 sobre JSON estático, sin embeddings en la v1 | Cero dependencias y cero latencia; la KB son unos cientos de chunks. Los embeddings (infra de HU19) son la mejora de la Fase 2. |
| La salida del LLM es solo texto; links/escalamiento salen de reglas | Evita URLs alucinadas y mantiene S1/S7 demostrables. |
| Reusar `GROQ_API_KEY` / `GROQ_MODEL`, nuevo `assistant/llm.py` | `_ask_groq` recibe un solo string de prompt; el asistente necesita system + historial. **No** cambiar la firma de `_ask_groq` (otros llamadores). Se comparten config y el contrato "falla → `None`". |
| `reasoning_effort="low"` y `max_tokens` pequeño para `openai/gpt-oss-*` | Mismo razonamiento que `ai.py`: los tokens de razonamiento consumen el presupuesto de salida. |
| Anónimo = Nivel 0; LLM solo para autenticados | Acota la exposición al tier gratuito sin necesitar un rate limiter distribuido. |
| Límite suave por usuario, best-effort en proceso, más la cuota de Groq como techo duro | Las instancias serverless no comparten memoria, así que el limitador es una cortesía, no una garantía; el circuit breaker cubre el resto. |
| Tickets vía backend con JWT del usuario | Recorte/enmascarado en servidor e identidad confiable; RLS sigue aplicando. |
| Bandeja = fuente de verdad, correo = aviso best-effort | El correo puede fallar o ir a spam; el ticket no puede depender de él. |
| Resend, sin proveedor nuevo | Ya integrado en backend y Edge Functions; cero secretos nuevos salvo destinatario/remitente de soporte. |
| Cambio de estado por RPC `SECURITY DEFINER` con chequeo de rol | Evita la clase de bug que HU16 tuvo como bloqueante. |
| Bandeja en `features/assistant`, montada desde `AdminPanel.jsx` | Sigue el precedente de `AdminArcoRequests.jsx` sin que una feature importe a otra. |
| Creación idempotente (`client_request_id` único por usuario) | Un doble clic no debe generar dos tickets. |
| Sin número ALG | No toca scoring y tiene un solo consumidor; los umbrales son lógica local de la historia, viven en `assistant/constants.py` y en el log de supuestos de abajo. |
| Código nuevo en `features/assistant` + `lib/assistant` (frontend), `app/assistant` (backend) | Regla de imports del handbook: lógica pura en `lib/`, una feature nunca importa otra feature. El widget se monta desde `App.jsx` solo como cableado del shell. |

## Preguntas permanentes

| # | Pregunta | Respuesta |
| :- | :------- | :-------- |
| 1 | ¿Toca scoring? ¿Qué ALG, qué números cambian? | No. El asistente explica; nunca lee ni calcula un score. No se referencia ni modifica ningún ALG. |
| 2 | ¿Necesita RLS / aislamiento multi-tenant? | **Sí.** `support_tickets` es nueva y guarda texto del usuario: RLS desde el día uno. Cada usuario lee solo sus tickets; **solo el admin global (equipo RutaHogar, `is_global_admin()`) lee todos y cambia estados**. Ni el ejecutivo ni el admin inmobiliario ven tickets ajenos, aunque sean de su inmobiliaria. `inmobiliaria_id` se guarda solo como contexto para soporte, no para autorizar. |
| 3 | ¿Necesita migración? ¿Quién la aplica al Supabase hosteado? | **Sí**, una migración (+ rollback, + `schema.sql` en el mismo commit). La aplica a mano el Tech Lead antes del deploy, como las de HU19. |
| 4 | ¿Cambia el contrato de `POST /score`? | No. Solo endpoints nuevos. |
| 5 | ¿Impacto en consentimiento / privacidad? | **Sí.** El texto de la conversación se guarda en tickets, se envía a Groq y, ya enmascarado, viaja por correo vía Resend (mismo proveedor que ya procesa solicitudes ARCO). Mitigaciones: enmascarado de datos personales en ambos, transcripción acotada, aviso en el widget, sin datos del perfil financiero en los prompts. El usuario confirma explícitamente antes de crear el ticket (E4). Derechos del titular (Spike 2, §4B): los tickets entran en la exportación y se anonimizan en el borrado lógico — ver Supuestos. Revisar que el texto de privacidad/consentimiento de `DataConsent.jsx` mencione al asistente y a los proveedores (Groq, Resend). |

## Entidades

**Nueva tabla `public.support_tickets`** (migración `supabase/migrations/20261026120000_hu24_support_tickets.sql`):

| Columna | Notas |
| :------ | :---- |
| `id uuid pk default gen_random_uuid()` | se muestra al usuario como código corto |
| `user_id uuid not null references auth.users` | tomado del token verificado |
| `role text not null` | de `get_my_role()` al momento del insert (administrador / ejecutivo / lead) |
| `inmobiliaria_id uuid null` | de `get_my_inmobiliaria()`; null para leads sin inmobiliaria |
| `subject text not null` | ≤ 120 caracteres |
| `message text not null` | explicación del usuario, ≤ 2000 caracteres, enmascarada |
| `transcript jsonb not null` | últimos ≤ 10 turnos, cada uno ≤ 1000 caracteres, enmascarados, `[{role, text, ts}]` |
| `screen_id text null` | dónde estaba el usuario |
| `status text not null default 'abierto'` | check in (`abierto`,`en_curso`,`resuelto`) |
| `status_updated_at timestamptz null`, `status_updated_by uuid null` | los fija la RPC de cambio de estado, no el cliente |
| `notified_at timestamptz null` | se llena cuando Resend acepta el correo |
| `notification_error text null` | código corto (`email_not_configured`, `email_provider_rejected`, …); nunca el detalle del proveedor |
| `client_request_id uuid not null` | `unique (user_id, client_request_id)` — idempotencia |
| `created_at timestamptz default now()` | |

RLS: `insert` y `select` donde `user_id = auth.uid()`; `select` además para `is_global_admin()`
(mismo patrón que `arco_requests`); **sin policy de `update`/`delete` y con `revoke update, delete`**
para los roles de cliente. El estado cambia solo por la RPC nueva
`public.update_support_ticket_status(p_ticket_id uuid, p_status text)`:
`SECURITY DEFINER`, `set search_path = public`, exige `is_global_admin()`,
ignora cualquier actor enviado por el cliente (usa `auth.uid()`), valida el valor de `p_status` y
llena `status_updated_at/by`. Es la única función nueva; las demás se reusan (`get_my_role()`,
`get_my_inmobiliaria()`, `is_global_admin()`, todas `SECURITY DEFINER`, según `docs/database.md`).
Filas existentes: ninguna; migración aditiva. Los cambios de policy y función también van en
`supabase/schema.sql` en el mismo commit.

**Nuevos endpoints** (FastAPI, rewrites agregados a `vercel.json`):

- `POST /api/assistant/chat` — body `{message, history[≤6], screen_id?, field_id?}` →
  `{answer, tier: 0|1|2, sources: [chunk_id], links: [{label, route}], suggest_escalation: bool}`.
  Auth opcional: sin token o token inválido ⇒ Nivel 0 forzado.
- `POST /api/support/tickets` — requiere auth; body `{subject?, message, history[≤10], screen_id?, client_request_id}`
  → `201 {id, code, created_at}`; repetir el mismo `client_request_id` devuelve el ticket existente
  con `200`. Tras insertar, intenta el aviso por correo (ADR-24.3); un fallo del correo no cambia la
  respuesta.
- **Bandeja de admin** — sin endpoint propio: lectura de `support_tickets` con el cliente de Supabase
  (RLS) y cambio de estado con `rpc('update_support_ticket_status')`, como hace `arcoService.js` con ARCO.

**Variables de entorno nuevas:** `SUPPORT_NOTIFICATION_EMAIL` (destinatario) y `SUPPORT_FROM_EMAIL`
(remitente). `RESEND_API_KEY` ya existe. Ninguna va en el código; agregarlas a `.env.example`.

**Nuevo artefacto estático:** `backend/app/assistant/kb/kb.json` (generado), más
`backend/app/assistant/kb/manual/*.json` escritos a mano para entradas de "cómo uso esta vista" por rol.

## Algoritmos

Ninguno referenciado y ninguno promovido a ALG (no toca scoring, un solo consumidor).

**Lógica local** (propia de la historia, parámetros en `backend/app/assistant/constants.py`, nunca en línea):

- **Recuperación:** tokens normalizados (tildes/mayúsculas), sin stop-words en español, BM25 sobre `title + text + synonyms` del chunk; se da prioridad a los chunks cuyo `screen_id`/`field_id` coincide con el contexto del request.
- **Niveles:** puntaje ≥ `MIN_RETRIEVAL_SCORE` → Nivel 1/0; si no, Nivel 2. Atajo de acierto fuerte `EXACT_HIT_SCORE` → Nivel 0 textual.
- **Guardia de fuera de alcance:** preguntas que piden calcular/alterar un score, aprobar un crédito o dar una decisión de inversión personal coinciden con una lista corta de patrones → negativa fija que reafirma S7, sin llamada al LLM, `suggest_escalation = true`.
- **Señales de escalamiento** (`lib/assistant/escalation.js`): "sigo con dudas", "no me sirvió", "no entiendo", "no ayuda", "hablar con alguien" (normalizadas) → mostrar "Contactar a Soporte".
- **Constructor de transcripción** (`lib/assistant/transcript.js`): conservar los últimos N turnos, truncar cada uno, descartar mensajes solo de UI.
- **`redact_pii`** (backend, puro), con una vista previa fina espejo en el cliente.

Log de supuestos (criterio del desarrollador, según el handbook — el revisor confirma que están *registrados*, no que sean correctos):

| Valor | Supuesto por / cuándo | Qué tendría que ser cierto |
| :---- | :-------------------- | :------------------------- |
| `MIN_RETRIEVAL_SCORE`, `EXACT_HIT_SCORE` calibrados con ~30 preguntas de muestra | sesión de build | Las preguntas reales se parecen a la muestra; recalibrar tras la primera semana de clics en "No". |
| 6 turnos de historial al LLM, 10 en un ticket, 1000 caracteres por turno | autor del plan, 2026-10-25 | Contexto suficiente para que soporte actúe sin guardar conversaciones completas. |
| Límite suave de 20 mensajes al asistente / usuario / hora | autor del plan, 2026-10-25 | La cuota gratuita de Groq cubre con holgura el tráfico esperado del piloto. |
| Un solo destinatario de aviso (`SUPPORT_NOTIFICATION_EMAIL`), el buzón del equipo RutaHogar | decisión del equipo, 2026-10-26 | Ya no es un supuesto sino una decisión: todos los tickets, de todos los roles, los atiende RutaHogar. Si más adelante una inmobiliaria quiere atender los suyos, es una historia nueva (hoy vería conversaciones fuera de su alcance en la matriz RBAC). |
| `max_tokens` ≈ 300 para respuestas | replica `ai.py` | Las respuestas cortas son lo que el usuario necesita. |

## Alcance

**Dentro:** script de build de la KB y KB generada; recuperación BM25; niveles + guardia de fuera de
alcance; capa de redacción con Groq y circuit breaker; `redact_pii`; `POST /api/assistant/chat`;
migración, rollback y `schema.sql` de `support_tickets`; `POST /api/support/tickets`; widget de chat
flotante para los tres roles y para la pre-evaluación anónima; botones de feedback por respuesta; flujo
de confirmación de "Contactar a Soporte"; los tests indicados abajo.

**También dentro (ampliación decidida el 2026-10-26):** bandeja de tickets **solo para el equipo
RutaHogar (admin global)** (lista, detalle con transcripción, cambio de estado
`abierto → en_curso → resuelto`, marca "sin aviso"), RPC `update_support_ticket_status` y correo de aviso
por Resend. **Advertencia de
estimación:** esto agrega una vista, una RPC y un cliente de correo a las 8 SP originales; si el sprint
no alcanza, el corte limpio es entregar creación + correo primero y la bandeja en un segundo PR de la
misma historia (el correo ya cubre el aviso).

**Fuera — y quién se hace cargo de cada cosa:**

- **Respuesta al usuario desde la bandeja** (hoy el equipo responde por fuera, por correo) y **notificación al usuario cuando su ticket se resuelve** → historia de seguimiento.
- **Vista de "mis tickets" para el usuario** → fuera de la v1; la RLS ya permite que lea los suyos, falta solo la UI.
- **Reintento automático de correos fallidos** → fuera; la bandeja muestra "sin aviso" y el ticket no se pierde.
- **Recuperación con embeddings (D) y LLM de pago (E)** → Fase 2 / más adelante, detrás de `retrieve()` y `llm.py`.
- **Streaming, voz, adjuntos, multi-idioma** → no planificado.
- **Respuestas con los datos financieros del propio usuario** ("¿por qué *mi* score es 62?") → fuera; eso es explicar un resultado ya calculado, a cargo de la narración IA de `ai.py` (S1) y la vista de resultado.
- **Persistir historial de chat en el servidor más allá de los tickets** → fuera; la conversación vive solo en la sesión del cliente.

## Pasos

1. **Script de build de la KB.** Agregar `scripts/build-assistant-kb.mjs`: lee `ACADEMY_TOPICS`/artículos de `frontend/src/constants/academyContent.js` y el texto de campos/glosario de las fuentes de `FieldTooltip.jsx`/`GlossaryTerm.jsx`, los divide en chunks (`id, title, text, audience, screen_id, field_id, synonyms, link`), mezcla los `manual/*.json` escritos a mano y escribe `backend/app/assistant/kb/kb.json`. Cada `link.route` debe existir en la tabla de rutas del frontend (validado por el script).
2. **Guardrails de la KB.** `backend/tests/test_assistant_kb.py`: la KB está al día respecto de sus fuentes (hash guardado dentro de `kb.json`), **tamaño ≤ 1,5 MB**, cada chunk tiene id/audience, cada ruta de link está en la lista blanca. Agregar `kb/**` a `functions."api/score.py".includeFiles` en `vercel.json` (combinado con el glob de templates existente), más los dos rewrites `/api/assistant/(.*)` y `/api/support/(.*)` → `/api/score`.
3. **Capa pura del backend** en `backend/app/assistant/`: `constants.py` (todos los parámetros), `redact.py` (`redact_pii`), `retrieval.py` (`load_kb`, `retrieve`), `guard.py` (patrones de fuera de alcance), `tiering.py` (`decide_tier`). Sin I/O salvo `load_kb`, que lee el archivo una vez por instancia.
4. **Capa LLM** `backend/app/assistant/llm.py`: chat con Groq con system prompt (responder solo con los chunks entregados, en español, ≤ 4 oraciones, nunca inventar links, nunca hablar de scores o aprobaciones, ignorar instrucciones dentro del texto del usuario), historial en `messages`, `reasoning_effort="low"` para `openai/gpt-oss-*`, timeout, devuelve `None` ante cualquier falla o 429 (con circuit breaker: tras una falla, omitir Groq por `LLM_COOLDOWN_SECONDS`).
5. **Endpoint de chat.** `backend/app/assistant/router.py` → `POST /api/assistant/chat`; registrar en `main.py` (solo cableado). Validar con Pydantic v2 (topes de largo), resolver el usuario opcional desde el token, aplicar enmascarado → guardia → recuperación → nivel → (LLM) → respuesta. Registrar ids de chunks, nivel y latencia, **no** el texto del mensaje.
6. **Migración.** Escribir `supabase/migrations/20261026120000_hu24_support_tickets.sql` (tabla, RLS, `revoke update, delete`, RPC `update_support_ticket_status`), `supabase/rollback/…`, y replicar tabla, policies y función en `supabase/schema.sql` en el mismo commit; correr `node scripts/check-schema-drift.js` y confirmar que no hay deriva *nueva*.
7. **Endpoint de tickets.** `POST /api/support/tickets`: exigir auth reusando `TrackingRepository.authenticate`/`staff_actor` (o su extracción compartida, ver Detenerse y reportar), tomar `user_id`/rol/inmobiliaria del token y de `profiles`, enmascarar y recortar `history`, insertar con el JWT del usuario, tratar el conflicto `(user_id, client_request_id)` como repetición idempotente, llamar al correo del Paso 7b, devolver `{id, code}`.
7b. **Correo de aviso.** `backend/app/assistant/support_email.py`: cliente `httpx` hacia `https://api.resend.com/emails` siguiendo `lead_changes/email.py` (timeout corto, `html.escape` en todo valor del usuario, errores como códigos, nunca el detalle del proveedor); lee `RESEND_API_KEY`, `SUPPORT_NOTIFICATION_EMAIL`, `SUPPORT_FROM_EMAIL`. Si falta configuración o Resend falla: registrar `notification_error`, **no** fallar el request. Si envía, llenar `notified_at`. Agregar las dos variables nuevas a `supabase/functions/.env.example`-style docs / `.env.example` del backend y a la sección Deploy.
8. **Capa pura del frontend** `frontend/src/lib/assistant/`: `escalation.js` (`isEscalationSignal`), `transcript.js` (`buildTranscript`), `redactPreview.js`, cada uno con tests de vitest.
9. **Widget** `frontend/src/features/assistant/`: `AssistantWidget.jsx` (botón flotante, lista de mensajes, input, aviso "No compartas tu RUT ni claves" y "Orientación general, no es asesoría financiera"), acciones por respuesta (links como botones que navegan por el router de URL existente; "¿Te sirvió? Sí/No"), `SupportTicketForm.jsx` (asunto/mensaje precargados, confirmación explícita), estado de éxito con el código del ticket ("Tu solicitud fue enviada") y `assistantApi.js` (wrappers de fetch; envía `screen_id`/`field_id`). Montar en `App.jsx` para todos los roles y la pre-evaluación anónima, pasando el `screen_id` actual. Textos de UI en español; reusar los tokens de `user-design-system.css`, estilos nuevos en un CSS nuevo.
10. **Disclaimers (S7).** Pie del widget más el estado de negativa fija de fuera de alcance que indica que el asistente solo orienta, no aprueba créditos.
11. **Bandeja de admin (solo equipo RutaHogar).** `frontend/src/features/assistant/AdminSupportTickets.jsx` + `supportTicketsService.js`, siguiendo `AdminArcoRequests.jsx`/`arcoService.js`: lista paginada (reusar `AdminPagination.jsx`), filtro por estado, detalle con mensaje y transcripción, marca "sin aviso" si `notified_at` es null, botones de cambio de estado que llaman a la RPC. Montar como pestaña de `AdminPanel.jsx` **visible solo para el admin global**, igual que la de ARCO (la UI oculta, la RLS decide). Copy en español y texto del usuario renderizado como texto, nunca como HTML.
12. **Docs.** Agregar a este plan las notas de "Deploy" tras el build: variables de entorno (`GROQ_API_KEY`, `GROQ_MODEL` opcional, `RESEND_API_KEY` ya existente, `SUPPORT_NOTIFICATION_EMAIL` y `SUPPORT_FROM_EMAIL` nuevas), la verificación del dominio `rutahogar.cl` ya hecha en Resend, el paso manual de migración y cómo regenerar la KB. Si el diseño cambió durante el build, enmendar este plan en el mismo PR.

## Mapa de criterios de aceptación

| Criterio | Paso(s) | Verificado por |
| :------- | :------ | :------------- |
| `E1` — en la pre-evaluación el asistente explica los pasos, qué significa cada dato pedido y dónde ingresarlo | 1, 3, 5, 9 | `test_preevaluation_field_question_returns_field_chunk` (recuperación con `screen_id="preevaluacion"`, `field_id`); revisor: abrir la pre-evaluación, preguntar "¿qué es la renta líquida?" y "¿dónde pongo mis deudas?" — la respuesta nombra el campo y su ubicación, con un botón para enfocarlo. |
| `E2` — las respuestas consultan la KB (Manuales + Academia) y adjuntan link/botón a la sección o artículo exacto | 1, 2, 3, 5, 9 | `test_answer_links_come_only_from_kb`, `test_every_kb_link_route_exists` (Paso 2); revisor: preguntar un concepto financiero y un cómo-hacer de vista de staff; el botón lleva al artículo de la Academia / la vista exacta. |
| `E3` — si el usuario indica que sigue con dudas o que no le sirvió, ofrecer proactivamente "Contactar a Soporte" | 4, 8, 9 | `escalation.test.js` (casos de `isEscalationSignal`), `test_low_confidence_sets_suggest_escalation`, `test_out_of_scope_sets_suggest_escalation`; revisor: hacer clic en "No" y escribir "sigo con dudas" — la acción de soporte aparece en ambos casos. |
| `E4` — al confirmar se crea un ticket con identidad del usuario y conversación reciente, y se confirma al usuario | 6, 7, 7b, 9, 11 | `test_ticket_created_with_identity_and_transcript`, `test_ticket_identity_ignores_request_body`, `test_ticket_idempotent_replay`, `test_ticket_transcript_trimmed_and_redacted`, `test_ticket_email_sent_and_notified_at_set`, `test_ticket_created_even_if_email_fails` (Resend simulado con error), `test_ticket_email_escapes_user_html`, prueba de RLS (el usuario B no puede leer el ticket del usuario A; un lead no puede cambiar estado; **un ejecutivo y un admin inmobiliario — ni siquiera de la misma inmobiliaria — no ven tickets ajenos ni pueden cambiar estados; solo el admin global sí**); revisor: crear un ticket, ver el código de confirmación, recibir el correo en el buzón del equipo, verlo en la bandeja con su transcripción y cambiarle el estado, y comprobar que con una cuenta de admin inmobiliario la pestaña no aparece. |
| Safeguards S1/S7 — el asistente nunca decide scores ni aprueba créditos | 3, 4, 10 | `test_assistant_does_not_require_groq_api_key`, `test_out_of_scope_guard_blocks_score_and_approval_requests`, `test_llm_failure_falls_back_to_kb`. |
| Presupuesto / límites — sin dependencias pesadas | 2 | `test_kb_size_budget`; el diff del PR muestra `requirements.txt` sin cambios. |

## Supuestos

- **Autenticación ya existe** (verificado en el repo): `backend/app/tracking/repository.py` → `TrackingRepository.authenticate(token)` valida el JWT llamando a `/auth/v1/user` de Supabase y `staff_actor(token)` lee `role`/`inmobiliaria_id` de `profiles`; `tracking/routes.py` lo expone con `HTTPBearer`. Es código de `tracking`, así que el módulo `assistant` no debe importarlo sin más: o se extrae a un módulo compartido (commit aparte que solo mueve, sin cambiar comportamiento, según el handbook) o se acuerda con el dueño de HU13 importarlo explícitamente. **No** se crea autenticación nueva.
- **Spike 2 vs. código (verificado por búsqueda en el repo):** Spike 2 describe `audit_logs`, `user_consents`, *Custom JWT Claims* y los endpoints `GET /api/v1/privacy/export` y `DELETE /api/v1/privacy/account`; **no encontré ninguno implementado** (la autorización real hoy es RLS con `profiles` + helpers `SECURITY DEFINER`, y la tabla de ARCO). Esta historia **no depende de ellos** y sigue el patrón que sí existe. Cuando esos módulos existan: (a) `support_tickets` debe entrar en la exportación del titular, (b) el borrado lógico debe anonimizar `message` y `transcript` conservando `id` y `user_id` (no borrado físico, como exige Spike 2 §4B), y (c) los cambios de estado, que hoy quedan en `status_updated_at/by`, deberían enviarse a `audit_logs`. Hasta entonces la v1 solo permite al Tech Lead anonimizar a mano por `user_id` (documentado en el PR).
- **Open Banking (Fintoc/Floid):** solo aparece en la documentación (`docs/stories/E1 Spike N2/E1 Spike 2.md` y `docs/stories/HU16/E1 HU16.md`); **no hay código ni una historia que lo implemente**, y HU16 trata de fraude y confiabilidad, no de validación de identidad. No es parte de HU24. Conviene confirmar en el backlog (`docs/BACKLOG_HUS_RUTAHOGAR.md`) qué historia lo cubre.
- El dominio `rutahogar.cl` está verificado en Resend (confirmado por el equipo): `SUPPORT_FROM_EMAIL` puede usar un remitente de ese dominio y `SUPPORT_NOTIFICATION_EMAIL` apunta al buzón del equipo.
- La tabla de rutas/URL del frontend puede consultarse para validar los valores de `link.route`; si no, el script valida contra una lista estática mantenida junto a `lib/routing/`.
- Los límites del tier gratuito de Groq y la disponibilidad de modelos pueden cambiar (el proyecto ya perdió un modelo una vez — ver la nota en `ai.py`). El build no debe fijar un modelo más allá del mecanismo existente `DEFAULT_GROQ_MODEL`/`GROQ_MODEL`.
