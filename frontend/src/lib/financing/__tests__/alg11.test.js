import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import cases from "../../../../../docs/algorithms/ALG-11-financing-cases.json";
import { calculateScenarioResult, classifyFinancialScenario } from "../scenarioResult";
import { applyRangeReferenceAmount, displayStatus, evaluateBenefit, rangeSimulationOptions } from "../benefitScenario";
import { BENEFIT_ESTIMATION_BASELINE } from "../benefitEstimationBaseline";
import { projectUf } from "../ufProjection";
import { closeComposition, allowedTerms } from "../scenarioDraft";
import { persistedScenarioStatus, referenceAlternatives, suggestedDraftFromResult } from "../scenarioSuggestions";
import { applyDraftScenario, synchronizeScenario } from "../scenarioState";
import { historicalScenarioView, scenarioDifferences } from "../scenarioComparison";
import { toggleComparisonSelection } from "../comparisonSelection";
import ScenarioStatus, { scenarioMetricTones } from "../../../components/financing/ScenarioStatus";
import SuggestedConfiguration from "../../../components/financing/SuggestedConfiguration";
import FinancingOverview, { FinancingAdjustments } from "../../../components/financing/FinancingOverview";
import ScenarioComparison from "../../../components/financing/ScenarioComparison";
import { RANGE_AMOUNT_SCROLL_OPTIONS, clearRangeAmountGuide, hasEffectiveScenarioChanges, scrollToRangeAmountSelector } from "../../../components/financing/FinancingSimulatorPanel";

const findElementByType = (node, type) => {
  if (Array.isArray(node)) return node.map((child) => findElementByType(child, type)).find(Boolean);
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  return findElementByType(React.Children.toArray(node.props.children), type);
};

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
  it("builds minimum, middle and maximum simulation references from a normalized range", () => {
    expect(rangeSimulationOptions([250, 550])).toEqual([
      { kind: "minimum", label: "Mínimo", amount: 250 },
      { kind: "middle", label: "Intermedio", amount: 400 },
      { kind: "maximum", label: "Máximo", amount: 550 },
    ]);
    expect(rangeSimulationOptions([550, 250])).toEqual(rangeSimulationOptions([250, 550]));
  });
  it("keeps equal and invalid ranges safe without duplicate or invented options", () => {
    expect(rangeSimulationOptions([250, 250])).toEqual([{ kind: "single", label: "Monto disponible", amount: 250 }]);
    expect(rangeSimulationOptions([250])).toEqual([]);
    expect(rangeSimulationOptions([250, "sin dato"])).toEqual([]);
  });
  it("does not apply a range amount until the user explicitly selects one", () => {
    const rangeBenefit = { amount_kind: "range", amount_clp: 0, estimated_range_clp: [250, 550] };
    expect(applyRangeReferenceAmount(rangeBenefit, null)).toBe(rangeBenefit);
  });
  it("reuses the selected range amount to close the composition and recalculate the dividend", () => {
    const rangeBenefit = { amount_kind: "range", amount_clp: 0, estimated_range_clp: [250, 550] };
    const draft = { precio_uf: 1000, pie_clp: 100, composition_mode: "pie", plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, deuda_mensual_clp: 0 };
    const results = rangeSimulationOptions(rangeBenefit.estimated_range_clp).map((option) => {
      const benefit = applyRangeReferenceAmount(rangeBenefit, option.amount);
      return calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit });
    });

    expect(results.map((result) => result.subsidio_principal_clp)).toEqual([250, 400, 550]);
    expect(results.map((result) => result.credito_clp)).toEqual([650, 500, 350]);
    expect(results.every((result) => result.pie_clp + result.subsidio_principal_clp + result.credito_clp === result.precio_clp)).toBe(true);
    expect(results[1].dividendo_clp).toBeLessThan(results[0].dividendo_clp);
    expect(results[2].dividendo_clp).toBeLessThan(results[1].dividendo_clp);
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
  it("enables applying only when the staged draft differs from the applied scenario", () => {
    const active = { pie_clp: 100, credito_clp: 900, selected_benefit: null };
    expect(hasEffectiveScenarioChanges({ ...active }, active)).toBe(false);
    expect(hasEffectiveScenarioChanges({ ...active, pie_clp: 250, credito_clp: 750 }, active)).toBe(true);
  });
  it("shows each scenario restriction with its own tone", () => {
    expect(scenarioMetricTones({ ltvRatio: 0.82, ltvLimit: 0.8, dividendRatio: 0.26, burdenRatio: 0.4 }))
      .toEqual({ ltvTone: "adjustment", dividendTone: "near", burdenTone: "compatible" });
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
    expect(markup).toContain(">Delta<");
    expect(markup).toContain("financing-comparison-table__delta is-better");
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
    const adjustments = renderToStaticMarkup(React.createElement(FinancingAdjustments, { draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: true, onApply: () => {}, onCancel: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange: () => {}, onUpdate: () => {} }));
    expect(result.renta_total_clp).toBe(3000);
    expect(overview).not.toContain("Complemento de renta");
    expect(adjustments).toContain("Renta considerada");
    expect(adjustments).toContain("2.200");
    expect(adjustments).toContain("maxLength=\"13\"");
    expect(adjustments).toContain("Cancelar");
    expect(adjustments).toContain("Aplicar cambios");
  });
  it("renders the explicit range choices without selecting a subsidy by default", () => {
    const draft = { precio_uf: 1000, pie_clp: 100, credito_clp: 900, plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, usar_renta_complementaria: false, deuda_mensual_clp: 0 };
    const benefit = { amount_kind: "range", amount_clp: 0, estimated_range_clp: [250, 550] };
    const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit });
    const markup = renderToStaticMarkup(React.createElement(FinancingAdjustments, { draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: false, onApply: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange: () => {}, onUpdate: () => {} }));

    expect(markup).toContain("Monto del subsidio a simular");
    expect(markup).toContain("Selecciona un monto");
    expect(markup).toContain("Mínimo · 250 UF");
    expect(markup).toContain("Intermedio · 400 UF");
    expect(markup).toContain("Máximo · 550 UF");
    expect(markup).toContain("No constituye una asignación oficial");
  });
  it("scrolls to and highlights the range amount selector while it still starts unselected", () => {
    const scrollIntoView = vi.fn();
    scrollToRangeAmountSelector({ scrollIntoView });
    expect(scrollIntoView).toHaveBeenCalledWith(RANGE_AMOUNT_SCROLL_OPTIONS);

    const draft = { precio_uf: 1000, pie_clp: 100, credito_clp: 900, plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, usar_renta_complementaria: false, deuda_mensual_clp: 0 };
    const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit: { amount_kind: "range", amount_clp: 0, estimated_range_clp: [250, 550] } });
    const props = { draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: true, isRangeAmountHighlighted: true, onRangeAmountInteraction: () => {}, onApply: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange: () => {}, onUpdate: () => {} };
    const adjustments = FinancingAdjustments(props);
    const markup = renderToStaticMarkup(React.createElement(FinancingAdjustments, props));

    expect(markup).toContain("financing-adjustments__range-field is-highlighted");
    expect(markup).toContain("Selecciona el monto que quieres usar en esta simulación.");
    expect(findElementByType(adjustments, "select").props.value).toBe("");
    expect(markup).toContain("Aplicar cambios");
  });
  it("clears the guide through the selector interaction without replacing the apply flow", () => {
    const onRangeAmountInteraction = vi.fn();
    const onRangeAmountChange = vi.fn();
    const draft = { precio_uf: 1000, pie_clp: 100, credito_clp: 900, plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, usar_renta_complementaria: false, deuda_mensual_clp: 0 };
    const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit: { amount_kind: "range", amount_clp: 0, estimated_range_clp: [250, 550] } });
    const adjustments = FinancingAdjustments({ draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: true, isRangeAmountHighlighted: true, onRangeAmountInteraction, onApply: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange, onUpdate: () => {} });
    const selector = findElementByType(adjustments, "select");

    selector.props.onFocus();
    selector.props.onChange({ target: { value: "400" } });

    expect(onRangeAmountInteraction).toHaveBeenCalledTimes(2);
    expect(onRangeAmountChange).toHaveBeenCalledWith(400);
  });
  it("removes the temporary highlight when the user starts interacting with the selector", () => {
    const timeoutRef = { current: setTimeout(() => {}, 10) };
    const setHighlighted = vi.fn();

    clearRangeAmountGuide(timeoutRef, setHighlighted);

    expect(setHighlighted).toHaveBeenCalledWith(false);
    expect(timeoutRef.current).toBeNull();
  });
  it("keeps a historic in-range amount selectable even when it is not one of the three new references", () => {
    const draft = { precio_uf: 1000, pie_clp: 100, credito_clp: 725, plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, usar_renta_complementaria: false, deuda_mensual_clp: 0 };
    const rangeBenefit = { amount_kind: "range", amount_clp: 0, estimated_range_clp: [100, 200] };
    const benefit = applyRangeReferenceAmount(rangeBenefit, 175);
    const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit });
    const markup = renderToStaticMarkup(React.createElement(FinancingAdjustments, { draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: false, onApply: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange: () => {}, onUpdate: () => {} }));

    expect(markup).toContain("Monto seleccionado · 175 UF");
  });
  it("keeps the numeric range amount frozen when a saved scenario is loaded", () => {
    const historicDraft = synchronizeScenario({ selected_benefit: "DS1", selected_benefit_range_amount_clp: 175 });
    const benefit = applyRangeReferenceAmount({ amount_kind: "range", amount_clp: 0, estimated_range_clp: [100, 200] }, historicDraft.selected_benefit_range_amount_clp);

    expect(historicDraft.selected_benefit_range_amount_clp).toBe(175);
    expect(benefit).toMatchObject({ amount_kind: "range_selected", amount_clp: 175 });
  });
  it("labels an applied range amount as simulated and keeps the official-assignment disclaimer", () => {
    const draft = { precio_uf: 1000, pie_clp: 100, credito_clp: 500, plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, usar_renta_complementaria: false, deuda_mensual_clp: 0 };
    const benefit = applyRangeReferenceAmount({ amount_kind: "range", amount_clp: 0, estimated_range_clp: [250, 550] }, 400);
    const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit });
    const markup = renderToStaticMarkup(React.createElement(FinancingOverview, { draft, result, ufReference: { uf_value_clp: 1 } }));

    expect(markup).toContain("Monto simulado");
    expect(markup).toContain("Subsidio simulado: 400 UF");
    expect(markup).toContain("No constituye una asignación oficial");
  });
  it("keeps fixed and informational benefits free of the range selector", () => {
    const draft = { precio_uf: 1000, pie_clp: 100, credito_clp: 900, plazo_anios: 20, tasa_anual: 0.04, renta_propia_clp: 10000, renta_complementaria_clp: 0, usar_renta_complementaria: false, deuda_mensual_clp: 0 };
    const buildMarkup = (benefit) => {
      const result = calculateScenarioResult({ draft, ufReference: { uf_value_clp: 1 }, marketReference: { ltv_referencial: 0.9 }, benefit });
      return renderToStaticMarkup(React.createElement(FinancingAdjustments, { draft, result, ufReference: { uf_value_clp: 1 }, terms: [20], hasDraftChanges: false, onApply: () => {}, onPieChange: () => {}, onCreditChange: () => {}, onRangeAmountChange: () => {}, onUpdate: () => {} }));
    };

    expect(buildMarkup({ amount_kind: "official", amount_clp: 250 })).not.toContain("Monto del subsidio a simular");
    expect(buildMarkup({ amount_kind: "information", amount_clp: 0 })).not.toContain("Monto del subsidio a simular");
  });
  it("renders a concrete explanation without the removed UF projection accordion", () => {
    const result = { financial_status: "Compatible", precio_clp: 1000, pie_clp: 250, credito_clp: 750, dividendo_clp: 100, renta_total_clp: 1000, reasons: [] };
    const markup = renderToStaticMarkup(React.createElement(ScenarioStatus, { result, ufReference: { uf_value_clp: 1 } }));
    expect(markup).toContain("Con un pie de 25,0%");
    expect(markup).not.toContain("Explorar UF futura");
  });
});
