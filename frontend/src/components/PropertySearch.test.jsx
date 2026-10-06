import { describe, expect, it } from "vitest";
import { getPropertyCompatibility, getQualifyLabel } from "./PropertySearch";

describe("getQualifyLabel", () => {
  it("usa el sustantivo del tipo de vivienda", () => {
    expect(getQualifyLabel({ property_type: "departamento" })).toBe("Ver si califico para este departamento");
    expect(getQualifyLabel({ property_type: "CASA" })).toBe("Ver si califico para esta casa");
    expect(getQualifyLabel({ tipo_vivienda: "casas" })).toBe("Ver si califico para esta casa");
  });

  it("cae en un texto neutro para tipos desconocidos o ausentes", () => {
    expect(getQualifyLabel({ property_type: "oficina" })).toBe("Ver si califico para esta propiedad");
    expect(getQualifyLabel({})).toBe("Ver si califico para esta propiedad");
  });
});

describe("getPropertyCompatibility", () => {
  const context = {
    classification: "Medio",
    uf_value_clp: 38000,
    ingreso_mensual: 2000000,
    deuda_mensual: 0,
    ahorro_disponible: 20000000,
  };

  it("sin precalificación no hay veredicto: el CTA inicia la evaluación", () => {
    expect(getPropertyCompatibility(null, { price_uf: 3000 })).toBeNull();
    expect(getPropertyCompatibility({ uf_value_clp: 38000 }, { price_uf: 3000 })).toBeNull();
  });

  it("con precalificación entrega el veredicto de compatibilidad", () => {
    const barata = getPropertyCompatibility(context, { id: "a", title: "Depto", price_uf: 1500, property_type: "departamento" });
    const cara = getPropertyCompatibility(context, { id: "b", title: "Casa", price_uf: 20000, property_type: "casa" });
    expect(["Compatible", "Cercano", "Requiere ajuste"]).toContain(barata.status);
    expect(cara.status).toBe("Requiere ajuste");
  });
});
