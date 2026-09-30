import { supabase } from "../utils/supabase";
import { ensureUserProfile, getAuthenticatedUser, isSupabaseDataConfigured, logSupabaseError } from "./profileService";

const ARCO_KEY = "RutaHogar_arco_requests";

function readLocalArcoRequests() {
  try {
    return JSON.parse(localStorage.getItem(ARCO_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalArcoRequests(requests) {
  localStorage.setItem(ARCO_KEY, JSON.stringify(requests));
}

export async function submitArcoRequest({ tipo, email, descripcion, userId, userRole, userName }) {
  const request = {
    id: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
    tipo,
    email,
    descripcion,
    estado: "pendiente",
    created_at: new Date().toISOString(),
  };

  const existing = readLocalArcoRequests();
  writeLocalArcoRequests([request, ...existing]);

  if (!isSupabaseDataConfigured || !userId) {
    return request;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para registrar la solicitud ARCO.");
  }
  await ensureUserProfile(user);

  const { data, error } = await supabase
    .from("arco_requests")
    .insert({
      user_id: userId,
      tipo,
      email,
      descripcion,
      estado: "pendiente",
    })
    .select()
    .single();

  if (error) {
    logSupabaseError(error);
    throw error;
  }

  if (userRole === "usuario") {
    try {
      await supabase.functions.invoke("notify-admin-arco", {
        body: {
          tipo,
          descripcion,
          email_usuario: email,
          nombre_usuario: userName || email,
        },
      });
    } catch (notifyError) {
      console.warn("No se pudo notificar a los admins:", notifyError);
    }
  }

  return normalizeArcoRequest(data);
}

export async function getArcoRequests(userId, role) {
  if (!isSupabaseDataConfigured) {
    const local = readLocalArcoRequests();
    if (role === "admin") return local;
    if (!userId) return [];
    return local.filter((item) => item.user_id === userId || item.email === userId);
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para cargar solicitudes ARCO.");
  }

  let query = supabase
    .from("arco_requests")
    .select("*")
    .order("created_at", { ascending: false });

  const isAdmin = role === "admin";
  if (!isAdmin) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) {
    logSupabaseError(error);
    throw error;
  }

  return (data || []).map(normalizeArcoRequest);
}

export async function resolveArcoRequest(id) {
  if (!id) throw new Error("ID de solicitud requerido.");

  if (!isSupabaseDataConfigured) {
    const local = readLocalArcoRequests();
    const idx = local.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("Solicitud no encontrada.");
    local[idx].estado = "procesado";
    local[idx].updated_at = new Date().toISOString();
    writeLocalArcoRequests(local);
    return normalizeArcoRequest(local[idx]);
  }

  const { data, error } = await supabase
    .from("arco_requests")
    .update({ estado: "procesado" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    logSupabaseError(error);
    throw error;
  }

  const local = readLocalArcoRequests();
  const idx = local.findIndex((r) => r.id === id);
  if (idx !== -1) {
    local[idx].estado = "procesado";
    local[idx].updated_at = data?.updated_at || new Date().toISOString();
    writeLocalArcoRequests(local);
    if (!data) return normalizeArcoRequest(local[idx]);
  }

  if (!data) throw new Error("Solicitud no encontrada.");
  return normalizeArcoRequest(data);
}

function normalizeArcoRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    tipo: row.tipo,
    email: row.email,
    descripcion: row.descripcion,
    estado: row.estado,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
