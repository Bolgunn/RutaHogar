import { describe, expect, it } from "vitest";

import { detectContactOpportunities } from "../contactOpportunities";

const supuestos = {
  tasa_anual_uf: 0.04,
  plazo_anios: 30,
  plazo_origen: "declarado",
  pie_ratio: 0.2,
  ratio_dividendo_max: 0.3,
  ratio_dividendo_saludable: 0.25,
  fogaes_tope_uf: 6000,
  fogaes_tope_con_subsidio_uf: 3000,
  fogaes_pie_ratio: 0.1,
  uf_value_clp: 40695,
  uf_fecha: "2026-08-16",
  age_term_verified: true,
  version: "e4-matching-v1",
};

const project = {
  id: "p-macul",
  nombre: "Altos de Macul",
  comuna: "Macul",
  tipo: "departamento",
  precio_min_uf: 2400,
  precio_max_uf: 3200,
  estado: "disponible",
};

function evaluation(userId, suffix, { score, classification = "Medio", capacidad, createdAt, comuna = "Macul" }) {
  return {
    id: `${userId}-${suffix}`,
    user_id: userId,
    email: `${userId}@rutahogar.test`,
    full_name: `Lead ${userId}`,
    created_at: createdAt,
    input: { ahorro_disponible: 25000000, comuna_objetivo: comuna },
    onboarding: { tipo_propiedad: "departamento", comuna_interes: comuna },
    result: {
      score,
      adjusted_score: score,
      classification,
      blockers: [],
      project_fit: { status: capacidad >= 2400 ? "compatible" : "out_of_reach" },
      financial_indicators: {
        ingreso_total: 2500000,
        capacidad_compra_estimada_uf: capacidad,
        capacidad_asistida_uf: null,
        restriccion_vinculante: "pie",
        capacidad_status: "ok",
        capacidad_supuestos: supuestos,
      },
    },
  };
}

describe("detectContactOpportunities", () => {
  it("detecta cuando un lead pasa a prioridad Alta", () => {
    const opportunities = detectContactOpportunities([
      evaluation("lead1", "old", { score: 68, classification: "Medio", capacidad: 2600, createdAt: "2026-09-01T10:00:00.000Z" }),
      evaluation("lead1", "new", { score: 78, classification: "Alto", capacidad: 2600, createdAt: "2026-09-02T10:00:00.000Z" }),
    ], [project]);

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].primary.type).toBe("score_high");
    expect(opportunities[0].score_delta).toBe(10);
  });

  it("detecta cuando la nueva capacidad alcanza un proyecto asignado", () => {
    const opportunities = detectContactOpportunities([
      evaluation("lead2", "old", { score: 55, capacidad: 1800, createdAt: "2026-09-01T10:00:00.000Z" }),
      evaluation("lead2", "new", { score: 62, capacidad: 2500, createdAt: "2026-09-02T10:00:00.000Z" }),
    ], [project]);

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].triggers.some((trigger) => trigger.type === "capacity")).toBe(true);
    expect(opportunities[0].triggers.find((trigger) => trigger.type === "capacity").project.id).toBe("p-macul");
  });

  it("detecta entrada al top 10 aun si no cambia a prioridad Alta", () => {
    const evaluations = [];
    for (let i = 0; i < 11; i += 1) {
      evaluations.push(evaluation(`stable${i}`, "old", { score: 60, capacidad: 3600 - i * 20, createdAt: "2026-09-01T09:00:00.000Z" }));
      evaluations.push(evaluation(`stable${i}`, "new", { score: 60, capacidad: 3600 - i * 20, createdAt: "2026-09-02T09:00:00.000Z" }));
    }
    evaluations.push(evaluation("lead3", "old", { score: 58, capacidad: 3000, createdAt: "2026-09-01T10:00:00.000Z", comuna: "Santiago" }));
    evaluations.push(evaluation("lead3", "new", { score: 64, capacidad: 3840, createdAt: "2026-09-02T10:00:00.000Z" }));

    const opportunities = detectContactOpportunities(evaluations, [project]);
    const opportunity = opportunities.find((item) => item.lead.user_id === "lead3");

    expect(opportunity).toBeTruthy();
    expect(opportunity.triggers.some((trigger) => trigger.type === "affinity_top")).toBe(true);
  });
});
