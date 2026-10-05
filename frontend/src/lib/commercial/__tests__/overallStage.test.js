import { describe, expect, it } from "vitest";
import { overallStage } from "../overallStage";

const lead = (stage, at, por_sistema = false) => ({ proyecto_id: null, stage, at, por_sistema });
const project = (id, stage, at, por_sistema = false) => ({ proyecto_id: id, stage, at, por_sistema });

describe("overallStage (ALG-17 R3)", () => {
  it("O1 no record → nuevo", () => {
    expect(overallStage([])).toEqual({ stage: "nuevo", causa: null });
    expect(overallStage()).toEqual({ stage: "nuevo", causa: null });
  });

  it("O2 only the lead-level record → its stage", () => {
    expect(overallStage([lead("contactado", "2026-01-01T00:00:00Z")])).toEqual({ stage: "contactado", causa: null });
  });

  it("O2 lead-level perdido is possible while there is no project record", () => {
    expect(overallStage([lead("perdido", "2026-01-01T00:00:00Z")])).toEqual({ stage: "perdido", causa: "por_gestion" });
  });

  it("O3 strictly later revives", () => {
    const records = [
      lead("en_plan_mejora", "2026-03-01T10:00:01Z"),
      project("p1", "perdido", "2026-03-01T10:00:00Z"),
      project("p2", "perdido", "2026-02-01T00:00:00Z", true),
    ];
    expect(overallStage(records)).toEqual({ stage: "en_plan_mejora", causa: null });
  });

  it("O3 same instant does not revive", () => {
    const records = [
      lead("contactado", "2026-03-01T10:00:00.000Z"),
      project("p1", "perdido", "2026-03-01T07:00:00.000-03:00"),
    ];
    expect(overallStage(records)).toEqual({ stage: "perdido", causa: "por_gestion" });
  });

  it("O3 compares instants, not strings", () => {
    const records = [
      lead("contactado", "2026-03-01T08:00:00-03:00"),
      project("p1", "perdido", "2026-03-01T10:30:00Z"),
    ];
    expect(overallStage(records).stage).toBe("contactado");
  });

  it("O3 an earlier lead-level event does not revive", () => {
    const records = [
      lead("contactado", "2026-01-01T00:00:00Z"),
      project("p1", "perdido", "2026-02-01T00:00:00Z"),
    ];
    expect(overallStage(records).stage).toBe("perdido");
  });

  it("O4 every project record perdido and no lead-level record → perdido", () => {
    expect(overallStage([project("p1", "perdido", "2026-02-01T00:00:00Z")]))
      .toEqual({ stage: "perdido", causa: "por_gestion" });
  });

  it("O5 highest-ranked stage among records that are not perdido, lead-level included", () => {
    const records = [
      lead("en_plan_mejora", "2026-01-01T00:00:00Z"),
      project("p1", "contactado", "2026-02-01T00:00:00Z"),
      project("p2", "perdido", "2026-03-01T00:00:00Z"),
    ];
    expect(overallStage(records)).toEqual({ stage: "en_plan_mejora", causa: null });
    expect(overallStage([...records, project("p3", "venta_cerrada", "2026-04-01T00:00:00Z")]).stage).toBe("venta_cerrada");
  });

  it("O5 a project record at nuevo keeps the lead open", () => {
    expect(overallStage([project("p1", "nuevo", "2026-01-01T00:00:00Z"), project("p2", "perdido", "2026-02-01T00:00:00Z")]))
      .toEqual({ stage: "nuevo", causa: null });
  });

  it("lead-level perdido ignored once a project record exists", () => {
    expect(overallStage([lead("perdido", "2026-05-01T00:00:00Z"), project("p1", "contactado", "2026-01-01T00:00:00Z")]))
      .toEqual({ stage: "contactado", causa: null });
    expect(overallStage([lead("perdido", "2026-05-01T00:00:00Z"), project("p1", "perdido", "2026-01-01T00:00:00Z", true)]))
      .toEqual({ stage: "perdido", causa: "por_agotamiento" });
  });

  it("G8 all system → por_agotamiento", () => {
    const records = [
      lead("contactado", "2026-01-01T00:00:00Z"),
      project("p1", "perdido", "2026-02-01T00:00:00Z", true),
      project("p2", "perdido", "2026-02-02T00:00:00Z", true),
    ];
    expect(overallStage(records)).toEqual({ stage: "perdido", causa: "por_agotamiento" });
  });

  it("G8 mixed → por_gestion", () => {
    const records = [
      project("p1", "perdido", "2026-02-01T00:00:00Z", true),
      project("p2", "perdido", "2026-02-02T00:00:00Z", false),
    ];
    expect(overallStage(records)).toEqual({ stage: "perdido", causa: "por_gestion" });
  });

  it("does not mutate input", () => {
    const records = [
      lead("contactado", "2026-03-01T00:00:00Z"),
      project("p1", "perdido", "2026-02-01T00:00:00Z", true),
    ];
    const snapshot = structuredClone(records);
    overallStage(records);
    expect(records).toEqual(snapshot);
  });
});
