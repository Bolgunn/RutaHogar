import { describe, expect, it } from "vitest";
import { consolidateMissingAttributes } from "../Subsidios";

describe("consolidateMissingAttributes", () => {
  it("une y deduplica los atributos faltantes de todos los beneficios", () => {
    const benefits = [
      { missing_attributes: ["Tramo RSH (Registro Social de Hogares)", "Ahorro en UF"] },
      { missing_attributes: ["Ahorro en UF", "Grupo familiar en el RSH"] },
      { missing_attributes: [] },
    ];
    expect(consolidateMissingAttributes(benefits)).toEqual([
      "Tramo RSH (Registro Social de Hogares)",
      "Ahorro en UF",
      "Grupo familiar en el RSH",
    ]);
  });

  it("devuelve lista vacía cuando no hay beneficios ni atributos faltantes", () => {
    expect(consolidateMissingAttributes([])).toEqual([]);
    expect(consolidateMissingAttributes([{ missing_attributes: [] }])).toEqual([]);
  });

  it("ignora beneficios sin el campo missing_attributes", () => {
    expect(consolidateMissingAttributes([{ type: "FOGAES" }])).toEqual([]);
  });
});
