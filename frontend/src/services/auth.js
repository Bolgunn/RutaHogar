import { invitationEmailRedirect } from "./coDebtorAuthContext";
import { supabase } from "../utils/supabase";
import { roles } from "../lib/roles";
import { ensureUserProfile, getCurrentProfile, normalizeBirthDateForStorage, normalizePhoneForStorage } from "./profileService";
import { normalizeEmail, PASSWORD_HINT, safeAuthError, sessionMethods, validNewPassword } from "../lib/authPolicy";

export { roles };
export const roleLabels = { usuario: "Usuario", ejecutivo: "Ejecutivo comercial", admin: "Admin", admin_inmobiliario: "Admin inmobiliaria" };
let interactiveAuth = false;
export const isInteractiveAuth = () => interactiveAuth;
const callbackUrl = () => `${window.location.origin}/auth/callback`;

function requireAuth() {
  if (!supabase) throw new Error("El servicio de acceso no está configurado. Contacta a soporte.");
  return supabase.auth;
}

export function clearPrivateAuth() {
  sessionStorage.removeItem("RutaHogar_recovery_context");
  const keys = ["RutaHogar_session", "RutaHogar_profile", "RutaHogar_onboarding", "RutaHogar_evaluations", "RutaHogar_scoring_history", "RutaHogar_improvement_goals", "RutaHogar_goal_progress", "RutaHogar_arco_requests", "RutaHogar_last_lead_check"];
  keys.forEach(key => localStorage.removeItem(key));
  Object.keys(localStorage).filter(key => key.startsWith("RutaHogar_dataconsent")).forEach(key => localStorage.removeItem(key));
}

async function accountFor(user, session) {
  if (!user?.email_confirmed_at) throw Object.assign(new Error("Confirma tu correo antes de continuar."), { code: "email_not_confirmed" });
  let profile;
  try {
    profile = await getCurrentProfile(user.id);
    // The signup trigger may already have created a partial profile. Recover
    // registration fields before deciding whether to ask for them again.
    if (!profile || (!profile.rut && user.user_metadata?.rut) ||
        (!profile.phone && user.user_metadata?.phone) ||
        (!profile.birth_date && user.user_metadata?.birth_date)) {
      profile = await ensureUserProfile({ ...user, user_metadata: { ...user.user_metadata, role: roles.user } });
    }
  } catch { throw new Error("No pudimos cargar el perfil. Si ya tienes una cuenta con este RUT, recupera su acceso; no se fusionarán cuentas."); }
  if (!profile?.id) throw new Error("No pudimos cargar tu perfil. Intenta nuevamente.");
  if (sessionMethods(session).includes("oauth") && profile.role !== roles.user) throw new Error("Esta cuenta debe ingresar con correo y contraseña.");
  return { session, profile: { ...profile, email: user.email, user_id: user.id } };
}

export async function assertAccountSession(id) {
  const { data, error } = await requireAuth().getSession();
  if (error || data.session?.user?.id !== id) throw new Error("La cuenta cambió. Vuelve a iniciar el proceso.");
}

export async function restoreAuth() {
  const auth = requireAuth();
  const { data: stored, error: sessionError } = await auth.getSession();
  if (sessionError) throw sessionError;
  if (!stored.session) { clearPrivateAuth(); return { session: null, profile: null }; }
  const { data, error } = await auth.getUser();
  if (error) {
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      await auth.signOut({ scope: "local" }); clearPrivateAuth();
      return { session: null, profile: null };
    }
    throw new Error(safeAuthError(error));
  }
  const account = await accountFor(data.user, stored.session);
  const { data: latest } = await auth.getSession();
  if (latest.session?.user?.id !== data.user.id) throw new Error("La cuenta cambió. Intenta nuevamente.");
  updateStoredProfile(account.profile);
  return account;
}

export async function signIn({ email, password }) {
  interactiveAuth = true;
  try {
    const { data, error } = await requireAuth().signInWithPassword({ email: normalizeEmail(email), password });
    if (error) throw Object.assign(new Error(safeAuthError(error)), { code: error.code });
    return await accountFor(data.user, data.session);
  } finally { interactiveAuth = false; }
}

export async function signUp({ email, password, nombre = "", apellido_paterno = "", apellido_materno = "", full_name = "", phone = "", rut = "", birth_date = "", invitationContext = null }) {
  if (!validNewPassword(password)) throw new Error(PASSWORD_HINT);
  interactiveAuth = true;
  try {
    const { data, error } = await requireAuth().signUp({ email: normalizeEmail(email), password, options: { emailRedirectTo: invitationContext ? invitationEmailRedirect(invitationContext) : callbackUrl(), data: { role: roles.user, nombre, apellido_paterno, apellido_materno, full_name, phone: normalizePhoneForStorage(phone), rut, birth_date: normalizeBirthDateForStorage(birth_date) } } });
    if (error) throw new Error(safeAuthError(error));
    if (!data.session || !data.user?.identities?.length) return { emailConfirmationRequired: true, email: normalizeEmail(email), session: null, profile: null };
    return await accountFor(data.user, data.session);
  } finally { interactiveAuth = false; }
}

export async function sendAccessEmail(email, type = "recovery") {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Ingresa un correo válido.");
  const key = `RutaHogar_auth_send_${type}`;
  if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 60000) throw new Error("Espera 60 segundos antes de solicitar otro enlace.");
  sessionStorage.setItem(key, String(Date.now()));
  const auth = requireAuth();
  const { error } = type === "recovery"
    ? await auth.resetPasswordForEmail(normalized, { redirectTo: `${window.location.origin}/definir-password` })
    : await auth.resend({ type: "signup", email: normalized, options: { emailRedirectTo: callbackUrl() } });
  if (error && (error.status === 429 || error.status >= 500 || error.name === "AuthRetryableFetchError")) throw new Error(safeAuthError(error));
  return "Si corresponde a tu cuenta, recibirás un enlace. Revisa también la carpeta de spam.";
}

export async function startGoogle({ link = false } = {}) {
  const auth = requireAuth();
  if (link) {
    const current = await restoreAuth();
    if (current.profile?.role !== roles.user) throw new Error("Google está disponible sólo para usuarios.");
    sessionStorage.setItem("RutaHogar_google_expected", JSON.stringify({ id: current.profile.id, email: normalizeEmail(current.profile.email) }));
  } else sessionStorage.removeItem("RutaHogar_google_expected");
  const { error } = await auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(), queryParams: { prompt: "select_account" } } });
  if (error) throw new Error(safeAuthError(error));
}

export function getStoredAuth() { return { session: null, profile: null }; }
export function updateStoredProfile(profile) {
  if (profile) localStorage.setItem("RutaHogar_profile", JSON.stringify(profile));
  return profile;
}
export async function signOut(scope = "local") {
  const { error } = await requireAuth().signOut({ scope });
  if (error) throw new Error("No pudimos cerrar las sesiones. Intenta nuevamente.");
  clearPrivateAuth();
}

// Used by the invitation return, including a verification link opened in a new tab.
// Null instead of an error: the invitation page then asks the visitor to sign in.
export async function restoreInvitationSession() {
  if (!supabase) return null;
  try {
    const account = await restoreAuth();
    return account.session ? account : null;
  } catch { return null; }
}
