import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ signup: vi.fn(), signin: vi.fn(), session: vi.fn(), user: vi.fn(),
  profile: vi.fn(), ensure: vi.fn() }));
vi.mock("../../utils/supabase", () => ({ supabase: { auth: { signUp: mocks.signup,
  signInWithPassword: mocks.signin, getSession: mocks.session, getUser: mocks.user } } }));
vi.mock("../profileService", () => ({ isSupabaseDataConfigured: true, ensureUserProfile: mocks.ensure,
  getCurrentProfile: mocks.profile, logSupabaseError: vi.fn(), normalizeBirthDateForStorage: value => value,
  normalizePhoneForStorage: value => value, normalizeRole: value => value }));
import { signUp, signIn, restoreInvitationSession } from "../auth";
const nonce = "f3000000-0000-0000-0000-000000000001";
const user = { id: "account", email: "own@example.test", user_metadata: { rut: "12345678-5" } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { origin: "https://rutahogar.test" } });
  vi.stubGlobal("localStorage", { setItem: vi.fn(), getItem: vi.fn() });
  mocks.profile.mockResolvedValue({ id: "account", role: "usuario", rut: "12345678-5" });
});
it("registration without a session waits for email verification without attempting RLS profile writes", async () => {
  mocks.signup.mockResolvedValue({ data: { user, session: null } });
  expect(await signUp({ email: user.email, password: "password", invitationContext: nonce }))
    .toEqual({ session: null, profile: null, emailConfirmationRequired: true });
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.ensure).not.toHaveBeenCalled();
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(mocks.signup.mock.calls[0][0].options.emailRedirectTo)
    .toBe(`https://rutahogar.test/co-deudor/invitacion?context=${nonce}`);
});
it("registration with a session and existing login use the usual Auth/profile contract", async () => {
  mocks.signup.mockResolvedValue({ data: { user, session: { user } } });
  mocks.signin.mockResolvedValue({ data: { user, session: { user } } });
  expect((await signUp({ email: user.email, password: "password", invitationContext: nonce })).session).toBeTruthy();
  expect((await signIn({ email: user.email, password: "password" })).profile.rut).toBe("12345678-5");
});
it("restores the callback session and completes a profile only after authentication", async () => {
  mocks.session.mockResolvedValue({ data: { session: { user } } });
  mocks.user.mockResolvedValue({ data: { user } });
  mocks.profile.mockResolvedValue(null);
  mocks.ensure.mockResolvedValue({ id: user.id, rut: "12345678-5", role: "usuario" });
  expect((await restoreInvitationSession()).session).toBeTruthy();
  expect(mocks.ensure).toHaveBeenCalledWith(user);
});
it("never trusts a stored session rejected by Auth on callback", async () => {
  mocks.session.mockResolvedValue({ data: { session: { user } } });
  mocks.user.mockResolvedValue({ error: { message: "expired" } });
  expect(await restoreInvitationSession()).toBeNull();
  expect(mocks.ensure).not.toHaveBeenCalled();
});

it("shows email verification pending when Auth rejects an unconfirmed login", async () => {
  mocks.signin.mockResolvedValue({ error: { code: "email_not_confirmed" } });
  expect(await signIn({ email: user.email, password: "password" }))
    .toEqual({ session: null, profile: null, emailConfirmationRequired: true });
  expect(mocks.profile).not.toHaveBeenCalled();
});
