import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("../../utils/supabase", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { getTracking } from "../trackingService";

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
});
