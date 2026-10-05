import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcResult = { data: null, error: null };
const logSupabaseError = vi.fn();

vi.mock("../profileService", () => ({ isSupabaseDataConfigured: true, logSupabaseError }));
vi.mock("../../utils/supabase", () => ({
  supabase: { rpc: vi.fn(async () => rpcResult) },
}));

const { FORBIDDEN_MESSAGE, getCommercialFunnelFacts } = await import("../commercialMetricsService");
const { supabase } = await import("../../utils/supabase");

describe("getCommercialFunnelFacts", () => {
  beforeEach(() => {
    rpcResult.data = null;
    rpcResult.error = null;
    logSupabaseError.mockClear();
  });

  it("returns the database's now with the projects and facts", async () => {
    rpcResult.data = { now: "2026-10-05T12:00:00.123456+00:00", proyectos: [{ id: "p1" }], facts: [] };
    await expect(getCommercialFunnelFacts()).resolves.toEqual(rpcResult.data);
    expect(supabase.rpc).toHaveBeenCalledWith("commercial_funnel_facts");
  });

  it("explains forbidden without logging it", async () => {
    rpcResult.error = { code: "42501", message: "forbidden" };
    await expect(getCommercialFunnelFacts()).rejects.toThrow(FORBIDDEN_MESSAGE);
    expect(logSupabaseError).not.toHaveBeenCalled();
  });

  it("logs any other error", async () => {
    rpcResult.error = { code: "57014", message: "canceling statement due to statement timeout" };
    await expect(getCommercialFunnelFacts()).rejects.toThrow("No se pudieron cargar las métricas comerciales.");
    expect(logSupabaseError).toHaveBeenCalledWith(rpcResult.error);
  });
});
