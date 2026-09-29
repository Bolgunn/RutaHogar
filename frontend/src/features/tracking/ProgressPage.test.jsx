import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ProgressView, TrackingHistoryView } from "./ProgressPage";

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

  it("shows a simple message when a date cannot be projected", () => {
    const html = renderToStaticMarkup(<ProgressView {...handlers} data={data} projection={{
      status: "not_projectable", cause: "insufficient_data", target_compatible_at: null,
    }} />);

    expect(html).toContain("Aún no podemos estimar una fecha");
    expect(html).toContain("Aún faltan observaciones en al menos dos fechas distintas.");
    expect(html).not.toContain("provenance");
    expect(html).not.toContain("variables");
  });
});

describe("HU13 goal cards and client language", () => {
  it("prioritizes goal status, percentage, values and temporal state without repeating the description", () => {
    const goalData = { ...data, goals: [{
      goal_id: "goal-1", action_status: "en_progreso", temporal_status: "atrasado",
      definition: {
        title: "Aumentar ahorro disponible", description: "Texto secundario que no debe repetirse",
        target_at: "2026-12-01T00:00:00Z",
      },
      progress: { percentage: 40, current_value: 4000000, target_value: 7000000, remaining_value: 3000000 },
      schedule: { expected_percentage: 55 },
      evidence: { ever_completed: false, currently_regressed: false },
      verification: { verifiable: true },
    }] };

    const html = renderToStaticMarkup(<ProgressView {...handlers} data={goalData} projection={{
      status: "not_projectable", cause: "insufficient_data", target_compatible_at: null,
    }} />);

    expect(html.indexOf("Aumentar ahorro disponible")).toBeLessThan(html.indexOf("En progreso"));
    expect(html).toContain("40%");
    expect(html).toContain("Actual");
    expect(html).toContain("Objetivo");
    expect(html).toContain("Restante");
    expect(html).toContain("Atrasado");
    expect(html).not.toContain("Texto secundario que no debe repetirse");
    expect(html).not.toContain("<dt>Inicio</dt>");
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
