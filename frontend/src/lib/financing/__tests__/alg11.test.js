import { describe, expect, it } from "vitest";
import cases from "../../../../../docs/algorithms/ALG-11-cases.json";
import { calculateScenarioResult, classifyFinancialScenario } from "../scenarioResult";
import { applyRangeReferenceAmount, displayStatus, evaluateBenefit } from "../benefitScenario";
import { BENEFIT_ESTIMATION_BASELINE } from "../benefitEstimationBaseline";
import { projectUf } from "../ufProjection";
import { closeComposition, allowedTerms } from "../scenarioDraft";

describe("ALG-11", () => {
  it.each(cases.cases.filter((item) => item.input?.precio_clp))("asserts $name", ({ input, expect: expected }) => {
    const result = classifyFinancialScenario(input);
    expect(result.financial_status).toBe(expected.financial_status);
  });
  it("keeps benefit inapplicability above financial presentation", () => {
    expect(displayStatus("Compatible", { selected: "DS1", eligible: false })).toBe("No aplicable actualmente");
  });
  it("silently removes projection with fewer than 90 dates", () => {
    const history = Array.from({ length: 89 }, (_, index) => ({ effective_date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`, uf_value_clp: 40000 }));
    expect(projectUf(history, "2026-10-10", new Date("2026-09-27T00:00:00Z"))).toBeNull();
  });
  it("closes pie and credit after either edit", () => {
    const byPie = closeComposition({ pie_clp: 0, credito_clp: 0 }, "pie_clp", 20, 10, 100);
    const byCredit = closeComposition(byPie, "credito_clp", 50, 10, 100);
    expect(byPie.pie_clp + byPie.credito_clp + 10).toBe(100);
    expect(byCredit.pie_clp + byCredit.credito_clp + 10).toBe(100);
  });
  it("uses a manually adjusted credit and closes the composition with pie", () => {
    const result = calculateScenarioResult({
      draft: { precio_uf: 100, pie_clp: 0, credito_clp: 50, composition_mode: "credito", plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 200, renta_complementaria_clp: 100, usar_renta_complementaria: false, deuda_mensual_clp: 0 },
      ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.8 }, benefit: { amount_clp: 10 },
    });
    expect(result.credito_clp).toBe(50);
    expect(result.pie_clp).toBe(40);
    expect(result.renta_total_clp).toBe(200);
  });
  it("gates terms that finish after age 70", () => expect(allowedTerms(50)).toEqual([10, 15, 20]));
  it("uses the DS49 base amount as a visible reference, not an approval", () => {
    const entry = BENEFIT_ESTIMATION_BASELINE.entries.find((item) => item.identifier === "DS49");
    const benefit = evaluateBenefit(entry, { result: { housing_benefits: { applicable_benefits: [{ type: "DS49", eligible: false, conditions_not_met: ["Revisar RSH"] }] } } }, { precio_uf: 900 }, 40000);
    expect(benefit.amount_clp).toBe(12560000);
    expect(benefit.eligible).toBe(false);
  });
  it("keeps a DS1 range separate from the single credit until an official amount exists", () => {
    const entry = BENEFIT_ESTIMATION_BASELINE.entries.find((item) => item.identifier === "DS1");
    const benefit = evaluateBenefit(entry, {}, { precio_uf: 1200 }, 40000);
    const result = calculateScenarioResult({ draft: { precio_uf: 1200, pie_clp: 10000000, plazo_anios: 30, tasa_anual: 0.04, renta_propia_clp: 3000000, renta_complementaria_clp: 0, deuda_mensual_clp: 0 }, ufReference: { uf_value_clp: 40000 }, marketReference: { ltv_referencial: 0.8 }, benefit });
    expect(benefit.amount_clp).toBe(0);
    expect(result.benefit_range_impact.credito_min_clp).toBeLessThan(result.benefit_range_impact.credito_max_clp);
  });
  it("only applies a user-selected reference amount when it stays within the reviewed range", () => {
    const rangeBenefit = { amount_kind: "range", amount_clp: 0, estimated_range_clp: [100, 200] };
    expect(applyRangeReferenceAmount(rangeBenefit, 200)).toMatchObject({ amount_kind: "range_selected", amount_clp: 200, range_reference_clp: [100, 200] });
    expect(applyRangeReferenceAmount(rangeBenefit, 201)).toBe(rangeBenefit);
  });
});
