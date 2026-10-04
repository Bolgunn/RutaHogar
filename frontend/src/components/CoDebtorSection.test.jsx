import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CoDebtorPanel } from "./CoDebtorSection";
import { runExclusive } from "../services/coDebtorService";

const declaredProps = {
  declaredComplement: true,
  declaredRelation: "pareja_conviviente",
  email: "",
  onEmailChange: vi.fn(),
  onInvite: vi.fn(),
  onUpdateScore: vi.fn(),
};

const confirmed = {
  status: "confirmed",
  recipientEmail: "co.deudor@correo.cl",
  confirmation: {
    ingreso_mensual_complementario: 1400000,
    deuda_mensual_complementario: 120000,
    tipo_contrato_complementario: "indefinido",
    continuidad_laboral_complementario: "mas_3_anios",
    morosidad_complementario: "no",
  },
};

function render(invitation, props = {}) {
  return renderToStaticMarkup(<CoDebtorPanel {...declaredProps} invitation={invitation} {...props} />);
}

describe("HU18 lead co-debtor section", () => {
  it("renders an invitation form when the lead declared complementary income but has no invitation", () => {
    const html = render(null);

    expect(html).toContain("Correo del co-deudor");
    expect(html).toContain("Enviar invitación");
    expect(html).toContain("completar y autorizar sus propios antecedentes");
  });

  it("renders pending and expired invitations as not confirmed", () => {
    const pending = render({ status: "pending", recipientEmail: "co.deudor@correo.cl", expiresAt: "2026-10-10T12:00:00Z" });
    const expired = render({ status: "expired", recipientEmail: "co.deudor@correo.cl", expiresAt: "2026-10-03T12:00:00Z" });

    expect(pending).toContain("Pendiente de confirmación");
    expect(pending).toContain("No confirmado");
    expect(pending).toContain("Enviar nueva invitación");
    expect(expired).toContain("Invitación expirada");
    expect(expired).toContain("No confirmado");
  });

  it("shows the update action and the five confirmed values only for a valid confirmation", () => {
    const html = render(confirmed);
    const incomplete = render({ status: "confirmed", recipientEmail: "co.deudor@correo.cl", confirmation: null });

    expect(html).toContain("Actualizar score con datos confirmados");
    expect(html).toContain("1.400.000");
    expect(html).toContain("120.000");
    expect(html).toContain("Pareja conviviente");
    expect(incomplete).not.toContain("Actualizar score con datos confirmados");
  });

  it("hides confirmed financial values and the update action after revocation", () => {
    const html = render({
      ...confirmed,
      status: "revoked",
      token_digest: "invitation-secret",
      management_token: "management-secret",
    });

    expect(html).toContain("Consentimiento revocado");
    expect(html).not.toContain("Actualizar score con datos confirmados");
    expect(html).not.toContain("1.400.000");
    expect(html).not.toContain("invitation-secret");
    expect(html).not.toContain("management-secret");
  });

  it("disables the update button while a confirmed-score update is in progress", () => {
    const html = render(confirmed, { updatingScore: true });

    expect(html).toContain("Actualizando score...");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Actualizando score/);
  });

  it("shares one in-flight update operation to prevent a double submission", async () => {
    const lock = { current: null };
    let resolve;
    const operation = vi.fn(() => new Promise((done) => { resolve = done; }));

    const first = runExclusive(lock, operation);
    const second = runExclusive(lock, operation);
    await Promise.resolve();
    expect(first).toBe(second);
    expect(operation).toHaveBeenCalledTimes(1);

    resolve("done");
    await expect(first).resolves.toBe("done");
    expect(lock.current).toBeNull();
  });
});
