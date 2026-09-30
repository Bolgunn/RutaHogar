# Especificación Técnica - Spike 2: Privacidad, Roles y Trazabilidad Legal

**Proyecto:** Ruta Hogar - Plataforma de Precalificación Financiera Inmobiliaria
**Stack Core:** FastAPI, Node.js, Supabase (PostgreSQL), Vercel (Frontend)

## 1\. Objetivo del Criterio de Aceptación

Definir e implementar una arquitectura segura para la gestión de datos financieros y personales de los leads. Esto incluye establecer la matriz de permisos (RBAC), diseñar los flujos de privacidad y consentimiento explícito bajo la normativa chilena, habilitar la gestión de derechos del usuario (descarga, rectificación, eliminación), y garantizar la trazabilidad inmutable de estas acciones mediante registros de auditoría en la base de datos.

## 2\. Decisiones Arquitectónicas y Justificación Legal

El modelo de negocio requiere generar un *scoring* de alta fiabilidad para derivar leads a las inmobiliarias. Para obtener esta información sin incurrir en contingencias legales bajo la **Ley 21.719 (Protección de Datos Personales)** y la normativa de la CMF, se han tomado las siguientes decisiones:

* **Validación Estricta de Identidad:** No se realizarán consultas a burós de crédito o a la CMF utilizando únicamente el RUT. Consultar datos financieros de terceros mediante un identificador público sin validar la identidad constituye una vulneración grave de privacidad (riesgo de "suplantación exploratoria").
* **Manejo del Número de Documento (Carnet de Identidad):** Si se utiliza el modelo de consulta tradicional, se solicitará el RUT y el Número de Documento en el frontend  **Decisión Técnica:** El backend (FastAPI/Node.js) consumirá el dato, validará contra la API del proveedor, y lo **desechará inmediatamente** de la memoria. No será persistido en Supabase para minimizar la superficie de exposición ante brechas de seguridad.

## 3\. Matriz de Control de Acceso Basado en Roles (RBAC)

La autorización se manejará inyectando *Custom JWT Claims* desde Supabase Auth hacia el backend, combinando validación en los middlewares de FastAPI/Node.js y políticas de *Row Level Security* (RLS) nativas en PostgreSQL.

La autorización se manejará inyectando *Custom JWT Claims* desde Supabase Auth hacia el backend, combinando validación en los middlewares de FastAPI/Node.js y políticas de *Row Level Security* (RLS) nativas en PostgreSQL.

| Módulo / Acción | Lead (Cliente) | Ejecutivo Comercial | Admin. Inmobiliario | Admin. Desarrollador (Ruta Hogar) |
| --- | --- | --- | --- | --- |
| **Perfil y Docs del Lead** | Lectura/Escritura (solo los suyos) | Lectura (solo leads asignados) | Lectura (solo leads de su inmobiliaria) | Lectura global (para soporte técnico) |
| **Scoring Financiero** | Lectura (su propio resultado) | Lectura (solo leads asignados) | Lectura (solo leads de su inmobiliaria) | Lectura global (solo para auditoría/fraude) |
| **Gestión de Negocios** | Sin acceso | Lectura/Escritura (sus negocios) | Lectura global (de su inmobiliaria) | Sin acceso |
| **Detección de Fraude y Confiabilidad** | Sin acceso (oculto por seguridad) | Visualiza alertas y Reporta sospechas | Gestiona estados (En revisión, Silenciado, Reactivado) | Auditoría Global / Configuración de Motor ML |
| **Config. Inmobiliaria** | Sin acceso | Sin acceso | Escritura (perfil de su empresa) | Lectura / Escritura |
| **Usuarios y Roles** | Sin acceso | Sin acceso | Escritura (solo personal de su equipo) | Control total |
| **Trazabilidad (Logs)** | Lectura (exportar sus datos) | Lectura (historial del lead asignado) | Lectura (auditoría de su inmobiliaria) | Lectura global de logs técnicos |

## 4\. Política de Privacidad y Derechos de los Titulares (ARCO+)

Bajo el principio de *Privacy by Design*, los flujos de la plataforma Vercel/Next.js y el backend deben soportar lo siguiente:

### A. Consentimiento Explícito e Informado

* **Mecanismo:** El formulario de onboarding tendrá casillas desmarcadas por defecto (*opt-in*).
* **Cobertura:** Debe existir un texto legal claro que autorice a Ruta Hogar a (1) validar su identidad, (2) consultar sus antecedentes financieros o conectarse a su banco, y (3) compartir su *scoring* o perfil financiero con la Inmobiliaria de destino.



### B. Gestión de Derechos sobre los Datos

El panel de usuario del Lead debe contar con un módulo de privacidad conectado a los siguientes endpoints:

* **Derecho de Acceso y Portabilidad:** Endpoint `GET /api/v1/privacy/export`. Extrae todas las relaciones del usuario desde Supabase y compila un archivo interoperable (JSON/CSV) para su descarga.
* **Derecho de Rectificación:** Endpoints `PUT /api/v1/users/me` para corregir correos, teléfonos o estado civil. Todo cambio genera un registro de auditoría.
* **Derecho de Supresión (Eliminación):** Endpoint `DELETE /api/v1/privacy/account`. Por requerimientos de trazabilidad de negocios y normativas financieras, **no se aplicará un borrado físico** de la base de datos si existe un historial comercial. Se aplicará un **Soft Delete** (Borrado Lógico) anonimizando los datos personales (ej. reemplazando el nombre por 'Usuario Eliminado', RUT en nulo) e invalidando el token en Supabase Auth, manteniendo los UUID para la integridad de las métricas de la inmobiliaria.


### 5. Notas de Implementación Técnica sobre el Flujo de Fraude y Confiabilidad:

**A. Flujo de Detección y Reporte (Motor ML -> Ejecutivo -> Admin):**

* Técnicamente, el sistema ya no utiliza booleanos simples como `is_blocked`. En su lugar, el perfil cuenta con un enumerador `reliability_status` (`normal`, `sospechoso`, `en_revision`, `silenciado`, `reactivado`).
* El **Motor de ML (XGBoost)** marca automáticamente a `sospechoso` ante comportamientos anómalos (ej: tanteo excesivo, velocidad irreal).
* El **Ejecutivo Comercial** NO puede alterar este estado de forma directa, pero puede usar el endpoint de Reporte para levantar sospechas manuales. Los leads sospechosos son ocultados de su vista principal para no perder tiempo comercial.
* Esto genera una alerta visible en el panel exclusivo del **Admin Inmobiliario** (AdminReportedLeads).

**B. Gestión de Confiabilidad y Trazabilidad Inmutable:**

* El **Admin Inmobiliario** es el juez. A través de la API puede decidir cambiar el estado de un lead sospechoso a `en_revision` (mientras averigua), `silenciado` (descarte) o `reactivado` (falsa alarma). 
* Toda modificación de estado requiere un motivo obligatorio (razón).
* **Trazabilidad (Audit Trail):** Ningún estado se borra. Todos los cambios, reportes y bloqueos quedan registrados en la tabla inmutable de base de datos para la línea de tiempo del lead, asegurando explicabilidad (XAI) en todo momento.

## 6\. Mecanismo de Registro y Trazabilidad (Audit Logs)

Para asegurar la "Responsabilidad Proactiva", el sistema no dependerá de logs a nivel de aplicación (que pueden fallar), sino de un sistema inmutable a nivel de base de datos.

1. **Tabla de Auditoría:** Se desplegará la tabla `audit\\\\_logs` en PostgreSQL para registrar: tabla afectada, acción (INSERT/UPDATE/DELETE), ID del registro, `old\\\\_data` y `new\\\\_data` (en formato `JSONB`), ID del usuario responsable, dirección IP y timestamp.
2. **Triggers Inmutables:** Se crearán funciones PL/pgSQL acopladas a las tablas críticas (`users`, `financial\\\\_profiles`, `business\\\\_deals`). Cualquier alteración disparará automáticamente la inserción en `audit\\\\_logs`.
3. **Registro de Consentimientos:** Se creará la tabla `user\\\\_consents` (relación 1:N con `users`) que registrará el UUID del usuario, la IP, el *User-Agent*, la marca de tiempo exacta y el hash o versión de la Política de Privacidad específica que el usuario aceptó en ese momento.

## 7\. Roadmap de Implementación y Stack para Sprint 2

* **Paso 1 (DB - Supabase):** Crear migraciones SQL para estructurar la tabla `audit\\\\_logs`, `user\\\\_consents` y configurar los Triggers de base de datos.
* **Paso 2 (DB - Supabase):** Habilitar RLS (*Row Level Security*) para restringir el acceso a los datos financieros basándose en el rol contenido en el JWT.
* **Paso 3 (Backend - FastAPI/Node):** Desarrollar la integración con la API de validación de identidad, asegurando que el número de serie (si se solicita) no se persista.
* **Paso 4 (Backend - FastAPI/Node):** Programar los endpoints de los derechos ARCO (`/export`, `/account` con lógica de *Soft Delete*).
* **Paso 5 (Frontend - Vercel):** Implementar la UI de captura de consentimiento en el Onboarding y el panel de configuración de Privacidad en el Dashboard del Lead.

## 8\. Posibles mejoras a futuro
* **Validación de identidad con Open Banking:** Para obtener datos de mayor calidad (cartolas, ingresos reales) con menor riesgo de manejo de credenciales, se priorizará la integración con proveedores del Sistema de Finanzas Abiertas (Ley Fintec) como Fintoc o Floid. El widget del proveedor manejará la autenticación bancaria, traspasando a Ruta Hogar únicamente el JSON con el perfil comercial.