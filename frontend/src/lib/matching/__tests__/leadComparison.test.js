import { describe, expect, it } from "vitest";
import { buildLeadProjectComparison } from "../leadComparison";

const project = {
  id: "p1",
  nombre: "Proyecto Norte",
  comuna: "Macul",
  tipo: "departamento",
  precio_min_uf: 3000,
  precio_max_uf: 3600,
};

function lead(overrides = {}) {
  return {
    id: overrides.id || "lead-1",
    full_name: overrides.full_name || "Lead Uno",
    input: {
      comuna_objetivo: "Macul",
      ahorro_disponible: 40_000_000,
      ...overrides.input,
    },
    onboarding: {
      tipo_propiedad: "departamento",
      ...overrides.onboarding,
    },
    result: {
      score: 85,
      classification: "Alto",
      positive_indicators: ["Buen ahorro disponible"],
      risks: [],
      financial_indicators: {
        capacidad_compra_estimada_uf: 3400,
        capacidad_supuestos: {
          uf_value_clp: 40_000,
          ratio_dividendo_max: 0.25,
          ratio_dividendo_saludable: 0.2,
          pie_ratio: 0.2,
          fogaes_pie_ratio: 0.1,
          fogaes_tope_uf: 4500,
          plazo_anios: 25,
          tasa_anual_uf: 0.045,
        },
        ingreso_total: 3_000_000,
      },
      blockers: [],
      ...overrides.result,
    },
    ...overrides,
  };
}

describe("buildLeadProjectComparison", () => {
  it("returns comparable score, capacity and affinity for two leads", () => {
    const comparison = buildLeadProjectComparison([
      lead({ id: "a", full_name: "Lead A" }),
      lead({ id: "b", full_name: "Lead B", result: { score: 70, classification: "Medio" } }),
    ], project);

    expect(comparison).toHaveLength(2);
    expect(comparison[0]).toMatchObject({ name: "Lead A", score: 85, classification: "Alto" });
    expect(comparison[0].capacity.valueUf).toBe(3400);
    expect(comparison[0].capacity.reachesMin).toBe(true);
    expect(comparison[0].affinity.value).toBeGreaterThan(0);
  });

  it("marks non-declared commune as a difficult factor", () => {
    const comparison = buildLeadProjectComparison([
      lead({ input: { comuna_objetivo: "Ñuñoa" }, onboarding: { comuna_alternativa: "La Florida" } }),
    ], project);

    expect(comparison[0].affinity.communeDeclared).toBe(false);
    expect(comparison[0].factors.difficult).toContain("La comuna del proyecto no está dentro de sus opciones declaradas.");
  });

  it("detects declared commune from project goal fallback", () => {
    const comparison = buildLeadProjectComparison([
      lead({
        input: { comuna_objetivo: "", project_goal: { comuna: "Macul" } },
        onboarding: { comuna_interes: "", comuna_alternativa: "" },
      }),
    ], project);

    expect(comparison[0].affinity.communeDeclared).toBe(true);
  });

  it("detects declared commune from input commune aliases", () => {
    const comparison = buildLeadProjectComparison([
      lead({
        input: { comuna_objetivo: "", comuna_interes: "Macul" },
        onboarding: { comuna_interes: "", comuna_alternativa: "" },
      }),
    ], project);

    expect(comparison[0].affinity.communeDeclared).toBe(true);
  });

  it("detects declared commune from lead preferences", () => {
    const comparison = buildLeadProjectComparison([
      lead({
        input: { comuna_objetivo: "" },
        onboarding: { comuna_interes: "", comuna_alternativa: "" },
        preferences: { comuna_interes: "Macul" },
      }),
    ], project);

    expect(comparison[0].affinity.communeDeclared).toBe(true);
  });

  it("detects declared commune from lead context", () => {
    const comparison = buildLeadProjectComparison([
      lead({
        input: { comuna_objetivo: "" },
        onboarding: { comuna_interes: "", comuna_alternativa: "" },
        context: { comuna_objetivo: "Macul" },
      }),
    ], project);

    expect(comparison[0].affinity.communeDeclared).toBe(true);
  });

  it("captures missing capacity antecedents", () => {
    const comparison = buildLeadProjectComparison([
      lead({
        result: {
          score: 45,
          classification: "Bajo",
          financial_indicators: { capacidad_status: "requires_info", capacidad_supuestos: {} },
        },
      }),
    ], project);

    expect(comparison[0].capacity.valueUf).toBeNull();
    expect(comparison[0].capacity.exclusion).toBe("capacidad_requiere_antecedentes");
    expect(comparison[0].factors.difficult).toContain("Faltan antecedentes para calcular capacidad.");
  });

  it("returns empty comparison without project", () => {
    expect(buildLeadProjectComparison([lead()], null)).toEqual([]);
  });
});
