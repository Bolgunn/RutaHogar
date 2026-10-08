import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ExecutiveCoDebtorSection } from "./ExecutiveCoDebtorSection";

const confirmed = {
  status: "confirmed",
  source: "co_debtor_confirmed",
  confirmed: {
    ingreso_mensual_complementario: 1400000,
    deuda_mensual_complementario: 120000,
    tipo_contrato_complementario: "indefinido",
    continuidad_laboral_complementario: "mas_3_anios",
    morosidad_complementario: "no",
  },
  relation: { value: "pareja_conviviente", source: "lead_declared" },
};

function render(coDebtor) {
  return renderToStaticMarkup(<ExecutiveCoDebtorSection coDebtor={coDebtor} />);
}

describe("HU18 executive co-debtor section", () => {
  it("does not render a section without a complementary participant", () => {
    expect(render(null)).toBe("");
  });

  it.each([
    ["not_confirmed", "No confirmado"],
    ["pending", "Pendiente de confirmación"],
    ["expired", "Invitación expirada"],
  ])("labels %s as lead-declared data without confirmed fields", (status, label) => {
    const html = render({ status, source: "lead_declared" });

    expect(html).toContain(label);
    expect(html).toContain("Datos declarados por el lead");
    expect(html).not.toContain("Ingreso mensual");
    expect(html).not.toContain("Antecedentes aportados por el co-deudor");
  });

  it("shows exactly the five currently consented fields and lead-declared relation", () => {
    const html = render(confirmed);

    expect(html).toContain("Co-deudor confirmado");
    expect(html).toContain("Antecedentes aportados por el co-deudor");
    expect(html).toContain("$1.400.000");
    expect(html).toContain("$120.000");
    expect(html).toContain("Contrato indefinido");
    expect(html).toContain("Más de 3 años");
    expect(html).toContain("No");
    expect(html).toContain("Relación");
    expect(html).toContain("Declarada por el lead");
  });

  it("removes all values and technical identifiers after revocation", () => {
    const html = render({
      status: "revoked",
      source: "excluded_after_revocation",
      confirmed: confirmed.confirmed,
      relation: confirmed.relation,
      token_digest: "must-never-render",
      invitation_id: "technical-id",
    });

    expect(html).toContain("Consentimiento revocado");
    expect(html).toContain("ya no están disponibles");
    expect(html).not.toContain("Ingreso mensual");
    expect(html).not.toContain("1.400.000");
    expect(html).not.toContain("must-never-render");
    expect(html).not.toContain("technical-id");
  });
});
