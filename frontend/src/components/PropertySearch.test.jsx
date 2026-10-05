import { describe, expect, it } from "vitest";
import { getQualifyLabel } from "./PropertySearch";

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
