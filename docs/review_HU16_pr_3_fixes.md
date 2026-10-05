# Verificación Post-Rebase y Correcciones de Código (HU16)

Este documento detalla la revisión exhaustiva realizada sobre el código del proyecto tras el proceso de rebase manual y la resolución de conflictos de merge.

---

## 1. Conflictos Resueltos en el Rebase

### A. `latestEvaluations` vs `localEvaluations` en `DashboardLeads.jsx`
- **Contexto:** Durante el merge se presentó la duda de si mantener `latestEvaluations` o `localEvaluations`.
- **Revisión:** En ramas anteriores se había introducido un estado `const [localEvaluations, setLocalEvaluations] = useState(evaluations || [])` que no era utilizado en ningún filtro ni render del dashboard. Toda la lógica de métricas, filtrado, rankings y selección depende de `latestEvaluations` (que obtiene la última evaluación única por lead mediante `latestEvaluationPerLead`).
- **Resultado:** Mantenerse con `latestEvaluations` fue la decisión correcta. Se limpió la variable de estado huérfana para evitar advertencias de variables sin uso.

### B. `latestEvaluation` vs `evaluation`
- **Contexto:** En varias partes del dashboard o de componentes hijos existían referencias entre la evaluación única (`latestEvaluation`) y la colección/objeto general `evaluation`.
- **Revisión:** 
  - La prop general recibida es `evaluations` (historial completo de evaluaciones recibidas).
  - La lista de leads mostrada en la tabla y los conteos de métricas utilizan `latestEvaluations` para no duplicar prospectos que hayan simulado más de una vez.
  - Para el historial de un lead seleccionado se emplea `selectedLeadEvaluations`.
- **Resultado:** No existen discrepancias activas en el renderizado ni variables colisionando.

### C. Consulta a `profiles` en `evaluationService.js` y el RPC `list_lead_contacts`
- **Contexto:** En `evaluationService.js` se removió la consulta directa:
  ```javascript
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, reliability_status")
    .in("id", userIds);
  ```
- **Revisión y Hallazgo:**
  - Remover la consulta directa a `profiles` desde el front para ejecutivos es una buena práctica de seguridad, ya que los datos de contacto y estado deben obtenerse vía el RPC `list_lead_contacts`.
  - Sin embargo, la versión actual de la función `list_lead_contacts` en base de datos únicamente retornaba `id, full_name, phone`, dejando fuera el campo `reliability_status`.
  - Al no retornar `reliability_status`, el dashboard asignaba por fallback `"normal"` a todos los leads, perdiéndose visualmente las etiquetas de leads sospechosos o en revisión.
- **Acción Realizada:**
  1. Se corrigieron los errores sintácticos producto del merge en `getEvaluations` (`requireConnection()` y nombres de variables desfasados).
  2. Se generó la migración SQL `supabase/migrations/20261003130000_update_list_lead_contacts_rpc.sql` para que el RPC `list_lead_contacts` devuelva `reliability_status`. Al aplicarla en Supabase, el servicio de evaluaciones funcionará de forma óptima sin necesitar la consulta directa eliminada.

---

## 2. Estado de ML en el Proyecto
- Confirmado: Se eliminaron las librerías de ML (`xgboost`, `scikit-learn`, `shap`, etc.) del backend y de `requirements.txt`.
- No se incorporan modelos de Machine Learning ni triggers dependientes de modelos predictivos.
