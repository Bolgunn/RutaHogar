import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutiveCoDebtorSection } from "./ExecutiveCoDebtorSection";
const fixture = (changes = {}) => ({ version: "hu30-projection-v1", evaluation_type: "bipersonal_confirmed", status: "confirmed", visibility: "visible", source: "co_debtor_confirmed",
  holder: { income: 1800000, debt: 100000, contract: "indefinido" },
  co_debtor: { income: 1900000, income_considered: 1400000, debt_considered: 120000, contract: "plazo_fijo", delinquency: "no" },
  relation: { value: "conyuge" }, capacity: { without_complement: { purchase_capacity_uf: 2100 }, with_complement: { purchase_capacity_clp: 92000000, purchase_capacity_uf: 2300 }, delta: { purchase_capacity_clp: 8000000, purchase_capacity_uf: 200, income_capacity_clp: 12000000, income_capacity_uf: 300 } }, ...changes });
const render = (value) => renderToStaticMarkup(<ExecutiveCoDebtorSection coDebtor={value} />);

describe("HU30 executive financial projection (replaces HU18 current-confirmation view)", () => {
  it("presents only considered holder/co-debtor figures and the used relation", () => {
    const html = render(fixture());
    for (const text of ["Titular", "Co-deudor", "1.800.000", "1.400.000", "100.000", "120.000", "Contrato indefinido", "Contrato a plazo fijo", "Morosidad", "Cónyuge", "utilizados en esta evaluación"]) expect(html).toContain(text);
    expect(html).not.toContain("1.900.000");
  });
  it.each(["pending", "expired", "declined", "revoked", "replaced"])("labels participation %s without treating its status as evaluation classification", (status) => {
    const html = render(fixture({ status }));
    expect(html).toContain("Bipersonal confirmado");
    const labels = { pending: "Invitación pendiente", expired: "Invitación expirada", declined: "Participación rechazada", revoked: "Consentimiento revocado", replaced: "Participación reemplazada" };
    expect(html).toContain(labels[status]);
  });
  it.each(["revoked", "replaced"])("keeps historical detail visible for %s when backend allows it", (status) => {
    const warning = status === "revoked" ? "historical_consent_revoked" : "historical_participation_replaced";
    const html = render(fixture({ status, warnings: [warning], historical_visible_until: "2026-11-01T12:00:00Z" }));
    expect(html).toContain("histórica"); expect(html).toContain("1.400.000"); expect(html).toContain("disponible hasta");
  });
  it.each([[200, 8000000], [0, 0], [-200, -8000000]])("preserves contribution %s UF without recomputing", (uf, clp) => {
    const value = fixture(); value.capacity.delta = { purchase_capacity_uf: uf, purchase_capacity_clp: clp };
    const html = render(value); expect(html).toContain(`${uf} UF`);
    expect(html).toContain(clp < 0 ? "$-8.000.000" : clp === 0 ? "$0" : "$8.000.000");
  });
  it.each(["individual", "declared_complement", "unverifiable_origin"])("does not upgrade %s using raw fields or confirmed status", (evaluation_type) => {
    const html = render(fixture({ evaluation_type, co_debtor: null, capacity: null }));
    expect(html).not.toContain("Bipersonal confirmado"); expect(html).not.toContain("1.400.000"); expect(html).toContain("no disponible");
  });
  it("uses only supplied risk codes, severity and scope, never a blanket co-debtor attribution", () => {
    const html = render(fixture({ risks: [{ code: "complemento_debil", severity: "low", scope: "co_debtor" }, { code: "pie_insuficiente", severity: "high", scope: "evaluation" }] }));
    expect(html).toContain("Complemento de renta débil"); expect(html).toContain("Pie insuficiente");
    expect(html).toContain("is-info"); expect(html).toContain("is-warning"); expect(html).toContain("Evaluación");
    expect(html).not.toContain("complemento_debil"); expect(html).not.toContain("Morosidad vigente");
  });
  it("does not invent severity or expose unknown technical codes", () => {
    const html = render(fixture({ risks: [{ code: "secret_internal_code", severity: null, scope: null }] }));
    expect(html).toContain("Severidad no informada"); expect(html).toContain("is-neutral"); expect(html).not.toContain("secret_internal_code");
  });
  it.each([true, false, undefined, 1])("exposes other participations only for strict true (%s)", (flag) => {
    const html = render(fixture({ has_other_active_participations: flag, other_participations: [{ id: "foreign-secret", count: 99 }] }));
    expect(html.includes("Posee otras participaciones confirmadas vigentes")).toBe(flag === true);
    expect(html).not.toContain("foreign-secret"); expect(html).not.toContain("99");
  });
  it("redacts residual co-debtor data, relations, capacities, risks and other participation signals", () => {
    const html = render(fixture({ visibility: "hidden", warnings: ["historical_details_hidden"], has_other_active_participations: true, risks: [{ code: "pie_insuficiente", severity: "high" }], used_revision: { id: "revision-secret" } }));
    for (const secret of ["1.400.000", "120.000", "Cónyuge", "92.000.000", "200 UF", "Pie insuficiente", "Posee otras", "revision-secret"]) expect(html).not.toContain(secret);
    expect(html).toContain("ocultos por privacidad"); expect(html).toContain("1.800.000");
  });
  it("shows a supplied revision number without disclosing technical reference IDs", () => {
    const html = render(fixture({ used_revision: { id: "revision-secret", revision_number: 2 } }));
    expect(html).toContain("Revisión utilizada"); expect(html).not.toContain("revision-secret");
  });
  it("keeps absent optional fields unknown without fabricating zero amounts", () => {
    const html = render(fixture({ holder: {}, co_debtor: {}, relation: null, capacity: null }));
    expect(html).toContain("No disponible"); expect(html).not.toContain("$0");
  });
  it.each([null, { status: "confirmed", confirmed: { ingreso_mensual_complementario: 999999 } }, { version: "future" }])("does not infer a projection from unsupported legacy input", (value) => {
    const html = render(value); expect(html).toContain("proyección de participación no está disponible"); expect(html).not.toContain("999.999");
  });
});
