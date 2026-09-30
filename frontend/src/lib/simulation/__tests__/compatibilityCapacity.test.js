import { describe, expect, it } from "vitest";

import { buildAccessibleAlternatives, buildSimulationContext } from "../compatibility";

const UF = 40695;

// Lead limitado por renta: su ahorro solo, a 10% y sin puerta de ingreso, da
// 800 millones; ALG-9 dice 390 millones. Es la discrepancia de orden de
// magnitud que HU 10 viene a cerrar.
const indicadoresConCapacidad = {
  ingreso_total: 5500000,
  capacidad_compra_estimada_uf: 9601.8,
  dividendo_maximo_sostenible_clp: 1650000,
  restriccion_vinculante: "renta",
  capacidad_status: "ok",
};

const input = (financialIndicators) => ({
  ahorro_disponible: 80000000,
  ingreso_mensual: 5500000,
  deuda_mensual: 500000,
  uf_value_clp: UF,
  plazo_compra: "6_12_meses",
  financial_indicators: financialIndicators,
});

// Forma de simulación (projectAdapter), no la del catálogo.
const proyectoCaro = {
  id: "p-caro",
  nombre: "Torre Cara",
  comuna: "Las Condes",
  tipo_vivienda: "departamento",
  valor_uf: 12000,
};

describe("buildSimulationContext", () => {
  it("deja pasar financial_indicators para que la capacidad llegue a la pantalla", () => {
    const contexto = buildSimulationContext(
      { input: { ahorro_disponible: 1 }, result: { financial_indicators: indicadoresConCapacidad } },
      {},
    );
    expect(contexto.financial_indicators).toEqual(indicadoresConCapacidad);
  });
});

describe("buildAccessibleAlternatives", () => {
  it("usa la capacidad de ALG-9 en lugar del cálculo local", () => {
    const [conCapacidad] = buildAccessibleAlternatives(
      [proyectoCaro],
      input(indicadoresConCapacidad),
    );
    const [sinCapacidad] = buildAccessibleAlternatives([proyectoCaro], input(undefined));

    expect(conCapacidad.maxByMinDownPayment).toBeCloseTo(9601.8 * UF, 0);
    expect(conCapacidad.mainGap).toBe("valor objetivo");
    // El cálculo local, sin puerta de ingreso, deja pasar el mismo proyecto.
    expect(sinCapacidad.maxByMinDownPayment).toBe(80000000 / 0.1);
    expect(sinCapacidad.mainGap).not.toBe("valor objetivo");
  });

  it("cae al cálculo local cuando la capacidad requiere antecedentes", () => {
    const requiereInfo = {
      capacidad_compra_estimada_uf: null,
      dividendo_maximo_sostenible_clp: null,
      capacidad_status: "requires_info",
    };
    expect(buildAccessibleAlternatives([proyectoCaro], input(requiereInfo))).toEqual(
      buildAccessibleAlternatives([proyectoCaro], input(undefined)),
    );
  });

  it("no cambia el orden de la lista: sigue siendo el de HU 6", () => {
    const catalogo = [
      { ...proyectoCaro, id: "p-3", valor_uf: 3000, comuna: "Macul" },
      { ...proyectoCaro, id: "p-1", valor_uf: 1500, comuna: "Macul" },
      { ...proyectoCaro, id: "p-2", valor_uf: 2000, comuna: "Macul" },
    ];
    const ordenados = buildAccessibleAlternatives(catalogo, input(indicadoresConCapacidad));
    // statusRank -> gapAmount -> comuna -> tipo -> valueClp: los tres son
    // alcanzables, así que manda el valor ascendente.
    expect(ordenados.map((a) => a.project.id)).toEqual(["p-1", "p-2", "p-3"]);
  });
});
