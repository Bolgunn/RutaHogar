export const PASSWORD_HINT = "Usa al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.";
export const SIGNUP_DATA_REJECTED = "No se pudo crear la cuenta con estos datos. Revisa el RUT o recupera el acceso a tu cuenta.";
export function validNewPassword(value) {
  return typeof value === "string" && value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
}
export function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
// A UI routing check only; Supabase must still verify the token and password update.
export function sessionMethods(session) {
  try {
    const encoded = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(encoded));
    return (claims.amr || []).map(item => item.method);
  } catch { return []; }
}
export function recoverySession(session, linkType) {
  const methods = sessionMethods(session);
  return methods.some(method => ["recovery", "invite"].includes(method)) ||
    (["recovery", "invite"].includes(linkType) && methods.includes("otp"));
}
export function safeAuthError(error) {
  if (error?.message === SIGNUP_DATA_REJECTED) return SIGNUP_DATA_REJECTED;
  if (error?.code === "email_not_confirmed") return "Confirma tu correo antes de iniciar sesión. Puedes solicitar otro enlace.";
  if (error?.code === "same_password") return "Elige una contraseña diferente de la actual.";
  if (error?.code === "weak_password") return PASSWORD_HINT;
  if (error?.status === 429 || /rate_limit/.test(error?.code || "")) return "Espera un momento antes de volver a intentarlo.";
  if (error?.status >= 500 || error?.name === "AuthRetryableFetchError" || error instanceof TypeError) return "No pudimos conectar con el servicio de acceso. Intenta nuevamente.";
  return "No se pudo completar el acceso. Revisa tus datos o recupera tu cuenta.";
}
