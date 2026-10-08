import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import UpdateFinancialDataForm, {
  cursorAfterDigits, digitsBeforeCursor, effectiveTrackingPatch, formatTrackingCurrency,
  hasUnsavedTrackingChanges,
} from "./UpdateFinancialDataForm";

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
