# DOCUMENTO DE IMPLEMENTACIÓN — HU 16: Gestión de leads inconsistentes o sospechosos

- **Story:** HU16 — Gestión de leads inconsistentes o sospechosos
- **Categoría:** Deseable · **Story Points:** 8 SP
- **Actores:** Ejecutivo comercial (reporte, filtrado y priorización) & Administrador inmobiliario (revisión y resolución de estado)
- **Metodología:** Scrum + SDD acotado (`docs/SCRUM_SDD_ACOTADO_RUTAHOGAR.md`)
- **Referencia de contexto:** Spike 2 (`docs/stories/E1 Spike N2/E1 Spike 2.md` — Privacidad, RBAC y Trazabilidad Legal)
- **Estado:** ✅ Implementado

---

## 1. Ficha SDD Acotado

Conforme a la metodología establecida en `docs/SCRUM_SDD_ACOTADO_RUTAHOGAR.md`, se define la siguiente ficha técnica previa a la implementación:

| Pregunta | Respuesta |
| :--- | :--- |
| **¿Qué problema resuelve?** | Evita que los ejecutivos comerciales pierdan tiempo persiguiendo leads con datos financieros contradictorios, inverosímiles o manipulados, y permite que los casos sospechosos sean investigados y resueltos por el administrador sin eliminar la información histórica. |
| **Actor beneficiado** | **Ejecutivo Comercial:** prioriza leads limpios y reporta anomalías. **Administrador Inmobiliario:** gestiona la calidad de la base de datos de su tenant y supervisa casos dudosos. |
| **Reglas afectadas** | Validaciones de coherencia financiera/personal (ingreso vs. deuda, ahorro desproporcionado, saltos atípicos en historial). Filtro por defecto en el dashboard comercial. Control de transición de estados de confiabilidad. |
| **Datos sensibles involucrados** | Datos financieros y de contacto de leads. Se cumple el principio de **confidencialidad**: el lead jamás es informado de que fue catalogado como sospechoso o inconsistente internamente (Regla #9 de RutaHogar). |
| **Cambios de contrato o integración** | Sin cambios destructivos. Se añaden campos opcionales/aditivos en la persistencia de `evaluations` y se crea la tabla de auditoría `lead_reliability_history`. El endpoint `POST /score` no sufre cambios de campos obligatorios. |
| **Fuera de alcance** | Consultas en tiempo real a burós de crédito externos de pago (Equifax/DICOM/CMF vía API de pago). Borrado físico de leads (prohibido por normativas de auditoría y Spike 2). Modelos opacos de Machine Learning no auditables. |
| **Pruebas o verificación** | Suite de tests unitarios para las reglas de inconsistencia (Pytest en backend, Vitest en frontend), tests del servicio de trazabilidad con fallback local, y validación E2E del filtrado en `DashboardLeads.jsx`. |

---

## 2. Definición de la Historia y Criterios de Aceptación

### Descripción
> **Como** ejecutivo comercial,  
> **quiero** identificar y reportar leads con información inconsistente o poco confiable,  
> **para** priorizar oportunidades de mejor calidad y permitir que los casos sospechosos sean revisados sin eliminar su información.

### Criterios de Aceptación

- **E1 — Detección automática de inconsistencias:**
  Dado que un lead registra o actualiza información financiera o personal relevante,  
  cuando el sistema detecte valores contradictorios, cambios anormales respecto a su historial o datos poco consistentes,  
  entonces debe marcar el lead con una alerta de posible inconsistencia e indicar los factores que originaron la advertencia.

- **E2 — Reporte y revisión manual:**
  Dado que un ejecutivo identifica información sospechosa en un lead,  
  cuando lo reporte indicando un motivo,  
  entonces el caso debe quedar disponible para revisión por parte del administrador inmobiliario, quien podrá cambiar su estado a `Normal`, `En revisión`, `silenciado` o `reactivado`.

- **E3 — Visualización y filtrado por estado de confiabilidad:**
  Dado que existen leads con distintos estados de revisión,  
  cuando el ejecutivo acceda al dashboard comercial,  
  entonces el sistema debe mostrar su estado de confiabilidad y permitir filtrarlos, **mostrando por defecto los leads que no estén marcados como sospechosos o silenciados**.

- **E4 — Conservación del historial y trazabilidad:**
  Dado que un lead es marcado, reportado, revisado, descartado o reactivado,  
  cuando cambie su estado,  
  entonces el sistema debe conservar su información e historial de cambios, incluyendo fecha, responsable, motivo y estado anterior y posterior, sin eliminar definitivamente el lead.

---

## 3. Arquitectura y Decisiones de Diseño

### 3.1. Máquina de Estados de Confiabilidad

El lead tendrá un atributo `reliability_status` con las siguientes transiciones controladas:

```mermaid
stateDiagram-v2
    [*] --> normal: Registro inicial sin anomalías
    [*] --> sospechoso: E1 (Detección automática de inconsistencias)
    
    normal --> sospechoso: E2 (Reporte manual por Ejecutivo)
    normal --> sospechoso: E1 (Actualización con salto anormal)
    
    sospechoso --> en_revision: Admin inmobiliario inicia revisión
    sospechoso --> silenciado: Admin inmobiliario descarta el lead
    sospechoso --> normal: Admin inmobiliario desestima sospecha
    
    en_revision --> silenciado: Admin confirma inconsistencia/fraude
    en_revision --> normal: Admin convalida antecedentes
    
    silenciado --> reactivado: Admin reactiva con nuevos antecedentes
    reactivado --> sospechoso: Nuevo reporte o inconsistencia
    reactivado --> en_revision: Nueva revisión
```

| Estado | Significado Comercial | Visible por Defecto en Dashboard (E3) |
| :--- | :--- | :---: |
| `normal` | Lead confiable sin alertas activas | **Sí** |
| `sospechoso` | Marcado automáticamente (E1) o reportado por ejecutivo (E2) | **No** (requiere activar filtro) |
| `en_revision` | El administrador inmobiliario está analizando el caso | **No** (o seleccionable vía filtro) |
| `silenciado` | Silenciado formalmente por el administrador inmobiliario | **No** (oculto por defecto) |
| `reactivado` | Reincorporado tras subsanar observaciones | **Sí** |

### 3.2. Reglas del Detector Automático (E1)

El sistema opera con reglas determinísticas tanto a nivel de Backend (`ml_fraud.py`) como a nivel de Base de Datos (`check_ml_fraud_on_insert` en Supabase), garantizando explicabilidad y auditoría sin requerir librerías pesadas de Machine Learning:

#### A. Reglas de Inconsistencia de Datos Financieros y Personales:
1. **Deuda mensual igual o superior al ingreso:** Si `deuda_mensual >= ingreso_mensual` (con `ingreso_mensual > 0`). Detona advertencia explicativa: *"Deuda mensual declarada ($X) es igual o supera el ingreso mensual total ($Y)"*.
2. **Dividendo estimado no viable:** Si `dividendo_estimado > ingreso_mensual * 0.85`. Detona: *"Dividendo mensual estimado ($X) supera el 85% del ingreso mensual ($Y)"*.
3. **Ahorro disponible desproporcionado:** Si `ahorro_disponible > ingreso_mensual * 120`. Detona: *"Ahorro disponible ($X) es desproporcionado (supera 120 veces el ingreso mensual $Y)"*.
4. **Contradicción en morosidad declarada vs. monto:** Si `morosidad_actual = 'no'` y `monto_morosidad > 0`, o bien si `morosidad_actual = 'si'` y `monto_morosidad <= 0`. Detona: *"Inconsistencia en morosidad: declara morosidad pero monto es $0 (o viceversa)"*.
5. **Edad + Plazo de crédito inviable:** Si `edad + plazo_credito_hipotecario > 85`. Detona: *"Edad (X años) + plazo solicitado (Y años) supera el límite máximo bancario de 85 años"*.

#### B. Reglas Comportamentales y Anti-Bot:
1. **Tiempo de llenado anormalmente bajo (< 5s):** Posible uso de scripts o herramientas automatizadas. Detona: *"Tiempo de llenado anormalmente bajo (<5s). Posible script automatizado"*.
2. **Tanteo excesivo (> 3 intentos en ventana de 15 minutos):** Manipulación deliberada de parámetros desde un mismo dispositivo para alterar el scoring. Detona: *"Tanteo detectado: El dispositivo ha intentado X evaluaciones en menos de 15 min"*.
3. **Salto de ahorro irreal en 24h:** Incremento abrupto de ahorro en un período corto que excede la capacidad de generación de ingresos declarada. Detona: *"Avance de ahorro irreal detectado en 24h"*.

Si se activa cualquiera de estas condiciones (score de inconsistencia o fraude >= 90%), el lead se clasifica automáticamente con `reliability_status = 'sospechoso'` y se genera un registro en `public.lead_status_history` con `changed_by = NULL` (Sistema) y los factores explicativos concatenados en el motivo.


### 3.3. Modelo de Datos y Persistencia (E4)

#### Extensión a `public.evaluations`:
- `reliability_status` (`text`, check `in ('normal', 'sospechoso', 'en_revision', 'silenciado', 'reactivado')`, default `'normal'`).
- `inconsistency_flags` (`jsonb`, default `'[]'::jsonb`).
- `reliability_updated_at` (`timestamptz`, default `now()`).

#### Nueva tabla `public.lead_reliability_history` (Trazabilidad inmutable):
```sql
create table if not exists public.lead_reliability_history (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  previous_status text,
  new_status text not null,
  reason text not null,
  trigger_type text not null, -- 'auto_detector', 'executive_report', 'admin_resolution'
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_role text not null,   -- 'sistema', 'ejecutivo', 'admin'
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

Políticas RLS:
- Inserción permitida para roles autenticados (`ejecutivo` y `admin`).
- Lectura permitida para staff (`ejecutivo` y `admin`).
- Prohibición estricta de `UPDATE` y `DELETE` para garantizar inmutabilidad.

### 3.4. Experiencia de Usuario (Dashboard Leads - E3 & E2)

1. **Filtro de Confiabilidad por Defecto (E3):**  
   - Selector en la barra de filtros del `DashboardLeads.jsx`:
     - **"Leads activos confiables"** (Filtra por `reliability_status in ('normal', 'reactivado')`). **Seleccionado por defecto al entrar**.
     - "Todos los leads" (Incluye sospechosos y descartados).
     - "Sospechosos / En alerta" (`sospechoso`).
     - "En revisión" (`en_revision`).
     - "Silenciado" (`silenciado`).
2. **Badges Visuales en Lead Card:**
   - Badge ámbar/rojo con icono `ti ti-alert-triangle` para leads con alerta de inconsistencia.
   - Badge azul `ti ti-clock-search` para leads en revisión.
   - Badge atenuado `ti ti-user-x` para leads descartados.
3. **Ficha Detallada del Lead:**
   - **Card de Advertencia de Inconsistencias (E1):** Muestra claramente los factores detonantes (ej: *"Deuda mensual declarada ($1.500.000) excede el ingreso mensual total ($1.200.000)"*).
   - **Botón "Reportar información sospechosa" (E2):** Visible para ejecutivos comerciales. Abre modal para ingresar motivo.
   - **Panel de Gestión de Confiabilidad (E2):** Visible exclusivamente para administradores (`role === 'admin'`). Permite cambiar a `Normal`, `En revisión`, `Silenciado` o `Reactivado` exigiendo motivo.
   - **Línea de Tiempo de Trazabilidad (E4):** Visualización cronológica de todas las marcas, reportes y cambios de estado con autor, fecha, estado anterior/posterior y motivo.

---

## 4. Plan de Implementación Paso a Paso

### Fase 1: Motor de Detección de Inconsistencias (E1)
1. **Backend:** Crear módulo `backend/app/scoring_engine/inconsistencies.py` con las funciones:
   - `detect_inconsistencies(input_data, previous_evaluation=None) -> dict`
   - Validación de reglas lógicas y de saltos de historial.
2. **Frontend:** Crear homólogo modular `frontend/src/lib/reliability/inconsistencyDetector.js` para mantener el cliente desacoplado y funcional en modo offline o previo a guardado.
3. **Tests unitarios:**
   - `backend/tests/test_inconsistencies.py`: Cobertura de cada regla con casos borde (deuda > ingreso, morosidad contradictoria, saltos de sueldo, plazo inviable).
   - `frontend/src/lib/__tests__/inconsistencyDetector.test.js`: Cobertura Vitest de las reglas en JavaScript.

### Fase 2: Persistencia, Migración y Trazabilidad (E4)
1. **Migración SQL:** `supabase/migrations/20260918000000_lead_reliability_and_history.sql`
   - Alter a `evaluations` agregando `reliability_status` y `inconsistency_flags`.
   - Creación de tabla `lead_reliability_history` con índices y constraints.
   - RLS y políticas para `ejecutivo` y `admin`.
   - Script de rollback `supabase/rollback/20260918000000_lead_reliability_and_history.rollback.sql`.
2. **Servicio Frontend de Confiabilidad:** `frontend/src/services/leadReliabilityService.js`
   - `reportSuspiciousLead({ evaluationId, userId, reason, details, actor })`
   - `resolveLeadReliabilityStatus({ evaluationId, userId, newStatus, reason, actor })`
   - `getLeadReliabilityHistory(evaluationId)`
   - Implementación dual: Supabase SDK + LocalStorage fallback para entornos de desarrollo.
3. **Adaptación de `evaluationService.js`:**
   - Normalizar `reliability_status` (fallback `'normal'`) y `inconsistency_flags` (fallback `[]`).
   - Al crear o actualizar evaluaciones (`createEvaluation`), invocar el detector y registrar automáticamente el evento inicial en el historial si nace con inconsistencias.

### Fase 3: Modales de Reporte y Revisión Manual (E2)
1. **Componente `ReportLeadModal.jsx`:**
   - Formulario para ejecutivo con motivos tipificados (Inconsistencia financiera, Contacto falso, Duplicado, etc.) y campo de observaciones.
   - Manejo de estados de carga, feedback visual accesible e integración con el servicio.
2. **Componente `ManageLeadReliabilityModal.jsx`:**
   - Formulario exclusivo para `admin` con selección de nuevo estado (`normal`, `en_revision`, `silenciado`, `reactivado`) y motivo obligatorio.
3. **Componente `LeadReliabilityTimeline.jsx`:**
   - Renderizado limpio y ordenado de la trazabilidad (E4) dentro de la ficha del lead.

### Fase 4: Integración en Dashboard Comercial y Filtrado (E3)
1. **Actualización de `DashboardLeads.jsx`:**
   - Añadir estado de filtro `reliabilityFilter` con valor por defecto `"confiables"` (`normal` y `reactivado`).
   - Aplicar el filtrado en `useMemo` antes del ranking y matching de proyectos.
   - Mostrar contador de alertas en la barra superior de filtros.
   - Añadir badges visuales y tooltip de estado en `leadCard`.
   - Renderizar en la ficha seleccionada la alerta de factores (E1), el botón de reporte (E2) y la trazabilidad (E4).

### Fase 5: Verificación y QA
1. **Pruebas Automatizadas:**
   - Ejecución de tests de backend con pytest: `pytest backend/tests/test_inconsistencies.py`.
   - Ejecución de tests de frontend con vitest / npm test.
2. **Pruebas Manuales E2E:**
   - Caso 1: Registrar lead con datos contradictorios -> Verificar alerta E1 automática con sus factores y estado `sospechoso`.
   - Caso 2: Abrir `DashboardLeads` con ejecutivo -> Comprobar que el lead sospechoso NO aparece por defecto (E3).
   - Caso 3: Cambiar filtro a "Sospechosos / En alerta" -> El lead aparece con su badge de advertencia.
   - Caso 4: Reportar un lead normal como sospechoso indicando motivo -> Verificar cambio a `sospechoso` y registro en trazabilidad (E2 y E4).
   - Caso 5: Autenticarse como administrador -> Cambiar estado a `en_revision` y luego a `silenciado` con motivos -> Verificar que no se borra el lead y queda registrado en la línea de tiempo (E4).
   - Caso 6: Reactivar el lead descartado -> Comprobar que vuelve a estar visible en el filtro por defecto de leads confiables.

---

## 5. Matriz de Control de Acceso (RBAC) para HU 16

| Acción | Lead | Ejecutivo Comercial | Administrador Inmobiliario |
| :--- | :---: | :---: | :---: |
| Detección automática (E1) | Transparente (no visible) | Visualiza factores de alerta | Visualiza factores de alerta |
| Reportar sospecha con motivo (E2) | Sin acceso | **Permitido** | **Permitido** |
| Cambiar a En revisión / Descartado / Reactivado (E2) | Sin acceso | Sin acceso | **Permitido** |
| Filtrar por confiabilidad (E3) | Sin acceso | **Permitido** | **Permitido** |
| Ver historial de trazabilidad (E4) | Sin acceso | **Lectura** | **Lectura** |
| Borrado físico de lead | Sin acceso (Soft delete ARCO) | Prohibido | Prohibido |

---


## 6. Estado de Implementación Final (Ejecutado)

Durante el desarrollo e implementación final de la HU16, se construyó un ecosistema de detección de inconsistencias y sospechas de doble capa (Backend + Base de Datos) diseñado para ser completamente determinístico, explicable, ligero y auditable, **sin dependencias de librerías de Machine Learning (sin XGBoost, SHAP, Scikit-learn ni Pandas)**.

A continuación, se detalla la arquitectura operativa de detección:

### 6.1. Variables Comportamentales y Financieras Clave
Se descartó la geolocalización por temas de privacidad (Ley 19.628). En su lugar, el sistema evalúa:
1. **`time_to_submit_ms`**: Tiempo exacto (en ms/segundos) que demora el usuario entre que abre el formulario y lo envía (detecta scripts que inyectan datos masivos en < 5s).
2. **`device_id_hash`**: Identificador ofuscado del navegador/dispositivo para correlacionar envíos en ventanas cortas.
3. **`intentos_previos`**: Conteo en tiempo real de evaluaciones originadas por el mismo `device_id_hash` en los últimos 15 minutos (detecta tanteo deliberado).
4. **Datos financieros declarados (`financial_data->'input'`):** Ingreso mensual, deuda mensual, dividendo estimado, ahorro disponible, morosidad declarada y plazo solicitado.

### 6.2. Capa 1: Detector Determinístico en Backend (`ml_fraud.py`)
Toda evaluación que entra al endpoint `POST /score` es procesada por el módulo `ml_fraud.py` en Python puro:
- **Anti-Bot (Velocidad):** Si `time_to_submit` < 5 segundos = 95% sospecha.
- **Anti-Tanteo:** Si el dispositivo registra más de 3 intentos en los últimos 15 minutos = 99% sospecha.
- **Salto de Ahorro Irreal:** Si en menos de 24 horas el ahorro salta más de 3 veces el ingreso mensual = 99% sospecha.
- **Factores Explicativos:** Los motivos se inyectan en lenguaje natural claro (ej: *"Tiempo de llenado anormalmente bajo (<5s)"*, *"Tanteo detectado"*), cumpliendo el principio de explicabilidad.

### 6.3. Capa 2: Reglas Nativas de Inconsistencia en Base de Datos (Supabase)
Para evitar que registros eludan la revisión ante eventualidades del frontend o invocaciones directas, se implementó en `supabase/migrations/20261004110000_fix_hu16_review_issues.sql` el trigger `check_ml_fraud_on_insert` que evalúa de forma atómica:
- **Deuda $\ge$ Ingreso:** Si la deuda mensual declarada es igual o mayor al ingreso mensual total.
- **Dividendo Inviable:** Si el dividendo estimado supera el 85% del ingreso.
- **Ahorro Desproporcionado:** Si el ahorro disponible supera 120 veces el ingreso mensual declarado.
- **Contradicción en Morosidad:** Si declara `morosidad_actual = 'no'` pero registra `monto_morosidad > 0` (o viceversa).
- **Edad + Plazo Excedido:** Si la suma de edad y plazo supera 85 años.

Cuando cualquiera de estas reglas se activa, la evaluación se marca con `reliability_status = 'sospechoso'`, y se inserta automáticamente un registro inmutable en `lead_status_history` con `changed_by = NULL` (Sistema) y los factores detallados.

*(Nota técnica: El trigger previo `check_housing_plan_progress` sobre `evaluations` fue descartado formalmente debido a que la HU13 convirtió a `evaluations` en inmutable mediante el trigger `hu13_immutable`, centralizando el análisis financiero al momento del `INSERT`).*

### 6.4. Separación de Roles y Testing
- **Ejecutivos vs Administradores:** Los leads clasificados como `sospechoso` o `silenciado` quedan ocultos por defecto en la vista del ejecutivo comercial (E3), mientras que el administrador cuenta con la facultad exclusiva de resolver su estado a `normal`, `en_revision`, `silenciado` o `reactivado` con motivo obligatorio (E2).
- **Testing Automatizado:**
  - `backend/tests/test_ml_fraud.py` (Pytest): Verifica unitariamente el motor determinístico `predict_fraud` in-memory:
    1. *Usuario normal:* Score bajo (< 20%) y sin factores.
    2. *Tanteo:* Score >= 99% por > 3 intentos.
    3. *Bot / Script:* Score >= 95% por tiempo < 5s.
    4. *Salto de ahorro:* Score >= 99% por salto en 24h.
  - `backend/test_fraude.py`: Suite de integración FastAPI completa (4 pruebas automatizadas con `TestClient` cubriendo usuario normal, bot, tanteo y salto de ahorro).
  - `supabase/test_hu16_rules.sql`: Script de validación SQL con `ROLLBACK` para verificar la activación del trigger `check_ml_fraud_on_insert` ante datos contradictorios y el funcionamiento del barrendero (`sweep_fraudulent_leads`).
