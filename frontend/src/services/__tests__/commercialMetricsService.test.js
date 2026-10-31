import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../profileService", () => ({ isSupabaseDataConfigured: true }));
vi.mock("../../utils/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
import { FORBIDDEN_MESSAGE, getCommercialFunnelMetrics } from "../commercialMetricsService";

describe("aggregate commercial metrics transport", () => {
  beforeEach(() => mocks.invoke.mockReset());
  it("sends only controls and receives aggregates, never fact rows", async () => {
    const controls = { filtros: { proyecto_id: null, afinidad: ["Compatible"], capacidad: [], prioridad: [] }, granularidad: "mes" };
    const data = { now: "2026-10-30T12:00:00Z", proyectos: [{ id: "p1" }], total_leads: 2, privacy_hidden: 0, refresh_at: null, metrics: { n: 1 } };
    mocks.invoke.mockResolvedValue({ data: { ...data, facts: ["must not propagate"] }, error: null });
    await expect(getCommercialFunnelMetrics(controls)).resolves.toEqual(data);
    expect(mocks.invoke).toHaveBeenCalledWith("commercial-funnel-metrics", { body: controls });
  });
  it("explains tenant/role rejection", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 403 } } });
    await expect(getCommercialFunnelMetrics()).rejects.toThrow(FORBIDDEN_MESSAGE);
  });
  it.each([401, 422, 503])("does not fall back to raw RPC after HTTP %s", async status => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status }, message: "private internal detail" } });
    await expect(getCommercialFunnelMetrics()).rejects.toThrow("No se pudieron cargar las métricas comerciales.");
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("rejects a response without aggregates", async () => {
    mocks.invoke.mockResolvedValue({ data: { facts: [{ input: { private: true } }] }, error: null });
    await expect(getCommercialFunnelMetrics()).rejects.toThrow("No se pudieron cargar las métricas comerciales.");
  });
});
