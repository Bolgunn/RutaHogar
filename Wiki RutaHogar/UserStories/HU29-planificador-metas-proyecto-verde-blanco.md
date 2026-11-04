# HU 29 - Planificador Interactivo de Metas de Ahorro para Compras en Verde/Blanco

> **✅ Implementada - Sprint 3.** Permite a los leads planificar su ahorro mensual de pie para proyectos en verde o blanco, comparar con modalidades de inmobiliaria (tarjeta y pagaré), simular protección inflacionaria y fijar metas de ahorro periódicas en el dashboard de seguimiento de su plan de mejora (HU 13).

---

## Resumen

| Campo | Valor |
| :---- | :---- |
| **Categoría** | Deseable |
| **Puntos de Historia** | 5 |
| **Actor** | Lead |
| **Sprint** | Sprint 3 |
| **Estado** | ✅ Implementada |

---

## Historia de usuario

> **Como** lead interesado en comprar una propiedad en etapa de construcción (en verde o en blanco), **quiero** simular un cronograma interactivo de ahorro mensual adaptado al plazo de entrega de la obra (ej. 12, 18, 24, 30 meses), **para** definir un plan de aportes periódico que me permita llegar a la fecha de escrituración con el pie completo sin sobreendeudarme.

---

## Criterios de aceptación

### E1 - Cálculo de cuotas de ahorro

**Dado** el valor del pie en UF y la fecha estimada de recepción municipal / entrega del edificio, **cuando** el usuario ingrese el plazo restante en meses, **entonces** el sistema debe calcular la cuota mensual sugerida de ahorro en UF y su equivalente en pesos a valor de hoy.

### E2 - Comparación con esquemas comerciales de la inmobiliaria

**Dado** el proyecto seleccionado, **cuando** la inmobiliaria ofrezca la opción de pago de pie en cuotas con tarjeta de crédito o pagarés, **entonces** el simulador debe contrastar el plan de ahorro personal versus el calendario de cuotas de pie de la inmobiliaria.

### E3 - Simulación de protección inflacionaria

**Dado** el ahorro en el mediano plazo, **cuando** el lead revise la proyección, **entonces** se debe mostrar una estimación de cómo ahorrar en instrumentos reajustables (cuentas en UF o depósitos a plazo) protege el poder adquisitivo frente al encarecimiento de la propiedad expresada en UF.

### E4 - Conexión con seguimiento mensual

**Dado** que el lead tenga activo el seguimiento del plan de mejora ([[HU13-seguimiento-mensual|HU 13]]), **cuando** fije su meta de pie en verde, **entonces** el monto mensual debe quedar fijado como meta de ahorro periódica en su dashboard personal (`FinancialTracking` y `ProgressPage`), conservando su avance a través de las actualizaciones mensuales del lead.

---

## Notas y especificación técnica de E4

1. **Precondición no circular de activación (`isTrackingPlanActive`)**:
   - Para evitar estados inválidos, el seguimiento activo se determina como fuente de verdad mediante el estado del backend de seguimiento (`GET /tracking` -> `status: "active"`).
   - Como respaldo resiliente (ej. modo offline o carga inicial), se valida si la evaluación cuenta con plan aceptado (`plan_accepted_at` o `plan_type`).
   - La mera presencia de una meta en verde previa no valida circularmente el seguimiento si el plan general no ha sido iniciado. Si el seguimiento está inactivo, el botón para fijar la meta permanece deshabilitado informando al usuario que debe activar su Plan de Mejora primero.

2. **Estructura y persistencia de la meta periódica**:
   - Al fijar la meta, se construye el payload `housing_plan.green_savings_goal`:
     - `type`: `"pie_en_verde_blanco"`
     - `project_id`, `project_name`, `entrega_estimada`
     - `pie_total_uf`, `pie_total_clp_hoy`
     - `plazo_meses`
     - `cuota_mensual_uf`, `cuota_mensual_clp`
     - `uf_value_clp`
     - `instrumento_sugerido` (`"cuenta_uf"` o `"deposito_plazo"`)
     - `fixed_at` (ISO timestamp)
   - La persistencia se realiza mediante `persistGreenSavingsGoal`, combinando la anotación en la cuenta Supabase (`housing_plan`) con almacenamiento local particionado por `evaluation_id`. Se elimina toda clave global compartida (`latest`) para evitar fugas entre distintos leads o evaluaciones.

3. **Manejo de errores y feedback visual**:
   - Si la API confirma la persistencia, la UI muestra una confirmación exitosa con rol accesible `role="status"` (`.success-message`).
   - Si la red o el backend fallan, el estado optimista se revierte limpiamente y se despliega una nota de advertencia con rol `role="alert"` (`.warning-note`), informando que la meta quedó resguardada únicamente en el navegador actual y habilitando el reintento.

4. **Traspaso entre evaluaciones inmutables (Carry-over)**:
   - En RutaHogar, las actualizaciones financieras mensuales (HU 13) generan nuevas evaluaciones inmutables.
   - `currentTrackingEvaluation` integra `preserveGreenSavingsGoal`, transfiriendo automáticamente la meta periódica activa hacia la evaluación vigente mientras continúe apuntando al mismo proyecto objetivo, asegurando que el objetivo no desaparezca al registrar avances.

5. **Visualización y sincronización en el Dashboard**:
   - **Unificación de variables (resolveUnifiedTrackingGoal)**: La "Meta de Pie" y el "Ahorro Pie" comparten la misma base matemática de valor de propiedad, pie real del proyecto y plazo en verde, evitando discrepancias entre tarjetas.
   - **Opción de ahorro ordinario (a tu propio ritmo)**: Permite al usuario desvincular el plan del plazo exigido de venta en verde con un solo clic. Al activarse:
     - Se elimina la etiqueta `"(Venta en Verde)"` del título (`"Ahorro Pie"`).
     - La cuota sugerida y el plazo retornan a la capacidad mensual ordinaria (ej. $244.000/mes a 22 meses).
     - Se despliega una nota informativa con botón directo para reanudar el cronograma de entrega en verde cuando el usuario lo decida.
   - **Vista Mi Progreso (`ProgressPage.jsx`)**: Despliega la tarjeta de meta periódica con badge de estado (`En curso (mes X de Y)` o `Plazo finalizado`), barra de progreso `<progress>`, porcentaje completado estimado y desglose del acumulado esperado y saldo restante calculado vía `describeGreenSavingsGoalProgress`.

---

## Estado frente al código

Verificación criterio por criterio contra el código entregado. ✅ implementado · ⚠️ parcial · ❌ no implementado.

| Criterio | Estado | Evidencia |
| :------- | :----- | :-------- |
| `E1` | ✅ | `greenSavingsPlannerService.js:calculateGreenSavingsSchedule` calcula cuota en UF y CLP hoy para plazos estándar (12, 18, 24, 30 meses) y personalizados. Verificado en `hu29GreenSavingsPlanner.test.jsx`. |
| `E2` | ✅ | `greenSavingsPlannerService.js:buildDeveloperInstallmentComparison` y `projectService.js:getProjectInstallmentScheme` contrastan esquemas de tarjeta y pagarés informados por la inmobiliaria. Verificado en `hu29GreenSavingsPlanner.test.jsx`. |
| `E3` | ✅ | `greenSavingsPlannerService.js:simulateInflationProtection` proyecta la cobertura del pie en Cuenta UF (+1.8% real), DAP (4.5% nominal) y efectivo frente a la inflación de la UF. Verificado en `hu29GreenSavingsPlanner.test.jsx`. |
| `E4` | ✅ | `isTrackingPlanActive`, `persistGreenSavingsGoal`, `describeGreenSavingsGoalProgress`, `preserveGreenSavingsGoal` en `currentEvaluation.js`, unificación en `resolveUnifiedTrackingGoal`, toggle de retorno a ahorro ordinario sin etiqueta `(Venta en Verde)`, e integración en `GreenSavingsPlanner.jsx`, `FinancialTracking.jsx` y `ProgressPage.jsx`. Verificado en `hu29GreenSavingsPlanner.test.jsx` (19 tests) y `currentEvaluation.test.js` (9 tests). |

---

## Historias relacionadas y dependencias

- [[HU13-seguimiento-mensual|HU 13 - Seguimiento mensual del plan de mejora]]: Dashboard personal y motor de eventos de avance donde se ancla la meta periódica de ahorro.
- [[HU7-catalogo-proyectos|HU 7 - Catálogo de proyectos inmobiliarios]]: Fuente de proyectos en verde/blanco, fechas estimadas de entrega y facilidades comerciales de pie (`esquema_pie_inmobiliaria`).
- [[HU6-simulador-financiamiento|HU 6 - Simulación de financiamiento]]: Precalificación hipotecaria y determinación del pie mínimo requerido.
