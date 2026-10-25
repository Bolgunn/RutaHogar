import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import BipersonalCapacityCard from "./BipersonalCapacityCard";
import { CoDebtorPanel } from "./CoDebtorSection";

export function projection(overrides = {}) {
  return {
    version: "hu30-projection-v1", evaluation_type: "bipersonal_confirmed", status: "confirmed",
    visibility: "visible", availability: "complete", warnings: [],
    holder: { income: 1800000, debt: 100000 },
    co_debtor: { income: 1900000, income_considered: 1200000, debt_considered: 90000 },
    financial_totals: { debt: 190000 }, relation: { value: "conyuge" },
    capacity: { without_complement: { purchase_capacity_uf: 2100 },
      with_complement: { purchase_capacity_uf: 2300, purchase_capacity_clp: 92000000 },
      delta: { purchase_capacity_uf: 200, purchase_capacity_clp: 8000000, income_capacity_uf: 300, income_capacity_clp: 12000000 } },
    ...overrides,
  };
}
const render = (value, props = {}) => renderToStaticMarkup(<BipersonalCapacityCard projection={value} {...props} />);

describe("HU30 owner capacity card", () => {
  it.each([[true, false, "Participación confirmada — pendiente de incorporar"], [false, true, "Participación confirmada"]])("separates live confirmation from the declared historical evaluation", (update_required, matching_confirmed_later, label) => {
    const html = render(projection({ evaluation_type: "declared_complement", status: "pending", current_participation: { status: "confirmed" }, current_revision: { id: "v1", revision_number: 1 }, update_required, matching_confirmed_later }));
    expect(html).toContain(label);
    expect(html).toContain(matching_confirmed_later ? "no fue necesario recalcularla" : "no utilizó una confirmación del co-deudor");
    if (matching_confirmed_later) {
      expect(html).not.toContain("Complemento declarado, sin confirmación utilizada");
      expect(html).not.toContain("no utilizó una confirmación del co-deudor");
      expect(html).toContain('role="status">Participación confirmada</p>');
    }
    expect(html).not.toContain("Sin participación confirmada");
    expect(html.includes("Actualizar score con datos confirmados")).toBe(update_required);
    expect(html).not.toContain("Capacidad Bipersonal");
  });
  it("uses considered amounts and backend capacities without converting or subtracting", () => {
    const html = render(projection());
    for (const text of ["Capacidad Bipersonal", "1.800.000", "1.200.000", "100.000", "90.000", "190.000", "2.100 UF", "2.300 UF", "92.000.000", "8.000.000", "200 UF", "12.000.000", "Cónyuge"]) expect(html).toContain(text);
    expect(html).not.toContain("1.900.000");
    expect(html).not.toContain("co_debtor_confirmation_id");
  });
  it.each([
    ["individual", "Evaluación individual"],
    ["declared_complement", "Complemento declarado, sin confirmación utilizada"],
    ["unverifiable_origin", "Origen de los antecedentes no verificable"],
  ])("presents %s without a confirmed capacity card even when amounts exist", (type, label) => {
    const html = render(projection({ evaluation_type: type }));
    expect(html).toContain(label);
    expect(html).not.toContain("Capacidad Bipersonal");
    expect(html).not.toContain("92.000.000");
  });
  it.each([[200, 8000000, "aumenta"], [0, 0, "no modifica"], [-200, -8000000, "reduce"]])("preserves signed contribution %s", (units, pesos, text) => {
    const value = projection(); value.capacity.delta = { purchase_capacity_uf: units, purchase_capacity_clp: pesos };
    const html = render(value);
    expect(html).toContain(`${units} UF`);
    expect(html).toContain(text);
    if (pesos < 0) expect(html).toContain("$-8.000.000");
    if (pesos === 0) expect(html).toContain("$0");
  });
  it("allows explicit incorporation only for backend pending flag", () => {
    expect(render(projection({ update_required: true }))).toContain("Actualizar score con datos confirmados");
    expect(render(projection())).not.toContain("Actualizar score");
    expect(render(projection({ update_required: true }), { updating: true })).toContain('disabled=""');
  });
  it("shows coincident later confirmation without an unnecessary action", () => {
    const html = render(projection({ matching_confirmed_later: true, update_required: true }));
    expect(html).toContain("Los antecedentes fueron confirmados posteriormente y coinciden con los utilizados en esta evaluación.");
    expect(html).not.toContain("Actualizar score");
  });
  it("hides refresh when current and offers only an error fallback", () => {
    expect(render(projection(), { onRefresh() {} })).not.toContain("Refrescar estado");
    const html = render(projection(), { error: "Error de lectura", onRefresh() {} });
    expect(html).toContain('class="text-button"');
    expect(html).toContain("Refrescar estado");
    expect(html).not.toContain("Actualizar estado de participación");
  });
  it("hides all financial details even if a hidden response contains leftover values", () => {
    const html = render(projection({ visibility: "hidden", status: "revoked", warnings: ["historical_consent_revoked", "historical_details_hidden"] }));
    expect(html).toContain("ocultos por privacidad");
    expect(html).toContain("histórica — consentimiento revocado");
    for (const secret of ["1.200.000", "92.000.000", "200 UF", "Cónyuge"]) expect(html).not.toContain(secret);
  });
  it("displays replacement warning and the server deadline without choosing a cutoff", () => {
    const html = render(projection({ status: "replaced", warnings: ["historical_participation_replaced"], historical_visible_until: "2026-11-01T12:00:00Z" }));
    expect(html).toContain("histórica — participación reemplazada");
    expect(html).toContain("Desglose histórico disponible hasta");
    expect(html).toContain("92.000.000");
  });
  it("keeps absent optional values unknown rather than zero or derived", () => {
    const html = render(projection({ holder: {}, co_debtor: {}, capacity: null, relation: null, financial_totals: null, availability: "insufficient_data" }));
    expect(html).toContain("No disponible");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("Aporte a la capacidad por renta");
    expect(html).toContain("No hay información suficiente");
  });
  it.each([null, { version: "future", evaluation_type: "bipersonal_confirmed" }])("does not infer classification for unsupported projection", (value) => {
    expect(render(value)).toContain("no está disponible");
    expect(render(value)).not.toContain("Capacidad Bipersonal");
  });
  it("does not expose latest invitation finances or duplicate update action in management mode", () => {
    const html = renderToStaticMarkup(<CoDebtorPanel managementOnly invitation={{ status: "confirmed", confirmation: { ingreso_mensual_complementario: 9876543 } }} scoreUpdateRequired onUpdateScore={vi.fn()} />);
    expect(html).not.toContain("9.876.543");
    expect(html).not.toContain("Actualizar score");
    expect(html).toContain("participación está confirmada");
  });
});
