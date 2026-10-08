import { describe, expect, it } from "vitest";
import { buildExecutiveHomeSummary } from "../executiveHomeSummary";

const now = Date.parse("2026-10-08T15:00:00Z");
const lead = (id, hoursAgo, extra = {}) => ({ id, created_at: new Date(now - hoursAgo * 3600000).toISOString(), result: { classification: "Alto" }, ...extra });

describe("Executive home summary", () => {
  it("separates high classifications from reliability alerts and excluded records", () => {
    const items = [lead("normal", 1), lead("reactivated", 1, { reliability_status: "reactivado" }),
      ...["sospechoso", "en_revision", "silenciado", "descartado"].map((status) => lead(status, 1, { reliability_status: status })),
      lead("medium", 1, { result: { classification: "Medio" } })];
    expect(buildExecutiveHomeSummary(items, 3, now)).toMatchObject({ total: 7, high: 2, review: 2 });
  });
  it("filters the selected range, excludes invalid and future dates, and sorts newest first", () => {
    const items = [lead("boundary", 3), lead("old", 4), lead("new", 1), lead("future", -1), lead("invalid", 0, { created_at: "invalid" })];
    const summary = buildExecutiveHomeSummary(items, 3, now);
    expect(summary.recent.map((item) => item.id)).toEqual(["new", "boundary"]);
    expect(summary.recentTotal).toBe(2);
    expect(items[0].id).toBe("boundary");
  });
  it("keeps the full recent count when the preview is limited to twelve", () => {
    const items = Array.from({ length: 15 }, (_, index) => lead(String(index), index / 20));
    expect(buildExecutiveHomeSummary(items, 3, now)).toMatchObject({ recentTotal: 15 });
    expect(buildExecutiveHomeSummary(items, 3, now).recent).toHaveLength(12);
  });
  it("supports missing evaluations and missing dates without inventing activity", () => {
    expect(buildExecutiveHomeSummary(null, 3, now)).toMatchObject({ total: 0, high: 0, review: 0, recentTotal: 0 });
    expect(buildExecutiveHomeSummary([{ id: "missing" }], 3, now).recent).toEqual([]);
  });
});
