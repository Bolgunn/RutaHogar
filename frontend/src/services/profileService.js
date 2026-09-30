import { supabase } from "../utils/supabase";
import { normalizePhone } from "../utils/phone";

export const isSupabaseDataConfigured = Boolean(supabase);

const roleAliases = {
  usuario_comun: "usuario",
  usuario: "usuario",
  ejecutivo_comercial: "ejecutivo",
  ejecutivo: "ejecutivo",
  admin: "admin",
};

export function normalizeRole(role) {
  return roleAliases[role] || "usuario";
}

export function isUUID(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function normalizeProfile(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.id,
    full_name: row.full_name || "",
    phone: row.phone || "",
    birth_date: row.birth_date || "",
    role: normalizeRole(row.role),
    onboarding_data: row.onboarding_data || null,
    last_lead_seen_at: row.last_lead_seen_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function logSupabaseError(error) {
  if (!error) return;

  console.error("Supabase Auth/Profile error:", {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
  });
}

export function normalizePhoneForStorage(phone = "") {
  return normalizePhone(phone);
}

export function normalizeBirthDateForStorage(birthDate = "") {
  const value = String(birthDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return "";
}

export async function getAuthenticatedUser() {
  if (!isSupabaseDataConfigured) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    logSupabaseError(sessionError);
    throw sessionError;
  }

  if (!sessionData?.session?.user) {
    return null;
  }

  return sessionData.session.user;
}

export async function getCurrentProfile(userId) {
  if (!isSupabaseDataConfigured || !userId || !isUUID(userId)) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, birth_date, role, onboarding_data, last_lead_seen_at, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return normalizeProfile(data);
}

export async function upsertProfile(userId, fullName, role = "usuario", onboardingData, contactData = {}) {
  const phone = normalizePhoneForStorage(contactData.phone || "");
  const birthDate = normalizeBirthDateForStorage(contactData.birth_date || "");

  if (!isUUID(userId)) {
    console.warn("Saltando upsert: ID no es un UUID válido.");
    return normalizeProfile({ id: userId, full_name: fullName, role, phone, birth_date: birthDate });
  }

  const profile = {
    id: userId,
    full_name: fullName || "",
    role: normalizeRole(role),
    onboarding_data: onboardingData || null,
  };
  if (phone) profile.phone = phone;
  if (birthDate) profile.birth_date = birthDate;

  if (!isSupabaseDataConfigured) {
    return normalizeProfile({ ...profile, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ ...profile, updated_at: new Date().toISOString(), created_at: new Date().toISOString() })
    .select("id, full_name, phone, birth_date, role, onboarding_data, last_lead_seen_at, created_at, updated_at")
    .maybeSingle();

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return normalizeProfile(data);
}

export async function ensureUserProfile(user) {
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para sincronizar perfil.");
  }

  const metadataPhone = normalizePhoneForStorage(user.user_metadata?.phone || "");
  const metadataBirthDate = normalizeBirthDateForStorage(user.user_metadata?.birth_date || "");
  const existingProfile = await getCurrentProfile(user.id);
  if (existingProfile) {
    const shouldCompleteContactData =
      (!existingProfile.phone && metadataPhone) ||
      (!existingProfile.birth_date && metadataBirthDate);

    if (!shouldCompleteContactData) return existingProfile;

    return upsertProfile(
      user.id,
      existingProfile.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email || "",
      existingProfile.role || user.user_metadata?.role || "usuario",
      existingProfile.onboarding_data || null,
      {
        phone: existingProfile.phone || metadataPhone,
        birth_date: existingProfile.birth_date || metadataBirthDate,
      },
    );
  }

  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || "";
  const role = normalizeRole(user.user_metadata?.role || "usuario");
  return upsertProfile(user.id, fullName, role, null, {
    phone: metadataPhone,
    birth_date: metadataBirthDate,
  });
}

export async function updateLastLeadSeenAt(userId) {
  if (!isSupabaseDataConfigured || !isUUID(userId)) return;
  const { error } = await supabase
    .from("profiles")
    .update({ last_lead_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) {
    logSupabaseError(error);
    throw error;
  }
}

function consentKeyForUser(userId) {
  return userId ? `RutaHogar_dataconsent_${userId}` : "RutaHogar_dataconsent";
}

export function getLocalConsent(userId) {
  try {
    return JSON.parse(localStorage.getItem(consentKeyForUser(userId))) || null;
  } catch {
    return null;
  }
}

export function saveLocalConsent(consentData, userId) {
  localStorage.setItem(consentKeyForUser(userId), JSON.stringify(consentData));
}

export function clearLocalConsent(userId) {
  localStorage.removeItem(consentKeyForUser(userId));
}

export async function saveConsent(userId, consentData) {
  saveLocalConsent(consentData, userId);

  if (!isSupabaseDataConfigured || !userId) return consentData;

  const user = await getAuthenticatedUser();
  if (!user?.id || user.id !== userId) return consentData;

  const { error } = await supabase
    .from("profiles")
    .update({ consent_data: consentData, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    logSupabaseError(error);
  }

  return consentData;
}

export async function getConsent(userId) {
  if (!userId) {
    const local = getLocalConsent();
    return local;
  }

  try {
    if (isSupabaseDataConfigured) {
      const { data, error } = await supabase
        .from("profiles")
        .select("consent_data")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data?.consent_data) {
        saveLocalConsent(data.consent_data, userId);
        return data.consent_data;
      }
    }

    return getLocalConsent(userId);
  } catch {
    return getLocalConsent(userId);
  }
}

export async function updateProfileOnboarding(userId, onboardingData) {
  if (!isSupabaseDataConfigured) {
    return normalizeProfile({
      id: userId,
      role: "usuario",
      onboarding_data: onboardingData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const user = await getAuthenticatedUser();
  if (!user?.id || user.id !== userId) {
    throw new Error("No hay usuario autenticado para actualizar respuestas preliminares.");
  }
  await ensureUserProfile(user);

  if (!isUUID(userId)) {
    return normalizeProfile({ id: userId, onboarding_data: onboardingData });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ 
      onboarding_data: onboardingData,
      updated_at: new Date().toISOString() 
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return normalizeProfile(data);
}
