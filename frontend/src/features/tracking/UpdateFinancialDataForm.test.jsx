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

  it("preserves manual age and nullable clearing controls without enabling an unchanged save", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm previous="event-1" onSubmit={vi.fn()} snapshot={{}} />);

    expect(html).toContain('aria-label="Edad"');
    expect(html).toContain('Borrar valor declarado: Dividendo estimado');
    expect(html).toContain('Borrar valor declarado: Monto de morosidad');
    expect(html).toContain('value="0"');
    expect(html).toContain("Guardar actualización");
    expect(html).toMatch(/Guardar actualización<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Guardar actualización/);
  });

  it("formats typed currency as whole Chilean peso amounts", () => {
    expect(formatTrackingCurrency(512345.67)).toBe("512.346");
    expect(formatTrackingCurrency(512345.12)).toBe("512.345");
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

  it("offers the supported mortgage terms and client-side digit limits", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm previous="event-1" onSubmit={vi.fn()} snapshot={{}} />);

    expect(html).not.toContain('<option value="5"');
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
    expect(html).toContain('rows="3"');
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

  it("distinguishes clearing, zero, and an untouched nullable amount", () => {
    const snapshot = { monto_morosidad: 50000, dividendo_estimado: 0 };
    const clear = { monto_morosidad: { touched: true, type: "currency", nullable: true, clear: true, value: "50.000" } };
    expect(hasUnsavedTrackingChanges(clear, snapshot)).toBe(true);
    expect(effectiveTrackingPatch(clear, snapshot)).toEqual({ monto_morosidad: null });
    expect(effectiveTrackingPatch({}, snapshot)).toEqual({});
    expect(effectiveTrackingPatch({ dividendo_estimado: { touched: true, type: "currency", nullable: true, clear: true, value: "0" } }, snapshot)).toEqual({ dividendo_estimado: null });
    expect(hasUnsavedTrackingChanges(clear, { monto_morosidad: null })).toBe(false);
  });

  it("keeps legacy mortgage terms selected and serializes numeric edits", () => {
    const html = renderToStaticMarkup(<UpdateFinancialDataForm correction previous="event-1" onSubmit={vi.fn()} snapshot={{ plazo_credito_hipotecario: 18, edad: 36 }} />);
    expect(html).toContain('<option value="18" selected="">18 años</option>');
    expect(html).toContain('aria-label="Edad"');
    expect(effectiveTrackingPatch({ plazo_credito_hipotecario: { touched: true, type: "number", value: "25" }, edad: { touched: true, type: "number", value: "35" } }, { plazo_credito_hipotecario: 18, edad: 36 })).toEqual({ plazo_credito_hipotecario: 25, edad: 35 });
  });
});
