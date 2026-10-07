import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PointTooltip, ProgressView, TrackingHistoryView, formatHistoricalProjectGoal,
  activeBaselineForComparison, bulkAnnulSuccessMessage, canBulkAnnul, correctionTargetForClick, goalsStatusMessage, historicalEvaluationSummary, historySnapshotFields, isUpdatedField,
  dateTime, financialHistoryRows, tooltipPlacement,
} from "./ProgressPage";

const data = {
  active_line: [],
  audit_line: [{
    event_id: "baseline", effective_at: "2026-01-01T00:00:00Z",
    evaluation: { score: 50 }, recorded_complete_snapshot: {},
  }],
  excluded_from_metrics: [],
  baseline: {
    root_event_id: "baseline", baseline_at: "2026-01-01T00:00:00Z",
    target_project_snapshot: { id: "project-1", nombre: "Proyecto Norte" },
  },
  current_evaluation: {
    score: 65, classification: "Medio",
    financial_indicators: { capacidad_compra_estimada_uf: 3200 },
    project_fit: { classification: "cercano" },
  },
  latest_effective_snapshot: {
    ingreso_mensual: 1200000, deuda_mensual: 180000, ahorro_disponible: 4000000,
    project_goal: { id: "project-1", nombre: "Proyecto Norte" },
  },
  goals: [], latest_event_id: "baseline", update_due: false,
};

const handlers = { onConfirm: vi.fn(), onOpenHistory: vi.fn(), onUpdate: vi.fn() };

describe("HU13 compact projection summary", () => {
  it("uses the active replacement in the baseline slot for the score delta", () => {
    const correctedBaseline = {
      ...data,
      active_line: [{
        event_id: "baseline-replacement", root_event_id: "baseline",
        effective_at: "2026-01-01T00:00:00Z", snapshot: {},
      }],
      audit_line: [
        { event_id: "baseline", effective_at: "2026-01-01T00:00:00Z", evaluation: { score: 50 } },
        { event_id: "baseline-replacement", correction_of: "baseline", effective_at: "2026-01-01T00:00:00Z" },
        { event_id: "baseline-recalculation", event_kind: "evaluation", previous: "baseline-replacement", evaluation: { score: 55 } },
      ],
      excluded_from_metrics: ["baseline"],
      current_evaluation: { score: 65, classification: "Medio", financial_indicators: {}, project_fit: {} },
    };

    expect(activeBaselineForComparison(correctedBaseline).evaluation).toEqual({ score: 55 });

    const html = renderToStaticMarkup(<ProgressView {...handlers} data={correctedBaseline} projection={{ status: "not_projectable" }} />);

    expect(html).toContain("+10 puntos desde el inicio");
    expect(html).not.toContain("+15 puntos desde el inicio");
  });

  it("falls back to the source baseline score when later updates prevent associating a recalculation", () => {
    const correctedBaseline = {
      ...data,
      active_line: [
        { event_id: "baseline-replacement", root_event_id: "baseline", snapshot: {} },
        { event_id: "latest-update", root_event_id: "latest-update", snapshot: {} },
      ],
      audit_line: [
        { event_id: "baseline", evaluation: { score: 50 } },
        { event_id: "baseline-replacement", correction_of: "baseline" },
        { event_id: "latest-update" },
        { event_id: "later-recalculation", event_kind: "evaluation", previous: "latest-update", evaluation: { score: 65 } },
      ],
      excluded_from_metrics: ["baseline"],
    };

    expect(activeBaselineForComparison(correctedBaseline).evaluation).toEqual({ score: 50 });
    expect(renderToStaticMarkup(<ProgressView {...handlers} data={correctedBaseline} projection={{ status: "not_projectable" }} />))
      .toContain("+15 puntos desde el inicio");
  });

  it("keeps the source baseline score when its correction does not create a recalculation", () => {
    const correctedBaseline = {
      ...data,
      active_line: [{ event_id: "baseline-replacement", root_event_id: "baseline", snapshot: {} }],
      audit_line: [
        { event_id: "baseline", evaluation: { score: 50 } },
        { event_id: "baseline-replacement", correction_of: "baseline" },
      ],
      excluded_from_metrics: ["baseline"],
    };

    expect(activeBaselineForComparison(correctedBaseline).evaluation).toEqual({ score: 50 });
    expect(renderToStaticMarkup(<ProgressView {...handlers} data={correctedBaseline} projection={{ status: "not_projectable" }} />))
      .toContain("+15 puntos desde el inicio");
  });

  it("shows the estimated date, capacity and compatibility in the top summary", () => {
    const html = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={{
      status: "projected", target_compatible_at: "2026-08-15T00:00:00Z",
    }} />);

    expect(html).toContain("Proyección del objetivo");
    expect(html).toContain("Fecha compatible estimada: 15 de agosto de 2026");
    expect(html).toContain("Capacidad estimada");
    expect(html).toContain("3.200");
    expect(html).toContain("Compatibilidad actual");
    expect(html).toContain("Cercano");
    expect(html).toContain("3 meses");
    expect(html).toContain("6 meses");
    expect(html).toContain("12 meses");
    expect(html).toMatch(/<input[^>]*checked=""[^>]*value="all"/);
    expect(html).toContain("Ver y corregir historial");
    expect(html).not.toContain("Proyección observada");
    expect(html).not.toContain("Ver supuestos técnicos");
  });

  it("links the frozen projection target to its project detail when navigation is available", () => {
    const html = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={{ status: "not_projectable" }}
      onOpenProject={vi.fn()} />);

    expect(html).toContain("progress-summary__project-link");
    expect(html).toContain("Proyecto Norte");
  });

  it("shows a simple message when a date cannot be projected", () => {
    const html = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={{
      status: "not_projectable", cause: "insufficient_data", target_compatible_at: null,
    }} />);

    expect(html).toContain("Aún no podemos estimar una fecha");
    expect(html).toContain("Aún faltan observaciones en al menos dos fechas distintas.");
    expect(html).not.toContain("provenance");
    expect(html).not.toContain("variables");
  });

  it("briefly explains when projection is still loading or cannot be requested", () => {
    const loading = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={null} />);
    const unavailable = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={null}
      projectionError="No se pudo conectar al seguimiento." onRetryProjection={vi.fn()} />);

    expect(loading).toContain("Aún no está lista porque estamos revisando tus observaciones y el objetivo del plan.");
    expect(unavailable).toContain("La proyección no está disponible por ahora");
    expect(unavailable).toContain("No se pudo conectar al seguimiento.");
    expect(unavailable).toContain("Reintentar proyección");
  });
});

describe("HU13 compact financial history", () => {
  it("shows the latest ten rows until the person explicitly expands the history", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: `row-${index}` }));

    expect(financialHistoryRows(rows).map((row) => row.id)).toEqual([
      "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8", "row-9", "row-10", "row-11",
    ]);
    expect(financialHistoryRows(rows, true)).toEqual(rows);
  });

  it("formats the recorded hour in the Chilean time zone", () => {
    // 03:47 UTC is 00:47 (shown as 12:47 a. m. in es-CL) in Santiago
    // during October daylight-saving time.
    expect(dateTime("2026-10-07T03:47:00Z")).toMatch(/12:47/);
  });

  it("selects only current non-baseline records for bulk annulment", () => {
    const baseline = { event_id: "baseline" };
    const normalUpdate = { event_id: "update-2" };
    const priorVersion = { event_id: "update-1", root_event_id: "update-1" };
    const correctedUpdate = { event_id: "update-1-correction", root_event_id: "update-1" };
    const audit = [baseline, normalUpdate, priorVersion, correctedUpdate];
    const bulkRows = audit.filter((row) => canBulkAnnul(row, "baseline", audit, ["update-1"]));

    expect(bulkRows.map((row) => row.event_id)).toEqual(["update-2", "update-1-correction"]);
    expect(bulkRows).toHaveLength(2);
  });

  it("reports the number of current logical records annulled in bulk", () => {
    expect(bulkAnnulSuccessMessage(1)).toBe("1 registro fue eliminado de tu historial visible y evolución.");
    expect(bulkAnnulSuccessMessage(2)).toBe("2 registros fueron eliminados de tu historial visible y evolución.");
  });
});

describe("HU13 goal cards and client language", () => {
  it("explains why a plan has no goals and states that every generated goal is shown", () => {
    expect(goalsStatusMessage([])).toContain("no detectó bloqueadores");
    expect(goalsStatusMessage([{ goal_id: "one" }, { goal_id: "two" }, { goal_id: "three" }]))
      .toBe("3 metas fueron generadas desde los bloqueadores de la evaluación inicial. Mostramos todas las metas de tu plan.");
  });

  it("prioritizes goal status, percentage, values and temporal state without repeating the description", () => {
    const goalData = { ...data, goals: [{
      goal_id: "goal-1", action_status: "en_progreso", temporal_status: "atrasado",
      definition: {
        source_action_type: "increase_savings", title: "Aumentar ahorro para el pie",
        description: "Texto secundario que no debe repetirse", unit: "CLP", target_at: "2026-12-01T00:00:00Z",
      },
      progress: { percentage: 40, current_value: 4000000, target_value: 7000000, remaining_value: 3000000 },
      schedule: { expected_percentage: 55 },
      evidence: { ever_completed: false, currently_regressed: false },
      verification: { verifiable: true },
    }] };

    const html = renderToStaticMarkup(<ProgressView {...handlers} data={goalData} projection={{
      status: "not_projectable", cause: "insufficient_data", target_compatible_at: null,
    }} />);

    expect(html.indexOf("Aumentar ahorro para el pie")).toBeLessThan(html.indexOf("En progreso"));
    expect(html).toContain("Aumenta tu ahorro disponible hasta alcanzar el monto objetivo de pie.");
    expect(html).toContain("40%");
    expect(html).toContain("Actual");
    expect(html).toContain("Objetivo");
    expect(html).toContain("Restante");
    expect(html).toContain("$4.000.000");
    expect(html).not.toContain("$4.000.000 / mes");
    expect(html).toContain("Atrasado");
    expect(html).not.toContain("Texto secundario que no debe repetirse");
    expect(html).not.toContain("<dt>Inicio</dt>");
  });

  it("uses the frozen unit and contextual copy for dividend, debt, and credit-term goals", () => {
    const goalData = { ...data, goals: [
      {
        goal_id: "dividend", action_status: "en_progreso", temporal_status: "dentro_de_lo_esperado",
        definition: { source_action_type: "adjust_property_goal", title: "Ajustar objetivo inmobiliario", unit: "CLP/month" },
        progress: { percentage: 50, current_value: 470411, target_value: 250000, remaining_value: 220411 },
        schedule: {}, evidence: { ever_completed: false }, verification: { verifiable: true },
      },
      {
        goal_id: "debt", action_status: "en_progreso", temporal_status: "atrasado",
        definition: { source_action_type: "reduce_debt", title: "Reducir deuda mensual", unit: "CLP/month" },
        progress: { percentage: 25, current_value: 500000, target_value: 200000, remaining_value: 300000 },
        schedule: {}, evidence: { ever_completed: false }, verification: { verifiable: true },
      },
      {
        goal_id: "term", action_status: "pendiente", temporal_status: null,
        definition: { source_action_type: "adjust_credit_term", title: "Ajustar plazo del crédito", unit: "years" },
        progress: { percentage: 0, current_value: 30, target_value: 25, remaining_value: 5 },
        schedule: {}, evidence: { ever_completed: false }, verification: { verifiable: true },
      },
    ] };

    const html = renderToStaticMarkup(<ProgressView {...handlers} data={goalData} projection={{ status: "not_projectable" }} />);

    expect(html).toContain("Reducir dividendo estimado");
    expect(html).toContain("Ajusta pie, plazo o valor de la vivienda para acercar el dividendo a un nivel más sostenible.");
    expect(html).toContain("$470.411 / mes");
    expect(html).toContain("$220.411 / mes");
    expect(html).toContain("Reduce tus pagos mensuales para mejorar tu carga financiera.");
    expect(html).toContain("$500.000 / mes");
    expect(html).toContain("Acerca el plazo del crédito al rango definido por el plan.");
    expect(html).toContain("30 años");
    expect(html).toContain("Dentro de lo esperado");
    expect(html).toContain("Atrasado");
    expect(html).toContain("25%");
  });

  it("keeps technical data listings and the large change history out of the main view", () => {
    const html = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={{
      status: "not_projectable", cause: "missing_project_goal", target_compatible_at: null,
    }} />);
    const visibleText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();

    expect(visibleText).toContain("evaluación inicial");
    expect(visibleText).toContain("historial financiero");
    expect(visibleText).not.toContain("ver datos registrados");
    expect(visibleText).not.toContain("historial de cambios");
    expect(visibleText).not.toMatch(/baseline|snapshot|auditoría|trazabilidad|supuestos técnicos|detalles técnicos/);
  });

  it("renders the existing correction history only in the dedicated view", () => {
    const html = renderToStaticMarkup(<TrackingHistoryView data={data} busy={false} onCorrect={vi.fn()} />);

    expect(html).toContain("Historial de cambios");
    expect(html).toContain("Ver datos registrados");
    expect(html).toContain("Corregir registro");
  });
});

describe("HU13 evolution graph resilience", () => {
  it("renders one real observation as a focusable point without a fabricated delta", () => {
    const single = {
      ...data,
      active_line: [{
        event_id: "baseline", effective_at: "2026-01-01T00:00:00Z",
        snapshot: { ingreso_mensual: 1200000, deuda_mensual: 180000, ahorro_disponible: 4000000 },
        evaluation: { score: 65, classification: "Medio" },
      }],
    };
    const html = renderToStaticMarkup(<ProgressView {...handlers} data={single} projection={{ status: "not_projectable" }} />);

    expect(html).toContain("tabindex=\"0\"");
    expect(html).toContain("Score: 65.");
    expect(html).not.toContain("(+0)");
  });

  it("keeps the tooltip as a point-anchored overlay with historical evaluation context", () => {
    const placement = tooltipPlacement({ x: 150, y: 72 });
    const html = renderToStaticMarkup(<PointTooltip tooltipId="tooltip-score" field="score" label="Score"
      placement={placement} point={{
        at: "2026-10-06T00:00:00Z", score: 85.4,
        deltas: { score: 27.5, capacity: 486.6 },
        classificationChange: { from: "Medio", to: "Alto" },
        capacity: 1216, compatibilityChange: { from: "Cercano", to: "Compatible" },
      }} />);

    expect(placement).toMatchObject({ horizontal: "center", vertical: "above", style: { left: "50%", top: "72%" } });
    expect(html).toContain("progress-trend-tooltip--above");
    expect(html).toContain("role=\"tooltip\"");
    expect(html).toContain("Score:</b> 85,4");
    expect(html).toContain("(+27,5)");
    expect(html).toContain("Clasificación:</b> Medio → Alto");
    expect(html).toContain("Capacidad de compra:</b> 1.216 UF");
    expect(html).toContain("Compatibilidad:</b> Cercano → Compatible");
    expect(html).not.toContain("Fecha compatible estimada");
  });

  it("anchors edge and top points without letting their tooltip leave the chart", () => {
    expect(tooltipPlacement({ x: 10, y: 10 })).toMatchObject({
      horizontal: "start", vertical: "below", style: { left: "6px", top: "10%" },
    });
    expect(tooltipPlacement({ x: 290, y: 90 })).toMatchObject({
      horizontal: "end", vertical: "above", style: { right: "6px", top: "90%" },
    });
  });

  it("omits capacity and compatibility rows when historic values are not comparable", () => {
    const html = renderToStaticMarkup(<PointTooltip tooltipId="tooltip-income" field="income" label="Ingreso"
      placement={tooltipPlacement({ x: 150, y: 50 })} point={{
        at: "2026-10-06T00:00:00Z", income: 1200000,
        deltas: { income: 100000, score: null, capacity: null }, score: 65, capacity: null,
      }} />);

    expect(html).toContain("Ingreso:</b> $1.200.000");
    expect(html).not.toContain("Capacidad de compra");
    expect(html).not.toContain("Compatibilidad");
  });
});

describe("HU13 readable recorded history", () => {
  const historicalRecord = {
    event_id: "update-1", event_kind: "data_update", effective_at: "2026-02-01T12:00:00Z",
    reason: "Actualización mensual", patch: { ahorro_disponible: 22000000, continuidad_laboral: "mas_3_anios" },
    recorded_complete_snapshot: {
      ingreso_mensual: 2200000, deuda_mensual: 180000, ahorro_disponible: 22000000,
      morosidad_actual: "no", tipo_contrato: "indefinido", continuidad_laboral: "mas_3_anios",
      plazo_compra: "6_a_12_meses",
      project_goal: { nombre: "Terrazas de Maipú", precio_min_uf: 2900, comuna: "Maipú" },
      anonymous_flow_id: "never-render-this", birth_date: "1990-01-01", property_value_clp: 150000000,
    },
    evaluation: {
      score: 68, classification: "Medio",
      financial_indicators: { capacidad_compra_estimada_uf: 2740 },
    },
  };

  const historyData = {
    ...data,
    audit_line: [historicalRecord],
    current_evaluation: { score: 99, classification: "No debe aparecer" },
    latest_effective_snapshot: { ingreso_mensual: 9999999, ahorro_disponible: 99999999 },
  };

  it("renders only the compact, human-readable historical subset", () => {
    const html = renderToStaticMarkup(<TrackingHistoryView data={historyData} busy={false} onCorrect={vi.fn()} />);

    expect(html).toContain("$2.200.000");
    expect(html).toContain("$180.000");
    expect(html).toContain("$22.000.000");
    expect(html).toContain("Contrato indefinido");
    expect(html).toContain("Más de 3 años");
    expect(html).toContain("6 a 12 meses");
    expect(html).toContain("Terrazas de Maipú · 2.900 UF");
    expect(html).toContain("Score");
    expect(html).toContain("Clasificación");
    expect(html).toContain("Capacidad");
    expect(html).toContain("2.740 UF");
    expect(html).not.toContain("never-render-this");
    expect(html).not.toContain("birth_date");
    expect(html).not.toContain("property_value_clp");
    expect(html).not.toContain("&quot;nombre&quot;");
    expect(html).not.toContain("$9.999.999");
    expect(html).not.toContain("No debe aparecer");
    expect(html.match(/Actualizado/g)).toHaveLength(2);
  });

  it("marks only fields that belong to a non-baseline row patch", () => {
    const baselineRow = { ...historicalRecord, event_id: "baseline", event_kind: "baseline" };
    const html = renderToStaticMarkup(<TrackingHistoryView data={{ ...historyData, audit_line: [baselineRow] }}
      busy={false} onCorrect={vi.fn()} />);

    expect(isUpdatedField(historicalRecord, "ahorro_disponible")).toBe(true);
    expect(isUpdatedField(historicalRecord, "ingreso_mensual")).toBe(false);
    expect(isUpdatedField(baselineRow, "ahorro_disponible")).toBe(false);
    expect(html).not.toContain("Actualizado");
  });

  it("does not fill incomplete snapshots or evaluation results with current values", () => {
    expect(historySnapshotFields({ ahorro_disponible: 10 })).toEqual([{
      field: "ahorro_disponible", label: "Ahorro disponible", format: "clp", value: "$10",
    }]);
    expect(historicalEvaluationSummary({ evaluation: { score: 41, classification: "Bajo" } })).toEqual([
      { label: "Score", value: "41" }, { label: "Clasificación", value: "Bajo" },
    ]);
  });

  it("formats a historical project without exposing its raw object", () => {
    expect(formatHistoricalProjectGoal(historicalRecord.recorded_complete_snapshot.project_goal))
      .toBe("Terrazas de Maipú · 2.900 UF");
    expect(formatHistoricalProjectGoal({ precio_max_uf: 3200 })).toBe("3.200 UF");
    expect(formatHistoricalProjectGoal("project-1")).toBeNull();
  });

  it("keeps the correction action available beside each record", () => {
    const html = renderToStaticMarkup(<TrackingHistoryView data={historyData} busy={false} onCorrect={vi.fn()} />);

    expect(html).toContain("progress-audit-record__correct");
    expect(html).toContain("Corregir registro");
  });

  it("labels a replace original as a prior version and its correction as current", () => {
    const original = { ...historicalRecord, event_id: "original", reason: "Dato original" };
    const replacement = { ...historicalRecord, event_id: "replacement", correction_of: "original", reason: "Dato corregido" };
    const html = renderToStaticMarkup(<TrackingHistoryView data={{
      ...historyData, audit_line: [original, replacement], excluded_from_metrics: ["original"],
    }} busy={false} onCorrect={vi.fn()} />);

    expect(html).toContain("Dato original");
    expect(html).toContain("Dato corregido");
    expect(html).toContain("Versión anterior");
    expect(html).toContain("Registro vigente");
  });

  it("opens and closes a correction using its corresponding correction button", () => {
    const row = historicalRecord;

    expect(correctionTargetForClick(null, row)).toBe(row);
    expect(correctionTargetForClick(row, row)).toBeNull();
  });

  it("renders the correction form inside the selected historical record", () => {
    const first = { ...historicalRecord, event_id: "first-record" };
    const selected = { ...historicalRecord, event_id: "selected-record", reason: "Registro seleccionado" };
    const selectedId = "progress-audit-record-selected-record";
    const html = renderToStaticMarkup(<TrackingHistoryView data={{ ...historyData, audit_line: [first, selected] }}
      initialTarget={selected} busy={false} onCorrect={vi.fn()} />);
    const selectedStart = html.indexOf(selectedId);
    const selectedEnd = html.indexOf("</li>", selectedStart);
    const correctionStart = html.indexOf('class="progress-correction"');

    expect(selectedStart).toBeGreaterThan(-1);
    expect(correctionStart).toBeGreaterThan(selectedStart);
    expect(correctionStart).toBeLessThan(selectedEnd);
    expect(html).not.toContain(">Cancelar<");
  });
});
