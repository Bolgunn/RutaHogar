import { supabase } from "../utils/supabase";
import {
  ensureUserProfile,
  getCurrentProfile,
  logSupabaseError,
  normalizeBirthDateForStorage,
  normalizePhoneForStorage,
  normalizeRole,
  isSupabaseDataConfigured,
} from "./profileService";

const PROFILE_KEY = "RutaHogar_profile";
const SESSION_KEY = "RutaHogar_session";
const ONBOARDING_KEY = "RutaHogar_onboarding";

export const roles = {
  user: "usuario",
  sales: "ejecutivo",
  admin: "admin",
};

export const roleLabels = {
  usuario: "Usuario",
  ejecutivo: "Ejecutivo comercial",
  admin: "Admin",
};

function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value?.role ? { ...value, role: normalizeRole(value.role) } : value;
  } catch {
    return null;
  }
}

function saveSession(session, profile) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const normalizedProfile = profile?.role ? { ...profile, role: normalizeRole(profile.role) } : profile;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizedProfile));
  return { session, profile: normalizedProfile };
}

function buildProfile(user, preferredRole = roles.user, persistedProfile = null) {
  if (!user?.id) {
    throw new Error("No se pudo obtener la información del usuario.");
  }

  const fullName = persistedProfile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || "";
  const role = normalizeRole(persistedProfile?.role || user.user_metadata?.role || preferredRole);
  const phone = persistedProfile?.phone || user.user_metadata?.phone || "";
  const birthDate = persistedProfile?.birth_date || user.user_metadata?.birth_date || "";

  return {
    id: user.id,
    user_id: user.id,
    email: user.email,
    full_name: fullName,
    phone,
    birth_date: birthDate,
    role,
    onboarding_data: persistedProfile?.onboarding_data || null,
    last_lead_seen_at: persistedProfile?.last_lead_seen_at || null,
    created_at: persistedProfile?.created_at || user.created_at || new Date().toISOString(),
    updated_at: persistedProfile?.updated_at,
  };
}

async function getOrCreateProfile(user, preferredRole, { strict = false } = {}) {
  const fallbackProfile = buildProfile(user, preferredRole);

  try {
    const existingProfile = await getCurrentProfile(user.id);
    if (existingProfile) {
      return buildProfile(user, preferredRole, existingProfile);
    }

    const createdProfile = await ensureUserProfile(user);
    return buildProfile(user, preferredRole, createdProfile);
  } catch (err) {
    console.error("Supabase Auth/Profile error:", {
      message: err?.message,
      details: err?.details,
      hint: err?.hint,
      code: err?.code,
    });
    if (strict) {
      throw new Error("La cuenta fue creada, pero no se pudo guardar el perfil.");
    }
    return fallbackProfile;
  }
}

function isExistingUserError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "user_already_exists" || message.includes("already registered") || message.includes("already exists");
}

function authUserAlreadyExists(data) {
  return data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
}

export async function signIn({ email, password, role = roles.user }) {
  if (isSupabaseDataConfigured) {
    if (!supabase) {
      throw new Error("Supabase no está configurado correctamente.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error("No se pudo iniciar sesión. Revisa tu correo y contraseña.");
    }

    if (!data?.user) {
      throw new Error("No se pudo obtener la información del usuario.");
    }

    return saveSession(data.session, await getOrCreateProfile(data.user, role));
  }

  const user = { id: `local-${email}`, email, created_at: new Date().toISOString(), user_metadata: { role } };
  return saveSession({ user, access_token: "local-RutaHogar-session" }, buildProfile(user, role));
}

export async function signUp({ email, password, role = roles.user, full_name = "", phone = "", birth_date = "" }) {
  const normalizedRole = normalizeRole(role || roles.user);
  const normalizedPhone = normalizePhoneForStorage(phone);
  const normalizedBirthDate = normalizeBirthDateForStorage(birth_date);

  if (isSupabaseDataConfigured) {
    if (!supabase) {
      throw new Error("Supabase no esta configurado correctamente.");
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role: normalizedRole, full_name, phone: normalizedPhone, birth_date: normalizedBirthDate } },
    });
    if (error) {
      logSupabaseError(error);
      if (isExistingUserError(error)) {
        throw new Error("Este correo ya está registrado. Intenta iniciar sesión.");
      }
      throw new Error("No se pudo crear la cuenta.");
    }

    if (authUserAlreadyExists(data)) {
      console.error("Supabase Auth/Profile error:", {
        message: "User already registered",
        details: "Supabase returned a user without new identities during signUp.",
        hint: "Ask the user to sign in instead of creating a duplicate account.",
        code: "user_already_exists",
      });
      throw new Error("Este correo ya está registrado. Intenta iniciar sesión.");
    }

    if (!data?.user) {
      throw new Error("Cuenta creada, pero no se pudo obtener el usuario. Revisa tu correo si Supabase requiere confirmación.");
    }

    return saveSession(data.session, await getOrCreateProfile(data.user, normalizedRole, { strict: true }));
  }

  const user = {
    id: `local-${email}`,
    email,
    created_at: new Date().toISOString(),
    user_metadata: { role: normalizedRole, full_name, phone: normalizedPhone, birth_date: normalizedBirthDate },
  };
  return saveSession({ user, access_token: "local-RutaHogar-session" }, buildProfile(user, normalizedRole));
}

export function getStoredAuth() {
  return {
    session: readStored(SESSION_KEY),
    profile: readStored(PROFILE_KEY),
  };
}

export function updateStoredProfile(profile) {
  if (!profile) return null;
  const normalizedProfile = { ...profile, role: normalizeRole(profile.role) };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(normalizedProfile));
  return normalizedProfile;
}

export async function signOut() {
  if (isSupabaseDataConfigured) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(ONBOARDING_KEY);
  localStorage.removeItem("RutaHogar_evaluations");
  localStorage.removeItem("RutaHogar_scoring_history");
  localStorage.removeItem("RutaHogar_improvement_goals");
  localStorage.removeItem("RutaHogar_goal_progress");
  localStorage.removeItem("RutaHogar_arco_requests");
  localStorage.removeItem("RutaHogar_last_lead_check");
  clearDataconsentKeys();
}

function clearDataconsentKeys() {
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("RutaHogar_dataconsent")) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((key) => localStorage.removeItem(key));
}
