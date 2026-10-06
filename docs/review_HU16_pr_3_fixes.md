# Resolución de Observaciones y Bloqueadores — Review PR 3 (HU16)

Este documento detalla la resolución punto por punto de todos los bloqueadores y observaciones identificados en `docs/stories/HU16/review HU16 pr 3.md`.

---

## 1. Bloqueadores de Merge Resueltos

### Bloqueador 1: Orden de Migraciones SQL y Conflicto de RLS
- **Problema:** Las migraciones anteriores (`20261002000000` y `20261003000000`) tenían fechas previas a `20261003120000_lead_status_history_read` (#108). Además, `20261003000000` recreaba la política `"Staff select lead_status_history"` con un alcance global, sobreescribiendo la política restringida por inmobiliaria de la migración #108.
- **Solución Implementada:**
  1. Se renombraron las migraciones con timestamps posteriores a `20261003120000`:
     - `supabase/migrations/20261004100000_create_hu16_objects.sql`
     - `supabase/migrations/20261004110000_fix_hu16_review_issues.sql`
  2. Se eliminó la recreación de `"Staff select lead_status_history"` en `20261004110000`, permitiendo que la política de #108 continúe rigiendo el control de acceso por tenant/inmobiliaria.
  3. Se incluyó `DROP FUNCTION IF EXISTS` para las funciones RPC (`list_lead_contacts`, `get_reported_leads_for_admin`, `get_lead_status_history_for_admin`) para permitir la actualización de tipos de retorno sin error de Postgres (`42P13`).
  4. Se integró el retorno de `reliability_status` dentro de `list_lead_contacts` en la misma migración, eliminando migraciones sueltas.

---

### Bloqueador 2: Trigger de Ahorro sobre `evaluations` no ejecutable
- **Problema:** La HU13 (`20260920190000_hu13_immutable_tracking.sql`) convirtió a `evaluations` en inmutable rechazando cualquier `UPDATE` (`hu13_immutable`). Por orden alfabético de triggers, `hu13_immutable` se ejecutaba antes que `trg_check_housing_plan_progress`, haciendo imposible su ejecución. Además, intentaba leer `housing_plan->'meta_ahorro'->>'monto_actual'`, que no se persiste en la aplicación.
- **Solución Implementada:**
  1. Se eliminó el trigger `trg_check_housing_plan_progress` y su función asociada `check_housing_plan_progress()` de la base de datos y de las migraciones.
  2. Se actualizó el archivo de pruebas `supabase/test_hu16_rules.sql` eliminando el test con `UPDATE` e incorporando validaciones de inserción de datos contradictorios.

---

### Bloqueador 3: Criterio E1 y Reglas de Inconsistencia de Datos Financieros
- **Problema:** En revisiones previas se habían eliminado las reglas de datos inconsistentes de E1 en `plan.md` y solo existían reglas anti-bot por dispositivo (tiempo < 5s, intentos > 3, salto de ahorro 24h). El criterio de aceptación E1 exige detectar valores contradictorios y registrar los factores explicativos.
- **Solución Implementada:**
  1. **Reglas de datos contradictorios en el trigger `check_ml_fraud_on_insert`:** Se implementaron las 5 reglas financieras sobre `NEW.financial_data->'input'` (Propuesta A de la review):
     - **Deuda mensual $\ge$ Ingreso mensual:** (`deuda_mensual >= ingreso_mensual` con ingreso > 0).
     - **Dividendo estimado inviable:** (`dividendo_estimado > ingreso_mensual * 0.85`).
     - **Ahorro disponible desproporcionado:** (`ahorro_disponible > ingreso_mensual * 120`).
     - **Inconsistencia de morosidad declarada vs. monto:** (`morosidad_actual = 'no'` y `monto_morosidad > 0`, o bien `'si'` y `monto_morosidad <= 0`).
     - **Edad + Plazo de crédito inviable:** (`edad + plazo_credito_hipotecario > 85`).
  2. **Explicabilidad y Trazabilidad (E4):** Cada regla agrega un mensaje en lenguaje natural a `v_reasons`. Si el score acumulado o alguna regla de inconsistencia detona, la evaluación se marca con `reliability_status = 'sospechoso'` y se genera automáticamente un registro en `lead_status_history` con `changed_by = NULL` ("Sistema") y los motivos concatenados.
  3. **Actualización de Documentación:** Se restablecieron las 5 reglas de inconsistencia en `docs/stories/HU16/plan.md` (§3.2 y §6).

---

## 2. Observaciones Menores e Inline Corregidas

| Archivo | Observación Original | Corrección Realizada |
| :--- | :--- | :--- |
| `backend/app/ml_fraud.py` | `time_to_submit or 30` convertía envíos en 0 segundos a 30, saltándose la regla de < 5s. | Se corrigió por `30.0 if raw_time is None else float(raw_time)`. |
| `backend/test_fraude.py` | El TEST 5 llamaba al endpoint `/score/retrain` (removido), fallando la suite con 404. | Se eliminó el TEST 5. La suite ahora consta de 4 tests de integración que pasan al 100%. |
| `frontend/src/components/DashboardLeads.jsx` | La actualización optimista al reportar solo actualizaba `item.id === selectedLead.id`. Si el lead tenía varias evaluaciones, las demás seguían como confiables. | Se actualizó a `item.user_id === selectedLead.user_id`, actualizando todas las evaluaciones del lead en el estado local. |
| `supabase/migrations/20261004110000_fix_hu16_review_issues.sql` | `get_my_role()` retorna NULL para usuarios sin fila en profiles, y `NULL NOT IN (...)` no lanzaba excepción. | Se corrigió la condición a `IF v_role IS NULL OR v_role NOT IN ('ejecutivo', 'admin', 'admin_inmobiliario') THEN`. |

---

## 3. Estado de la Suite de Pruebas

1. **Tests Unitarios Backend (`backend/tests/test_ml_fraud.py`):**
   - 4 tests pasando al 100% con Pytest:
     - `test_fraud_rule_normal_user` ✅
     - `test_fraud_rule_tanteo` ✅
     - `test_fraud_rule_bot_fast_submit` ✅
     - `test_fraud_rule_avance_ahorro_irreal` ✅
2. **Tests de Integración Backend (`backend/test_fraude.py`):**
   - 4 escenarios con `TestClient` pasando al 100%:
     - [TEST 1] Usuario Normal (45s, sin alertas) ✅
     - [TEST 2] Ataque Bot/Script (< 5s) ✅
     - [TEST 3] Tanteo de Parámetros (> 3 intentos en 15 min) ✅
     - [TEST 4] Salto de Ahorro Irreal en 24h ✅
3. **Tests de Base de Datos (`supabase/test_hu16_rules.sql`):**
   - Transacción con `ROLLBACK` que valida la activación de `check_ml_fraud_on_insert` ante datos contradictorios y el barrendero de inconsistencias.
