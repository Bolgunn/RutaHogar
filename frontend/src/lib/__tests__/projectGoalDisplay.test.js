import { describe, expect, it } from "vitest";
import { getCurrentProjectGoal, isCurrentProjectGoal } from "../projectGoalDisplay";

describe("project goal display", () => {
  const projectGoal = {
    id: "project-1",
    nombre: "Parque Central",
    comuna: "Santiago",
    tipo_vivienda: "departamento",
  };

  it("lee la meta exclusivamente desde el snapshot persistido de la evaluación", () => {
    expect(getCurrentProjectGoal({ input: { project_goal: projectGoal } })).toBe(projectGoal);
    expect(getCurrentProjectGoal({ input: {} })).toBeNull();
  });

  it("marca solo el proyecto cuyo identificador coincide con la meta", () => {
    expect(isCurrentProjectGoal({ id: "project-1" }, projectGoal)).toBe(true);
    expect(isCurrentProjectGoal({ id: "project-2" }, projectGoal)).toBe(false);
    expect(isCurrentProjectGoal({ nombre: "Parque Central" }, projectGoal)).toBe(false);
  });
});
