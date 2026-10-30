import { describe, expect, it } from "vitest";
import { buildAccessibleAlternatives, buildComparisonInsights, buildSimulationContext } from "../compatibility";

const input = {
  ingreso_mensual: 1450000,
  deuda_mensual: 0,
  ahorro_disponible: 20000000,
  dividendo_estimado: 300000,
  uf_value_clp: 40695,
};
const projects = [
  { id: "maipu", nombre: "Proyecto Maipú", comuna: "Maipú", tipo_vivienda: "casa", valor_uf: 1500 },
  { id: "nunoa", nombre: "Proyecto Ñuñoa", comuna: "Ñuñoa", tipo_vivienda: "departamento", valor_uf: 1500 },
];

describe("preferencias opcionales de simulación", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["vacías", {}],
    ["sin comuna ni tipo", { plazo_compra: "6_12_meses" }],
  ])("usa coincidencias neutras con preferencias %s", (_, preferences) => {
    const alternatives = buildAccessibleAlternatives(projects, input, preferences);
    expect(alternatives).toEqual(buildAccessibleAlternatives(projects, input, {}));
    expect(alternatives.map((item) => item.preference)).toEqual([
      { communeMatch: false, typeMatch: false },
      { communeMatch: false, typeMatch: false },
    ]);
    const comparison = buildComparisonInsights(alternatives[0], alternatives[1], preferences);
    expect(comparison).toEqual(buildComparisonInsights(alternatives[0], alternatives[1], {}));
    expect(comparison.preference).toEqual({
      current: { communeMatch: false, typeMatch: false },
      alternative: { communeMatch: false, typeMatch: false },
    });
    const context = buildSimulationContext({ input }, preferences);
    expect(context.comuna_objetivo).toBeUndefined();
    expect(context.tipo_vivienda_preferida).toBeUndefined();
  });

  it("conserva el tipo declarado cuando comuna_interes está ausente", () => {
    const preferences = Object.freeze({ tipo_propiedad: "departamento" });
    const alternatives = buildAccessibleAlternatives(projects, input, preferences);
    expect(alternatives[0].project.id).toBe("nunoa");
    expect(alternatives[0].preference).toEqual({ communeMatch: false, typeMatch: true });
    expect(alternatives[1].preference).toEqual({ communeMatch: false, typeMatch: false });
    expect(preferences).toEqual({ tipo_propiedad: "departamento" });
  });

  it("conserva las coincidencias y el orden con preferencias completas", () => {
    const preferences = Object.freeze({ comuna_interes: "  NUNOA  ", tipo_propiedad: "departamento", plazo_compra: "6_12_meses" });
    const alternatives = buildAccessibleAlternatives(projects, input, preferences);
    expect(alternatives.map((item) => item.project.id)).toEqual(["nunoa", "maipu"]);
    expect(alternatives[0].preference).toEqual({ communeMatch: true, typeMatch: true });
    expect(alternatives[1].preference).toEqual({ communeMatch: false, typeMatch: false });
    const comparison = buildComparisonInsights(alternatives[0], alternatives[1], preferences);
    expect(comparison.preference.current).toEqual({ communeMatch: true, typeMatch: true });
    expect(comparison.advantages.current).toContain("Coincide con tu comuna objetivo.");
    expect(comparison.advantages.current).toContain("Coincide con tu tipo de vivienda preferido.");
  });

  it("mantiene los alias existentes para comuna y tipo", () => {
    expect(buildAccessibleAlternatives(projects, input, { comuna_objetivo: "Ñuñoa", tipo_vivienda_preferida: "departamento" }))
      .toEqual(buildAccessibleAlternatives(projects, input, { comuna_interes: "Ñuñoa", tipo_propiedad: "departamento" }));
  });
});
