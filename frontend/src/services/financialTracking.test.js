import { describe, expect, it } from "vitest";

import { buildFinancialTracking } from "./financialTracking";

const evaluation = {
  input: { ingreso_mensual: 1000000, deuda_mensual: 100000, ahorro_disponible: 500000, dividendo_estimado: 250000 },
  onboarding: { plazo_compra: "6_12_meses" },
  result: {
    score: 55,
    classification: "Medio",
    financial_indicators: {},
    improvement_plan: [{ type: "reduce_debt", title: "Recomendación posterior", description: "No debe reemplazar el plan congelado." }],
  },
};

describe("HU13 steps and frozen goals", () => {
  it("uses the frozen plan actions so suggested steps match persisted metas", () => {
    const tracking = buildFinancialTracking(evaluation, {
      status: "active",
      baseline: { original_plan_snapshot: { structured_improvement_plan: [
        { type: "increase_savings", title: "Aumentar ahorro para el pie", description: "Paso congelado." },
      ] } },
      goals: [{ definition: { source_action_type: "increase_savings" } }],
    });

    expect(tracking.goals).toHaveLength(1);
    expect(tracking.goals[0]).toMatchObject({
      title: "Aumentar ahorro para el pie", source_action_type: "increase_savings",
    });
  });
});
