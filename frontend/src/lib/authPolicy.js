export const PASSWORD_HINT = "Usa al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial.";
export const SIGNUP_DATA_REJECTED = "No se pudo crear la cuenta con estos datos. Revisa el RUT o recupera el acceso a tu cuenta.";
export const ACCESS_DISABLED = "Esta cuenta no tiene acceso habilitado. Contacta al administrador.";
export function passwordChecks(value = "") {
  return [value.length >= 8, /[A-Z]/.test(value), /[a-z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9\s]/.test(value)];
}
export function validNewPassword(value) {
  return typeof value === "string" && passwordChecks(value).every(Boolean);
}
export function getPasswordStrength(value = "") {
  const score = passwordChecks(value).filter(Boolean).length;
  if (!value || score <= 2) return { label: "Débil", level: "weak", percent: value ? 25 : 0, score };
  if (score === 3) return { label: "Media", level: "medium", percent: 50, score };
  if (score === 4) return { label: "Segura", level: "strong", percent: 75, score };
  return { label: "Muy segura", level: "very-strong", percent: 100, score };
}
export function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
export function callbackAccessError(href) {
  const url = new URL(href);
  if (url.pathname !== "/auth/callback") return null;
  const hash = new URLSearchParams(url.hash.slice(1));
  const params = url.searchParams.has("error") || url.searchParams.has("error_code") ? url.searchParams : hash;
  if (!params.has("error") && !params.has("error_code")) return null;
  const description = params.get("error_description") || "";
  const known = ["Esta cuenta debe ingresar con correo y contraseña.", "Google debe utilizar el mismo correo de la cuenta.", ACCESS_DISABLED];
  return known.find(message => description.includes(message)) || "No se completó el acceso. El enlace puede haber vencido o el proceso fue cancelado.";
}
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
  if (error?.message === ACCESS_DISABLED) return ACCESS_DISABLED;
  if (error?.message === SIGNUP_DATA_REJECTED) return SIGNUP_DATA_REJECTED;
  if (error?.code === "email_not_confirmed") return "Confirma tu correo antes de iniciar sesión. Puedes solicitar otro enlace.";
  if (error?.code === "same_password") return "Elige una contraseña diferente de la actual.";
  if (error?.code === "weak_password") return PASSWORD_HINT;
  if (error?.status === 429 || /rate_limit/.test(error?.code || "")) return "Espera un momento antes de volver a intentarlo.";
  if (error?.status >= 500 || error?.name === "AuthRetryableFetchError" || error instanceof TypeError) return "No pudimos conectar con el servicio de acceso. Intenta nuevamente.";
  return "No se pudo completar el acceso. Revisa tus datos o recupera tu cuenta.";
}
