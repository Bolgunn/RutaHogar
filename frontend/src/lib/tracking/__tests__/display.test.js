import { describe, expect, it } from "vitest";

import {
  activeSeries, belongsToSlot, filterSeriesByPeriod, isUpdateDue,
  projectName, projectionCauses, serializePatch, trackingProjectContext,
} from "../display";

describe("HU13 presence-preserving updates", () => {
  it("omits untouched controls and accepts genuine worsening including zero", () => {
    expect(serializePatch({
      ingreso_mensual: { touched: true, type: "number", value: "750000" },
      deuda_mensual: { touched: true, type: "number", value: "450000" },
      ahorro_disponible: { touched: true, type: "number", value: "0" },
      edad: { touched: false, type: "number", value: "30" },
    })).toEqual({
      ingreso_mensual: 750000,
      deuda_mensual: 450000,
      ahorro_disponible: 0,
    });
  });

  it("keeps explicit null different from omission", () => {
    expect(serializePatch({
      comuna_objetivo: { touched: true, nullable: true, clear: true },
      monto_morosidad: { touched: false, nullable: true, clear: true },
    })).toEqual({ comuna_objetivo: null });
  });

  it("rejects invalid numeric input and clearing a required field", () => {
    expect(() => serializePatch({
      ingreso_mensual: { touched: true, type: "number", value: "" },
    })).toThrow("Ingresa un número válido");
    expect(() => serializePatch({
      ingreso_mensual: { touched: true, type: "number", nullable: false, clear: true },
    })).toThrow("no permite un valor vacío");
  });
});

describe("HU13 active history and update-due indicator", () => {
  it("builds chart points only from the already-resolved active line", () => {
    const active = [{
      event_id: "replacement", effective_at: "2026-02-01T00:00:00Z",
      snapshot: { ingreso_mensual: 900000, deuda_mensual: 200000, ahorro_disponible: 100000 },
      evaluation: { score: 55, classification: "Medio" },
    }];
    const before = structuredClone(active);

    expect(activeSeries(active)).toEqual([{
      id: "replacement", at: "2026-02-01T00:00:00Z", score: 55, classification: "Medio",
      income: 900000, debt: 200000, savings: 100000,
    }]);
    expect(active).toEqual(before);
  });

  it.each([
    ["2026-01-31T23:59:00Z", false],
    ["2026-02-01T00:00:00Z", true],
    ["2026-02-05T12:00:00Z", true],
    ["2026-01-31T21:00:00-03:00", true],
  ])("uses an exact 30-day instant boundary for %s", (asOf, expected) => {
    expect(isUpdateDue("2026-01-02T00:00:00Z", asOf)).toBe(expected);
  });

  it("does not show an update warning without a prior active update", () => {
    expect(isUpdateDue(null, "2026-02-01T00:00:00Z")).toBe(false);
  });

  it("identifies the baseline slot through chained corrections", () => {
    const audit = [
      { event_id: "e1" },
      { event_id: "c1", correction_of: "e1" },
      { event_id: "c1b", correction_of: "c1" },
      { event_id: "e2" },
    ];
    expect(belongsToSlot(audit[2], "e1", audit)).toBe(true);
    expect(belongsToSlot(audit[3], "e1", audit)).toBe(false);
  });

  it("has an accessible message for every ALG-13 empty cause", () => {
    for (const cause of [
      "insufficient_data", "missing_project_goal", "incomplete_state",
      "non_projectable_blocker", "no_favorable_trend", "objective_unreachable",
    ]) expect(projectionCauses[cause]).toBeTruthy();
  });
});

describe("HU13 evolution period filter", () => {
  const series = [
    { id: "old", at: "2025-05-30T12:00:00Z" },
    { id: "year", at: "2025-06-30T12:00:00Z" },
    { id: "six", at: "2025-12-01T12:00:00Z" },
    { id: "three-boundary", at: "2026-02-28T12:00:00Z" },
    { id: "latest", at: "2026-05-31T12:00:00Z" },
  ];
  const cutoff = "2026-05-31T12:00:00Z";

  it.each([
    ["3m", ["three-boundary", "latest"]],
    ["6m", ["six", "three-boundary", "latest"]],
    ["12m", ["year", "six", "three-boundary", "latest"]],
    ["all", ["old", "year", "six", "three-boundary", "latest"]],
  ])("filters %s relative to the explicit cutoff", (period, expected) => {
    expect(filterSeriesByPeriod(series, period, cutoff).map((row) => row.id)).toEqual(expected);
  });

  it("defaults to all, keeps sparse periods, and never mutates the source", () => {
    const before = structuredClone(series);

    expect(filterSeriesByPeriod(series).map((row) => row.id)).toEqual(series.map((row) => row.id));
    expect(filterSeriesByPeriod([{ id: "only", at: cutoff }], "3m", cutoff)).toHaveLength(1);
    expect(series).toEqual(before);
  });
});

describe("HU13 frozen project target presentation", () => {
  it("keeps a later project preference separate from the frozen ALG-13 target", () => {
    const tracking = {
      baseline: { target_project_snapshot: { id: "project-a", nombre: "Proyecto inicial" } },
      latest_effective_snapshot: { project_goal: { id: "project-b", nombre: "Proyecto posterior" } },
    };

    expect(trackingProjectContext(tracking)).toEqual({
      frozenTarget: { id: "project-a", nombre: "Proyecto inicial" },
      latestPreference: { id: "project-b", nombre: "Proyecto posterior" },
      hasDifferentLatestPreference: true,
    });
    expect(projectName(trackingProjectContext(tracking).frozenTarget)).toBe("Proyecto inicial");
  });

  it("does not manufacture a target when the snapshot is JSON null or absent", () => {
    expect(trackingProjectContext({ baseline: { target_project_snapshot: null }, latest_effective_snapshot: {} }))
      .toEqual({ frozenTarget: null, latestPreference: null, hasDifferentLatestPreference: false });
  });
});
