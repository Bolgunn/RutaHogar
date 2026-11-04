import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));

vi.mock("../../utils/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession, signOut: mocks.signOut } },
}));

import { getStaffEvaluations } from "../trackingService";

const respond = (status, payload) => () => Promise.resolve(new Response(JSON.stringify(payload), {
  status, headers: { "Content-Type": "application/json" },
}));

describe("sesión revocada en el servidor", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    mocks.getSession.mockReset();
    mocks.signOut.mockReset();
  });

  it("closes the dead session locally when the backend rejects the token", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "revoked" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    globalThis.fetch = respond(401, { detail: { code: "unauthenticated" } });

    await expect(getStaffEvaluations())
      .rejects.toEqual(expect.objectContaining({ code: "unauthenticated", message: "Tu sesión expiró. Inicia sesión nuevamente." }));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("does not dispatch a staff read if the session changed after selecting its account", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "valid-b", user: { id: "staff-b" } } }, error: null });
    globalThis.fetch = vi.fn();
    await expect(getStaffEvaluations({ expectedUserId: "staff-a" })).rejects.toThrow("La cuenta cambió");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps the session on other backend errors", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "valid" } }, error: null });
    globalThis.fetch = respond(403, { detail: { code: "owner_mismatch" } });

    await expect(getStaffEvaluations()).rejects.toEqual(expect.objectContaining({ code: "owner_mismatch" }));
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
