import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import cases from "../../../../../docs/algorithms/ALG-11-cases.json";
import { calculateScenarioResult, classifyFinancialScenario } from "../scenarioResult";
import { applyRangeReferenceAmount, displayStatus, evaluateBenefit } from "../benefitScenario";
import { BENEFIT_ESTIMATION_BASELINE } from "../benefitEstimationBaseline";
import { projectUf } from "../ufProjection";
import { closeComposition, allowedTerms } from "../scenarioDraft";
import { persistedScenarioStatus, referenceAlternatives, suggestedDraftFromResult } from "../scenarioSuggestions";
import { applyDraftScenario, synchronizeScenario } from "../scenarioState";
import { historicalScenarioView, scenarioDifferences } from "../scenarioComparison";
import { toggleComparisonSelection } from "../comparisonSelection";
import ScenarioStatus from "../../../components/financing/ScenarioStatus";
import SuggestedConfiguration from "../../../components/financing/SuggestedConfiguration";
import FinancingOverview, { FinancingAdjustments } from "../../../components/financing/FinancingOverview";
import ScenarioComparison from "../../../components/financing/ScenarioComparison";

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
  it("keeps a compatible scenario free of alternatives", () => {
    expect(referenceAlternatives({ pie_clp: 10 }, { financial_status: "Compatible" })).toEqual([]);
  });
  it.each(["Cercano", "Requiere ajuste"])("offers the existing E3 pie adjustment for %s", (financial_status) => {
    const draft = { pie_clp: 100, credito_clp: 900, composition_mode: "pie" };
    const result = { financial_status, pie_clp: 100, reference_adjustment: { pie_clp: 250, credito_clp: 750 } };
    const [alternative] = referenceAlternatives(draft, result);
    expect(alternative).toMatchObject({ id: "reference-down-payment", current: 100, suggested: 250, difference: 150 });
    expect(alternative.draft).toMatchObject({ pie_clp: 250, credito_clp: 750, composition_mode: "pie" });
  });
  it("builds a suggested configuration from the existing reference adjustment without changing benefits", () => {
    const draft = { pie_clp: 100, credito_clp: 900, selected_benefit: "DS1" };
    expect(suggestedDraftFromResult(draft, { reference_adjustment: { pie_clp: 250, credito_clp: 750 } })).toMatchObject({ pie_clp: 250, credito_clp: 750, selected_benefit: "DS1", composition_mode: "pie", isAdjusted: true });
  });
  it("keeps an edited draft separate until it is explicitly applied", () => {
    const active = { pie_clp: 100, credito_clp: 900, selected_benefit: null };
    const draft = { ...active, pie_clp: 250, credito_clp: 750 };
    expect(active.pie_clp).toBe(100);
    const applied = applyDraftScenario(draft, { credito_clp: 750 });
    expect(applied).toEqual(draft);
    expect(synchronizeScenario(applied)).toEqual(applied);
    expect(synchronizeScenario(applied)).not.toBe(applied);
  });
  it("reads the historic scenario classification from its saved snapshot", () => {
    expect(persistedScenarioStatus({ financial_status: "Cercano" })).toBe("Cercano");
  });
  it("compares only persisted historical snapshots and lists objective differences", () => {
    const first = { id: "a", name: "Escenario A", project_snapshot: { nombre: "Vivienda A" }, input_snapshot: { precio_uf: 2000, plazo_anios: 25, tasa_anual: 0.04, renta_complementaria_clp: 0, usar_renta_complementaria: false }, result_snapshot: { financial_status: "Compatible", precio_uf: 2000, precio_clp: 80000000, pie_clp: 16000000, subsidio_principal_clp: 0, credito_clp: 64000000, dividendo_clp: 320000, renta_total_clp: 2200000, uf_reference: { uf_value_clp: 40000 } } };
    const second = { id: "b", name: "Escenario B", project_snapshot: { nombre: "Vivienda B" }, input_snapshot: { precio_uf: 2000, plazo_anios: 30, tasa_anual: 0.05, renta_complementaria_clp: 600000, usar_renta_complementaria: true }, result_snapshot: { financial_status: "Cercano", precio_uf: 2000, precio_clp: 80000000, pie_clp: 24000000, subsidio_principal_clp: 5000000, credito_clp: 51000000, dividendo_clp: 260000, renta_total_clp: 2800000, benefit: { selected: "DS1", entry: { name: "DS1" } }, uf_reference: { uf_value_clp: 40000 } } };
    expect(historicalScenarioView(first)).toMatchObject({ status: "Compatible", pieUf: 400, credit: 64000000, term: 25 });
    expect(historicalScenarioView(second)).toMatchObject({ status: "Cercano", complementaryIncome: 600000, benefitAmount: 5000000 });
    const differences = scenarioDifferences(first, second);
    expect(differences.join(" ")).toContain("Escenario B requiere 200 UF más de pie");
    expect(differences.join(" ")).toContain("renta complementaria");
    const markup = renderToStaticMarkup(React.createElement(ScenarioComparison, { scenarios: [first, second], onClose: () => {} }));
    expect(markup).toContain("Comparación de escenarios");
    expect(markup).toContain("Principales diferencias");
    expect(markup).not.toContain("mejor escenario");
  });
  it("keeps comparison selection independent and limits it to two saved scenarios", () => {
    expect(toggleComparisonSelection([], "a")).toEqual({ ids: ["a"], limited: false });
    expect(toggleComparisonSelection(["a"], "b")).toEqual({ ids: ["a", "b"], limited: false });
    expect(toggleComparisonSelection(["a", "b"], "c")).toEqual({ ids: ["a", "b"], limited: true });
    expect(toggleComparisonSelection(["a", "b"], "a")).toEqual({ ids: ["b"], limited: false });
  });
  it("renders the suggested configuration with the existing scenario values", () => {
    const draft = { pie_clp: 100, credito_clp: 900, plazo_anios: 30, tasa_anual: 0.04 };
    const result = { precio_clp: 1000, pie_clp: 100, credito_clp: 900, renta_total_clp: 1000, financial_status: "Cercano" };
    const markup = renderToStaticMarkup(React.createElement(SuggestedConfiguration, { draft, result, suggestedDraft: draft, suggestedResult: result, benefit: { selected: null }, onUse: () => {} }));
    expect(markup).toContain("Configuración referencial sugerida");
    expect(markup).toContain("Usar esta configuración");
  });
  it("keeps complementary income in the draft income calculation, not in financing composition", () => {
    const draft = { precio_uf: 1000, pie_clp: 200, credito_clp: 800, composition_mode: "pie", plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 2200, renta_complementaria_clp: 800, usar_renta_complementaria: true, deuda_mensual_clp: 0 };
    const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.8 }, benefit: { amount_clp: 0 } });
    const overview = renderToStaticMarkup(React.createElement(FinancingOverview, { draft, result, ufReference: { uf_value_clp: 1 } }));
    const adjustments = renderToStaticMarkup(React.createElement(FinancingAdjustments, { draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: true, onApply: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange: () => {}, onUpdate: () => {} }));
    expect(result.renta_total_clp).toBe(3000);
    expect(overview).not.toContain("Complemento de renta");
    expect(adjustments).toContain("Renta considerada");
    expect(adjustments).toContain("2.200");
    expect(adjustments).toContain("Aplicar cambios");
  });
  it("renders a concrete explanation without the removed UF projection accordion", () => {
    const result = { financial_status: "Compatible", precio_clp: 1000, pie_clp: 250, credito_clp: 750, dividendo_clp: 100, renta_total_clp: 1000, reasons: [] };
    const markup = renderToStaticMarkup(React.createElement(ScenarioStatus, { result, ufReference: { uf_value_clp: 1 } }));
    expect(markup).toContain("Con un pie de 25,0%");
    expect(markup).not.toContain("Explorar UF futura");
  });
});
