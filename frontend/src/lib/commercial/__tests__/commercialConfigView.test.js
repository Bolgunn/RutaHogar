import { describe, expect, it } from "vitest";

import {
  countDeltas,
  deltaText,
  formatCambios,
  getCriterion,
  priorityProjectsImpact,
  setCriterion,
} from "../commercialConfigView";

const supuestos = {
  tasa_anual_uf: 0.04, plazo_anios: 30, plazo_origen: "declarado", pie_ratio: 0.2,
  ratio_dividendo_max: 0.3, ratio_dividendo_saludable: 0.25, fogaes_tope_uf: 6000,
  fogaes_tope_con_subsidio_uf: 3000, fogaes_pie_ratio: 0.1, uf_value_clp: 40695,
  uf_fecha: "2026-08-16", age_term_verified: true, version: "e4-matching-v1",
};

function lead(id, capacidad) {
  return {
    id,
    input: { ahorro_disponible: 25000000, comuna_objetivo: "Macul" },
    onboarding: { tipo_propiedad: "departamento" },
    result: {
      classification: "Medio", blockers: [], project_fit: { status: "compatible" },
      financial_indicators: {
        ingreso_total: 2500000, capacidad_compra_estimada_uf: capacidad, capacidad_asistida_uf: null,
        restriccion_vinculante: "pie", capacidad_status: "ok", capacidad_supuestos: supuestos,
      },
    },
  };
}

const macul = { id: "p-macul", nombre: "Altos de Macul", comuna: "Macul", tipo: "departamento", precio_min_uf: 2400, precio_max_uf: 3200, estado: "disponible" };

describe("commercialConfigView", () => {
  it("lee y escribe criterios anidados sin mutar el original", () => {
    const criterios = { senales: { plazos: ["inmediato"], propiedad_vista: true }, umbral_reorientar: 70 };
    const next = setCriterion(criterios, "senales.propiedad_vista", false);
    expect(getCriterion(next, "senales.propiedad_vista")).toBe(false);
    expect(getCriterion(criterios, "senales.propiedad_vista")).toBe(true);
    expect(getCriterion(setCriterion(criterios, "umbral_reorientar", 75), "umbral_reorientar")).toBe(75);
  });

  it("formatea los cambios con etiquetas legibles", () => {
    const cambios = [
      { key: "senales.plazos", before: ["3_a_6_meses", "inmediato"], after: ["inmediato"] },
      { key: "subir_con_senales", before: 0, after: 1 },
      { key: "proyectos_prioritarios", before: [], after: ["p-macul", "p-borrado"] },
    ];
    expect(formatCambios(cambios, [macul])).toEqual([
      { key: "senales.plazos", label: "Señales · plazos de compra", before: "3 a 6 meses, Inmediato", after: "Inmediato" },
      { key: "subir_con_senales", label: "Subir a «Contactar ahora» con señales", before: "Desactivado", after: "Con 1 señal" },
      { key: "proyectos_prioritarios", label: "Proyectos prioritarios", before: "Ninguno", after: "Altos de Macul, Proyecto no disponible" },
    ]);
  });

  it("calcula el delta por acción y completa las que faltan con cero", () => {
    const rows = countDeltas({ vigente: { contact_now: 2, contact_with_review: 3 }, borrador: { contact_now: 4, contact_with_review: 1 } });
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.key === "contact_now")).toMatchObject({ vigente: 2, borrador: 4, delta: 2 });
    expect(rows.find((row) => row.key === "contact_with_review").delta).toBe(-2);
    expect(rows.find((row) => row.key === "do_not_route")).toMatchObject({ vigente: 0, borrador: 0, delta: 0 });
  });

  it("cuenta los leads Compatibles con cada proyecto prioritario e ignora agotados", () => {
    const agotado = { ...macul, id: "p-agotado", nombre: "Agotado", estado: "agotado" };
    const impact = priorityProjectsImpact([lead("a", 3000), lead("b", 3840), lead("c", 900)], [macul, agotado], ["p-macul", "p-agotado"]);
    expect(impact).toEqual([
      { proyecto_id: "p-macul", compatibles: 2, texto: "2 leads compatibles con Altos de Macul subirán dentro de su nivel" },
    ]);
  });

  it("describe el cambio con palabras en vez de un delta", () => {
    expect(deltaText(30, "contact_now")).toBe("30 leads más");
    expect(deltaText(-1, "contact_with_review")).toBe("1 lead menos");
    expect(deltaText(0, "nurture")).toBe("Sin cambios");
    expect(deltaText(0, "do_not_route")).toBe("Sin cambios · regla fija");
  });
});
