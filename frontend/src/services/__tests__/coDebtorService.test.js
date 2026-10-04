import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn() }));

vi.mock("../../utils/supabase", () => ({
  supabase: { from: mocks.from, functions: { invoke: mocks.invoke } },
}));

import {
  CO_DEBTOR_TREATMENT_CONSENT_VERSION,
  createCoDebtorInvitation,
  getLeadCoDebtorInvitation,
  inspectCoDebtorInvitation,
  inspectCoDebtorManagement,
  normalizeLeadCoDebtorInvitation,
  readPublicCoDebtorToken,
  revokeCoDebtorManagement,
  submitCoDebtorConfirmation,
} from "../coDebtorService";

function invitationQuery(result) {
  const query = {};
  for (const name of ["select", "order", "limit"]) query[name] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  return query;
}

describe("HU18 lead co-debtor service", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.invoke.mockReset();
  });

  it("reads only the lead-visible invitation fields and normalizes an expired pending invitation", async () => {
    const query = invitationQuery({ data: {
      recipient_email: "co.deudor@correo.cl", status: "pending",
      expires_at: "2026-10-03T12:00:00Z", created_at: "2026-09-26T12:00:00Z",
    }, error: null });
    mocks.from.mockReturnValue(query);

    const invitation = await getLeadCoDebtorInvitation();

    expect(mocks.from).toHaveBeenCalledWith("co_debtor_invitations");
    expect(query.select.mock.calls[0][0]).not.toContain("token");
    expect(query.select.mock.calls[0][0]).not.toContain("digest");
    expect(invitation).toEqual({
      recipientEmail: "co.deudor@correo.cl", status: "expired",
      expiresAt: "2026-10-03T12:00:00Z", confirmation: null,
    });
  });

  it("keeps confirmed values available only while the invitation remains confirmed", () => {
    const raw = {
      recipient_email: "co.deudor@correo.cl", status: "confirmed", expires_at: "2026-10-10T12:00:00Z",
      co_debtor_confirmations: [{ ingreso_mensual_complementario: 900000 }],
    };

    expect(normalizeLeadCoDebtorInvitation(raw)).toEqual(expect.objectContaining({
      status: "confirmed", confirmation: { ingreso_mensual_complementario: 900000 },
    }));
    expect(normalizeLeadCoDebtorInvitation({ ...raw, status: "revoked" })).toEqual(expect.objectContaining({
      status: "revoked", confirmation: null,
    }));
  });

  it("validates the recipient email before calling the Edge Function", async () => {
    await expect(createCoDebtorInvitation("correo-invalido"))
      .rejects.toThrow("Ingresa un correo válido para el co-deudor.");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("sends a lead invitation through the existing co-debtor Edge Function", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "pending", expires_at: "2026-10-11T12:00:00Z", email_sent: true }, error: null });

    await expect(createCoDebtorInvitation("  CO.DEUDOR@Correo.cl ")).resolves.toEqual(expect.objectContaining({ status: "pending" }));
    expect(mocks.invoke).toHaveBeenCalledWith("co-debtor-consent", {
      body: { action: "create_invitation", recipient_email: "co.deudor@correo.cl" },
    });
  });

  it("uses public invitation inspection without requiring an authenticated session", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "pending", expires_at: "2026-10-10T12:00:00Z", can_submit: true }, error: null });

    await expect(inspectCoDebtorInvitation("invitation-token")).resolves.toEqual(expect.objectContaining({ can_submit: true }));
    expect(mocks.invoke).toHaveBeenCalledWith("co-debtor-consent", {
      body: { action: "inspect_invitation", token: "invitation-token" },
    });
  });

  it("normalizes an invalid public link without exposing a function transport error", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: {
      context: { status: 404, clone: () => ({ json: async () => ({ status: "invalid", can_submit: false }) }) },
    } });

    await expect(inspectCoDebtorInvitation("bad-token")).resolves.toEqual({ status: "invalid", can_submit: false });
  });

  it("submits exactly the five permitted financial fields and separate consent", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "confirmed" }, error: null });
    const values = {
      ingreso_mensual_complementario: "900000",
      deuda_mensual_complementario: "100000",
      tipo_contrato_complementario: "indefinido",
      continuidad_laboral_complementario: "mas_3_anios",
      morosidad_complementario: "no",
      relacion_complementario: "pareja_conviviente",
    };

    await submitCoDebtorConfirmation("invitation-token", values);

    expect(mocks.invoke).toHaveBeenCalledWith("co-debtor-consent", {
      body: {
        action: "submit_confirmation", token: "invitation-token",
        ingreso_mensual_complementario: "900000", deuda_mensual_complementario: "100000",
        tipo_contrato_complementario: "indefinido", continuidad_laboral_complementario: "mas_3_anios",
        morosidad_complementario: "no", treatment_consent: true,
        treatment_consent_version: CO_DEBTOR_TREATMENT_CONSENT_VERSION,
      },
    });
  });

  it("uses the public management contract and preserves idempotent revocation responses", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { status: "confirmed", can_revoke: true }, error: null });
    await expect(inspectCoDebtorManagement("management-token")).resolves.toEqual({ status: "confirmed", can_revoke: true });

    mocks.invoke.mockResolvedValueOnce({ data: { status: "revoked", already_revoked: true }, error: null });
    await expect(revokeCoDebtorManagement("management-token")).resolves.toEqual({ status: "revoked", already_revoked: true });
    expect(mocks.invoke).toHaveBeenLastCalledWith("co-debtor-consent", {
      body: { action: "revoke_management", token: "management-token" },
    });
  });

  it("reads a public token only from the current URL query string", () => {
    expect(readPublicCoDebtorToken("?token=only-in-memory")).toBe("only-in-memory");
    expect(readPublicCoDebtorToken("")).toBe("");
  });
});
