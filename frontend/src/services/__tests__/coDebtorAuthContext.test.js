import { beforeEach, expect, it, vi } from "vitest";
import { captureInvitationContext, invitationReturnPath, invitationEmailRedirect } from "../coDebtorAuthContext";
const TOKEN = "a".repeat(43);
let storage, history;
beforeEach(() => {
  const values = new Map();
  storage = { get length() { return values.size; }, key: index => [...values.keys()][index], setItem: (key, value) => values.set(key, value), getItem: key => values.get(key), removeItem: key => values.delete(key) };
  history = { replaceState: vi.fn() };
  vi.stubGlobal("window", { location: { origin: "https://rutahogar.test" } });
});
it("keeps only the capability and random context locally, and strips the token from the return URL", () => {
  const ctx = captureInvitationContext({ search: `?token=${TOKEN}&next=https://evil.test`, hash: "" }, storage, history, 100);
  expect(history.replaceState).toHaveBeenCalledWith(null, "", invitationReturnPath(ctx.nonce));
  expect(invitationEmailRedirect(ctx.nonce)).not.toContain(TOKEN);
  expect(invitationEmailRedirect(ctx.nonce)).toBe(`https://rutahogar.test/co-deudor/invitacion?context=${ctx.nonce}`);
  // Email link opened in another tab of the same browser uses the shared context.
  expect(captureInvitationContext({ search: `?context=${ctx.nonce}`, hash: "" }, storage, history, 101)).toEqual(ctx);
});
it.each(["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "%2f%2fevil.test"])("rejects redirect/context injection: %s", value => {
  expect(invitationReturnPath(value)).toBeNull();
  expect(() => invitationEmailRedirect(value)).toThrow();
});
it("fails closed for another context, corrupt storage, or an expired browser context", () => {
  const ctx = captureInvitationContext({ search: `?token=${TOKEN}` }, storage, history, 100);
  expect(captureInvitationContext({ search: "?context=manipulated" }, storage, history, 101)).toBeNull();
  expect(captureInvitationContext({ search: `?context=${ctx.nonce}` }, storage, history, 86400100)).toBeNull();
  expect(captureInvitationContext({ search: `?context=${ctx.nonce}` }, { getItem: () => "corrupt" }, history)).toBeNull();
});
it("preserves independent return contexts when the same invitation is opened in two tabs", () => {
  const first = captureInvitationContext({ search: `?token=${TOKEN}` }, storage, history, 100);
  const second = captureInvitationContext({ search: `?token=${TOKEN}` }, storage, history, 101);
  expect(first.nonce).not.toBe(second.nonce);
  expect(captureInvitationContext({ search: `?context=${first.nonce}` }, storage, history, 102)).toEqual(first);
  expect(captureInvitationContext({ search: `?context=${second.nonce}` }, storage, history, 102)).toEqual(second);
});

it("prunes abandoned expired contexts while retaining a fresh return context", () => {
  const expired = captureInvitationContext({ search: `?token=${TOKEN}` }, storage, history, 100);
  const current = captureInvitationContext({ search: `?token=${TOKEN}` }, storage, history, 86400100);
  expect(storage.length).toBe(1);
  expect(captureInvitationContext({ search: `?context=${expired.nonce}` }, storage, history, 86400101)).toBeNull();
  expect(captureInvitationContext({ search: `?context=${current.nonce}` }, storage, history, 86400101)).toEqual(current);
});
