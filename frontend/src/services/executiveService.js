import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";
import { derivedTestPassword, validateExecutive } from "./projectValidation";

// Alta y listado de ejecutivos comerciales de una inmobiliaria (HU 7).
// La creación real de la cuenta ocurre en la Edge Function `create-executive`,
// porque exige la service_role key. Aquí solo se invoca y se normaliza.

const LOCAL_EXECUTIVES_KEY = "scoreleads_ejecutivos";

function readLocalExecutives() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_EXECUTIVES_KEY)) || [];
  } catch {
    return [];
  }
}

function writeLocalExecutives(executives) {
  localStorage.setItem(LOCAL_EXECUTIVES_KEY, JSON.stringify(executives));
}

function normalizeExecutive(row) {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name || "",
    phone: row.phone || "",
    inmobiliaria_id: row.inmobiliaria_id,
    inmobiliaria_nombre: row.inmobiliaria_nombre || "",
    proyectos_asignados: Number(row.proyectos_asignados || 0),
    created_at: row.created_at,
  };
}

export async function getExecutives({ inmobiliariaId } = {}) {
  if (!isSupabaseDataConfigured) {
    const local = readLocalExecutives();
    return inmobiliariaId && inmobiliariaId !== "all"
      ? local.filter((item) => item.inmobiliaria_id === inmobiliariaId)
      : local;
  }

  const { data, error } = await supabase.rpc("list_inmobiliaria_executives", {
    p_inmobiliaria_id: inmobiliariaId && inmobiliariaId !== "all" ? inmobiliariaId : null,
  });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar los ejecutivos.");
  }

  return (data || []).map(normalizeExecutive);
}

export async function createExecutive({ email, full_name, phone, inmobiliaria_id }) {
  const payload = {
    email: String(email || "").trim().toLowerCase(),
    full_name: String(full_name || "").trim(),
    phone: String(phone || "").trim(),
    inmobiliaria_id,
  };

  const { ok, errors } = validateExecutive(payload);
  if (!ok) throw new Error(Object.values(errors)[0]);

  if (!isSupabaseDataConfigured) {
    // Sin Supabase no hay cuentas reales: se registra el ejecutivo localmente
    // para poder recorrer la pantalla, con la misma contraseña derivada.
    const local = readLocalExecutives();
    if (local.some((item) => item.email === payload.email)) {
      throw new Error("Ya existe un ejecutivo con ese correo.");
    }
    const executive = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      email: payload.email,
      full_name: payload.full_name,
      phone: payload.phone,
      inmobiliaria_id: payload.inmobiliaria_id,
      inmobiliaria_nombre: "",
      proyectos_asignados: 0,
      created_at: new Date().toISOString(),
    };
    writeLocalExecutives([...local, executive]);
    return {
      created: true,
      ejecutivo: executive,
      email_enviado: false,
      password_temporal: derivedTestPassword(payload.email),
      mensaje: "Ejecutivo registrado solo en este navegador (Supabase no está configurada).",
    };
  }

  const { data, error } = await supabase.functions.invoke("create-executive", { body: payload });

  // Un status !== 2xx llega como FunctionsHttpError: el detalle viene en el body.
  if (error) {
    let detail = "";
    try {
      detail = (await error.context?.json())?.error || "";
    } catch {
      detail = "";
    }
    logSupabaseError(error);
    throw new Error(detail || error.message || "No se pudo crear el ejecutivo.");
  }

  if (data?.error) throw new Error(data.error);

  return data;
}
