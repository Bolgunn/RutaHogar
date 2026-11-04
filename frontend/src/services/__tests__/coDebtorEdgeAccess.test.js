import { beforeEach, expect, it, vi } from "vitest";
import { authorizeInvitationAccess } from "../../../../supabase/functions/co-debtor-consent/access.ts";
const token = "a".repeat(43);
let admin;
const request = () => new Request("https://edge.test", { headers: { Authorization: "Bearer validated-by-auth" } });
beforeEach(() => {
  admin = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "auth-user" } } })) },
    rpc: vi.fn(async () => ({ data: { authorized: true, participation_id: "participation" } })) };
});
it("gets the actor from Auth and sends only its ID plus a token digest to the linking RPC", async () => {
  const result = await authorizeInvitationAccess(request(), { action: "authorize_invitation", token }, admin);
  expect(result.status).toBe(200);
  expect(admin.auth.getUser).toHaveBeenCalledWith("validated-by-auth");
  expect(admin.rpc.mock.calls[0][1].p_actor).toBe("auth-user");
  expect(admin.rpc.mock.calls[0][1].p_token_digest).toHaveLength(64);
  expect(JSON.stringify(result)).not.toContain(token);
});
it("rejects forged actor/participation fields before persistence", async () => {
  const result = await authorizeInvitationAccess(request(), { action: "authorize_invitation", token, user_id: "other" }, admin);
  expect(result.status).toBe(409);
  expect(admin.rpc).not.toHaveBeenCalled();
});
it("denies an expired/invalid session", async () => {
  admin.auth.getUser.mockResolvedValue({ error: {} });
  expect((await authorizeInvitationAccess(request(), { token }, admin)).status).toBe(401);
  expect(admin.rpc).not.toHaveBeenCalled();
});
it.each(["participant_identity_mismatch", "email_confirmation_required", "invitation_unavailable", "sensitive unexpected database error"])(
  "exposes only an allowlisted generic error: %s", async message => {
    admin.rpc.mockResolvedValue({ error: { message } });
    const result = await authorizeInvitationAccess(request(), { token }, admin);
    expect(result.status).not.toBe(200);
    expect(JSON.stringify(result)).not.toContain("sensitive unexpected");
    expect(JSON.stringify(result)).not.toContain("validated-by-auth");
  });
