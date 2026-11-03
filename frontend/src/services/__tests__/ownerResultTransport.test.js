import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("../../utils/supabase", () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
import { updateScoreWithConfirmedCoDebtor } from "../trackingService";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("HU30 owner action dispatch", () => {
  it("does not send the old owner's action under a new account's session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test", user: { id: "new-owner" } } } });
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(updateScoreWithConfirmedCoDebtor({ expectedUserId: "old-owner" })).rejects.toThrow("La cuenta cambió");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends the explicit action with the expected session and no financial payload", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "test", user: { id: "owner" } } } });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ evaluation: { id: "e2" } }), { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(updateScoreWithConfirmedCoDebtor({ expectedUserId: "owner" })).resolves.toEqual({ evaluation: { id: "e2" } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: "{}", headers: { Authorization: "Bearer test" } });
  });
});
