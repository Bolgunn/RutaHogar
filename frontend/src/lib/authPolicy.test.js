import { describe, expect, it } from "vitest";
import { normalizeEmail, PASSWORD_HINT, SIGNUP_DATA_REJECTED, recoverySession, safeAuthError, sessionMethods, validNewPassword } from "./authPolicy";

describe("HU27 access policy", () => {
  it("shows only the allowlisted signup hook rejection without exposing database details", () => {
    expect(safeAuthError({ status: 400, message: SIGNUP_DATA_REJECTED })).toBe(SIGNUP_DATA_REJECTED);
    expect(safeAuthError({ status: 400, message: "private database failure" })).not.toContain("private");
  });
  it.each(["short", "abcdefgh", "ABCDEFGH", "Abcdef12", "Abcdef!x", "abc123!x", "ABC123!X", "Abcd123 "])("rejects an incomplete new password: %s", value => expect(validNewPassword(value)).toBe(false));
  it("accepts every required character class", () => expect(validNewPassword("Valid123!")).toBe(true));
  it("normalizes the email without changing its identity", () => expect(normalizeEmail(" User@Example.cl ")).toBe("user@example.cl"));
  it("does not mistake a normal password session for a recovery link", () => {
    const token = method => ({ access_token: `header.${btoa(JSON.stringify({ amr: [{ method }] }))}.signature` });
    expect(recoverySession(token("password"))).toBe(false);
    expect(recoverySession(token("recovery"))).toBe(true);
    expect(recoverySession(token("invite"))).toBe(true);
    expect(sessionMethods(token("oauth"))).toEqual(["oauth"]);
    expect(recoverySession(null)).toBe(false);
  });
  it("does not expose internal errors or account existence", () => {
    for (const code of ["invalid_credentials", "user_not_found", "user_banned"]) expect(safeAuthError({ code, message: "secret database details" })).toBe("No se pudo completar el acceso. Revisa tus datos o recupera tu cuenta.");
    expect(safeAuthError({ code: "weak_password" })).toBe(PASSWORD_HINT);
  });
  it("accepts verified email OTP sessions only with recovery or invite link context", () => {
    const session = { access_token: `header.${btoa(JSON.stringify({ amr: [{ method: "otp" }] }))}.signature` };
    expect(recoverySession(session, "recovery")).toBe(true);
    expect(recoverySession(session, "invite")).toBe(true);
    expect(recoverySession(session, "signup")).toBe(false);
    expect(recoverySession(session)).toBe(false);
    const password = { access_token: `header.${btoa(JSON.stringify({ amr: [{ method: "password" }] }))}.signature` };
    expect(recoverySession(password, "recovery")).toBe(false);
  });
});
