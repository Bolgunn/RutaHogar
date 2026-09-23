import { describe, expect, it } from "vitest";

import { getHousingPropertyPrice } from "../housingSavingsPlanService";


describe("getHousingPropertyPrice market snapshot", () => {
  it("convierte la referencia comunal con la UF persistida en la evaluación", () => {
    const price = getHousingPropertyPrice({
      input: { comuna_objetivo: "Buin", uf_value_clp: 40695 },
      result: {
        financial_indicators: {
          capacidad_supuestos: {
            market_snapshot: { uf_value_clp: 40999.93 },
          },
        },
      },
    });

    expect(price).toBe(2800 * 40999.93);
  });

  it("no inventa una conversión para evaluaciones sin UF persistida", () => {
    expect(getHousingPropertyPrice({
      input: { comuna_objetivo: "Buin" },
      result: {},
    })).toBe(0);
  });
});
