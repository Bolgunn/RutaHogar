# Visualización del Flujo de Derivación Comercial (HU 12)

Este documento detalla visualmente la arquitectura de integración y el flujo completo de la Historia de Usuario 12, con un enfoque especial en la visibilidad de los métodos HTTP (GET, POST), validaciones legales y los mecanismos de auditoría (logs) implementados para asegurar la trazabilidad.

## Diagrama de Secuencia

El siguiente diagrama ilustra la interacción paso a paso entre el Ejecutivo Comercial, los servicios de Frontend y la API Mock del CRM en Backend.

```mermaid
sequenceDiagram
    autonumber
    actor Ejecutivo as Ejecutivo Comercial
    participant UI as DashboardLeads (Frontend)
    participant CRMService as crmService.js
    participant API as CRM Mock (Backend FastAPI)
    participant Log as Auditoría y Logs

    %% Carga inicial de la bandeja
    Ejecutivo->>UI: Ingresa a "Mesa de Oportunidades"
    UI->>CRMService: Solicita leads derivados previamente
    CRMService->>API: GET /api/v1/crm-mock/leads <br/> Headers: { X-Mock-CRM-API-Key }
    API-->>UI: HTTP 200 OK (Retorna arreglo de Leads)
    UI-->>Ejecutivo: Renderiza UI con badges ("En CRM Simulado")

    %% Acción de derivación
    Ejecutivo->>UI: Clic en "Derivar a CRM" (Individual o Masivo)
    UI->>CRMService: syncLeadToSimulatedCrm(lead, proyecto, match)
    
    %% Validación de datos
    rect rgb(240, 248, 255)
        Note right of CRMService: Cumplimiento Ley 19.628 (Privacidad)
        CRMService->>CRMService: Valida lead.input.consentimiento !== false
        CRMService->>CRMService: Prepara payload sin PII falsa (null fallback)
        CRMService->>CRMService: Genera SHA-256 (version_hash) para Idempotencia
    end
    
    %% Llamada POST al backend
    CRMService->>API: POST /api/v1/crm-mock/sync <br/> Headers: { X-Mock-CRM-API-Key } <br/> Body: { CRMSyncPayload }
    
    %% Capa de auditoría backend
    rect rgb(255, 240, 245)
        Note right of API: Capa de Seguridad y Trazabilidad (Auditoría)
        API->>API: Valida API Key (Falla HTTP 401 si es incorrecta)
        API->>Log: logger.info("Audit: Sync requested for lead_id=..., hash=...")
    end

    %% Resolución del POST
    alt version_hash existente y coincide
        API->>Log: logger.info("Audit: Sync unchanged for lead_id=...")
        API-->>CRMService: HTTP 200 OK { status: "sin_cambios" }
    else Registro no existe
        API->>Log: logger.info("Audit: Sync created for lead_id=...")
        API-->>CRMService: HTTP 200 OK { status: "creado" }
    else version_hash difiere
        API->>Log: logger.info("Audit: Sync updated for lead_id=...")
        API-->>CRMService: HTTP 200 OK { status: "actualizado" }
    end
    
    CRMService-->>UI: Retorna estado de la operación
    UI-->>Ejecutivo: Actualiza tarjeta del lead (Badge cambia a verde)
```

---

## Puntos Críticos de Auditoría y Trazabilidad

A través del diagrama anterior, podemos evidenciar cómo el sistema maneja la seguridad y trazabilidad:

### 1. Auditoría de Eventos en Logs
Las operaciones del CRM en el backend (`crm_mock.py`) generan eventos en consola o plataforma de monitoreo. Toda petición autorizada se registra de forma unívoca, proveyendo al equipo de seguridad visibilidad total:
- **`Audit: Sync requested for lead_id=..., hash=...`**: Queda constancia del intento de derivación y el identificador de la versión de datos.
- **`Audit: Sync created/updated/unchanged for lead_id=...`**: Indica el resultado exacto de la inserción o actualización de la base de datos (in-memory o persistente).
- **`Audit: Syncing to PlanOK/HubSpot/Salesforce...`**: Queda trazabilidad explícita de qué información (Ej: `rut`, `email`) fue inyectada en endpoints simulados de proveedores externos.

### 2. Autenticación Transparente en GET y POST
La comunicación cliente-servidor obliga el uso del encabezado `X-Mock-CRM-API-Key`.
- **GET `/leads`**: Asegura que nadie pueda "raspar" (scraping) o listar los usuarios derivados.
- **POST `/sync`**: Previene la inyección de datos impidiendo que atacantes contaminen la bandeja de oportunidades.

### 3. Privacidad desde el Origen (Shift-left Privacy)
La responsabilidad de prevenir la fuga de información inicia en `crmService.js`.
- El payload no se construye ni se envía si no existe un consentimiento previo.
- Para evitar errores silenciosos o contaminación de datos con identificadores genéricos (`11111111-1`), los campos vacíos son procesados como `null` en lugar de strings de relleno (placeholders).
