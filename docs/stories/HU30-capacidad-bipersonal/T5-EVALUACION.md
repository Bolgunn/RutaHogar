# HU30 — T5: evaluación y aporte financiero

Cierre técnico local: 2026-10-21. Rama `feat/hu30-capacidad-bipersonal`, árbol inicialmente limpio y base `f9a0344`. Se leyeron PLAN, T3, T4A, T4B y las instrucciones generales/backend/QA del repositorio.

## Revalidación y alcance

Se reutilizan la acción explícita HU18 `POST /tracking/evaluations/co-debtor-confirmation`, TrackingService, el ensamblador de antecedentes, score_snapshot sin IA y la transacción hu13_commit. T3 ya guarda referencia canónica, versión y evento de relación y su trigger revalida estos datos al INSERT bajo los mismos locks de titular/participación usados por confirmaciones y cierres. No hace falta otra migración.

Conexiones identificadas antes de ampliar código:

- Una línea individual conservaba complemento_renta=false y la acción anterior no podía incorporar una confirmación. Ahora el evento explícito registra complemento_renta=true. Esto permite la incorporación y mantiene la decisión en los siguientes cambios normales; no habilita incorporación automática al confirmar el co-deudor.
- Faltaban resumen y clasificación basados en evidencia. Se añaden en la orquestación, sin alterar el motor ni las fórmulas.
- T4B ya cotejaba cinco valores con el input evaluado. T5 conserva esa protección y expone su estado textual, sin una proyección completa de T6.

No se modifican frontend, DashboardLeads, LeadDetailModal, permisos, Auth, dependencias, migraciones ni schema.sql. No hay aplicación remota, push o PR.

## Incorporación y revisión seleccionada

TrackingRepository conserva select_confirmation: revisión máxima única de la participación seleccionada, nunca el primer elemento del embed. Las filas modernas solo aportan verified_revision=true cuando están confirmed, tienen vínculo de cuenta coincidente, declaración válida de relación, aceptación inicial de esa cuenta y no tienen exclusión/cierre. La marca es interna, no entra desde el cliente y no se persiste como segunda procedencia.

La acción del titular fija el UUID seleccionado y la revisión HU13 previa. Al releer antes de calcular, un UUID distinto no se sustituye silenciosamente. Se cargan los cinco antecedentes como unidad y se usa la relación declarada vigente. La evaluación guarda:

- financial_data.input: antecedentes seleccionados y relación efectiva.
- financial_data.provenance.co_debtor_confirmation_id: UUID canónico.
- financial_data.provenance.co_debtor_consent.revision_number: versión utilizada.
- financial_data.provenance.co_debtor_consent.relation_declaration_event_id: evento de relación utilizado.
- Procedencia financiera/mercado y scoring_overrides ya existentes.

La aceptación inicial permanece en su revisión/evento original; un cambio posterior de relación no los actualiza. Un UUID permite resolver participación/cuenta y aceptación histórica sin duplicar correo, RUT, actor o participación en el resumen.

En el commit, hu30_guard_evaluation existente exige mismo titular, participación confirmed sin cierre, cuenta vinculada, revisión todavía máxima, versión/evento de relación correctos y snapshot coincidente. Si se confirmó otra revisión, cambió relación o hubo revocación/reemplazo, se rechaza toda la transacción sin evaluación, historial ni evento parcial. Las confirmadas no se invalidan por la expiración del token inicial; pending/expired no se admiten como confirmaciones.

## Clasificación

La función pura evaluation_type distingue:

| Valor | Evidencia |
| --- | --- |
| individual | Resultado nuevo verificable sin ingreso complementario considerado; también confirmación válida con ingreso cero/no admisible. |
| bipersonal_confirmed | Revisión verificada en servidor, procedencia confirmada con UUID canónico e ingreso complementario considerado > 0. |
| declared_complement | Complemento seleccionado desde declaración del titular, sin confirmación. |
| unverifiable_origin | Complemento/confirmación indicada sin evidencia suficiente; cantidades o UUID aislados no acreditan identidad/consentimiento. |

El helper acepta shapes de input/result antiguos para una futura lectura conservadora, pero T5 no lo integra como backfill ni genera resúmenes al leer. Las evaluaciones antiguas quedan intactas. Una declaración referencial HU18 no se convierte en bipersonal por una confirmación posterior con los mismos valores.

## Comparación pura y precisión

El nuevo módulo tracking/bipersonal.py llama dos veces a capacity_limits de ALG-9, el modelo sin redondeo que ya utiliza calculate_purchase_capacity. No implementa fórmulas ni llama a un segundo servicio de score.

- A: copia del input efectivo, después de aplicar el override de proyecto congelado.
- B: otra copia idéntica, con ingreso_mensual_complementario=0 y deuda_mensual_complementario=0.

No cambia complemento_renta, relación, contrato, morosidad, datos del titular, ahorro, proyecto, plazo, dividendos u otros supuestos. Ambos reciben copias del mismo snapshot BCCh validado: UF, tasa, LTV/plazo referencial, fuentes y fechas. Las demás constantes/reglas son las del mismo motor. La exclusión económica elimina ingreso y deuda complementarios mediante la decisión única de admisibilidad existente.

Los escenarios solo calculan capacidad; no generan score/IA, eventos, evaluaciones independientes, correos ni I/O de mercado. El score real se ejecuta una sola vez con include_ai=false. El snapshot de mercado ya conservado se reutiliza; el contrafactual no obtiene uno nuevo.

La diferencia efectiva es A.capacity - B.capacity; por renta es A.by_income - B.by_income. Ambas se guardan en UF sin restar indicadores previamente redondeados y en CLP multiplicando por la UF exacta del snapshot. No se fuerza mínimo cero. Puede ser positiva, cero por restricción de pie o negativa por deuda; con ingreso confirmado efectivamente utilizado, la clasificación sigue siendo bipersonal en los tres casos.

Los indicadores públicos actuales siguen con su redondeo original. Por eso sumar capacidades mostradas ya redondeadas puede diferir del delta redondeado en la última décima: presentación posterior debe usar los deltas guardados. Para auditoría, la capacidad real sin redondear se obtiene como without_complement + delta, sin duplicar otro snapshot de capacidad/mercado.

## Resumen persistido

financial_data.result.bipersonal_summary contiene:

```json
{
  "version": "hu30-bipersonal-v1",
  "evaluation_type": "bipersonal_confirmed",
  "availability": "complete",
  "without_complement": {
    "purchase_capacity_uf": 1234.567,
    "income_capacity_uf": 1234.567
  },
  "delta": {
    "purchase_capacity_uf": 100.123,
    "purchase_capacity_clp": 4074505.485,
    "income_capacity_uf": 100.123,
    "income_capacity_clp": 4074505.485
  }
}
```

Los números del ejemplo son ilustrativos. Se conservan ingresos/deudas titular/complementario considerados, totales, capacidades reales y snapshot UF en result.financial_indicators; los antecedentes declarados/confirmados completos están en input. No se duplican estos campos ni el identificador canónico en el resumen.

Sin confirmación verificable o datos suficientes para comparar se guarda availability=insufficient_data y capacidades/deltas null, nunca ceros inventados. Una evaluación individual nueva puede tener clasificación conocida y comparación no disponible. Si el titular tiene ingreso cero y el motor exige antecedentes para el escenario individual, se conserva la clasificación bipersonal real pero no se inventa capacidad individual.

hu13_commit copia input/result/provenance a evaluations y scoring_history, y mantiene la procedencia en tracking_events. Se persiste una única evaluación real y la anterior queda inmutable.

## Coincidencia, idempotencia e historia

El cotejo de T4B compara los cinco valores normalizados contra el input de la evaluación vigente. Si coinciden, score_update_required=false y la acción conserva el conflicto de dominio co_debtor_confirmation_already_applied, sin escribir otra evaluación. La lectura de seguimiento añade antecedents_status=matching_confirmed_later y message="Antecedentes coincidentes confirmados posteriormente" cuando esa revisión nueva no figura entre las ya utilizadas; no etiqueta como posterior una revisión ya incorporada.

La incorporación conserva el patrón HU18/HU13: evento propio del servidor, referencia de revisión y expected revision de la línea. Doble clic/retry no consumen dos veces la revisión; un segundo envío devuelve el conflicto de dominio existente. En hu13_commit, un request idéntico retorna su respuesta guardada y una carrera con distinta operación pierde por lineage_conflict. No se reintenta automáticamente seleccionando otra revisión.

Revocar/reemplazar excluye usos futuros y no reescribe evaluación ni clasificación histórica. La ventana y las proyecciones completas siguen siendo T6; la redacción existente ya trata bipersonal_summary como sensible.

## Archivos

1. backend/app/tracking/bipersonal.py — clasificación y comparación pura.
2. backend/app/tracking/repository.py — evidencia interna de revisión moderna verificable.
3. backend/app/tracking/service.py — resumen en nuevas evaluaciones, habilitación explícita en el evento y estado de coincidencia.
4. backend/tests/tracking/test_bipersonal_evaluation.py — 28 casos nuevos.
5. scripts/test-hu30-persistence.py — commit real, carreras, retry, cierres y conservación histórica.
6. docs/stories/HU30-capacidad-bipersonal/PLAN.md — cierre T5.
7. Este documento.

## Pruebas

- Backend relacionado, incluyendo tracking, HU18/T3/T4A/T4B, ALG-17, scoring profesional, grants y rutas: **221 aprobadas, 1 fallida, 0 omitidas**. La única falla es la previa test_insufficient_down_payment_is_identical_before_and_after_confirmation: 2200 esperado vs 2737.1852638989135. Test y motor intactos. Advertencia previa de operation ID duplicado.
- PostgreSQL 16 desechable: pasan fixtures legado y suites T3/T4A/T4B, así como nueva integración T5 con hu13_commit. Se rechazan revisión/relación cambiadas y revocación/reemplazo al commit, sin filas parciales. Dos transacciones simultáneas crean una evaluación y un scoring_history. Retry estable, baseline intacta, revocación posterior no muta histórico y rollbacks preservan fingerprint de evidencia. Contenedor eliminado; nada remoto.
- Frontend completo, Node 22.23.2: **850 aprobadas, 2 fallidas, 0 omitidas**. Solo las previas: fecha fija vencida de invitación y RUT inválido esperado como válido. No se modifica frontend.
- Helpers/correos Edge con harness Node: **11 aprobadas, 1 falla previa** de managementPublicContext (Date frente al contrato de estado). No es ejecución del runtime Deno.
- git diff --check sin errores. No cambian dependencias o esquema y no se añade una migración.

Comandos backend desde raíz:

```bash
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m pytest backend/tests/tracking backend/tests/test_co_debtor_scoring_inputs.py backend/tests/test_alg17_cases.py backend/tests/test_evaluations_grants.py backend/tests/test_hu18_decline_migration.py backend/tests/test_hu18_edge_function_security.py backend/tests/test_hu13_deployment_routes.py backend/tests/test_score_professional.py -q -o cache_dir=/tmp/hu30-t5-pytest
python3 scripts/test-hu30-persistence.py
```

Las pruebas no equivalen a E2E del despliegue Supabase real. Se mantienen las adaptaciones explícitas del bootstrap SQL documentadas en T3 y la necesidad de despliegue coordinado y E2E antes de liberar. Las ocho diferencias de esquema ajenas documentadas previamente no se modifican en esta etapa.

## Cierre y T6 pendiente

T5 cerrada en implementación/verificación local. No se alteran fórmulas, evaluación anterior ni confirmación automática, y no se ejecuta T6.

T6 debe construir las proyecciones autorizadas completas titular/staff a partir de revisión utilizada y resumen persistido: distinguir estado actual de evidencia histórica, visibilidad/advertencias y corte de 30 días, redacción de derivados/narrativas, referencias legacy y señal de otras participaciones según PLAN. Debe preservar autorización por inmobiliaria y resolver consultas en lote. Tarjeta, badge/filtro y detalle visual corresponden a las etapas de frontend posteriores.
