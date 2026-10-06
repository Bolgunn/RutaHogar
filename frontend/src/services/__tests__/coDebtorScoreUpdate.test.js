import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../../utils/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { updateScoreWithConfirmedCoDebtor } from "../trackingService";

describe("HU18 confirmed co-debtor score update", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    mocks.getSession.mockReset();
  });

  it("calls exactly the authenticated Step 5 endpoint", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "lead-token" } }, error: null });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ evaluation_ids: ["new-evaluation"] }),
    });

    await expect(updateScoreWithConfirmedCoDebtor()).resolves.toEqual({ evaluation_ids: ["new-evaluation"] });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/tracking\/evaluations\/co-debtor-confirmation$/),
      expect.objectContaining({ method: "POST", body: "{}", headers: expect.objectContaining({ Authorization: "Bearer lead-token" }) }),
    );
  });

  it("turns a revocation conflict into a clear message for the lead", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "lead-token" } }, error: null });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: { code: "co_debtor_consent_revoked" } }),
    });

    await expect(updateScoreWithConfirmedCoDebtor()).rejects.toEqual(expect.objectContaining({
      code: "co_debtor_consent_revoked",
      message: "El co-deudor revocó su consentimiento. Sus antecedentes ya no se pueden usar para actualizar tu score.",
    }));
  });
});
