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
  // LA REGRESION. Pisar solo `property_value` no cambiaba nada: el resolutor del
  // backend (scoring_engine/property_value.py) lee property_value_clp y luego
  // property_value_uf ANTES que property_value, y ambos venian arrastrados de la
  // evaluacion anterior. La meta se guardaba re-evaluada al precio viejo.
  it("reescribe los tres campos de valor, no solo property_value", () => {
    const result = buildProjectGoalInput(baseInput, project, UF);

    expect(result.property_value).toBe(5000);
    expect(result.property_value_unit).toBe("uf");
    expect(result.property_value_uf).toBe(5000);
    expect(result.property_value_clp).toBe(5000 * UF);
  });

  it("no deja rastro del valor anterior en ningun campo derivado", () => {
    const result = buildProjectGoalInput(baseInput, project, UF);
    const stale = [result.property_value, result.property_value_uf, result.property_value_clp];

    expect(stale).not.toContain(2000);
    expect(stale).not.toContain(2000 * UF);
  });

  // El dividendo depende del monto del credito, o sea del valor de la vivienda.
  // El backend no lo recalcula: solo lee dividendo_estimado (indicators.py).
  it("recalcula el dividendo para el nuevo valor", () => {
    const result = buildProjectGoalInput(baseInput, project, UF);

    expect(result.dividendo_estimado).toBeGreaterThan(baseInput.dividendo_estimado);
    expect(result.dividendo_esperado).toBe(result.dividendo_estimado);
    expect(result.dividendo_estimado_origen).toBe("calculado");
    // Un manual viejo, calculado para otra vivienda, no puede sobrevivir: el
    // backend lo usaria como respaldo si dividendo_estimado llegara vacio.
    expect(result.dividendo_estimado_manual).toBeUndefined();
  });

  it("el credito estimado descuenta el ahorro del valor de la vivienda", () => {
    const result = buildProjectGoalInput(baseInput, project, UF);
    expect(result.dividendo_monto_credito_estimado_clp).toBe(5000 * UF - 30_000_000);
  });

  // Un proyecto mas barato tiene que bajar el dividendo, no solo cambiarlo.
  it("un proyecto mas barato produce un dividendo menor", () => {
    const caro = buildProjectGoalInput(baseInput, { precio_min_uf: 8000 }, UF);
    const barato = buildProjectGoalInput(baseInput, { precio_min_uf: 3000 }, UF);
    expect(barato.dividendo_estimado).toBeLessThan(caro.dividendo_estimado);
  });

  // Sin plazo no hay cuota que calcular. Poner 0 le diria al motor que no hay
  // carga financiera, lo que SUBE el score: conservar el valor viejo solo lo
  // deja desactualizado, que es el menor de los dos errores.
  it("conserva el dividendo declarado si no puede calcular uno nuevo", () => {
    const sinPlazo = { ...baseInput, plazo_credito_hipotecario: 0 };
    const result = buildProjectGoalInput(sinPlazo, project, UF);

    expect(result.dividendo_estimado).toBe(500_000);
    expect(result.dividendo_estimado_origen).toBe("manual");
  });

  it("no muta el input recibido", () => {
    const copy = { ...baseInput };
    buildProjectGoalInput(baseInput, project, UF);
    expect(baseInput).toEqual(copy);
  });

  it("acepta el vocabulario de simulacion (valor_uf) ademas del catalogo", () => {
    const result = buildProjectGoalInput(baseInput, { valor_uf: 4000 }, UF);
    expect(result.property_value_uf).toBe(4000);
  });

  it("cae al uf_value_clp del input si no se pasa uno", () => {
    const result = buildProjectGoalInput(baseInput, project);
    expect(result.property_value_clp).toBe(5000 * UF);
  });

  it("conserva el resto del perfil intacto", () => {
    const result = buildProjectGoalInput(baseInput, project, UF);
    expect(result.ingreso_mensual).toBe(2_500_000);
    expect(result.ahorro_disponible).toBe(30_000_000);
    expect(result.morosidad_actual).toBe("no");
  });
});
