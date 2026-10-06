# Resolución de Hallazgos de Code Review 2 — HU16 (Confiabilidad y Gestión de Leads)

Este documento detalla todas las correcciones, decisiones de arquitectura y ajustes implementados en respuesta a las observaciones del segundo Code Review de la Historia de Usuario 16 (`review HU16 pr 2.md`).

---

## 1. Resumen Ejecutivo de Cambios

1. **Eliminación Completa de Dependencias de Machine Learning**:
   * Se eliminaron `xgboost`, `shap`, `pandas`, `scikit-learn` y `numpy` de los requerimientos para resolver el sobrepeso del bundle (1.8 GB) que bloqueaba el despliegue en Vercel.
   * La lógica de detección de fraude/inconsistencias se migró a un motor de reglas puras en Python nativo (`backend/app/ml_fraud.py`), determinístico, rápido y auditable.
   * Se eliminó el artefacto binario `xgboost_fraud_model.json` y el endpoint `/score/retrain`.

2. **Subsanación de Errores de Base de Datos y Permisos (Error 42501)**:
   * Se eliminó la re-creación de la política `"Evaluations select own"` que realizaba una subconsulta sobre `lead_status_history`, causante del fallo de permisos en producción.
   * Se creó una migración base formal (`20261002000000_create_hu16_objects.sql`) para asegurar que una base de datos limpia cree todos los objetos requeridos (`lead_status_history`, columnas de confiabilidad, rol `admin_inmobiliario` y triggers).

3. **Correcciones de Flujo y Trazabilidad (E2, E3 y E4)**:
   * **Ejecutivos**: El motivo de reporte de lead ahora es estrictamente obligatorio. La UI actualiza el estado optimistamente sin requerir recargar la página. Los ejecutivos están restringidos por base de datos a sólo poder reportar a `en_revision`.
   * **Administradores**: La interfaz de administración ahora soporta los cuatro estados del ciclo de vida (`normal`, `en_revision`, `reactivado`, `silenciado`) con ingreso de motivo obligatorio.
   * **Métricas**: `ExecutiveHome.jsx` excluye leads `sospechoso`, `en_revision` y `silenciado` del cálculo de "prioritarios".
   * **Auditoría de Sistema**: Los triggers automáticos y el sweeper ahora insertan en `lead_status_history` registrando `changed_by = NULL` (identificado como "Sistema"), corrigiendo el error donde el propio lead aparecía como autor de su bloqueo.

---

## 2. Detalle de Correcciones por Criterio de Aceptación

### E1 — Detección Automática y Reglas Nativas
* **Problema reportado**: Las dependencias pesadas impedían el despliegue; además, los triggers automáticos no registraban historial y marcaban estados dispares (`sospechoso` vs `en_revision`).
* **Solución aplicada**:
  * En `backend/app/ml_fraud.py` se implementó la detección con reglas nativas puras (tiempo de llenado < 5s, tanteo repetido y avance anómalo de ahorro en 24h).
  * Los triggers en base de datos (`check_housing_plan_progress` y `check_ml_fraud_on_insert`) unifican el estado resultante a `sospechoso` cuando salta una alerta.
  * Se sincronizó `docs/stories/HU16/plan.md` para reflejar las reglas deterministas operativas en el backend.

---

### E2 — Reporte y Revisión Manual
* **Problema reportado**:
  * El motivo de reporte del ejecutivo era opcional y guardaba texto por defecto.
  * La función RPC `update_lead_reliability` permitía que un ejecutivo asignara cualquier estado (ej. reactivar o silenciar).
  * En la vista de administrador sólo existían botones rígidos para Reactivar y Silenciar, sin posibilidad de marcar `normal` o `en_revision`, y sin permitir un motivo personalizado.
* **Solución aplicada**:
  * En `frontend/src/components/DashboardLeads.jsx`: el campo `textarea` de motivo ahora es obligatorio para proceder con el reporte.
  * En `supabase/migrations/20261003000000_fix_hu16_review_issues.sql`: se agregó validación a nivel de RPC:
    ```sql
    IF v_role = 'ejecutivo' AND p_new_status != 'en_revision' THEN
      RAISE EXCEPTION 'Unauthorized: ejecutivo can only set en_revision';
    END IF;
    ```
  * En `frontend/src/components/AdminReportedLeads.jsx`: se reemplazaron los botones fijos por formularios inline por fila, permitiendo al administrador elegir entre los 4 estados (`normal`, `en_revision`, `reactivado`, `silenciado`) e ingresar obligatoriamente un motivo justificado.

---

### E3 — Visualización y Filtros
* **Problema reportado**:
  * Los leads silenciados no se podían consultar mediante ningún filtro.
  * Al reportar un lead, permanecía en la lista hasta recargar la página.
  * `ExecutiveHome` contabilizaba leads dudosos como prioritarios.
* **Solución aplicada**:
  * En `DashboardLeads.jsx` se agregó la opción de filtro `"Silenciados"` en el selector de Confiabilidad.
  * Se implementó actualización optimista del estado local de React al reportar un lead, ocultándolo o actualizando su badge inmediatamente.
  * En `ExecutiveHome.jsx` se ajustó la consulta de leads prioritarios para filtrar:
    ```javascript
    l.reliability_status !== "sospechoso" &&
    l.reliability_status !== "en_revision" &&
    l.reliability_status !== "silenciado"
    ```

---

### E4 — Trazabilidad e Historial (`lead_status_history`)
* **Problema reportado**:
  * Los triggers automáticos cambiaban `profiles.reliability_status` sin escribir en `lead_status_history`.
  * La función `sweep_fraudulent_leads` insertaba `changed_by = p.id`, figurando el propio lead como autor de su marcación sospechosa.
  * Cualquier usuario autenticado o anónimo podía invocar el sweeper.
* **Solución aplicada**:
  * En `20261002000000_create_hu16_objects.sql`: ambos triggers (`check_ml_fraud_on_insert` y `check_housing_plan_progress`) ahora ejecutan un `INSERT` en `lead_status_history` con `changed_by = NULL` y el detalle del motivo de la alerta.
  * En `20261003000000_fix_hu16_review_issues.sql`: el sweeper inserta con `changed_by = NULL`, mostrándose como *"Sistema"* en la interfaz de auditoría.
  * Se reforzaron los permisos del sweeper:
    ```sql
    REVOKE ALL ON FUNCTION public.sweep_fraudulent_leads() FROM public;
    REVOKE EXECUTE ON FUNCTION public.sweep_fraudulent_leads() FROM anon, authenticated, public;
    ```

---

## 3. Estado de Archivos y Migraciones

| Archivo | Tipo de Cambio | Propósito |
| :--- | :--- | :--- |
| `backend/requirements.txt` | Modificado | Eliminación de dependencias ML (XGBoost, SHAP, Pandas, Sklearn). |
| `requirements.txt` | Modificado | Sincronización de dependencias raíz sin ML. |
| `backend/app/ml_fraud.py` | Modificado | Detección determinista y explicativa en Python nativo puro. |
| `backend/app/main.py` | Modificado | Eliminación de endpoint `/score/retrain`. |
| `backend/app/xgboost_fraud_model.json` | Eliminado | Retiro del modelo binario pesado. |
| `backend/tests/test_ml_fraud.py` | Modificado | Suite de pruebas unitarias para reglas nativas (100% pasando). |
| `frontend/src/components/DashboardLeads.jsx` | Modificado | Motivo obligatorio, UI optimista y filtro "Silenciados". |
| `frontend/src/components/AdminReportedLeads.jsx` | Modificado | Selector de los 4 estados con motivo obligatorio por administrador. |
| `frontend/src/components/ExecutiveHome.jsx` | Modificado | Exclusión de leads no confiables de las métricas prioritarias. |
| `supabase/migrations/20261002000000_create_hu16_objects.sql` | Creado | Migración base con tablas, columnas, rol inmobiliario y triggers con auditoría. |
| `supabase/migrations/20261003000000_fix_hu16_review_issues.sql` | Modificado | Eliminación de política con error 42501, protección de RPC y sweeper seguro. |
| `docs/stories/HU16/plan.md` | Modificado | Sincronización del plan con las reglas determinísticas acordadas. |
