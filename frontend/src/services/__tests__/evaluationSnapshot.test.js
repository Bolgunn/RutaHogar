import { describe, expect, it } from "vitest";
import { buildFinancialDataSnapshot } from "../evaluationService";
import { buildScoringHistoryRow } from "../getScoringHistory";

describe("evaluation market snapshot persistence", () => {
  it("retains the exact resolved bundle in both persisted result aliases", () => {
    const marketSnapshot = { uf_value_clp: 40695, effective_date: "2026-09-18", source: { uf_value_clp: { series: "F073.UFF.PRE.Z.D" } } };
    const result = { score: 80, financial_indicators: { capacidad_supuestos: { market_snapshot: marketSnapshot } } };
    const persisted = buildFinancialDataSnapshot({ input: { ingreso_mensual: 1 }, result });
    expect(persisted.result.financial_indicators.capacidad_supuestos.market_snapshot).toEqual(marketSnapshot);
    expect(persisted.result_snapshot).toEqual(persisted.result);
  });

  it("keeps the original resolved bundle in immutable scoring history", () => {
    const marketSnapshot = { uf_value_clp: 40695, effective_date: "2026-09-18", source: { uf_value_clp: { series: "F073.UFF.PRE.Z.D" } } };
    const result = { score: 80, classification: "Alto", algorithm_version: "1.2.0", financial_indicators: { capacidad_supuestos: { market_snapshot: marketSnapshot } } };
    const history = buildScoringHistoryRow("user", "evaluation", { input: { ingreso_mensual: 1 }, result });
    expect(history.snapshot.result.financial_indicators.capacidad_supuestos.market_snapshot).toEqual(marketSnapshot);
  });
});
