import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ScoreForm from "./ScoreForm";
import { buildFinancialInput } from "../App";

const baseProps = {
  targetCommune: "Valparaíso",
  objective: "comprar_ahora",
  onboardingData: { comuna_interes: "Valparaíso" },
  birthDate: "1990-01-01",
  consentGranted: true,
  onResult: vi.fn(),
  onConsentAccept: vi.fn(),
};

function render(form) {
  return renderToStaticMarkup(<ScoreForm {...baseProps} initialDraft={{ currentStep: 3, form }} />);
}

describe("HU18 co-debtor fields in Precalificación", () => {
  it("shows RUT and email only when the lead enables complementary income", () => {
    const enabled = render({ complemento_renta: true });
    const disabled = render({ complemento_renta: false });

    expect(enabled).toContain("RUT del co-deudor");
    expect(enabled).toContain("Correo del co-deudor");
    expect(disabled).not.toContain("RUT del co-deudor");
    expect(disabled).not.toContain("Correo del co-deudor");
  });

  it("keeps complementary delinquency required without exposing score-gaming copy", () => {
    const html = render({ complemento_renta: true, morosidad_complementario: "si" });

    expect(html).toContain('id="morosidad_complementario"');
    expect(html).not.toContain("no se considerará válida para mejorar el score orientativo");
  });

  it("excludes lead-declared invitation metadata from persisted scoring input", () => {
    const input = buildFinancialInput({
      complemento_renta: true,
      ingreso_mensual_complementario: 900000,
      deuda_mensual_complementario: 100000,
      rut_codeudor: "12345678-5",
      correo_codeudor: "co.deudor@correo.cl",
    });

    expect(input).not.toHaveProperty("rut_codeudor");
    expect(input).not.toHaveProperty("correo_codeudor");
    expect(input).toMatchObject({ complemento_renta: true, ingreso_mensual_complementario: 900000 });
  });

  it("adds every preliminary answer as an immutable evaluation snapshot", () => {
    const input = buildFinancialInput({}, {
      objetivo_principal: "comprar_ahora", tipo_propiedad: "casa", comuna_interes: "La Pintana",
      comuna_alternativa: "La Reina", plazo_compra: "6_12_meses", tiene_propiedad_vista: true,
    });

    expect(input.onboarding_snapshot).toEqual({
      objetivo_principal: "comprar_ahora", tipo_propiedad: "casa", comuna_interes: "La Pintana",
      comuna_alternativa: "La Reina", plazo_compra: "6_12_meses", tiene_propiedad_vista: true,
    });
  });
});
