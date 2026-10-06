import { describe, expect, it } from "vitest";

import { formatGoalValue, goalPresentation } from "../goalPresentation";

describe("HU13 goal presentation", () => {
  it("clarifies the dividend metric without changing its frozen action type", () => {
    const definition = {
      source_action_type: "adjust_property_goal", title: "Ajustar objetivo inmobiliario",
      unit: "CLP/month",
    };

    expect(goalPresentation(definition)).toEqual({
      title: "Reducir dividendo estimado",
      description: "Ajusta pie, plazo o valor de la vivienda para acercar el dividendo a un nivel más sostenible.",
    });
    expect(formatGoalValue(470411, definition.unit)).toBe("$470.411 / mes");
  });

  it("formats frozen financial and time units for their actual metric", () => {
    expect(formatGoalValue(10000000, "CLP")).toBe("$10.000.000");
    expect(formatGoalValue(250000, "CLP/month")).toBe("$250.000 / mes");
    expect(formatGoalValue(30, "years")).toBe("30 años");
    expect(formatGoalValue(1, "years")).toBe("1 año");
    expect(formatGoalValue(2900, "UF")).toBe("2.900 UF");
  });

  it("uses concise copy for real goal types and preserves an unknown future definition", () => {
    expect(goalPresentation({ source_action_type: "increase_savings", title: "Aumentar ahorro para el pie" }).description)
      .toBe("Aumenta tu ahorro disponible hasta alcanzar el monto objetivo de pie.");
    expect(goalPresentation({ source_action_type: "reduce_debt", title: "Reducir deuda mensual" }).description)
      .toBe("Reduce tus pagos mensuales para mejorar tu carga financiera.");
    expect(goalPresentation({ source_action_type: "adjust_credit_term", title: "Ajustar plazo del crédito" }).description)
      .toBe("Acerca el plazo del crédito al rango definido por el plan.");
    expect(goalPresentation({ source_action_type: "future_goal", title: "Meta futura", description: "Contexto futuro." }))
      .toEqual({ title: "Meta futura", description: "Contexto futuro." });
    expect(formatGoalValue(5, "unidades")).toBe("5 unidades");
  });
});
