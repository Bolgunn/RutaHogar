import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  getMarketReference,
  MarketReferenceError,
  normalizeMarketReference,
} from "../marketReferenceService";


describe("marketReferenceService", () => {
  it("preserva la UF exacta y la versión del snapshot persistido", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        uf_value_clp: 40999.93,
        effective_date: "2026-09-23",
        snapshot_effective_date: "2026-09-23",
        snapshot_fetched_at: "2026-09-23T12:00:00Z",
        source: { provider: "BCCh BDE", series: "F073.UFF.PRE.Z.D" },
      }),
    });

    const reference = await getMarketReference({
      apiBase: "https://api.example.test/",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example.test/market-reference",
      { signal: undefined },
    );
    expect(reference.uf_value_clp).toBe(40999.93);
    expect(reference.snapshot_fetched_at).toBe("2026-09-23T12:00:00Z");
  });

  it("rechaza respuestas sin una UF/version de snapshot utilizable", () => {
    expect(() => normalizeMarketReference({ uf_value_clp: 40695 })).toThrow(
      MarketReferenceError,
    );
    expect(() => normalizeMarketReference({
      uf_value_clp: 0,
      snapshot_fetched_at: "2026-09-23T12:00:00Z",
    })).toThrow(MarketReferenceError);
  });

  it("no inventa una UF cuando el backend no está disponible", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: "sin snapshot" }),
    });

    await expect(getMarketReference({ apiBase: "", fetchImpl })).rejects.toMatchObject({
      name: "MarketReferenceError",
      status: 503,
    });
  });

  it("ScoreForm no consulta mindicador ni conserva una UF hardcodeada", () => {
    const scoreForm = readFileSync(
      new URL("../../components/ScoreForm.jsx", import.meta.url),
      "utf8",
    );

    expect(scoreForm).toContain("getMarketReference");
    expect(scoreForm).not.toContain("mindicador.cl");
    expect(scoreForm).not.toContain("FALLBACK_UF_VALUE_CLP");
    expect(scoreForm).not.toContain("respaldo interno");
    expect(scoreForm).not.toContain("referencePropertyValuesUf");
    expect(scoreForm).not.toContain("buildReferencePropertyValues");
  });
});
