import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UpdateFinancialDataForm, {
  cursorAfterDigits, digitsBeforeCursor, effectiveTrackingPatch, formatTrackingCurrency,
  hasUnsavedTrackingChanges,
  calculatedDividendContext,
} from "./UpdateFinancialDataForm";
import { calculateMortgageDividend, roundCurrency } from "../../lib/mortgage";

const calculatedSnapshot = () => {
  const context = { propertyValueClp: 108000000, savingsClp: 10000000, termYears: 20, annualRate: 0.049 };
  const result = calculateMortgageDividend(context);
  return {
    property_value_clp: context.propertyValueClp, ahorro_disponible: context.savingsClp,
    plazo_credito_hipotecario: context.termYears, dividendo_tasa_anual_referencial: context.annualRate,
    dividendo_estimado_origen: "calculado_referencial", dividendo_estimado: result.dividend,
    dividendo_estimado_calculado: result.dividend, dividendo_esperado: result.dividend,
    dividendo_monto_credito_estimado_clp: result.principalClp,
    dividendo_monto_credito_estimado_uf: roundCurrency(result.principalClp / 40000),
    dividendo_uf_referencial_clp: 40000,
  };
};
const savingsControls = (value) => ({ ahorro_disponible: {
  touched: true, type: "currency", value: String(value), nullable: false, clear: false,
} });

describe("HU13 calculated dividend updates", () => {
  it("reuses the canonical mortgage calculation and emits only changed financing facts", () => {
    const snapshot = calculatedSnapshot();
    const before = structuredClone(snapshot);
    const result = calculateMortgageDividend({ ...calculatedDividendContext(snapshot), savingsClp: 60000000 });
    expect(effectiveTrackingPatch(savingsControls(60000000), snapshot)).toEqual({
      ahorro_disponible: 60000000, dividendo_estimado: result.dividend,
      dividendo_estimado_calculado: result.dividend, dividendo_esperado: result.dividend,
      dividendo_monto_credito_estimado_clp: result.principalClp,
      dividendo_monto_credito_estimado_uf: roundCurrency(result.principalClp / 40000),
    });
    expect(result.dividend).toBeLessThan(snapshot.dividendo_estimado);
    expect(result.dividend).toBeLessThanOrEqual(375000);
    expect(snapshot).toEqual(before);
  });

  it("recalculates a term change using the saved rate, without touching savings or principal", () => {
    const snapshot = calculatedSnapshot();
    const result = calculateMortgageDividend({ ...calculatedDividendContext(snapshot), termYears: 30 });
    expect(effectiveTrackingPatch({ plazo_credito_hipotecario: { touched: true, type: "select", value: "30" } }, snapshot))
      .toEqual({ plazo_credito_hipotecario: "30", dividendo_estimado: result.dividend,
        dividendo_estimado_calculado: result.dividend, dividendo_esperado: result.dividend });
  });

  it.each([
    { dividendo_estimado_origen: "manual", dividendo_estimado_manual: 644003 },
    { dividendo_estimado_manual: 644003 },
    { dividendo_tasa_anual_referencial: undefined },
    { dividendo_tasa_anual_referencial: null },
    { dividendo_tasa_anual_referencial: "" },
    { dividendo_tasa_anual_referencial: Infinity },
    { dividendo_estimado_origen: undefined },
    { dividendo_estimado_calculado: 1 },
    { property_value_clp: null },
    { ahorro_disponible: null },
    { plazo_credito_hipotecario: null },
  ])("keeps manual or incomplete snapshots editable without inferring context: %j", (missing) => {
    const snapshot = { ...calculatedSnapshot(), ...missing };
    expect(calculatedDividendContext(snapshot)).toBeNull();
    expect(effectiveTrackingPatch(savingsControls(60000000), snapshot)).toEqual({ ahorro_disponible: 60000000 });
    const html = renderToStaticMarkup(<UpdateFinancialDataForm snapshot={snapshot} onSubmit={vi.fn()} />);
    expect(html).not.toMatch(/readonly/i);
  });

  it("uses a saved UF conversion when the property is expressed in UF", () => {
    const snapshot = { ...calculatedSnapshot(), property_value_clp: undefined, property_value_uf: 2700, uf_value_clp: 45000 };
    expect(calculatedDividendContext(snapshot).propertyValueClp).toBe(108000000);
    expect(effectiveTrackingPatch(savingsControls(60000000), snapshot).dividendo_estimado)
      .toBe(calculateMortgageDividend({ ...calculatedDividendContext(snapshot), savingsClp: 60000000 }).dividend);
    expect(calculatedDividendContext({ ...snapshot, dividendo_uf_referencial_clp: null, uf_value_clp: null })).toBeNull();
  });

  it("uses a historical rate different from the frontend fallback and preserves explicit manual edits", () => {
    const snapshot = { ...calculatedSnapshot(), dividendo_tasa_anual_referencial: 0.031 };
    const initial = calculateMortgageDividend({ ...calculatedDividendContext(snapshot), annualRate: 0.031 }).dividend;
    snapshot.dividendo_estimado = initial;
    snapshot.dividendo_estimado_calculado = initial;
    const expected = calculateMortgageDividend({ ...calculatedDividendContext(snapshot), savingsClp: 60000000 }).dividend;
    expect(effectiveTrackingPatch(savingsControls(60000000), snapshot).dividendo_estimado).toBe(expected);
    const manual = { ...snapshot, dividendo_estimado_origen: "manual", dividendo_estimado_manual: initial };
    expect(effectiveTrackingPatch({ dividendo_estimado: {
      touched: true, type: "currency", value: "400000", nullable: true, clear: false,
    } }, manual)).toEqual({ dividendo_estimado: 400000 });
  });

  it("does not change the dividend for unrelated updates, reverted controls or an unchanged rounded result", () => {
    const snapshot = calculatedSnapshot();
    expect(effectiveTrackingPatch({ continuidad_laboral: { touched: true, type: "select", value: "mas_3_anios" } }, snapshot))
      .toEqual({ continuidad_laboral: "mas_3_anios" });
    expect(effectiveTrackingPatch(savingsControls(snapshot.ahorro_disponible), snapshot)).toEqual({});
    expect(effectiveTrackingPatch({}, snapshot)).toEqual({});
    const patch = effectiveTrackingPatch(savingsControls(snapshot.ahorro_disponible + 1), snapshot);
    expect(patch).not.toHaveProperty("dividendo_estimado");
    expect(patch).not.toHaveProperty("dividendo_estimado_calculado");
  });

  it("shows a calculated dividend as read-only and preserves metadata absence", () => {
    const snapshot = calculatedSnapshot();
    const html = renderToStaticMarkup(<UpdateFinancialDataForm snapshot={snapshot} onSubmit={vi.fn()} />);
    expect(html).toMatch(/aria-label="Dividendo estimado"[^>]*readonly=""/i);
    delete snapshot.dividendo_esperado;
    delete snapshot.dividendo_monto_credito_estimado_uf;
    const patch = effectiveTrackingPatch(savingsControls(60000000), snapshot);
    expect(patch).not.toHaveProperty("dividendo_esperado");
    expect(patch).not.toHaveProperty("dividendo_monto_credito_estimado_uf");
    expect(patch).not.toHaveProperty("dividendo_estimado_origen");
    expect(patch).not.toHaveProperty("dividendo_tasa_anual_referencial");
  });

  it("handles fully funded housing and later worsening without altering previous snapshots", () => {
    const snapshot = calculatedSnapshot();
    const patch = effectiveTrackingPatch(savingsControls(108000000), snapshot);
    expect(patch.dividendo_estimado).toBe(0);
    expect(patch.dividendo_monto_credito_estimado_clp).toBe(0);
    const funded = { ...snapshot, ...patch };
    const later = effectiveTrackingPatch(savingsControls(10000000), funded);
    expect(later.dividendo_estimado).toBe(snapshot.dividendo_estimado);
    expect(funded.dividendo_estimado).toBe(0);
    expect(snapshot.ahorro_disponible).toBe(10000000);
  });
});

describe("HU13 update form presentation", () => {
  it("formats financial amounts and uses readable select labels", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm previous="event-1" onSubmit={vi.fn()} snapshot={{
      ingreso_mensual: 1200000, deuda_mensual: 40000, ahorro_disponible: 3000000,
      dividendo_estimado: 450000, monto_morosidad: 0, tipo_contrato: "indefinido",
      continuidad_laboral: "entre_1_y_3_anios", plazo_credito_hipotecario: 25,
    }} />);

    expect(html).toContain('value="1.200.000"');
    expect(html).toContain('value="40.000"');
    expect(html).toContain("Contrato indefinido");
    expect(html).toContain("Entre 1 y 3 años");
  });

  it("does not expose manual age or value-clearing controls", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm previous="event-1" onSubmit={vi.fn()} snapshot={{}} />);

    expect(html).not.toContain("Edad");
    expect(html).not.toContain("Borrar valor declarado");
    expect(html).toContain('value="0"');
    expect(html).toContain("Guardar actualización");
    expect(html).toMatch(/Guardar actualización<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Guardar actualización/);
  });

  it("renders nullable currency values from the snapshot as empty inputs", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm previous="event-1" onSubmit={vi.fn()} snapshot={{
      dividendo_estimado: null,
      monto_morosidad: null,
    }} />);

    expect(html).toMatch(/aria-label="Dividendo estimado"[^>]*value=""/);
    expect(html).toMatch(/aria-label="Monto de morosidad"[^>]*value=""/);
  });

  it("formats typed currency as whole Chilean peso amounts", () => {
    expect(formatTrackingCurrency("250000")).toBe("250.000");
    expect(formatTrackingCurrency("$1.200.000")).toBe("1.200.000");
    expect(formatTrackingCurrency("1234567890123", 10)).toBe("1.234.567.890");
    // Removing the first digit of 50.000 leaves four zero digits. They must
    // remain editable instead of normalizing to a visually empty-looking 0.
    expect(formatTrackingCurrency("0000")).toBe("0.000");
    expect(formatTrackingCurrency("400000")).toBe("400.000");
  });

  it("keeps an equivalent cursor position while an amount is edited in the middle", () => {
    // The browser has already removed the 2 from 123, leaving the caret after 1.
    const digits = digitsBeforeCursor("13", 1);

    expect(digits).toBe(1);
    expect(cursorAfterDigits(formatTrackingCurrency("13"), digits)).toBe(1);
    expect(cursorAfterDigits("1.234", 2)).toBe(3);
  });

  it("uses the six fixed mortgage terms and client-side digit limits", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm previous="event-1" onSubmit={vi.fn()} snapshot={{}} />);

    expect(html).toContain("5 años");
    expect(html).toContain("10 años");
    expect(html).toContain("15 años");
    expect(html).toContain("20 años");
    expect(html).toContain("25 años");
    expect(html).toContain("30 años");
    expect(html).toContain('maxLength="13"');
    expect(html).toContain('maxLength="15"');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain('autoComplete="off"');
    expect(html).toContain('<textarea');
    expect(html).toContain('rows="6"');
  });

  it("only enables a save for a real valid change and can restore the original value", () => {
    const snapshot = { ingreso_mensual: 5100000 };
    const unchanged = { ingreso_mensual: { touched: true, type: "currency", value: "5.100.000" } };
    const changed = { ingreso_mensual: { touched: true, type: "currency", value: "5.000.000" } };

    expect(hasUnsavedTrackingChanges(unchanged, snapshot)).toBe(false);
    expect(effectiveTrackingPatch(unchanged, snapshot)).toEqual({});
    expect(hasUnsavedTrackingChanges(changed, snapshot)).toBe(true);
    expect(effectiveTrackingPatch(changed, snapshot)).toEqual({ ingreso_mensual: 5000000 });
  });

  it("distinguishes nullable clears, zero, untouched fields and invalid required currency", () => {
    const snapshot = { dividendo_estimado: 450000, monto_morosidad: 120000, ingreso_mensual: 1000000 };

    expect(effectiveTrackingPatch({
      dividendo_estimado: { touched: true, type: "currency", value: "", nullable: true, clear: true },
    }, snapshot)).toEqual({ dividendo_estimado: null });
    expect(effectiveTrackingPatch({
      monto_morosidad: { touched: true, type: "currency", value: "", nullable: true, clear: true },
    }, snapshot)).toEqual({ monto_morosidad: null });
    expect(effectiveTrackingPatch({
      dividendo_estimado: { touched: true, type: "currency", value: "0", nullable: true, clear: false },
    }, snapshot)).toEqual({ dividendo_estimado: 0 });
    expect(effectiveTrackingPatch({
      ingreso_mensual: { touched: false, type: "currency", value: "900.000", nullable: false, clear: false },
    }, snapshot)).toEqual({});
    expect(() => effectiveTrackingPatch({
      ingreso_mensual: { touched: true, type: "currency", value: "", nullable: false, clear: true },
    }, snapshot)).toThrow("Este dato no permite un valor vacío.");
  });
});
