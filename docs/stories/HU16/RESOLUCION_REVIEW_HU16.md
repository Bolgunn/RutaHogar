# Resolución de Hallazgos de Code Review — HU16 (Detección y Gestión de Fraude)

Este documento detalla el estado de resolución de cada uno de los hallazgos reportados en el Code Review de la Historia de Usuario 16 (`reviewed HU16.md`), indicando qué fue corregido, la justificación técnica de la solución implementada y los puntos acordados con el equipo.

---

## 1. Resumen de Decisiones Generales

* **Estrategia sobre el modelo de Machine Learning (XGBoost / SHAP / Pandas)**:
  * Se decidió **mantener y reparar** la arquitectura de Machine Learning (Opción A solicitada), garantizando que las reglas duras de negocio (anti-bot <5s, tanteo repetido y salto abrupto de ahorro) actúen como filtros prioritarios e inmediatos, mientras que el modelo XGBoost y explicabilidad SHAP aportan detección de patrones comportamentales adaptativos.
* **Flujo de Migraciones**:
  * Se centralizaron todas las correcciones de base de datos en una migración versionada y con timestamp: `supabase/migrations/20261003000000_fix_hu16_review_issues.sql`, lista para aplicar vía Supabase CLI o SQL Editor sin dependencias manuales sueltas.

---

## 2. Detalle de Hallazgos: Qué se corrigió y Qué se mantuvo

### ✅ Corregido — Blocker 1: Mismatch de variables en modelo XGBoost (Error 500 en `/score`)
* **Problema reportado**: El archivo `xgboost_fraud_model.json` fue entrenado con 5 variables (`time_to_submit`, `ingreso_mensual`, `deuda_mensual`, `edad`, `ahorro_disponible`), pero el backend generaba 6 al incluir `intentos_previos`. Al consultar `/score`, `predict_proba` arrojaba error de nombres de columnas (HTTP 500).
* **Solución aplicada**:
  * Se alineó `_extract_features` en `backend/app/ml_fraud.py` a las 5 variables exactas con las que opera el modelo.
  * La variable `intentos_previos` se evalúa de manera determinista y prioritaria en la capa de reglas duras de negocio (bloqueo automático ante tanteo repetido).

---

### ✅ Corregido — Blocker 2: Caída por `float(None)` en `time_to_submit`
* **Problema reportado**: `payload.model_dump()` incluye `time_to_submit: None` cuando el cliente no lo envía (ej: flujos antiguos o "Fijar como mi Meta"). `data.get("time_to_submit", 30)` devolvía `None`, causando excepción al castear a `float(None)`.
* **Solución aplicada**:
  * Se actualizó a `float(data.get("time_to_submit") or 30)` tanto en la inferencia en tiempo real (`_extract_features`) como en el script de entrenamiento (`train_fraud_model`).

---

### ✅ Corregido — Blocker 3: Referencias a columna inexistente `evaluations.input`
* **Problema reportado**: Múltiples scripts SQL y políticas RLS hacían referencia a `evaluations.input->>'comuna_objetivo'` o `e.input`. En PostgreSQL la tabla `evaluations` no posee la columna `input` (la comuna se guarda en la columna nativa `target_commune` y los datos financieros en el jsonb `financial_data`), lo que provocaba que las migraciones y consultas de administración fallaran.
* **Solución aplicada**:
  * Se corrigieron todas las referencias en:
    * `supabase/migrations/20261003000000_fix_hu16_review_issues.sql`
    * `supabase/schema.sql`
    * `supabase/e1_fraud_columns_migration.sql`
    * `supabase/historial_admin_migration.sql`
  * Ahora se utiliza la columna real con fallback seguro:
    ```sql
    pr.comuna = COALESCE(evaluations.target_commune, evaluations.financial_data->'input'->>'comuna_objetivo')
    ```

---

### ✅ Corregido — Seguridad: Función `update_lead_reliability` sin control de roles
* **Problema reportado**: La función era `SECURITY DEFINER` y estaba otorgada a todo `authenticated` sin validar si el usuario era staff, permitiendo que un lead normal reactivara su propia cuenta o modificara estados ajenos. Además confiaba en un parámetro `p_reporter_id`.
* **Solución aplicada**:
  * Se implementó validación estricta de roles:
    ```sql
    IF v_role NOT IN ('ejecutivo', 'admin', 'admin_inmobiliario') THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;
    ```
  * Se fijó el autor del cambio obligatoriamente a `auth.uid()`, ignorando cualquier ID manipulado desde el cliente.
  * Se agregó `SET search_path = public` para mitigar riesgos de secuestro de ruta en funciones `SECURITY DEFINER`.

---

### ✅ Corregido — Seguridad: Tabla `lead_status_history` sin RLS
* **Problema reportado**: La tabla de auditoría fue creada sin habilitar Row Level Security, lo que permitía consultas anónimas y manipulación a través de la API PostgREST.
* **Solución aplicada**:
  * Se ejecutó `ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;`.
  * Se creó la política `Staff select lead_status_history` restringiendo la lectura exclusivamente a `ejecutivo`, `admin` y `admin_inmobiliario`.
  * No se crearon políticas de inserción o modificación pública: las escrituras se realizan únicamente a través de la función autorizada `update_lead_reliability` y el trigger/sweeper.

---

### ✅ Corregido — Seguridad: Endpoint `/score/retrain` desprotegido
* **Problema reportado**: El endpoint POST `/score/retrain` leía todos los registros usando la service key sin ninguna autenticación, permitiendo a cualquier tercero forzar un sobreentrenamiento continuo del modelo.
* **Solución aplicada**:
  * Se protegió el endpoint mediante el encabezado `x-admin-token`, validado contra la variable de entorno `ADMIN_RETRAIN_TOKEN` (o token seguro predeterminado de respaldo).
  * Se corrigieron los filtros de estados auditados para incluir `en_revision`, `silenciado`, `descartado` y `sospechoso`.

---

### ✅ Corregido — Regresión: Filtro por Fecha en `DashboardLeads.jsx`
* **Problema reportado**: Se había removido accidentalmente la línea que filtra por `dateThreshold`, dejando inoperativo el selector de rango de fechas en la interfaz de ejecutivos.
* **Solución aplicada**:
  * Se restauró la verificación:
    ```javascript
    if (dateThreshold && (!item.created_at || new Date(item.created_at) < dateThreshold)) return false;
    ```

---

### ✅ Corregido — Bug en Sweeper `sweep_fraudulent_leads()`
* **Problema reportado**: El sweeper insertaba columnas inexistentes (`lead_id`, `previous_status`, `changed_by_role`) en vez de las columnas reales de `lead_status_history` (`profile_id`, `old_status`, `new_status`, `reason`, `changed_by`). Además no contaba con `search_path` seguro ni `REVOKE FROM public`.
* **Solución aplicada**:
  * Se corrigió la sentencia `INSERT INTO public.lead_status_history` con las columnas correctas y agregando `DISTINCT ON (p.id)` para evitar filas duplicadas por lead.
  * Se revocaron permisos a `public` y se fijó `search_path = public`.

---

### ✅ Corregido — Política RLS de `evaluations` demasiado restrictiva
* **Problema reportado**: Se limitaba la visibilidad de los ejecutivos generales a solo comunas donde su inmobiliaria tuviera proyectos, lo cual vaciaba la bandeja de entrada para ejecutivos generales o con `inmobiliaria_id` nulo.
* **Solución aplicada**:
  * Se restauró la regla de negocio general: tanto `admin` como `ejecutivo` tienen acceso amplio a las evaluaciones:
    ```sql
    (public.get_my_role() IN ('admin', 'ejecutivo'))
    ```
  * El filtro geográfico por comunas de proyectos se mantiene acotado únicamente para el rol `admin_inmobiliario`.

---

### ⏸️ Mantenido / Decisión de Equipo: Nuevas dependencias ML (XGBoost, SHAP, Pandas)
* **Punto del Review**: `CLAUDE.md` establece que la incorporación de modelos ML y nuevas librerías pesadas en backend requiere acuerdo formal del equipo.
* **Estado actual**:
  * **Decisión adoptada**: Se conserva la funcionalidad completa de Machine Learning adaptativo con fallback automático a reglas duras deterministas cuando no hay modelo cargado o faltan datos suficientes (<10 evaluaciones).
  * **Validación**: Toda la suite de pruebas automatizadas en `backend/test_fraude.py` corre exitosamente (5/5 pruebas pasadas).
  * **Acción para el equipo**: Informar en la reunión técnica del Sprint que el modelo está estabilizado, protegido y no bloquea el endpoint bajo ninguna circunstancia.

---

## 3. Estado de la Suite de Pruebas

Se ejecutó la suite de pruebas automatizadas (`make test-fraude` / `python test_fraude.py`):
1. **Usuario Normal (45s)**: Aprobado (Probabilidad de fraude < 1%, usuario catalogado como Normal).
2. **Ataque Bot / Script Rápido (3s)**: Aprobado (Detectado por regla estricta de velocidad, fraude >= 95%).
3. **Tanteo Rápido / Multi-intento**: Aprobado (Detectado por frecuencia en ventana de tiempo, fraude >= 99%).
4. **Salto Abrupto de Ahorro en 24h**: Aprobado (Detectado por inconsistencia patrimonial con formato chileno, fraude >= 99%).
5. **Endpoint `/score/retrain`**: Aprobado (Protegido por token de administrador, status 200).
