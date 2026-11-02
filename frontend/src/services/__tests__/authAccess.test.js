import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: { getSession: vi.fn(), getUser: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), resetPasswordForEmail: vi.fn(), resend: vi.fn() }, profile: vi.fn(), ensure: vi.fn() }));
vi.mock("../../utils/supabase", () => ({ supabase: { auth: mocks.auth } }));
vi.mock("../profileService", () => ({ getCurrentProfile: mocks.profile, ensureUserProfile: mocks.ensure, normalizeBirthDateForStorage: x => x, normalizePhoneForStorage: x => x }));
import { restoreAuth, signIn, signUp, sendAccessEmail, signOut, startGoogle } from "../auth";

const user = { id: "user-a", email: "user@example.cl", email_confirmed_at: "2026-11-01", app_metadata: { provider: "email" } };
const session = { user, access_token: "test-token" };
beforeEach(() => {
  vi.resetAllMocks();
  const store = () => { const entries = new Map(); return { getItem: key => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) }; };
  vi.stubGlobal("localStorage", store()); vi.stubGlobal("sessionStorage", store()); vi.stubGlobal("window", { location: { origin: "https://www.rutahogar.cl" } });
  mocks.auth.getSession.mockResolvedValue({ data: { session } });
  mocks.auth.getUser.mockResolvedValue({ data: { user } });
  mocks.profile.mockResolvedValue({ id: user.id, role: "usuario" });
  mocks.auth.signOut.mockResolvedValue({ error: null });
});

describe("HU27 authenticated accounts", () => {
  it.each(["usuario", "ejecutivo", "admin", "admin_inmobiliario"])("preserves the server role for password login: %s", async role => {
    mocks.profile.mockResolvedValue({ id: user.id, role });
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session, user } });
    expect((await signIn({ email: " USER@example.cl ", password: "legacy" })).profile.role).toBe(role);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({ email: user.email, password: "legacy" });
  });
  it("blocks unconfirmed email before reading a private profile", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session, user: { ...user, email_confirmed_at: null } } });
    await expect(signIn({ email: user.email, password: "legacy" })).rejects.toThrow("Confirma");
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("preserves Supabase's unconfirmed-email code for the contextual resend action", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: { code: "email_not_confirmed" } });
    await expect(signIn({ email: user.email, password: "legacy" })).rejects.toMatchObject({ code: "email_not_confirmed" });
  });
  it("keeps duplicate email signup responses generic without opening a profile", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session, user: { ...user, identities: [] } } });
    expect((await signUp({ email: user.email, password: "Valid123!" })).confirmationRequired).toBe(true);
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("does not release an account when profile completion conflicts with an existing RUT", async () => {
    mocks.profile.mockResolvedValue(null);
    mocks.ensure.mockRejectedValue({ code: "23505", message: "private database detail" });
    await expect(restoreAuth()).rejects.toThrow("No pudimos cargar el perfil");
  });
  it("does not expose provider errors or credentials in login feedback", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", message: "private detail" } });
    await expect(signIn({ email: user.email, password: "wrong" })).rejects.toThrow("Revisa tus datos");
  });
  it("starts Google with an explicit account chooser and the current origin callback", async () => {
    mocks.auth.signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    await startGoogle();
    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://www.rutahogar.cl/auth/callback", queryParams: { prompt: "select_account" } } });
  });
  it("records the current verified identity before linking Google", async () => {
    mocks.auth.signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    await startGoogle({ link: true });
    expect(JSON.parse(sessionStorage.getItem("RutaHogar_google_expected"))).toEqual({ id: user.id, email: user.email });
  });
  it.each(["ejecutivo", "admin", "admin_inmobiliario"])("does not initiate Google linking for %s", async role => {
    mocks.profile.mockResolvedValue({ id: user.id, role });
    mocks.auth.signInWithOAuth = vi.fn();
    await expect(startGoogle({ link: true })).rejects.toThrow("usuarios");
    expect(mocks.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it("completes a trigger-created profile from email registration before returning the account", async () => {
    const registered = { ...user, identities: [{}], user_metadata: { rut: "12345678-5", phone: "+56912345678", birth_date: "1990-01-01" } };
    const complete = { id: user.id, role: "usuario", ...registered.user_metadata };
    mocks.auth.signUp.mockResolvedValue({ data: { user: registered, session } });
    mocks.ensure.mockResolvedValue(complete);
    expect((await signUp({ email: user.email, password: "Valid123!" })).profile).toMatchObject(complete);
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ id: user.id, user_metadata: expect.objectContaining(registered.user_metadata) }));
  });
  it("leaves new Google profiles without registration fields for profile completion", async () => {
    expect((await restoreAuth()).profile.rut).toBeUndefined();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it("verifies cached sessions with the server before returning a profile", async () => {
    expect((await restoreAuth()).profile.id).toBe(user.id);
    expect(mocks.auth.getUser).toHaveBeenCalledOnce();
  });
  it("never restores a cached profile without an active Supabase session", async () => {
    localStorage.setItem("RutaHogar_profile", JSON.stringify({ id: "stale" }));
    mocks.auth.getSession.mockResolvedValue({ data: { session: null } });
    expect((await restoreAuth()).profile).toBeNull();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("does not release old-account data when the session changes during profile loading", async () => {
    mocks.auth.getSession.mockResolvedValueOnce({ data: { session } }).mockResolvedValueOnce({ data: { session: { user: { id: "other" } } } });
    await expect(restoreAuth()).rejects.toThrow("La cuenta cambió");
  });
  it("does not erase a session on temporary connection failure", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: {}, error: { status: 503 } });
    await expect(restoreAuth()).rejects.toThrow();
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it("invalid sessions are cleared locally", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: {}, error: { status: 401 } });
    expect((await restoreAuth()).profile).toBeNull();
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not apply new password rules to legacy password login", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { session, user } });
    expect((await signIn({ email: user.email, password: "old123" })).profile.id).toBe(user.id);
  });
  it("signup always uses usuario and never accesses private data pending verification", async () => {
    mocks.auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [{}] } } });
    const result = await signUp({ email: user.email, password: "Valid123!", role: "admin" });
    expect(result.confirmationRequired).toBe(true);
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.auth.signUp.mock.calls[0][0].options.data.role).toBe("usuario");
  });
  it("rejects weak new passwords before calling Supabase", async () => {
    await expect(signUp({ email: user.email, password: "old123" })).rejects.toThrow();
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("recovery responses do not disclose unknown accounts and resend is throttled", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 400, code: "user_not_found" } });
    expect(await sendAccessEmail(user.email)).toContain("Si corresponde");
    await expect(sendAccessEmail(user.email)).rejects.toThrow("60 segundos");
  });
  it("uses the explicit requested logout scope", async () => {
    await signOut("global");
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
  it("allows staff password login even if the account's original provider was Google", async () => {
    const existing = { ...user, app_metadata: { provider: "google" } };
    const passwordSession = { user: existing, access_token: `header.${btoa(JSON.stringify({ amr: [{ method: "password" }] }))}.signature` };
    mocks.profile.mockResolvedValue({ id: user.id, role: "ejecutivo" });
    mocks.auth.signInWithPassword.mockResolvedValue({ data: { user: existing, session: passwordSession } });
    expect((await signIn({ email: user.email, password: "legacy" })).profile.role).toBe("ejecutivo");
  });
  it("rejects a staff OAuth session in the UI as well as the SQL hook", async () => {
    mocks.profile.mockResolvedValue({ id: user.id, role: "ejecutivo" });
    mocks.auth.getSession.mockResolvedValue({ data: { session: { user, access_token: `header.${btoa(JSON.stringify({ amr: [{ method: "oauth" }] }))}.signature` } } });
    await expect(restoreAuth()).rejects.toThrow("correo y contraseña");
  });
});
