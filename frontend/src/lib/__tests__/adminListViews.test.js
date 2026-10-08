import { describe, expect, it } from "vitest";
import { paginateRows } from "../adminPagination";
import { filterReportHistory, leadFromReport } from "../reportHistoryView";

describe("admin pagination", () => {
  it("keeps every record accessible across pages without changing the source", () => {
    const source = Array.from({ length: 23 }, (_, id) => ({ id }));
    const pages = [1, 2, 3].map((page) => paginateRows(source, page, 10));
    expect(pages.flatMap((page) => page.rows)).toEqual(source);
    expect(pages[2]).toMatchObject({ start: 21, end: 23, total: 23, pages: 3 });
    expect(source).toHaveLength(23);
  });
  it("returns the last available page when filtering or deleting reduces the list", () => {
    expect(paginateRows([1, 2, 3], 8, 2)).toMatchObject({ rows: [3], page: 2, start: 3, end: 3 });
  });
  it("handles an empty result and an invalid page without negative ranges", () => {
    expect(paginateRows([], -2)).toMatchObject({ rows: [], page: 1, pages: 1, start: 0, end: 0 });
    expect(paginateRows([1, 2], 0)).toMatchObject({ rows: [1, 2], page: 1 });
  });
});

describe("opening a lead from an audit event", () => {
  const oldEvent = { profile_id: "user-1", lead_name: "Ana", lead_email: "ana@example.cl", new_status: "sospechoso", created_at: "2026-10-01T00:00:00Z" };
  const recentEvent = { ...oldEvent, new_status: "normal", created_at: "2026-10-03T00:00:00Z" };
  it("opens the correct user with their latest evaluation and current status even from an old event", () => {
    const older = { id: "evaluation-1", user_id: "user-1", created_at: "2026-10-01T00:00:00Z", result: { score: 20 } };
    const latest = { id: "evaluation-2", user_id: "user-1", created_at: "2026-10-02T00:00:00Z", result: { score: 85 }, input: { ahorro: 1000 } };
    const lead = leadFromReport(oldEvent, [oldEvent, recentEvent], [older, latest]);
    expect(lead).toMatchObject({ id: "evaluation-2", user_id: "user-1", full_name: "Ana", reliability_status: "normal", result: { score: 85 }, input: { ahorro: 1000 } });
    expect(oldEvent.new_status).toBe("sospechoso");
  });
  it("supplies the user identifier for the existing modal loader without inventing an evaluation date", () => {
    const lead = leadFromReport(oldEvent, [oldEvent]);
    expect(lead).toMatchObject({ id: "user-1", user_id: "user-1", email: "ana@example.cl" });
    expect(lead.created_at).toBeUndefined();
  });
  it("does not open another lead when the event has no profile identifier", () => {
    expect(leadFromReport({ history_id: "event-id" })).toBeNull();
  });
});

describe("report history filters", () => {
  const history = [
    { id: 1, lead_name: "Ana", lead_email: "ana@example.cl", reason: "Ahorro actualizado", new_status: "normal", created_at: "2026-10-01T12:00:00Z" },
    { id: 2, lead_name: "Luis", reason: "Revisión documental", new_status: "reactivado", created_at: "2026-10-03T12:00:00Z" },
    { id: 3, lead_name: "Eva", new_status: "descartado", created_at: "2026-10-02T12:00:00Z" },
    { id: 4, lead_name: "Tomás", new_status: "silenciado", created_at: "2026-10-04T12:00:00Z" },
  ];
  it("includes both statuses described by each grouped filter", () => {
    expect(filterReportHistory(history, "", "reactivado").map((row) => row.id)).toEqual([2, 1]);
    expect(filterReportHistory(history, "", "silenciado").map((row) => row.id)).toEqual([4, 3]);
  });
  it("searches the complete reason and email while combining the status filter", () => {
    expect(filterReportHistory(history, " AHORRO ACTUALIZADO ", "reactivado")).toEqual([history[0]]);
    expect(filterReportHistory(history, "ANA@EXAMPLE", "todos")).toEqual([history[0]]);
    expect(filterReportHistory(history, "Ana", "silenciado")).toEqual([]);
  });
  it("shows all events newest first without mutating records or their source order", () => {
    expect(filterReportHistory(history, " ", "todos").map((row) => row.id)).toEqual([4, 2, 3, 1]);
    expect(history.map((row) => row.id)).toEqual([1, 2, 3, 4]);
    expect(filterReportHistory(history, "", "todos")[0]).toBe(history[3]);
  });
});
