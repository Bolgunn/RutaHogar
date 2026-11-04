import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ data: null, loading: true, error: "", refresh: vi.fn() }));
vi.mock("../hooks/useStaffProjectionRead", () => ({ default: () => mock }));
import LeadDetailModal from "./LeadDetailModal";
const contact = { id: "stale-eval", user_id: "lead-a", full_name: "Lead A", input: { ingreso_mensual_complementario: 9876543 }, result: { score: 99, financial_indicators: { ingreso_total: 12345678 } } };
function response(extra = {}) { return { evaluation: { id: "new-eval", user_id: "lead-a", financial_data: { input: { ingreso_mensual: 1800000 }, result: { score: 60, classification: "Medio" } } }, co_debtor: { version: "hu30-projection-v1", evaluation_type: "bipersonal_confirmed", status: "revoked", visibility: "hidden", warnings: ["historical_details_hidden"], holder: { income: 1800000 } }, history: [], ...extra }; }
afterEach(() => { Object.assign(mock, { data: null, loading: true, error: "" }); });
describe("HU30 authorized lead detail integration", () => {
  it("does not expose the list snapshot while reading the authorized detail", () => {
    const html = renderToStaticMarkup(<LeadDetailModal lead={contact} onClose={vi.fn()} />);
    expect(html).toContain("Consultando expediente autorizado");
    expect(html).not.toContain("12.345.678"); expect(html).not.toContain("9.876.543");
  });
  it("uses the authorized evaluation and projection without restoring stale list/history values", () => {
    Object.assign(mock, { data: response(), loading: false });
    const html = renderToStaticMarkup(<LeadDetailModal lead={contact} evaluations={[contact]} onClose={vi.fn()} />);
    expect(html).toContain("ocultos por privacidad"); expect(html).toContain("Lead A"); expect(html).toContain("Bipersonal confirmado");
    expect(html).not.toContain("12.345.678"); expect(html).not.toContain("9.876.543");
  });
  it("does not show another lead's response after a selection change", () => {
    Object.assign(mock, { data: response(), loading: false });
    const html = renderToStaticMarkup(<LeadDetailModal lead={{ id: "other", user_id: "lead-b" }} onClose={vi.fn()} />);
    expect(html).not.toContain("Lead A"); expect(html).not.toContain("1.800.000"); expect(html).toContain("No hay una evaluación disponible");
  });
  it("keeps a denied/failed read closed instead of using historical fallbacks", () => {
    Object.assign(mock, { data: null, loading: false, error: "No pudimos consultar la información vigente." });
    const html = renderToStaticMarkup(<LeadDetailModal lead={contact} evaluations={[contact]} onClose={vi.fn()} />);
    expect(html).toContain("No pudimos consultar"); expect(html).not.toContain("9.876.543");
  });
});
