import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoDebtorInvitationView, CoDebtorManagementView } from "./PublicCoDebtorPages";

const confirmation = {
  ingreso_mensual_complementario: "900000",
  deuda_mensual_complementario: "100000",
  tipo_contrato_complementario: "indefinido",
  continuidad_laboral_complementario: "mas_3_anios",
  morosidad_complementario: "no",
  treatment_consent: true,
};

const invitationHandlers = {
  onChange: vi.fn(), onSubmit: vi.fn(),
};

function invitation(context, props = {}) {
  return renderToStaticMarkup(<CoDebtorInvitationView
    {...invitationHandlers}
    context={context}
    loading={false}
    confirmation={confirmation}
    busy={false}
    error=""
    submitted={false}
    {...props}
  />);
}

function management(context, props = {}) {
  return renderToStaticMarkup(<CoDebtorManagementView
    context={context}
    loading={false}
    confirmRevoke={false}
    onStartRevoke={vi.fn()}
    onCancelRevoke={vi.fn()}
    onConfirmRevoke={vi.fn()}
    busy={false}
    error=""
    {...props}
  />);
}

describe("HU18 public co-debtor invitation", () => {
  it("treats a missing or invalid token as a generic unavailable link", () => {
    const html = invitation({ status: "invalid", can_submit: false, lead_email: "lead@example.com" });

    expect(html).toContain("No podemos usar este enlace");
    expect(html).not.toContain("lead@example.com");
    expect(html).not.toContain("co-debtor-income");
  });

  it("renders exactly the five financial fields and separate mandatory consent for a valid invitation", () => {
    const html = invitation({ status: "pending", can_submit: true, token: "invitation-secret", lead_name: "No mostrar" });

    for (const field of [
      "ingreso_mensual_complementario", "deuda_mensual_complementario", "tipo_contrato_complementario",
      "continuidad_laboral_complementario", "morosidad_complementario",
    ]) expect(html).toContain(`name="${field}"`);
    expect(html).toContain('name="treatment_consent"');
    expect(html).not.toContain("relacion_complementario");
    expect(html).not.toContain("invitation-secret");
    expect(html).not.toContain("No mostrar");
    expect(html).not.toContain("teléfono");
    expect(html).toContain("Confirmar mis antecedentes");
  });

  it("shows no form for expired, confirmed, or replaced invitations", () => {
    const expired = invitation({ status: "expired", can_submit: false });
    const confirmed = invitation({ status: "confirmed", can_submit: false });
    const replaced = invitation({ status: "replaced", can_submit: false });

    expect(expired).toContain("Este enlace ya expiró");
    expect(confirmed).toContain("Ya registraste tus antecedentes");
    expect(replaced).toContain("No podemos usar este enlace");
    for (const html of [expired, confirmed, replaced]) expect(html).not.toContain("Confirmar mis antecedentes");
  });

  it("renders a loading submission state that disables a second confirmation", () => {
    const html = invitation({ status: "pending", can_submit: true }, { busy: true });

    expect(html).toContain("Registrando antecedentes...");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Registrando antecedentes/);
  });
});

describe("HU18 public consent management", () => {
  it("shows a confirmed consent without financial data and requires a confirmation step to revoke", () => {
    const html = management({ status: "confirmed", can_revoke: true, ingreso_mensual_complementario: 900000 });
    const confirmation = management({ status: "confirmed", can_revoke: true }, { confirmRevoke: true });

    expect(html).toContain("Tu participación está activa");
    expect(html).toContain("Revocar mi consentimiento");
    expect(html).not.toContain("900000");
    expect(confirmation).toContain("¿Quieres revocar tu consentimiento?");
    expect(confirmation).toContain("Confirmar revocación");
  });

  it("hides the management CTA and all financial values after revocation", () => {
    const html = management({ status: "revoked", can_revoke: false, management_token: "secret", deuda_mensual_complementario: 100000 });

    expect(html).toContain("Consentimiento revocado");
    expect(html).not.toContain("Revocar mi consentimiento");
    expect(html).not.toContain("100000");
    expect(html).not.toContain("secret");
  });

  it("shows a generic message for an invalid management token", () => {
    const html = management({ status: "invalid", can_revoke: false, recipient_email: "external@example.com" });

    expect(html).toContain("No podemos usar este enlace");
    expect(html).not.toContain("external@example.com");
  });
});
