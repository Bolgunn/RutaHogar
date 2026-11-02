import { describe, expect, it } from "vitest";
import { buildAdminHomeSummary } from "../adminHomeSummary";

describe("admin home operational summary", () => {
  it("counts evaluations without calling repeat evaluations unique leads", () => {
    const result = buildAdminHomeSummary([{ user_id: "same", result: { classification: "Alto" }, reliability_status: "sospechoso" }, { user_id: "same", result: { classification: "Medio" } }, { result: {} }]);
    expect(result.counts).toEqual({ total: 3, alto: 1, medio: 1, bajo: 0, sinDato: 1, review: 1 });
  });
  it("requires an active assignment and excludes sold-out projects from active uncovered work", () => {
    const { projectCounts } = buildAdminHomeSummary([], [
      { estado: "disponible", ejecutivos: [{ estado: "vinculado" }, { estado: "vinculado" }] },
      { estado: "en_construccion", ejecutivos: [{ estado: "desvinculado" }] },
      { estado: "agotado", ejecutivos: [] },
    ]);
    expect(projectCounts).toEqual({ total: 3, disponibles: 1, construccion: 1, agotados: 1, conCobertura: 1, activeUncovered: 1 });
  });
  it("sorts recent activity without mutating history and uses catalog update dates", () => {
    const items = [{ id: "old", created_at: "2026-01-01", input: { comuna_objetivo: "Maipú" } }, { id: "invalid", created_at: "invalid" }, { id: "new", created_at: "2026-10-08", onboarding: { comuna_interes: "Maipú" } }];
    const summary = buildAdminHomeSummary(items, [{ created_at: "2026-01-01", updated_at: "2026-10-07" }]);
    expect(summary.recent.map((item) => item.id)).toEqual(["new", "old", "invalid"]);
    expect(items[0].id).toBe("old");
    expect(summary.topCommunes).toEqual([["Maipú", 2]]);
    expect(summary.latestProjectDate).toBe(new Date("2026-10-07").getTime());
  });
  it("returns empty state counts with no fake latest dates", () => {
    const result = buildAdminHomeSummary();
    expect(result.counts.total).toBe(0);
    expect(result.latestLeadDate).toBeNull();
    expect(result.latestProjectDate).toBeNull();
    expect(result.recent).toEqual([]);
  });
});
