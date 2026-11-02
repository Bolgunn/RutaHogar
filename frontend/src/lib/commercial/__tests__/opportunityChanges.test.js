import { describe, expect, it } from "vitest";
import { buildOpportunityChanges } from "../opportunityChanges";

const evaluation = (input) => ({ input });
describe("observed opportunity changes", () => {
  it("shows savings, income and debt deltas with their before and after amounts", () => {
    const changes = buildOpportunityChanges(evaluation({ ahorro_disponible: 1000000, ingreso_mensual: 900000, deuda_mensual: 200000 }), evaluation({ ahorro_disponible: 1500000, ingreso_mensual: 1000000, deuda_mensual: 100000 }));
    expect(changes.map(({ key }) => key)).toEqual(["ahorro_disponible", "ingreso_mensual", "deuda_mensual"]);
    expect(changes[0].difference).toContain("+$500.000");
    expect(changes[2].difference).toContain("−$100.000");
    expect(changes.every(({ tone }) => tone === "positive")).toBe(true);
    expect(changes[0].before).toContain("1.000.000");
    expect(changes[0].after).toContain("1.500.000");
  });
  it("never treats missing, blank or invalid values as a previous zero", () => {
    for (const value of [null, undefined, "", " ", "invalid", false]) {
      expect(buildOpportunityChanges(evaluation({ ingreso_mensual: value }), evaluation({ ingreso_mensual: 2000000 }))).toEqual([]);
    }
    expect(buildOpportunityChanges(null, evaluation({}))).toEqual([]);
  });
  it("preserves real zeros and labels adverse changes without claiming a score cause", () => {
    const changes = buildOpportunityChanges(evaluation({ deuda_mensual: "0" }), evaluation({ deuda_mensual: "100000" }));
    expect(changes[0].tone).toBe("negative");
    expect(changes[0].before).toContain("$0");
    expect(changes[0]).not.toHaveProperty("score_delta");
  });
  it("omits unchanged fields and inactive complementary income", () => {
    expect(buildOpportunityChanges(evaluation({ complemento_renta: false, ingreso_mensual: 1000, ingreso_mensual_complementario: 200 }), evaluation({ complemento_renta: false, ingreso_mensual: 1000, ingreso_mensual_complementario: 300 }))).toEqual([]);
  });
  it("compares declared complementary income when enabled in both evaluations", () => {
    const changes = buildOpportunityChanges(evaluation({ complemento_renta: true, ingreso_mensual_complementario: 100 }), evaluation({ complemento_renta: true, ingreso_mensual_complementario: 200 }));
    expect(changes[0].key).toBe("ingreso_mensual_complementario");
  });
  it("shows readable employment and payment-history changes with neutral attribution", () => {
    const changes = buildOpportunityChanges(evaluation({ tipo_contrato: "plazo_fijo", morosidad_actual: true }), evaluation({ tipo_contrato: "indefinido", morosidad_actual: "no" }));
    expect(changes[0].after).toBe("Contrato indefinido");
    expect(changes[1].before).toBe("Sí");
    expect(changes[1].after).toBe("No");
    expect(changes.every(({ tone }) => tone === "neutral")).toBe(true);
  });
});
