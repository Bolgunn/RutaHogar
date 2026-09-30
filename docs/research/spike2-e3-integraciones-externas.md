# Spike 2 · E3 — Integración Comercial y Servicios Externos

Reviewed: 2026-09-29
Scope: Validación técnica, patrones de integración y definición de contratos para la comunicación entre RutaHogar y sistemas de terceros (CRM comercial y CMF para indicadores financieros).
Deliverable status: **Definición de arquitectura y contratos congelados. No hay código de producción.** La implementación es responsabilidad de las historias de usuario del Sprint 2 asociadas a integraciones (HU4 y HU31).

---

## 1. Matriz de Decisión de Integración (CRM y CMF)

Dado que la elección del CRM comercial y la API exacta de la CMF pueden estar sujetas a confirmación comercial, se establece una matriz de decisión agnóstica que dicta el estándar técnico requerido, garantizando que el diseño soporte cualquier proveedor de la industria (ej. HubSpot, Salesforce, servicios del Banco Central).

| Dimensión | Requisito del Proveedor CRM | Requisito API Financiera (CMF / Banco Central) |
| :--- | :--- | :--- |
| **Protocolo** | RESTful o GraphQL sobre HTTPS (TLS 1.2+). | RESTful (JSON o XML estandarizado). |
| **Webhooks / Eventos** | Debe soportar emisión de Webhooks para actualizaciones de estado de *Leads*. | No requerido. Modalidad de consumo tipo *Pull*. |
| **Límites de consumo** | Soporte para ráfagas (*Bursts*) mínimas de 100 req/min. | Consultas diarias, no requiere alta concurrencia. |
| **Idempotencia** | Requerida vía `Idempotency-Key` o UPSERTs con llaves únicas (ej. RUT). | Operaciones GET idempotentes por definición. |
| **Autenticación** | OAuth 2.0 (Client Credentials) o API Keys rotativas. | API Key estática por IP/Servicio. |

*Nota: Para el presente diseño, se asume un CRM basado en REST con soporte de API Keys/OAuth 2.0 y una consulta a indicadores diarios mediante una API REST.*

---

## 2. Requisitos Técnicos y Arquitectura

La integración con sistemas externos se desacoplará del flujo crítico de *scoring* y registro de usuarios, garantizando que la latencia de terceros no penalice la experiencia del usuario final en RutaHogar.

### 2.1 Patrones de Integración

- **Inyección de Leads al CRM:** Se utilizará un patrón asíncrono. RutaHogar publicará un evento de `LeadScored` en una cola de mensajes o *Event Bus* interno. Un *worker* en *background* consumirá el evento y realizará la llamada REST (POST/PUT) al CRM.
- **Sincronización de Estados (CRM → RutaHogar):** Se utilizará el patrón de *Webhooks*. El CRM enviará notificaciones HTTP POST a un endpoint expuesto por RutaHogar (`/api/v1/webhooks/crm`) cuando un ejecutivo asigne un estado comercial al lead.
- **Consulta de Indicadores (CMF):** Patrón *Cron Job* diario. Dado que valores como la UF o Tasas no varían intradía, un trabajo programado consultará la API a primera hora, persistirá el valor en caché/DB, y el motor de *scoring* consumirá el valor interno. **Nunca se consultará la CMF en tiempo real durante un cálculo de scoring.**

---

## 3. Autenticación y Credenciales

El manejo de secretos para conectarse a sistemas externos sigue políticas estrictas de mínima exposición y no versionamiento.

### 3.1 Mecanismos de Seguridad
- **CRM (Outbound):** Preferencia por OAuth 2.0 *Client Credentials flow* si es soportado. En su defecto, el uso de *API Keys* enviadas mediante *Bearer Token* o *Custom Headers* (`X-Api-Key`).
- **CRM (Inbound - Webhooks):** RutaHogar validará las firmas HMAC en los *headers* de las peticiones entrantes (`X-Hub-Signature` o equivalente) usando un secreto compartido, para asegurar que el evento proviene genuinamente del CRM.
- **CMF:** Uso de *API Keys* estándar inyectadas en la petición GET a través de headers o *Query Params* bajo HTTPS.

### 3.2 Almacenamiento Seguro
- **Prohibición estricta:** Ninguna credencial, *API Key*, o *client_secret* existirá en el código fuente ni en variables por defecto.
- **Infraestructura:** Los secretos se inyectarán en tiempo de ejecución a través del administrador de variables de entorno de la plataforma de despliegue (ej. Vercel Secrets) o mediante un gestor de secretos especializado (HashiCorp Vault / AWS Secrets Manager).

---

## 4. Contratos de Interfaz (Esquemas)

### 4.1 Creación / Actualización de Lead (RutaHogar → CRM)

**Idempotencia:** El endpoint objetivo debe realizar un UPSERT basado en el identificador único (`rut` o `email`). Esto mitiga duplicidades en caso de reintentos por *timeouts*.

**Ejemplo de Payload (Request):**
```json
{
  "lead_id": "usr_9a8b7c6d",
  "rut": "12345678-9",
  "personal_info": {
    "first_name": "Juan",
    "last_name": "Pérez",
    "email": "jperez@example.com",
    "phone": "+56912345678"
  },
  "scoring": {
    "financial_classification": "Medio",
    "capacidad_compra_estimada_uf": 3060.4,
    "main_blocker": "pie_insuficiente",
    "is_fogaes_eligible": true
  },
  "matched_projects": [
    { "project_id": "prj_001", "affinity_score": 75 },
    { "project_id": "prj_005", "affinity_score": 62 }
  ],
  "metadata": {
    "source": "rutahogar_web",
    "evaluation_version": "e4-matching-v1",
    "timestamp": "2026-09-29T10:00:00Z"
  }
}
```

### 4.2 Consulta de Indicadores Financieros (CMF → RutaHogar)

**Ejemplo de Payload (Response Esperado):**
```json
{
  "indicator": "UF",
  "date": "2026-09-29",
  "value": 40854.01,
  "unit": "CLP"
}
```
*Si la estructura de la CMF difiere (ej. un XML provisto por el Banco Central), se implementará una capa de adaptación (Anti-Corruption Layer) para normalizar el dato a este contrato JSON interno utilizado por el motor de scoring.*

---

## 5. Límites de Consumo (Rate Limiting)

### 5.1 Cuotas Esperadas y Concurrencia
- **CRM:** Sujeto a la capa gratuita o de pago del proveedor (típicamente 10-100 req/segundo). RutaHogar implementará un encolamiento interno (*Rate Limiter* por *Token Bucket*) para asegurar que las llamadas salientes nunca excedan el límite contratado del CRM.
- **CMF:** Extremadamente bajo (1-5 consultas al día programadas). No representa un riesgo de *Rate Limiting* técnico para la plataforma.

### 5.2 Estrategias de Throttling
Si el CRM devuelve un código HTTP `429 Too Many Requests`, el *worker* asíncrono que consume la cola interna debe pausar el procesamiento por el tiempo indicado en el header `Retry-After`. Los *Leads* encolados no se perderán; quedarán en estado *Pending* hasta reanudar el consumo.

---

## 6. Resiliencia y Manejo de Errores

El sistema asume que los servicios de terceros fallarán. Se prohíbe explícitamente que una caída o falla externa interrumpa el flujo del usuario en RutaHogar.

### 6.1 Códigos HTTP Esperados
- **`2xx` (200, 201):** Éxito. El evento de integración se marca como `Completado`.
- **`4xx` (400, 401, 403, 404, 422):** Errores del cliente (RutaHogar). No se debe reintentar automáticamente (salvo `401` para intentar un refresco proactivo de token OAuth). Generar alerta crítica a ingeniería por discrepancia de contrato, reglas de validación o credenciales inválidas.
- **`429` / `5xx` (500, 502, 503, 504):** Errores transitorios de red o indisponibilidad del proveedor. Aplican políticas de reintento.

### 6.2 Políticas de Reintentos
Para códigos `429` y `5xx`, se implementará una estrategia estandarizada de **Exponential Backoff con Jitter**:
- **Intento 1:** Diferido 5s.
- **Intento 2:** 15s + *jitter*.
- **Intento 3:** 45s + *jitter*.
- **Máximo de reintentos:** 5 (tiempo acumulado de reintentos ~15 minutos).
- **Agotamiento de reintentos:** El mensaje pasa a una *Dead Letter Queue* (DLQ) para inspección manual, diagnóstico y futuro reprocesamiento sin pérdida de datos.

### 6.3 Comportamiento de Degradación (Circuit Breaker y Fallbacks)
- **CRM:** Si las fallas `5xx` o los *timeouts* superan el 50% de las transacciones en una ventana de 1 minuto, un *Circuit Breaker* pasa a estado **Abierto**. Las llamadas REST al CRM se detienen inmediatamente y los leads se encolan pasivamente. Tras un período de enfriamiento (ej. 5 minutos), el circuito pasa a **Semi-Abierto**, permitiendo el paso de una transacción de prueba; si resulta exitosa, el circuito se cierra y se comienza a drenar la cola retenida.
- **CMF (Fallback):** Si la consulta diaria programada de UF o tasas falla repetidamente, el sistema de RutaHogar no detendrá su motor de *scoring*. Empleará una estrategia de *Fallback* que consiste en:
  1. Utilizar el último valor persistido exitosamente en la base de datos (típicamente del día hábil anterior).
  2. Emitir una alerta no bloqueante (amarilla) en las herramientas de observabilidad indicando que se operan cálculos con indicadores desactualizados por 24 horas, lo que supone un riesgo transaccional marginal para el scoring pre-evaluativo.
