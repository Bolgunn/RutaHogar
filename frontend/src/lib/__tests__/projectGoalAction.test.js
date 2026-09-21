import { describe, expect, it } from "vitest";

import { submitProjectGoal } from "../projectGoalAction";

describe("project goal action", () => {
  it("contains a failed later project selection as an actionable error", async () => {
    await expect(submitProjectGoal(
      async () => { throw new Error("lineage_conflict"); },
      { id: "project-b" },
    )).resolves.toEqual({ saved: false, error: "lineage_conflict" });
  });

  it("marks a persisted preference as successful", async () => {
    await expect(submitProjectGoal(async () => true, { id: "project-b" }))
      .resolves.toEqual({ saved: true, error: "" });
  });
});
