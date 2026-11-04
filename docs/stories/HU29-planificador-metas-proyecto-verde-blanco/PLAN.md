# PLAN — HU 29: Planificador Interactivo de Metas de Ahorro para Compras en Verde/Blanco

- **Story:** `Wiki RutaHogar/UserStories/HU29-planificador-metas-proyecto-verde-blanco.md` · **Actor:** Lead
- **Status:** Implemented · Sprint 3 · 5 SP · **Depends on / Required by:** Depends on HU 7 (Catálogo de proyectos), HU 13 (Seguimiento mensual del plan de mejora), HU 6 (Simulación de financiamiento). Required by: Dashboard de seguimiento mensual y derivación comercial.
- **Branch:** `feat/hu29-planificador-metas-proyecto-verde-blanco`

## Start here

For the build session. Standing instructions are in `docs/HANDBOOK.md` ("Starting a build session"); only what is specific to this story goes here.

- Read first:
  - `frontend/src/services/greenSavingsPlannerService.js` (cálculo puro de cronogramas, protección inflacionaria y comparativa comercial)
  - `frontend/src/components/GreenSavingsPlanner.jsx` (componente interactivo con criterios E1–E4, tipografía justificada y design tokens)
  - `frontend/src/services/projectService.js` (resolución ad-hoc de `getProjectInstallmentScheme` y `entrega_estimada`)
  - `supabase/migrations/20261103090000_hu29_esquema_pie_inmobiliaria.sql` (esquema de cuotas en `public.proyectos`)
  - `frontend/src/services/__tests__/hu29GreenSavingsPlanner.test.jsx` (suite de 12 tests unitarios e integración)
- Stop and report if:
  - Se intentan inventar condiciones comerciales de la inmobiliaria sin configuración explícita en `esquema_pie_inmobiliaria`.
  - Se modifica el contrato de scoring o se introducen cálculos de crédito vinculantes (RutaHogar es orientativo y no aprueba créditos).

## Goal

Permitir que un lead interesado en una propiedad en etapa de construcción (en blanco o en verde) simule interactivamente su cronograma mensual de ahorro en UF y CLP adaptado a los meses restantes hasta la recepción municipal/entrega del edificio, contraste de forma transparente su plan propio contra las opciones de cuotificación comercial de la inmobiliaria (tarjeta de crédito y pagarés notariales directos), comprenda la protección inflacionaria de instrumentos reajustables, y fije su cuota mensual como meta periódica en su dashboard de seguimiento (HU 13) sin sobreendeudarse.

## Approach & decisions

La funcionalidad se implementa en dos capas estrictas (conforme a `docs/HANDBOOK.md` §Architecture): una capa pura (`greenSavingsPlannerService.js`) sin frameworks ni I/O para cálculos financieros en UF/CLP, proyección inflacionaria y contrastes de cuotas, y una capa de integración visual (`GreenSavingsPlanner.jsx`) integrada en el Plan de Ahorro para la Vivienda (`HousingSavingsPlan.jsx`) y el Dashboard de Seguimiento (`FinancialTracking.jsx`).

| Decision | Rationale |
| :------- | :-------- |
| Unidad base de cálculo en UF con equivalencia diaria en CLP | Las propiedades nuevas en Chile se comercializan en UF; calcular en UF protege el plan del comprador ante la variación de precios durante la obra. |
| Comparativa comercial E2 estrictamente condicional | El criterio E2 exige contrastar solo cuando la inmobiliaria efectivamente ofrezca cuotas de pie. Si el proyecto no tiene esquema informado, la UI explica que no hay condiciones informadas en lugar de inventar números. |
| Modalidades de tarjeta de crédito vs pagarés directos | Cada modalidad tiene plazos, recargos y riesgos legales/financieros distintos. La tarjeta bloquea cupo en la CMF (riesgo de rechazo del crédito hipotecario final), mientras que el pagaré es un título ejecutivo mercantil exigible en notaría. |
| Modelado de condiciones independientes por modalidad | Permite que una inmobiliaria informe, por ejemplo, tarjeta en 12 cuotas sin recargo y pagarés en 24 cuotas con 3% de recargo. |
| Simulación inflacionaria E3 con 3 instrumentos | Educa al usuario contrastando Cuenta de Ahorro en UF (cobertura 100%), Depósito a Plazo DAP (cobertura ~98%) y cuenta corriente/efectivo en pesos (pérdida de poder adquisitivo por inflación). |
| Conexión con seguimiento mensual E4 (HU 13) | Al presionar "Fijar meta de pie en verde", el payload se persiste en `housing_plan.green_savings_goal` y `localStorage`, alimentando el registro mensual de abonos y la auditoría. |
| Migración incremental y fallback resiliente | Se agrega columna `esquema_pie_inmobiliaria jsonb` a `public.proyectos`. Para metas fijadas con anterioridad, `GreenSavingsPlanner` consulta el catálogo por ID vía `getProjectInstallmentScheme`, evitando bloqueos. |

## Standing questions

| # | Question | Answer |
| :- | :------- | :----- |
| 1 | Touches scoring? Which ALG, numbers changed? | No. No modifica algoritmos de scoring (ALG-1 a ALG-17) ni altera la clasificación o pesos del motor de precalificación. |
| 2 | Needs RLS / multi-tenant scoping? | Sí. Los proyectos mantienen su scoping por inmobiliaria (`proyectos.inmobiliaria_id`) y las evaluaciones respetan las políticas RLS por `user_id`. |
| 3 | Needs a migration? Who applies it to hosted Supabase? | Sí: `supabase/migrations/20261103090000_hu29_esquema_pie_inmobiliaria.sql` agrega la columna `esquema_pie_inmobiliaria` a `public.proyectos`. Ya aplicada en la base de datos Supabase. |
| 4 | Changes the `POST /score` contract? | No. El contrato de entrada y salida de `POST /score` permanece intacto. |
| 5 | Consent / privacy impact? | Ninguno. No se consultan burós de crédito externos ni fuentes de datos sensibles. La simulación y meta de ahorro son declarativas y voluntarias. |

## Entities

- `public.proyectos.esquema_pie_inmobiliaria`: Columna `jsonb` nullable y aditiva en `public.proyectos`. Formato:
  ```json
  {
    "ofrece_cuotas": true,
    "modalidades": ["tarjeta_credito", "pagares"],
    "numero_cuotas": 18,
    "recargo_porcentaje": 0,
    "condiciones": {
      "tarjeta_credito": { "numero_cuotas": 12, "recargo_porcentaje": 0 },
      "pagares": { "numero_cuotas": 24, "recargo_porcentaje": 3 }
    }
  }
  ```
- `evaluations.housing_plan.green_savings_goal`: Estructura JSON donde se guarda la meta fijada por el lead:
  - `proyecto_id`, `proyecto_nombre`, `entrega_estimada`, `plazo_meses`
  - `pie_total_uf`, `pie_total_clp_hoy`
  - `cuota_mensual_uf`, `cuota_mensual_clp_hoy`
  - `instrumento_sugerido` (`cuenta_uf` o `deposito_plazo`)
  - `created_at`

## Algorithms

**Lógica local de la historia (story-local logic en `frontend/src/services/greenSavingsPlannerService.js`):**

- `calculateGreenSavingsSchedule({ pieUf, plazoMeses, ufValueClp, entregaEstimada })`:
  - Cuota mensual sugerida en UF: `pieUf / plazoMeses`.
  - Equivalente en CLP hoy: `(pieUf / plazoMeses) * ufValueClp`.
  - Cronograma de amortización de ahorro mes a mes con acumulado y saldo restante en UF y CLP.
- `buildDeveloperInstallmentComparison({ project, pieUf, plazoPersonalMeses, ufValueClp })`:
  - Obtiene el esquema mediante `getDeveloperInstallmentScheme(project)`.
  - Si no ofrece cuotas o no está informado, devuelve `disponible: false` con su estado descriptivo (`no_ofrece` o `no_informado`).
  - Para cada modalidad calcula cuota mensual, recargo adicional en UF y CLP, diferencia mensual respecto al plan personal, diferencia en meses, custodia del dinero y advertencia de riesgo de endeudamiento/DTI.
- `simulateInflationProtection({ pieUf, plazoMeses, ufValueClp, propertyUf, annualInflationRate })`:
  - Proyecta la UF final en base a la tasa de inflación anual estimada (por defecto 3.5% anual).
  - Simula el encarecimiento del pie en CLP versus el valor actual.
  - Modela 3 instrumentos: Cuenta de Ahorro en UF (UF + 1.8% real anual), Depósito a Plazo DAP (4.5% nominal anual) y Ahorro en Efectivo/Cta. Cte. (0%).

## Scope

**In:**
- Criterios de aceptación E1, E2, E3 y E4.
- Rediseño visual alineado con el design system de RutaHogar (Navy `#132B4A`, Dorado `#D4A843`, tipografía monospaciada para métricas y párrafos justificados).
- Soporte para tarjeta de crédito y pagarés notariales directos con plazos y recargos diferenciados.
- Resiliencia ante snapshots antiguos mediante `getProjectInstallmentScheme` en `projectService.js`.
- Migración `20261103090000_hu29_esquema_pie_inmobiliaria.sql`.

**Out:**
- Formulario de administración en `/admin/proyectos` para editar el JSON de cuotas (gestión vía SQL o historia futura de backlog de inmobiliarias).
- Integración directa con pasarelas de pago de pagarés o procesamiento de tarjetas (fuera de alcance de precalificación orientativa).

## Steps

1. **Definición de Entidad y Migración:** Crear `supabase/migrations/20261103090000_hu29_esquema_pie_inmobiliaria.sql` con check constraint y datos demo en *Edificio Plaza Ñuñoa Referencial*.
2. **Servicio Financiero Puro:** Implementar `frontend/src/services/greenSavingsPlannerService.js` con cálculo en UF/CLP, proyección de inflación, lectura de modalidades y esquemas de la inmobiliaria.
3. **Servicio de Catálogo:** Agregar `getProjectInstallmentScheme(projectId)` en `frontend/src/services/projectService.js` para consultar el esquema y fecha de entrega si faltan en el snapshot.
4. **Componente Visual:** Crear `frontend/src/components/GreenSavingsPlanner.jsx` con los bloques E1 a E4, grillas simétricas, textos justificados, badges de custodia/rendimiento y clases del design system en `styles.css`.
5. **Integración con Vistas:** Integrar el planificador en `HousingSavingsPlan.jsx` (resultados del plan de ahorro) y `FinancialTracking.jsx` (dashboard mensual de progreso HU 13).
6. **Preservación en Inputs:** Enriquecer `projectGoalInput.js` para propagar `esquema_pie_inmobiliaria` cuando se fija un proyecto meta.
7. **Suite de Pruebas Automatizadas:** Implementar `frontend/src/services/__tests__/hu29GreenSavingsPlanner.test.jsx` (17 pruebas exhaustivas) y `currentEvaluation.test.js` (9 pruebas) cubriendo cálculo de plazos (12, 18, 24, 30 meses), ausencia de cuotas, esquemas diferenciados de tarjeta y pagarés, protección inflacionaria, fijación resiliente de meta E4, avance periódico estimado y traspaso de meta en evaluaciones vigentes.

## Acceptance criteria map

| Criterion | Step(s) | Verified by |
| :-------- | :------ | :---------- |
| `E1` — Cálculo de cuotas de ahorro (UF y CLP a valor hoy para plazos 12, 18, 24, 30 meses) | 2, 4, 5 | `calcula la cuota mensual sugerida en UF y su equivalente en pesos a valor de hoy para plazo de [12, 18, 24, 30] meses` en `hu29GreenSavingsPlanner.test.jsx` |
| `E2` — Comparación con esquemas comerciales de la inmobiliaria (tarjeta y pagarés) | 1, 2, 3, 4 | `no muestra la comparación cuando el proyecto NO ofrece pago de pie en cuotas...`, `no inventa condiciones comerciales cuando la inmobiliaria no informó...`, y `usa plazos y recargos distintos por modalidad y calcula diferencias frente al plan personal` en `hu29GreenSavingsPlanner.test.jsx` |
| `E3` — Simulación de protección inflacionaria (Cuenta UF vs DAP vs Pesos) | 2, 4 | `estima cómo ahorrar en instrumentos reajustables (cuentas en UF o depósitos a plazo) protege el poder adquisitivo frente al alza de la UF` en `hu29GreenSavingsPlanner.test.jsx` |
| `E4` — Conexión con seguimiento mensual en dashboard (HU 13) | 2, 4, 5 | `isTrackingPlanActive` no circular, `persistGreenSavingsGoal` resiliente, `describeGreenSavingsGoalProgress`, `preserveGreenSavingsGoal`, unificación matemática de metas en `resolveUnifiedTrackingGoal` y alternancia de retorno al ahorro ordinario sin etiqueta `(Venta en Verde)` en `hu29GreenSavingsPlanner.test.jsx` y `currentEvaluation.test.js` |
