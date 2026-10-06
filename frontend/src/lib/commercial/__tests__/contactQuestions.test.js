import { describe, expect, it } from "vitest";
import { buildContactQuestions } from "../contactQuestions";

describe("buildContactQuestions", () => {
  it("includes core non-financial discovery questions", () => {
    const questions = buildContactQuestions({ lead: { input: {}, onboarding: {}, result: {} } });

    expect(questions.map((item) => item.id)).toEqual(expect.arrayContaining([
      "purchase_motivation",
      "decision_makers",
      "purchase_tradeoff",
    ]));
  });

  it("prioritizes readiness when purchase term is short", () => {
    const questions = buildContactQuestions({
      lead: { input: { plazo_compra: "3_6_meses" }, onboarding: {}, result: {} },
    });

    expect(questions[0].id).toBe("short_term_readiness");
  });

  it("asks about savings availability when savings are materially high", () => {
    const questions = buildContactQuestions({
      lead: { input: { ingreso_mensual: 2_000_000, ahorro_disponible: 20_000_000 }, onboarding: {}, result: {} },
    });

    expect(questions.some((item) => item.id === "savings_availability")).toBe(true);
  });

  it("asks about openness when selected project is not the lead goal", () => {
    const questions = buildContactQuestions({
      lead: {
        input: { project_goal: { id: "p1", nombre: "Proyecto Uno", comuna: "Macul" } },
        onboarding: {},
        result: {},
      },
      selectedProject: { id: "p2", nombre: "Proyecto Dos", comuna: "La Florida" },
    });

    expect(questions.find((item) => item.id === "selected_project_openness")?.question).toContain("Proyecto Dos");
  });

  it("does not ask project openness when selected project matches the lead goal", () => {
    const questions = buildContactQuestions({
      lead: {
        input: { project_goal: { id: "p1", nombre: "Proyecto Uno", comuna: "Macul" } },
        onboarding: {},
        result: {},
      },
      selectedProject: { id: "p1", nombre: "Proyecto Uno", comuna: "Macul" },
    });

    expect(questions.some((item) => item.id === "selected_project_openness")).toBe(false);
  });

  it("asks for missing income context when project capacity needs antecedents", () => {
    const questions = buildContactQuestions({
      lead: { input: {}, onboarding: {}, result: {} },
      selectedMatch: { motivo_exclusion: "capacidad_requiere_antecedentes" },
    });

    expect(questions[0].id).toBe("missing_income_context");
  });

  it("asks about search priorities when no project is selected", () => {
    const questions = buildContactQuestions({
      lead: { input: {}, onboarding: {}, result: { classification: "Medio", score: 65 } },
    });

    expect(questions.some((item) => item.id === "no_project_goal_priority")).toBe(true);
    expect(questions.some((item) => item.id === "selected_project_commune_openness")).toBe(false);
  });

  it("asks about openness to a non-declared commune when selected project is compatible", () => {
    const questions = buildContactQuestions({
      lead: {
        input: { comuna_objetivo: "Macul" },
        onboarding: { comuna_alternativa: "Ñuñoa" },
        result: { classification: "Alto", score: 88 },
      },
      selectedProject: { id: "p2", nombre: "Vista Sur", comuna: "La Florida" },
      selectedMatch: { clasificacion: "Compatible", motivo_exclusion: null },
    });

    const communeQuestion = questions.find((item) => item.id === "selected_project_commune_openness");
    expect(communeQuestion?.question).toContain("La Florida");
    expect(communeQuestion?.reason).toContain("calza financieramente");
  });

  it("does not ask about commune openness when selected project commune was declared", () => {
    const questions = buildContactQuestions({
      lead: {
        input: { comuna_objetivo: "Macul" },
        onboarding: { comuna_alternativa: "La Florida" },
        result: { classification: "Alto", score: 88 },
      },
      selectedProject: { id: "p2", nombre: "Vista Sur", comuna: "La Florida" },
      selectedMatch: { clasificacion: "Compatible", motivo_exclusion: null },
    });

    expect(questions.some((item) => item.id === "selected_project_commune_openness")).toBe(false);
  });

  it("varies by score classification", () => {
    const highQuestions = buildContactQuestions({
      lead: { input: {}, onboarding: {}, result: { classification: "Alto", score: 92 } },
    });
    const lowQuestions = buildContactQuestions({
      lead: { input: {}, onboarding: {}, result: { classification: "Bajo", score: 32 } },
    });

    expect(highQuestions.some((item) => item.id === "high_score_next_step")).toBe(true);
    expect(lowQuestions.some((item) => item.id === "low_score_timeline")).toBe(true);
  });
});
