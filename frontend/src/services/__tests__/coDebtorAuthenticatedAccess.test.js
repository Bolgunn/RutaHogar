import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), authorize: vi.fn(), restore: vi.fn() }));
vi.mock("../coDebtorService", () => ({ inspectCoDebtorInvitation: mocks.inspect, authorizeCoDebtorInvitation: mocks.authorize }));
vi.mock("../auth", () => ({ restoreInvitationSession: mocks.restore }));
import { loadInvitationAccess } from "../coDebtorAccess";
const context = { token: "secret-invitation" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.inspect.mockResolvedValue({ status: "pending" });
  mocks.restore.mockResolvedValue({ session: { access_token: "session" } });
  mocks.authorize.mockResolvedValue({ authorized: true });
});
it("authorizes an existing session without submitting financial data", async () => {
  expect(await loadInvitationAccess(context)).toEqual({ phase: "authorized", expiresAt: undefined });
  expect(mocks.authorize).toHaveBeenCalledWith(context.token);
});
it("asks for login/registration, then revalidates after login or email confirmation", async () => {
  mocks.restore.mockResolvedValueOnce(null);
  expect(await loadInvitationAccess(context)).toEqual({ phase: "authentication" });
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect((await loadInvitationAccess(context)).phase).toBe("authorized");
  expect(mocks.inspect).toHaveBeenCalledTimes(2);
});
it.each(["expired", "replaced", "revoked", "declined", "confirmed", "invalid"])("blocks %s on return without linking", async status => {
  mocks.inspect.mockResolvedValue({ status });
  expect(await loadInvitationAccess(context)).toEqual({ phase: "unavailable" });
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it.each([[401, "unauthenticated", "authentication"], [403, "participant_identity_mismatch", "wrong_account"],
  [403, "email_confirmation_required", "verification"], [409, "invitation_unavailable", "unavailable"]])(
  "handles revalidation at the binding boundary (%s, %s)", async (status, code, phase) => {
    mocks.authorize.mockRejectedValue({ status, payload: { code } });
    expect(await loadInvitationAccess(context)).toEqual({ phase });
  });
it("blocks a replacement/revocation that occurs after inspection but before binding", async () => {
  mocks.authorize.mockRejectedValue({ status: 409 });
  expect((await loadInvitationAccess(context)).phase).toBe("unavailable");
});
