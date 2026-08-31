import { describe, expect, it } from "vitest";

import { rankLeadsForProject } from "../leadRanking";

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

function lead(id, capacidad, extra = {}) {
  return {
    id,
    created_at: "2026-08-20T10:00:00.000Z",
    full_name: `Lead ${id}`,
    input: { ahorro_disponible: 25000000, comuna_objetivo: "Macul" },
    onboarding: { tipo_propiedad: "departamento" },
    result: {
      classification: extra.classification || "Medio",
      blockers: extra.blockers || [],
      project_fit: { status: "compatible" },
      financial_indicators: {
        ingreso_total: 2500000,
        capacidad_compra_estimada_uf: capacidad,
        capacidad_asistida_uf: null,
        restriccion_vinculante: capacidad === null ? null : "pie",
        capacidad_status: extra.status || (capacidad === null ? "requires_info" : "ok"),
        capacidad_supuestos: supuestos,
      },
    },
  };
}

const proyecto = {
  id: "p-macul",
  nombre: "Altos de Macul",
  comuna: "Macul",
  tipo: "departamento",
  precio_min_uf: 2400,
  precio_max_uf: 3200,
  estado: "disponible",
};

describe("panel del ejecutivo — sin proyecto seleccionado", () => {
  // HU 2 no puede regresar en silencio: sin proyecto, el panel devuelve las
  // mismas filas en el mismo orden y sin evidencia.
  it("devuelve los leads tal cual, sin evidencia ni grupos", () => {
    const leads = [lead("c", 3000), lead("a", 1000), lead("b", null)];
    const { ranked, descartados, requiereAntecedentes } = rankLeadsForProject(leads, null);

    expect(ranked.map((f) => f.lead)).toEqual(leads);
    expect(ranked.every((f) => f.match === null)).toBe(true);
    expect(descartados).toEqual([]);
    expect(requiereAntecedentes).toEqual([]);
  });
});

describe("panel del ejecutivo — con proyecto seleccionado", () => {
  it("separa alcanzables, descartados y requieren antecedentes", () => {
    const leads = [lead("alcanza", 3800), lead("lejos", 800), lead("sin-datos", null)];
    const { ranked, descartados, requiereAntecedentes } = rankLeadsForProject(leads, proyecto);

    expect(ranked.map((f) => f.lead.id)).toEqual(["alcanza"]);
    expect(descartados.map((f) => f.match.motivo_exclusion)).toEqual(["capacidad_insuficiente"]);
    expect(requiereAntecedentes.map((f) => f.lead.id)).toEqual(["sin-datos"]);
  });

  it("ordena por afinidad y, en el orden alternativo, por capacidad", () => {
    const leads = [lead("holgado", 3840), lead("justo", 2500), lead("sobrecalzado", 9600)];

    // El sobrecalzado (-20) sigue por delante del que apenas pasa precio_min:
    // ese ancla mide alcance de inventario, no solvencia (ALG-10 R2.1).
    const porAfinidad = rankLeadsForProject(leads, proyecto, "afinidad").ranked;
    expect(porAfinidad.map((f) => f.lead.id)).toEqual(["holgado", "sobrecalzado", "justo"]);

    const porCapacidad = rankLeadsForProject(leads, proyecto, "capacidad").ranked;
    expect(porCapacidad.map((f) => f.lead.id)).toEqual(["sobrecalzado", "holgado", "justo"]);
  });

  it("es determinista ante empates", () => {
    const leads = [lead("b", 3000), lead("a", 3000)];
    expect(rankLeadsForProject(leads, proyecto).ranked.map((f) => f.lead.id)).toEqual(["a", "b"]);
  });
});
