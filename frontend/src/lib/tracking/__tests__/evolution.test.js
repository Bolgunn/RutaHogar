import { describe, expect, it } from "vitest";

import {
  evolutionSeries, expectedProgressAt, expectedProgressLine, sourceForChartField,
} from "../evolution";

const history = [
  {
    event_id: "first", effective_at: "2026-09-01T00:00:00Z",
    snapshot: { ahorro_disponible: 5000000, ingreso_mensual: 1000000, deuda_mensual: 250000 },
    evaluation: { score: 61, classification: "Medio", financial_indicators: { capacidad_compra_estimada_uf: 2500 } },
  },
  {
    event_id: "second", effective_at: "2026-10-01T00:00:00Z",
    snapshot: { ahorro_disponible: 8000000, ingreso_mensual: 1100000, deuda_mensual: 200000 },
    evaluation: { score: 68, classification: "Alto", financial_indicators: { capacidad_compra_estimada_uf: 2900 } },
  },
];

describe("HU13 evolution point context", () => {
  it("leaves the first evaluation without a nonexistent delta", () => {
    const [first] = evolutionSeries(history);
    expect(first.deltas).toEqual({ score: null, capacity: null, income: null, debt: null, savings: null });
    expect(first.classificationChange).toBeNull();
  });

  it("calculates variable and score deltas from the preceding immutable snapshot", () => {
    const [, second] = evolutionSeries(history);
    expect(second.deltas.savings).toBe(3000000);
    expect(second.deltas.score).toBe(7);
  });

  it("detects a classification change", () => {
    expect(evolutionSeries(history)[1].classificationChange).toEqual({ from: "Medio", to: "Alto" });
  });

  it("shows capacity deltas only when both historical evaluations persist comparable values", () => {
    const incomplete = structuredClone(history);
    delete incomplete[0].evaluation.financial_indicators.capacidad_compra_estimada_uf;
    expect(evolutionSeries(incomplete)[1].capacity).toBe(2900);
    expect(evolutionSeries(incomplete)[1].deltas.capacity).toBeNull();
  });

  it("does not fill incomplete historical data from a current evaluation", () => {
    const incomplete = structuredClone(history);
    delete incomplete[0].evaluation.score;
    incomplete.current_evaluation = { score: 99 };
    const [first, second] = evolutionSeries(incomplete);
    expect(first.score).toBeNull();
    expect(second.deltas.score).toBeNull();
  });

  it("shows a compatibility change only for evaluations of the same frozen project", () => {
    const projectHistory = history.map((row, index) => ({
      ...row,
      snapshot: { ...row.snapshot, project_goal: { id: "project-1" } },
      evaluation: {
        ...row.evaluation,
        project_fit: { classification: index ? "Compatible" : "Cercano" },
      },
    }));

    expect(evolutionSeries(projectHistory, { id: "project-1" })[1].compatibilityChange)
      .toEqual({ from: "Cercano", to: "Compatible" });
    expect(evolutionSeries(projectHistory, { id: "another-project" })[1].compatibilityChange).toBeNull();
    expect(evolutionSeries([{ ...projectHistory[0], snapshot: { ...projectHistory[0].snapshot, project_goal: {} } }], { id: "project-1" })[0].compatibility)
      .toBeNull();
  });
});

describe("HU13 expected progress reference", () => {
  const goal = {
    definition: {
      source: "ahorro_disponible", initial_value: 5000000, target_value: 10000000,
      target_at: "2026-12-01T00:00:00Z",
    },
  };

  it("starts at the frozen baseline, reaches the frozen target, and interpolates linearly", () => {
    const line = expectedProgressLine([goal], "ahorro_disponible", "2026-09-01T00:00:00Z");
    expect(line).toEqual([
      { at: "2026-09-01T00:00:00.000Z", value: 5000000 },
      { at: "2026-12-01T00:00:00.000Z", value: 10000000 },
    ]);
    expect(expectedProgressAt(line, "2026-10-16T12:00:00Z")).toBe(7500000);
  });

  it("is not generated when the frozen goal lacks a target or valid deadline", () => {
    expect(expectedProgressLine([{ definition: { ...goal.definition, target_at: null } }], "ahorro_disponible", "2026-09-01T00:00:00Z"))
      .toEqual([]);
    expect(expectedProgressLine([{ definition: { ...goal.definition, target_value: null } }], "ahorro_disponible", "2026-09-01T00:00:00Z"))
      .toEqual([]);
  });

  it("supports every chart source only when its own frozen numeric goal exists", () => {
    const baselineAt = "2026-09-01T00:00:00Z";
    const income = { definition: { source: "ingreso_mensual", initial_value: 1000000, target_value: 1200000, target_at: "2026-12-01T00:00:00Z" } };
    const debt = { definition: { source: "deuda_mensual", initial_value: 500000, target_value: 200000, target_at: "2026-12-01T00:00:00Z" } };

    expect(expectedProgressLine([income], sourceForChartField("income"), baselineAt).at(-1).value).toBe(1200000);
    expect(expectedProgressLine([debt], sourceForChartField("debt"), baselineAt).at(-1).value).toBe(200000);
    expect(expectedProgressLine([], sourceForChartField("savings"), baselineAt)).toEqual([]);
    expect(expectedProgressLine([], sourceForChartField("score"), baselineAt)).toEqual([]);
    expect(sourceForChartField("score")).toBe("score");
  });

  it("keeps descending targets and does not mutate frozen goals", () => {
    const goals = [{ definition: {
      source: "deuda_mensual", initial_value: 500000, target_value: 200000,
      target_at: "2026-12-01T00:00:00Z",
    } }];
    const before = structuredClone(goals);
    const line = expectedProgressLine(goals, sourceForChartField("debt"), "2026-09-01T00:00:00Z");

    expect(line[0].value).toBeGreaterThan(line[1].value);
    expect(goals).toEqual(before);
  });
});
