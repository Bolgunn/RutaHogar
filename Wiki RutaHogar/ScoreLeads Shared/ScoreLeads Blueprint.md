
> Documento maestro del proyecto RutaHogar con el propósito de guiar y documentar los procedimientos antes de implementar.
>
> **Última actualización:** 2026-06-21 — Sesión de blueprint completo (post-MVP). Decisiones tomadas en conjunto con el equipo.

---

# Resumen ejecutivo

RutaHogar es una plataforma web (y próximamente móvil) de **precalificación y acompañamiento financiero** para el sector inmobiliario. Permite a un interesado en comprar vivienda ingresar sus datos financieros y recibir en segundos un score 0–100, una clasificación (Alto / Medio / Bajo), una explicación asistida por IA, un plan de mejora personalizado y un **mapa de la Región Metropolitana** que muestra a qué barrios puede acceder con su perfil actual. Los leads Alto quedan priorizados en un panel comercial.

El MVP (HdU 1–4) ya está construido. Este blueprint define la evolución del producto hacia un sistema completo: scoring más realista, mapa por barrios, app móvil, integración con CRM, simulador hipotecario, notificaciones (WhatsApp/email/push), scoring de compromiso del usuario, y un módulo educativo.

**El sistema no reemplaza una evaluación bancaria formal.** Es una herramienta orientativa de precalificación temprana.

## Decisiones clave (locked)

| Decisión | Elección |
| :------- | :------- |
| Frontend web | React + Vite (desplegado en Vercel) |
| App móvil | React Native + Expo (track paralelo desde Sprint 3) |
| Backend | FastAPI + Python (desplegado en Render) |
| Base de datos | Supabase + PostgreSQL |
| Proveedor IA | Groq API (SDK compatible OpenAI, free tier) |
| Mapa | Leaflet + OpenStreetMap, datos de barrios estáticos curados (`neighborhoods` en Supabase) |
| Notificaciones | Meta WhatsApp Cloud API (directo) + Resend (email) + Expo Push, tras un único `notifications service` |
| CI/CD | GitHub Actions, 3 entornos reales (development / staging / production) desde el día uno |
| Algoritmo de scoring | v2 (dividend ratio + total burden + pie escalonado), versionado explícito, sin re-scoring de historia |

## Hitos / deadlines

| Hito | Fecha | Foco |
| :--- | :---- | :--- |
| Milestone 1 | **2026-09-03** | Scoring v2, mapa por barrios (Leaflet + shading Layer 1 + preguntas Layer 2), edad en registro, kickoff app móvil |
| Milestone 2 | **2026-10-15** | Integración IA real (Groq), HdU 6 simulador de estrés, HdU 5 export CRM, OCR, flujos core móvil, analítica admin, scoring de compromiso, re-engagement |
| Milestone 3 (final) | **2026-11-05** | Integración CMF/Dicom, asistente de chat, módulo educativo, release móvil, asignación de ejecutivos, agendamiento, hardening + demo Feria SW |

---

# Fase 1 — Descubrimiento (Discovery)

## Objetivo

Comprender el problema, los usuarios, las restricciones y la propuesta de valor antes de diseñar la solución.

## 1. Requerimientos (Requirements)

### Functional Requirements

- Formulario de preevaluación financiera guiado (consentimiento + complemento de renta).
- Motor de scoring híbrido (reglas + explicación IA).
- Clasificación y gestión de leads según el rol del ejecutivo.
- Plan de mejora personalizado para los usuarios.
- **Educación financiera** a los usuarios sobre tipos de vivienda a los que pueden optar y dónde (módulo educativo + mapa por barrios de la RM).
- **Mapa de accesibilidad** que muestra las zonas de la RM accesibles según las condiciones económicas del usuario.
- **Seguimiento y re-engagement**: incentivar que los usuarios vuelvan a actualizar sus datos.
- **Memoria de compromiso del usuario** (engagement scoring): usuario más comprometido → venta más rápida.
- Explicación asistida por IA del scoring para el usuario y resumen del perfil para los ejecutivos.
- **Simulador hipotecario / de estrés** (escenarios de tasa y UF).
- **Notificaciones** multicanal (WhatsApp / email / push).
- **Asignación de leads a ejecutivos** y métricas de conversión.
- **Agendamiento** de reuniones entre lead y ejecutivo.
- **Integración con CRM** de la inmobiliaria (HdU 5).
- **OCR** de documentos subidos voluntariamente.
- Historial inmutable de evaluaciones.
- Gestión de usuarios y roles (RBAC).
- **Trazabilidad de consentimiento y auditoría de datos** (cumplimiento Ley 19.628 / 21.719).
- **Configuración de parámetros de scoring** por el cliente para adaptar qué leads ven sus ejecutivos.
- **Gestión y reporte de fraude**: indicadores, reporte y retiro de leads fraudulentos del dashboard.
- **Dossier bancario exportable** (PDF) con score, perfil y documentos del lead.
- **Comparador de evaluaciones** de un mismo o distinto lead.
- **Recuperación y cambio de contraseña**.
- **Estimación de postulación a crédito hipotecario**: cuánto y dónde convendría postular.
- **Consulta simulada a la CMF** con clasificación de riesgo y ajuste de scoring.
- **Simulación de subsidios habitacionales** (DS19) con recálculo del dividendo.
- **Simulación de variación de plazos** de crédito (20 / 25 / 30 años).
- **Dashboard de conversión de ventas**: embudo y tiempo de ciclo de venta.
- **Visualización demográfica y socioeconómica** de los leads.
- **Analítica de logs de eventos** con gráficos, estadísticas y export descargable.

### Non-Functional Requirements

Con metas SMART (ver Fase 2 §7 y Fase 4 — Testing):

- **Usability** — ≥80% completa el formulario sin ayuda en <10 min.
- **Performance** — score visible en <60 s tras enviar el formulario.
- **Availability** — uptime ≥95% durante el periodo de prueba.
- **Scalability** — soportar ≥100 evaluaciones sin pérdida de datos.
- **Security** — HTTPS obligatorio, sin credenciales bancarias ni documentos sensibles obligatorios, RBAC.
- **Privacy** — recolectar solo datos mínimos; consentimiento explícito; derecho a borrado.
- **Maintainability** — código modular (frontend / backend / scoring / notifications).
- **Traceability** — cada evaluación persiste timestamp, score, clasificación, snapshot, versión de algoritmo.
- **Explainability** — explicación/análisis preliminar de métricas y resultados para facilitar la toma de decisiones.
- **Performance de simulación** — las simulaciones responden en ≤30 s.
- **Right to erasure** — eliminación total e irrecuperable de cuenta y datos a solicitud del usuario.
- **Anonimización para análisis** — métricas no personales conservadas de forma anónima; informes exportados sin identificadores personales.
- **Transparencia de riesgo** — alerta al usuario cuando la carga financiera simulada supera el 25%.
- **Security (verificable)** — validación de entradas, sin fuga de trazas/SQL/tokens en errores, consultas parametrizadas/ORM.
- **Mobile compatibility** — UI correcta en resoluciones móviles representativas y paridad de permisos por rol entre escritorio y móvil.

### Restricciones

- Tiempo académico limitado — tres deadlines fijos (03-sep, 15-oct, 05-nov 2026).
- Equipo de desarrollo reducido (6 personas).
- Sin integración bancaria directa en etapas iniciales.
- No reemplazar evaluaciones hipotecarias reales.
- Datos autodeclarados por el usuario como fuente primaria del MVP.

## 2. Funcionalidades (Features)

Tres tiers. **Todo lo aquí listado está comprometido** — no hay features "opcionales descartables"; las fases reflejan orden, no incertidumbre.

### Construido (MVP — HdU 1–4)

- Formulario guiado + validaciones + consentimiento + complemento de renta.
- Cálculo de score (v1) + clasificación Alto/Medio/Bajo.
- Explicación IA (mock determinístico) + plan de mejora.
- Dashboard de leads priorizados (ejecutivo).
- Login + roles (user / sales / admin).
- Historial de evaluaciones.
- Seguimiento financiero, plan mensual, revisión de objetivo, recomendaciones.
- Landing anónima + notificación realtime de leads Alto.

### Comprometido — Milestones 1–3

| Feature | Hito |
| :------ | :--- |
| Scoring v2 (dividend ratio + total burden + pie escalonado, complemento cuantitativo) | M1 |
| Mapa de barrios RM (Leaflet, shading Layer 1, preguntas Layer 2) | M1 |
| Edad capturada en registro (alimenta Layer 1 del mapa) | M1 |
| Kickoff app móvil (scaffold + capa API compartida) | M1 |
| Integración IA real (Groq) reemplazando el mock | M2 |
| HdU 6 — Simulador de estrés / hipotecario | M2 |
| HdU 5 — Export / sincronización con CRM | M2 |
| OCR de documentos | M2 |
| Flujos core de la app móvil | M2 |
| Scoring de compromiso (engagement) | M2 |
| Re-engagement / drip (WhatsApp + email) | M2 |
| Asignación de leads a ejecutivos + métricas | M2 |
| Analítica admin | M2 |
| Integración CMF / Dicom | M3 |
| Asistente de chat (IA) | M3 |
| Módulo educativo / Academia financiera | M3 |
| Agendamiento lead ↔ ejecutivo | M3 |
| Release app móvil | M3 |
| Notificaciones multicanal completas (WhatsApp/email/push) | M2–M3 |
| Consent & data audit log (compliance) | M2 |

### Mapa de accesibilidad — diseño funcional

Ubicación: **página de resultado**, después del score y antes del plan de mejora. Es el momento más visual y "compartible" del producto.

Lógica de shading en dos capas:

- **Layer 1 — automática, sin fricción.** Calculada desde los datos ya disponibles (formulario + edad del registro). Para cada barrio se evalúan tres gates independientes:
  - **Capacidad** — `dividend_ratio = dividendo_estimado / ingreso_total` soporta el dividendo del precio del barrio.
  - **Pie** — `pie_ratio = ahorro_disponible / precio_barrio` alcanza el pie mínimo/recomendado.
  - **Perfil de riesgo** — penalización por morosidad, tipo de contrato y continuidad laboral.
  - Verde = pasa los tres; amarillo = alcanzable con mejora; rojo = fuera de alcance hoy.
- **Layer 2 — preguntas progresivas ("Afina tu mapa"), panel inline sobre el mapa**, actualizan el shading en vivo y enseñan al usuario *por qué* cambia el mapa:
  - ¿Es tu primera vivienda? (desbloquea FOGAES / subsidio → pie mínimo 10% para vivienda nueva ≤ 4.000 UF)
  - ¿Cuántos años de plazo buscas? (afecta `max_credito` ~35% entre 20 y 30 años)
  - ¿Prefieres departamento o casa? (rangos de precio distintos dentro del mismo barrio)
  - ¿Tienes interés en subsidio habitacional?
  - *(La edad ya no se pregunta — se conoce desde el registro y se usa en Layer 1 para topes de plazo/seguro de desgravamen: edad + plazo ≤ 77.)*

Granularidad: **por barrio**, no por comuna (las comunas son demasiado grandes y heterogéneas — Las Condes va de ~3.000 a ~12.000 UF). Datos en tabla `neighborhoods` (Supabase) con polígonos GeoJSON y rangos de precio en UF, poblada desde fuentes públicas (MINVU, CChC, reportes de mercado). Arquitectura diseñada para reemplazar el dataset estático por una API de datos en vivo más adelante.

Las métricas derivadas de **scoring v2** (`dividend_ratio`, `total_burden`, `pie_ratio`) son la base compartida entre el motor de scoring y el shading del mapa.

## 3. Tecnologías (Technologies)

### Frontend
- React + Vite (web) — Vercel
- React Native + Expo (móvil)
- Leaflet + OpenStreetMap (mapa)

### Backend
- FastAPI + Python — Render

### Database
- Supabase + PostgreSQL

### AI
- Groq API (SDK compatible OpenAI) — explicaciones, planes de mejora, asistente de chat

### Notificaciones
- Meta WhatsApp Cloud API (directo)
- Resend (email)
- Expo Push (móvil)

### DevOps
- GitHub + GitHub Actions
- Vercel (frontend) · Render (backend) · Supabase (DB)
- 3 entornos: development / staging / production

### Integraciones externas (fases posteriores)
- CRM inmobiliaria (HdU 5)
- CMF / Dicom (validación crediticia)
- OCR (procesamiento de documentos)

## 4. Conceptos (Concepts)

### Negocio
- Lead Qualification · Financial Readiness · Mortgage Eligibility · Sales Funnel
- **Engagement / Commitment** — compromiso del usuario como predictor de cierre
- **Incubación / Nurturing** — transformar leads no aptos en aptos

### Técnicos
- Scoring Engine (versionado) · Recommendation Engine · AI Layer
- RBAC · Authentication · Authorization
- Notification Service (abstracción multicanal)
- Map Accessibility Shading (Layer 1 / Layer 2)

## 5. Tiempo y esfuerzo (Time & Effort)

Equipo de 6 personas, tracks paralelos (backend / frontend web / móvil / datos+QA). Sprints anclados a los tres deadlines. Detalle en Fase 3 §1 y Fase 4.

## 6. Recursos (Resources)

### Entrevistas
- Cliente: Ellison De Moraes Caram (Gerente de Inteligencia de Negocios, Echeverría Izquierdo).
- Ejecutivos comerciales · usuarios potenciales.

### Investigación
- `research/competitor_prequalification_audit.md` — auditoría de ~30 flujos de precalificación (bancos, proptech, inmobiliarias).
- `research/scoring_improvement_recommendations.md` — base del algoritmo v2.
- Legislación vigente: Ley 19.628 y Ley 21.719 (protección de datos).
- Fuentes de precios: MINVU, CChC, reportes de mercado RM.

## 7. Objetivos (Goals)

### Business Goals
- Mejorar la calidad de los leads (concentrar esfuerzo en los ~240 viables de ~2.000).
- Reducir el ciclo de venta de ~12 meses a ~3 meses.
- Aumentar la eficiencia comercial y recuperar leads "perdidos" vía incubación.

### User Goals
- Entender su situación financiera sin hablar con un ejecutivo.
- Saber qué puede comprar y dónde (mapa).
- Obtener un plan concreto para llegar a ser sujeto de crédito.

### Technical Goals
- Sistema modular, escalable y seguro.
- Scoring realista, versionado y trazable.
- Cliente unificado web + móvil con código/diseño compartido.

---

# Fase 2 — Diseño de la Solución (Solution Design)

## Objetivo

Definir completamente la solución antes de comenzar el desarrollo.

## 1. Arquitectura del Sistema (System Architecture)

### High-Level Architecture

```
┌────────────────────┐     ┌────────────────────┐
│  Web (React+Vite)  │     │  Móvil (RN+Expo)   │
│   Vercel           │     │   Expo / stores     │
└─────────┬──────────┘     └─────────┬──────────┘
          │   capa API compartida (TS)          │
          └──────────────┬──────────────────────┘
                         ▼
            ┌─────────────────────────┐
            │  Backend FastAPI (Render)│
            │  ┌────────────────────┐  │
            │  │ Scoring Engine v2  │  │
            │  │ Recommendation Eng │  │
            │  │ AI Layer (Groq)    │  │
            │  │ Notification Svc   │  │
            │  │ Map Accessibility  │  │
            │  │ Auth / RBAC        │  │
            │  └────────────────────┘  │
            └───────┬─────────┬────────┘
                    ▼         ▼
        ┌────────────────┐  ┌──────────────────────┐
        │ Supabase /     │  │ Servicios externos:  │
        │ PostgreSQL     │  │ Groq · Meta WhatsApp │
        │                │  │ Resend · Expo Push   │
        │                │  │ CRM · CMF/Dicom (fut)│
        └────────────────┘  └──────────────────────┘
```

### Component Diagram

- **UI** (web + móvil, capa API y tipos compartidos)
- **API** (FastAPI, contrato `POST /score` estable)
- **Scoring Engine** (v1/v2 versionado)
- **Recommendation Engine**
- **AI Layer** (Groq — explicación, plan, chat)
- **Notification Service** (Meta WhatsApp / Resend / Expo Push tras una sola interfaz)
- **Map Accessibility Module** (Layer 1 / Layer 2)
- **Auth Module** (RBAC)

### Deployment Architecture

| Entorno | Trigger | Frontend (Vercel) | Backend (Render) | DB |
| :------ | :------ | :---------------- | :--------------- | :- |
| development | push a cualquier rama | preview URL | sin auto-deploy | Supabase dev |
| staging | merge a `develop` | preview URL fija | servicio staging | Supabase staging |
| production | merge a `main` | producción | servicio prod | Supabase prod |

## 2. Modelo de Datos (Database Schema)

### Tablas existentes (documentadas en `Database/`)
- `profiles` — perfil de usuario. **Modificación:** agregar `fecha_nacimiento` / `edad` (capturada en registro, alimenta el mapa).
- `evaluations` — **append-only / inmutable** (HdU 3 E5): timestamp, score, clasificación, snapshot de entrada, `scoring_version`, desglose de componentes con explicaciones.
- `improvement_goals` — metas del plan de mejora.

### Tablas nuevas

| Tabla | Propósito | Mutabilidad |
| :---- | :-------- | :---------- |
| `neighborhoods` | Polígono GeoJSON + rangos de precio UF por barrio RM | CRUD (refresh periódico) |
| `engagement_events` | Señales crudas (login, progreso de plan, ahorro registrado, actualización de datos) | append |
| `engagement_scores` | Score de compromiso computado por usuario | recomputado |
| `notifications` | Log de mensajes salientes (canal, template, estado) | append + estado |
| `lead_assignments` | Ejecutivo dueño de cada lead + estado | mutable |
| `appointments` | Reuniones/visitas agendadas lead ↔ ejecutivo | mutable |
| `consent_audit_log` | Registro inmutable de consentimiento dado/revocado + acciones sobre datos | **append-only / inmutable** |
| `simulations` | Corridas guardadas del simulador hipotecario / estrés | CRUD |
| `documents` | Metadatos de documentos OCR (no los archivos en sí) | CRUD |

**Tablas inmutables:** `evaluations` y `consent_audit_log`. El resto es CRUD normal. Engagement se modela como **eventos crudos + score computado** para poder afinar la definición de "compromiso" con el tiempo conservando el historial.

### Relaciones
- User → Evaluations (1:N, inmutable)
- User → Engagement events / score (1:N / 1:1)
- User → Lead assignment → Executive
- User → Appointments → Executive
- User → Simulations · Documents · Consent audit
- Neighborhood ↔ precios UF (consumido por el mapa y por scoring v2)

## 3. Diseño de APIs (API Design)

### Auth Endpoints
- Login · Register (captura `fecha_nacimiento`) · Logout

### Evaluation Endpoints
- `POST /score` — **contrato estable** (no romper keys: `score`, `classification`, `risks`, `recommendations`, `ai_explanation`, `improvement_plan`). Campos nuevos del v2 se agregan como **opcionales**.
- Get History (evaluaciones inmutables del usuario)

### Map Endpoints
- Get neighborhoods + shading para un perfil (Layer 1)
- Recompute shading con respuestas Layer 2

### Notification Endpoints (internos)
- Enviar notificación (canal-agnóstico vía Notification Service)

### Sales / Admin Endpoints
- Leads priorizados + filtros + asignación
- Métricas de ejecutivos · funnel · analítica admin
- Agendamiento

### Integración Endpoints (fases posteriores)
- Export/sync CRM (HdU 5) · CMF/Dicom · OCR upload

## 4. Diseño de Lógica (Core Logic Design)

### Scoring Engine

**Versionado explícito.** `SCORING_VERSION` constante en `scoring.py`, persistido en cada evaluación. **v1** (actual) y **v2** (objetivo) documentados lado a lado. Historia previa queda como v1; v2 aplica hacia adelante (sin re-scoring — respeta la inmutabilidad de E5).

**v2 (objetivo)** — desde `research/scoring_improvement_recommendations.md`, implementado de forma **aditiva y no-breaking**:

```text
ingreso_total = ingreso_mensual + complemento_monto (si válido y completo)

dividend_ratio = dividendo_estimado / ingreso_total
total_burden   = (deuda_mensual + dividendo_estimado) / ingreso_total
pie_ratio      = ahorro_disponible / precio_objetivo

capacidad:  dividend_ratio ≤25%:+20 · ≤30%:+10 · ≤35%:-5 · >35%:-20
carga:      total_burden  ≤35%:+10 · ≤45%:-5 · >45%:-20
pie:        ≥20%:+15 · ≥15%:+10 · ≥10%:+3 · <10%:-20
empleo/continuidad: reglas actuales
morosidad: penalizaciones fuertes actuales
complemento de renta: cuantitativo (usa el monto, no +5 plano);
  relación como modificador de confianza/explicación
subsidio/FOGAES: solo recomendación, no boost de score
timing de compra / propiedad vista: solo prioridad en dashboard de ventas
```

Las métricas derivadas (`dividend_ratio`, `total_burden`, `pie_ratio`) son la **base compartida con el mapa**.

### Recommendation Engine
- Planes de mejora paso a paso.
- Rutas de recomendación: subsidio/FOGAES, pie en cuotas, propiedad en parte de pago (no afectan score, solo guían).

### AI Layer (Groq)
- Reemplaza las funciones mock manteniendo su firma.
- `generate_ai_explanation` · `generate_improvement_plan` · asistente de chat.
- Sin LangChain ni capa de abstracción hasta tener tres usos reales.

### Notification Service
- Interfaz única canal-agnóstica; implementaciones Meta WhatsApp / Resend / Expo Push detrás.
- Cambiar un proveedor nunca toca el código de feature.

### Engagement Engine
- Consume `engagement_events`, computa `engagement_scores`, expuesto al ejecutivo junto al score financiero.

## 5. Interacciones Internas (Intra-App Interactions)

### User Journey
Registro (con edad) → Objetivo → Formulario → Evaluación → **Resultado + Mapa de accesibilidad** → Plan de mejora / Recomendaciones → Seguimiento → Re-engagement.

### Executive Journey
Dashboard de leads priorizados → filtros (clasificación + timing + engagement) → asignación → agendamiento → contacto → métricas de conversión.

### Admin Journey
Gestión de usuarios/roles → analítica de funnel → configuración → auditoría de consentimiento.

## 6. UX/UI Design

> **Sección diferida.** Por decisión del equipo (2026-06-21) se omite por ahora. Se documentará el sistema de diseño existente (colores, tipografía, componentes, wireframes, flujo de navegación) más adelante, con el objetivo de que la app móvil (React Native) lo refleje de forma consistente.

## 7. Documentación (Documentation)

### ADRs (Architecture Decision Records)
A registrar como ADRs individuales:
- ADR-001 Backend en Render (vs Vercel Python) por cold starts de FastAPI.
- ADR-002 React Native + Expo (vs Flutter / PWA) por reuso de skills React.
- ADR-003 Leaflet + datos estáticos curados (vs Mapbox / scraping en vivo).
- ADR-004 Groq como proveedor IA (free tier, SDK compatible OpenAI).
- ADR-005 Meta WhatsApp Cloud API directo (vs Twilio) por costo a escala.
- ADR-006 Scoring versionado, sin re-scoring de historia.
- ADR-007 Engagement como eventos crudos + score computado.

### Assumptions
- **Negocio:** datos autodeclarados son suficientes para precalificación temprana; el valor entregado antes de pedir contacto reduce la fricción.
- **Técnicos:** Supabase no es necesaria para el scoring local; el contrato `POST /score` se mantiene estable; el dataset estático de barrios es suficiente para M1 y se reemplazará por API en vivo después.
- **App móvil:** distribución tipo Expo/TestFlight es suficiente para las demos; submission a stores es post-05-nov.

---

# Fase 3 — Reducción de Decisiones (Decision Reduction)

## Objetivo

Tomar decisiones antes de programar para reducir incertidumbre durante el desarrollo.

## 1. Sprint Breakdown

| Sprint | Ventana | Deliverables principales |
| :----- | :------ | :----------------------- |
| **S1–S2** | hecho | Core MVP, dashboard, tracking, explicación IA (mock), landing anónima, notificación realtime |
| **S3 → 2026-09-03** | ahora–sep | Scoring v2; mapa Leaflet + shading Layer 1; preguntas Layer 2; edad en registro; kickoff app móvil (scaffold + capa API) |
| **S4 → 2026-10-15** | sep–oct | IA real (Groq); HdU 6 simulador; HdU 5 export CRM; OCR; flujos core móvil; engagement scoring; re-engagement; asignación ejecutivos; analítica admin; consent audit log |
| **S5 → 2026-11-05** | oct–nov | CMF/Dicom; asistente de chat; módulo educativo; release móvil; agendamiento; hardening + demo Feria SW |

Track móvil corre en paralelo desde S3 (un sub-equipo), mientras backend construye scoring + integraciones.

## 2. Descomposición de Historias (Story Breakdown)

Cada HdU se divide en: **Backend Tasks** (APIs, lógica, validaciones), **Frontend Tasks** (vistas web + móvil, formularios, componentes), **QA Tasks** (test cases, acceptance criteria), **DevOps Tasks** (deploy, configuración, CI/CD).

## 3. Gestión de Riesgos (Risk Register)

| Riesgo | Tipo | Mitigación |
| :----- | :--- | :--------- |
| IA inconsistente / alucinaciones en explicaciones | Técnico | Prompts estructurados sobre `risk_codes`; output determinístico de respaldo (mock) si la API falla |
| Aprobación de templates Meta WhatsApp tarda semanas | Técnico/Plan | **Iniciar verificación de Meta Business + templates AHORA** para no bloquear S4 |
| Datos de barrios imprecisos o desactualizados | Técnico/Negocio | Dataset curado + mecanismo de refresh; arquitectura lista para API en vivo |
| Equipo pequeño vs alcance grande | Plan | Tracks paralelos; tiers por milestone; PWA como fallback móvil si nov se aprieta |
| Errores de scoring tras migración a v2 | Técnico | Versionado + tests bloqueantes del engine; sin re-scoring de historia |
| Manejo de datos personales sensibles | Legal | Consent audit log; derecho a borrado; datos mínimos; HTTPS; RBAC (Ley 19.628 / 21.719) |
| Baja adopción / resistencia a entregar datos | Negocio | Valor inmediato y gratis antes de pedir contacto (diagnóstico + mapa) |
| Cold starts / caídas en Render | Técnico | Monitoreo de uptime; smoke tests post-deploy |

## 4. Definition of Done

Una funcionalidad está terminada cuando:
- Código mergeado vía PR con al menos un review.
- Backend: unit tests de reglas de scoring + lógica de negocio nueva.
- Frontend: render de componentes + interacción de la ruta crítica cubierta.
- Acceptance criteria de la HdU verificados manualmente contra **staging**.
- Pipeline verde: lint → test → build → deploy a staging → smoke test.
- Metas SMART aplicables verificadas (<60 s score, <10 min formulario, etc.).
- Documentación/wiki actualizada (carpeta `Functionalities/`).

---

# Fase 4 — Implementación (Implementation)

## Objetivo

Construir, validar y desplegar la solución.

## Milestone 1 — 2026-09-03

### Deliverables
- Scoring v2 con versionado explícito.
- Mapa de barrios RM (Leaflet) con shading Layer 1.
- Preguntas progresivas Layer 2 (panel inline).
- Edad capturada en el registro.
- Kickoff app móvil: scaffold Expo + capa API/tipos compartida.
- Tabla `neighborhoods` poblada desde fuentes públicas.

## Milestone 2 — 2026-10-15

### Deliverables
- Integración IA real (Groq) reemplazando el mock.
- HdU 6 — simulador de estrés / hipotecario.
- HdU 5 — export/sync con CRM.
- OCR de documentos.
- Flujos core de la app móvil.
- Engagement scoring (eventos + score) + re-engagement (WhatsApp/email).
- Asignación de leads a ejecutivos + métricas.
- Analítica admin.
- Consent & data audit log.

## Milestone 3 — 2026-11-05 (final)

### Deliverables
- Integración CMF / Dicom.
- Asistente de chat (IA).
- Módulo educativo / Academia financiera.
- Agendamiento lead ↔ ejecutivo.
- Release de la app móvil.
- Notificaciones multicanal completas.
- Hardening, optimización UX y preparación de la Feria SW.

## Testing

### Functional Testing
- Flujos de usuario (web + móvil) · APIs · contrato `POST /score`.

### QA
- Acceptance criteria (Dado–Cuando–Entonces) por HdU · casos límite.
- Metas SMART como barra de aceptación (scripts existentes en `QA/`):
  - <60 s para mostrar el score.
  - ≥80% completa el formulario sin ayuda en <10 min.
  - ≥100 evaluaciones sin pérdida de datos (prueba de carga Supabase).
  - uptime ≥95% (monitoreo).

### Security Testing
- Authentication · Authorization (RBAC) · protección de datos · consentimiento.

### Quality Gates (CI — GitHub Actions)
- **Bloqueantes:** lint, build, y **tests del scoring engine** (el corazón del producto). Unit tests deben pasar.
- **No bloqueantes (warning):** umbrales de coverage y tests E2E — se ejecutan y se reportan, pero no bloquean merges críticos por deadline al inicio; se endurecen a bloqueantes cuando estén estables.
- **No se impone un % mínimo de coverage global** — se bloquea solo en scoring tests + lint + build.

## Deployment

### Environments
- development · staging (real, desde el día uno) · production.

### Monitoring
- Performance · Availability (uptime) · Error tracking · smoke tests post-deploy.

---

# Mejora Continua (Continuous Improvement)

Este documento debe mantenerse actualizado durante todo el proyecto y ser la fuente principal de decisiones, arquitectura, planificación y evolución de RutaHogar. Secciones pendientes de completar: **UX/UI Design** (Fase 2 §6) y los **ADRs individuales** (Fase 2 §7).

## Consideraciones futuras

- **Capacidad absoluta vs clasificación.** La clasificación (Alto/Medio/Bajo) es *relativa al objetivo declarado* del usuario; la **capacidad de compra absoluta** (techo de precio financiable, derivado de las métricas de scoring v2) es independiente del objetivo. El matching lead↔proyecto se hace sobre **capacidad absoluta**, no sobre la etiqueta Alto. Un usuario puede ser Medio/Bajo para su comuna soñada y aun así poder comprar un proyecto más económico que un ejecutivo vende.
- **Motor what-if (alternativas accesibles).** Cuando un usuario no califica para su objetivo, el sistema varía palancas ajustables — barrio/comuna más económica, plazo más largo, vivienda nueva + subsidio/FOGAES, tipo de propiedad — y le muestra la alternativa accesible más cercana a su meta, además de permitir exploración interactiva en el mapa (Layer 2). Reutiliza la matemática de capacidad del mapa, sin motor separado.
- **[Por considerar más adelante] Vincular el what-if con el módulo educativo.** Cada palanca del what-if ("extiende el plazo a 30 años", "una vivienda nueva ≤ 4.000 UF abre el subsidio") debería enlazar a un explainer de la Academia financiera, convirtiendo cada sugerencia de alternativa en un momento educativo. Se usa el what-if como está diseñado por ahora; la integración profunda con educación queda registrada como trabajo futuro.
