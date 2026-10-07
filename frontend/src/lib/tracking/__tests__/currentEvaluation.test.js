import { describe, expect, it } from "vitest";

import { currentTrackingEvaluation } from "../currentEvaluation";

describe("HU13 current evaluation for Plan de mejora", () => {
  it("keeps the later project evaluation available after a frozen target already exists", () => {
    const baseline = { id: "evaluation-a", created_at: "2026-01-01T00:00:00Z", input: { project_goal: { id: "project-a" } } };
    const later = { id: "evaluation-b", created_at: "2026-02-01T00:00:00Z", input: { project_goal: { id: "project-b" } } };
    const tracking = {
      status: "active",
      baseline: { target_project_snapshot: { id: "project-a" } },
      current_evaluation_id: "evaluation-b",
      latest_effective_snapshot: later.input,
      current_evaluation: { score: 72 },
    };

    expect(currentTrackingEvaluation(tracking, [later, baseline], "owner")).toBe(later);
  });

  it("uses the effective snapshot safely while the evaluation list refreshes", () => {
    const evaluation = currentTrackingEvaluation({
      status: "active", current_evaluation_id: "evaluation-b",
      latest_effective_snapshot: { project_goal: { id: "project-b" } },
      current_evaluation: { score: 72 },
    }, [], "owner");

    expect(evaluation).toMatchObject({ id: "evaluation-b", user_id: "owner", input: { project_goal: { id: "project-b" } } });
  });

  it("keeps the last persisted plan choice when a later tracking evaluation has no annotation", () => {
    const accepted = {
      id: "evaluation-a", created_at: "2026-01-01T00:00:00Z", plan_accepted_at: "2026-01-02T00:00:00Z",
      plan_type: "acelerado", housing_plan: { plan_type: "acelerado" },
    };
    const later = { id: "evaluation-b", created_at: "2026-02-01T00:00:00Z", input: {} };
    const tracking = { status: "active", current_evaluation_id: "evaluation-b", current_evaluation: { score: 70 } };

    expect(currentTrackingEvaluation(tracking, [accepted, later], "owner")).toMatchObject({
      id: "evaluation-b", plan_type: "acelerado", housing_plan: { plan_type: "acelerado" },
    });
  });
});
