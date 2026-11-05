import { describe, expect, it } from "vitest";

import { currentTrackingEvaluation } from "../currentEvaluation";

describe("HU13 current evaluation for Plan de mejora", () => {
  it("does not copy an old plan onto a new evaluation when tracking is inactive", () => {
    const old = { id: "a", created_at: "2026-01-01", plan_type: "acelerado" };
    const fresh = { id: "b", created_at: "2026-02-01" };
    for (const state of [null, { status: "not_started" }]) {
      expect(currentTrackingEvaluation(state, [old, fresh])).toBe(fresh);
      expect(currentTrackingEvaluation(state, [old, fresh]).plan_type).toBeUndefined();
    }
  });
  it("inherits the latest saved plan for the same target project", () => {
    const accepted = {
      id: "evaluation-a", created_at: "2026-01-01T00:00:00Z", plan_accepted_at: "2026-01-02T00:00:00Z",
      input: { project_goal: { id: "project-a" } }, plan_type: "acelerado",
    };
    const later = { id: "evaluation-b", created_at: "2026-02-01T00:00:00Z", input: { project_goal: { id: "project-a" } } };
    const tracking = {
      status: "active",
      baseline: { target_project_snapshot: { id: "project-a" } },
      current_evaluation_id: "evaluation-b",
      latest_effective_snapshot: later.input,
      current_evaluation: { score: 72 },
    };

    expect(currentTrackingEvaluation(tracking, [accepted, later], "owner")).toMatchObject({
      id: "evaluation-b", plan_type: "acelerado", housing_plan: { plan_type: "acelerado" },
    });
  });

  it("uses the effective snapshot safely while the evaluation list refreshes", () => {
    const evaluation = currentTrackingEvaluation({
      status: "active", current_evaluation_id: "evaluation-b",
      latest_effective_snapshot: { project_goal: { id: "project-b" } },
      current_evaluation: { score: 72 },
    }, [], "owner");

    expect(evaluation).toMatchObject({ id: "evaluation-b", user_id: "owner", input: { project_goal: { id: "project-b" } } });
  });

  it("does not inherit a plan from a different target project", () => {
    const accepted = {
      id: "evaluation-a", created_at: "2026-01-01T00:00:00Z", plan_accepted_at: "2026-01-02T00:00:00Z",
      input: { project_goal: { id: "project-a" } }, plan_type: "acelerado",
    };
    const later = { id: "evaluation-b", created_at: "2026-02-01T00:00:00Z", input: { project_goal: { id: "project-b" } } };
    const tracking = { status: "active", current_evaluation_id: "evaluation-b", current_evaluation: { score: 70 } };

    expect(currentTrackingEvaluation(tracking, [accepted, later], "owner")).toBe(later);
  });

  it("does not inherit a plan without a stable target project identity", () => {
    const accepted = {
      id: "evaluation-a", created_at: "2026-01-01T00:00:00Z", plan_type: "acelerado",
      input: { project_goal: { id: "project-a" } },
    };
    const later = { id: "evaluation-b", created_at: "2026-02-01T00:00:00Z", input: {} };
    const tracking = { status: "active", current_evaluation_id: "evaluation-b", current_evaluation: { score: 70 } };

    expect(currentTrackingEvaluation(tracking, [accepted, later], "owner")).toBe(later);
  });

  it("leaves an evaluation that already selected a plan unchanged", () => {
    const accepted = {
      id: "evaluation-a", created_at: "2026-01-01T00:00:00Z", plan_type: "acelerado",
      input: { project_goal: { id: "project-a" } },
    };
    const later = {
      id: "evaluation-b", created_at: "2026-02-01T00:00:00Z", plan_type: "conservador",
      input: { project_goal: { id: "project-a" } },
    };
    const tracking = { status: "active", current_evaluation_id: "evaluation-b", current_evaluation: { score: 70 } };

    expect(currentTrackingEvaluation(tracking, [accepted, later], "owner")).toBe(later);
  });

  describe("HU29 E4: green savings goal carry-over", () => {
    const greenGoal = {
      type: "pie_en_verde_blanco",
      project_id: "project-a",
      cuota_mensual_uf: 25,
      cuota_mensual_clp: 962500,
      plazo_meses: 18,
      pie_total_uf: 450,
      fixed_at: "2026-04-15T12:00:00Z",
    };

    it("inherits green_savings_goal onto a newer evaluation for the same target project", () => {
      const evaluation1 = {
        id: "eval-1",
        created_at: "2026-04-15T12:00:00Z",
        plan_type: "acelerado",
        input: { project_goal: { id: "project-a" } },
        housing_plan: { green_savings_goal: greenGoal },
      };
      const evaluation2 = {
        id: "eval-2",
        created_at: "2026-05-15T12:00:00Z",
        input: { project_goal: { id: "project-a" } },
        housing_plan: {},
      };
      const tracking = {
        status: "active",
        current_evaluation_id: "eval-2",
        current_evaluation: { score: 75 },
      };

      const result = currentTrackingEvaluation(tracking, [evaluation1, evaluation2], "owner");
      expect(result.id).toBe("eval-2");
      expect(result.housing_plan.green_savings_goal).toEqual(greenGoal);
    });

    it("does not inherit green_savings_goal when target project differs", () => {
      const evaluation1 = {
        id: "eval-1",
        created_at: "2026-04-15T12:00:00Z",
        input: { project_goal: { id: "project-a" } },
        housing_plan: { green_savings_goal: greenGoal },
      };
      const evaluation2 = {
        id: "eval-2",
        created_at: "2026-05-15T12:00:00Z",
        input: { project_goal: { id: "project-diff" } },
        housing_plan: {},
      };
      const tracking = {
        status: "active",
        current_evaluation_id: "eval-2",
        current_evaluation: { score: 75 },
      };

      const result = currentTrackingEvaluation(tracking, [evaluation1, evaluation2], "owner");
      expect(result.housing_plan?.green_savings_goal).toBeUndefined();
    });

    it("preserves an existing green_savings_goal if the evaluation already defines one", () => {
      const existingGoal = { ...greenGoal, cuota_mensual_uf: 30 };
      const evaluation = {
        id: "eval-1",
        created_at: "2026-04-15T12:00:00Z",
        input: { project_goal: { id: "project-a" } },
        housing_plan: { green_savings_goal: existingGoal },
      };
      const tracking = { status: "active", current_evaluation_id: "eval-1" };

      const result = currentTrackingEvaluation(tracking, [evaluation], "owner");
      expect(result.housing_plan.green_savings_goal.cuota_mensual_uf).toBe(30);
    });
  });
});
