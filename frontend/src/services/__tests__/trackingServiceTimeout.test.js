import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../../utils/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { appendTrackingEvent, getTracking } from "../trackingService";

describe("HU13 tracking transport timeout", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    mocks.getSession.mockReset();
  });

  it("settles a stalled GET /tracking as a controlled error", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token" } }, error: null });
    globalThis.fetch = () => new Promise(() => {});

    await expect(getTracking({ timeoutMs: 5 }))
      .rejects.toEqual(expect.objectContaining({ name: "RequestTimeoutError", message: "El seguimiento tardó demasiado. Intenta nuevamente." }));
  });
  it("does not send a previous account's evaluation using a new session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token-b", user: { id: "b" } } }, error: null });
    globalThis.fetch = vi.fn();
    await expect(appendTrackingEvent({ input: { ingreso_mensual: 1500000 } }, { expectedUserId: "a" })).rejects.toThrow("La cuenta cambió");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
