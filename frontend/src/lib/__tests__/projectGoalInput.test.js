import { describe, expect, it } from "vitest";
import { buildProjectGoalInput } from "../projectGoalInput";

const UF = 40695;

// La evaluacion previa del usuario: una vivienda de 2.000 UF. ScoreForm siempre
// deja poblados property_value_uf y property_value_clp junto a property_value.
const baseInput = {
  ingreso_mensual: 2_500_000,
  deuda_mensual: 200_000,
  ahorro_disponible: 30_000_000,
  edad: 35,
  plazo_credito_hipotecario: 25,
  tipo_contrato: "indefinido",
  continuidad_laboral: "mas_3_anios",
  morosidad_actual: "no",
  consentimiento: true,
  uf_value_clp: UF,
  property_value: 2000,
  property_value_unit: "uf",
  property_value_uf: 2000,
  property_value_clp: 2000 * UF,
  dividendo_estimado: 500_000,
  dividendo_esperado: 500_000,
  dividendo_estimado_manual: 500_000,
  dividendo_estimado_origen: "manual",
};

const project = { id: "p1", nombre: "Parque Ñuñoa", precio_min_uf: 5000, precio_max_uf: 6200 };

describe("buildProjectGoalInput", () => {
  it("envia el objetivo en UF para que el backend lo convierta con su snapshot", () => {
    const result = buildProjectGoalInput(baseInput, project);

    expect(result.property_value).toBe(5000);
    expect(result.property_value_unit).toBe("uf");
    expect(result.property_value_uf).toBe(5000);
    expect(result.property_value_clp).toBeUndefined();
  });

  it("conserva el dividendo declarado y elimina derivados de mercado del frontend", () => {
    const result = buildProjectGoalInput(baseInput, project);

    expect(result.dividendo_estimado).toBe(500_000);
    expect(result.dividendo_estimado_origen).toBe("manual");
    expect(result.dividendo_estimado_manual).toBe(500_000);
    expect(result.uf_value_clp).toBeUndefined();
    expect(result.dividendo_tasa_anual_referencial).toBeUndefined();
    expect(result.dividendo_monto_credito_estimado_clp).toBeUndefined();
    expect(result.dividendo_monto_credito_estimado_uf).toBeUndefined();
    expect(result.dividendo_uf_referencial_clp).toBeUndefined();
  });

  it("no muta el input recibido", () => {
    const copy = { ...baseInput };
    buildProjectGoalInput(baseInput, project);
    expect(baseInput).toEqual(copy);
  });

  it("acepta el vocabulario de simulacion (valor_uf) ademas del catalogo", () => {
    const result = buildProjectGoalInput(baseInput, { valor_uf: 4000 });
    expect(result.property_value_uf).toBe(4000);
  });

  it("marca vivienda nueva al fijar un proyecto en construccion", () => {
    const result = buildProjectGoalInput(baseInput, {
      precio_min_uf: 4000,
      estado: "en_construccion",
    });

    expect(result.vivienda_nueva).toBe(true);
  });

  it("marca vivienda usada para proyectos sin estado de construccion", () => {
    const result = buildProjectGoalInput(
      { ...baseInput, vivienda_nueva: true },
      { precio_min_uf: 4000, estado: "disponible" },
    );

    expect(result.vivienda_nueva).toBe(false);
  });

  it("conserva un resumen del proyecto para identificar la meta actual", () => {
    const result = buildProjectGoalInput(baseInput, project);

    expect(result.project_goal).toMatchObject({
      id: "p1",
      nombre: "Parque Ñuñoa",
      precio_min_uf: 5000,
      precio_max_uf: 6200,
    });
  });

  it("no reutiliza la UF ni el valor CLP historicos", () => {
    const result = buildProjectGoalInput(baseInput, project);
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized).not.toHaveProperty("uf_value_clp");
    expect(serialized).not.toHaveProperty("property_value_clp");
  });

  it("conserva el resto del perfil intacto", () => {
    const result = buildProjectGoalInput(baseInput, project);
    expect(result.ingreso_mensual).toBe(2_500_000);
    expect(result.ahorro_disponible).toBe(30_000_000);
    expect(result.morosidad_actual).toBe("no");
  });
});
