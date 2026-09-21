import { describe, expect, it } from "vitest";

import {
  applyEvaluationAnnotations,
  deleteEvaluation,
  normalizeEvaluation,
} from "../evaluationService";

describe("HU13 immutable evaluation views", () => {
  it("overlays append-only annotations in deterministic audit order without mutating the row", () => {
    const row = {
      id: "evaluation-1",
      financial_data: { result: { score: 60, ai_explanation: "Original" } },
      housing_plan: { saved: 1 },
    };
    const annotations = [
      { event_id: "b", recorded_at: "2026-02-01T00:00:00Z", effective_at: "2026-02-01T00:00:00Z",
        kind: "narrative", payload: { ai_explanation: "Texto corregido" } },
      { event_id: "a", recorded_at: "2026-01-01T00:00:00Z", effective_at: "2026-01-01T00:00:00Z",
        kind: "plan_accepted", payload: { plan_type: "ahorro", housing_plan: { target: 10 } } },
    ];
    const original = structuredClone(row);

    const view = applyEvaluationAnnotations(row, annotations);

    expect(view.plan_accepted_at).toBe("2026-01-01T00:00:00Z");
    expect(view.housing_plan).toEqual({ saved: 1, target: 10, plan_type: "ahorro" });
    expect(view.financial_data.result.ai_explanation).toBe("Texto corregido");
    expect(row).toEqual(original);
  });

  it("preserves the valid engine classification requiring information", () => {
    const evaluation = normalizeEvaluation({
      id: "evaluation-2", user_id: "owner", score: 12,
      classification: "Requiere antecedentes",
      financial_data: { input: {}, result: { classification: "Requiere antecedentes", score: 12 } },
      recommendations: [],
    });

    expect(evaluation.result.classification).toBe("Requiere antecedentes");
  });

  it("rejects the retired physical-delete path", async () => {
    await expect(deleteEvaluation("evaluation-1", "owner")).rejects.toThrow("historial es inmutable");
  });
});
