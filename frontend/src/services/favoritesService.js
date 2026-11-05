import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

// Favoritos de proyectos del lead (HU 9) y configuración de alertas de oportunidad (HU 31).
//
// Mismo reparto de proveedores que projectService: 'local' cuando Supabase no
// está configurada (guardrail 3 de CLAUDE.md — el flujo tiene que funcionar sin
// ella), 'supabase' en el resto de los casos.
//
// `getFavorites`, `addFavorite` y `removeFavorite` conservan intacto su contrato
// de devolver/recibir `string[]` de IDs de proyecto.
// `getFavoriteAlerts` y `setFavoriteAlert` gestionan la campana "Notificar cambios"
// y los umbrales de precio/bono pie de HU 31.
export const PROVIDER = isSupabaseDataConfigured ? "supabase" : "local";

const FAVORITES_KEY = "scoreleads_proyecto_favoritos";
const FAVORITE_ALERTS_KEY = "scoreleads_proyecto_favoritos_alertas";

function readLocal() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function writeLocal(byUser) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(byUser));
}

function readLocalAlerts() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITE_ALERTS_KEY));
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function writeLocalAlerts(byUser) {
  localStorage.setItem(FAVORITE_ALERTS_KEY, JSON.stringify(byUser));
}

function localKey(usuarioId) {
  return String(usuarioId || "anonimo");
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export const localProvider = {
  get(usuarioId) {
    return readLocal()[localKey(usuarioId)] || [];
  },
  add(usuarioId, proyectoId) {
    const byUser = readLocal();
    const key = localKey(usuarioId);
    const current = byUser[key] || [];
    if (!current.includes(proyectoId)) byUser[key] = [...current, proyectoId];
    writeLocal(byUser);
    return true;
  },
  remove(usuarioId, proyectoId) {
    const byUser = readLocal();
    const key = localKey(usuarioId);
    byUser[key] = (byUser[key] || []).filter((id) => id !== proyectoId);
    writeLocal(byUser);

    const alertsByUser = readLocalAlerts();
    if (alertsByUser[key] && proyectoId in alertsByUser[key]) {
      delete alertsByUser[key][proyectoId];
      writeLocalAlerts(alertsByUser);
    }
    return true;
  },
  getAlerts(usuarioId) {
    const alertsByUser = readLocalAlerts();
    return { ...(alertsByUser[localKey(usuarioId)] || {}) };
  },
  getAllAlerts() {
    return readLocalAlerts();
  },
  setAlert(usuarioId, proyectoId, activar = true, projectSnapshot = null) {
    const key = localKey(usuarioId);
    const isActivating = Boolean(activar);
    if (isActivating) {
      this.add(usuarioId, proyectoId);
    }

    const alertsByUser = readLocalAlerts();
    const userAlerts = { ...(alertsByUser[key] || {}) };
    const existing = userAlerts[proyectoId] || {};

    const minUf =
      toFiniteNumberOrNull(projectSnapshot?.precio_min_uf ?? projectSnapshot?.valor_uf) ??
      toFiniteNumberOrNull(existing.umbral_precio_min_uf);
    const maxUf =
      toFiniteNumberOrNull(projectSnapshot?.precio_max_uf) ??
      minUf ??
      toFiniteNumberOrNull(existing.umbral_precio_max_uf);
    const bonoPct =
      toFiniteNumberOrNull(projectSnapshot?.bono_pie_pct) ??
      toFiniteNumberOrNull(existing.umbral_bono_pie_pct) ??
      0;

    const record = {
      usuario_id: key,
      proyecto_id: proyectoId,
      notificar_cambios: isActivating,
      umbral_precio_min_uf: isActivating ? minUf : existing.umbral_precio_min_uf ?? minUf,
      umbral_precio_max_uf: isActivating ? maxUf : existing.umbral_precio_max_uf ?? maxUf,
      umbral_bono_pie_pct: isActivating ? bonoPct : existing.umbral_bono_pie_pct ?? bonoPct,
      alerta_activada_at: isActivating ? new Date().toISOString() : null,
    };

    userAlerts[proyectoId] = record;
    alertsByUser[key] = userAlerts;
    writeLocalAlerts(alertsByUser);
    return record;
  },
  updateAlertThresholds(usuarioId, proyectoId, thresholds = {}) {
    const key = localKey(usuarioId);
    const alertsByUser = readLocalAlerts();
    const userAlerts = { ...(alertsByUser[key] || {}) };
    if (!userAlerts[proyectoId]) return null;
    userAlerts[proyectoId] = {
      ...userAlerts[proyectoId],
      ...thresholds,
    };
    alertsByUser[key] = userAlerts;
    writeLocalAlerts(alertsByUser);
    return userAlerts[proyectoId];
  },
};

export async function getFavorites(usuarioId) {
  if (!usuarioId) return [];

  if (PROVIDER === "local") return localProvider.get(usuarioId);

  const { data, error } = await supabase
    .from("proyecto_favoritos")
    .select("proyecto_id")
    .eq("usuario_id", usuarioId);

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar tus favoritos.");
  }

  return (data || []).map((row) => row.proyecto_id);
}

export async function addFavorite(usuarioId, proyectoId) {
  if (!usuarioId || !proyectoId) throw new Error("Falta el usuario o el proyecto.");

  if (PROVIDER === "local") return localProvider.add(usuarioId, proyectoId);

  const { error } = await supabase
    .from("proyecto_favoritos")
    .upsert({ usuario_id: usuarioId, proyecto_id: proyectoId }, {
      onConflict: "usuario_id,proyecto_id",
      ignoreDuplicates: true,
    });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo guardar el proyecto en tus favoritos.");
  }
  return true;
}

export async function removeFavorite(usuarioId, proyectoId) {
  if (!usuarioId || !proyectoId) throw new Error("Falta el usuario o el proyecto.");

  if (PROVIDER === "local") return localProvider.remove(usuarioId, proyectoId);

  const { error } = await supabase
    .from("proyecto_favoritos")
    .delete()
    .eq("usuario_id", usuarioId)
    .eq("proyecto_id", proyectoId);

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo quitar el proyecto de tus favoritos.");
  }
  return true;
}

export async function getFavoriteAlerts(usuarioId) {
  if (!usuarioId) return {};

  if (PROVIDER === "local") return localProvider.getAlerts(usuarioId);

  const { data, error } = await supabase
    .from("proyecto_favoritos")
    .select(
      "proyecto_id, notificar_cambios, umbral_precio_min_uf, umbral_precio_max_uf, umbral_bono_pie_pct, alerta_activada_at",
    )
    .eq("usuario_id", usuarioId);

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudieron cargar las alertas de tus proyectos favoritos.");
  }

  return (data || []).reduce((acc, row) => {
    acc[row.proyecto_id] = {
      usuario_id: usuarioId,
      proyecto_id: row.proyecto_id,
      notificar_cambios: Boolean(row.notificar_cambios),
      umbral_precio_min_uf: toFiniteNumberOrNull(row.umbral_precio_min_uf),
      umbral_precio_max_uf: toFiniteNumberOrNull(row.umbral_precio_max_uf),
      umbral_bono_pie_pct: toFiniteNumberOrNull(row.umbral_bono_pie_pct) ?? 0,
      alerta_activada_at: row.alerta_activada_at || null,
    };
    return acc;
  }, {});
}

export async function setFavoriteAlert(
  usuarioId,
  proyectoId,
  activar = true,
  projectSnapshot = null,
) {
  if (!usuarioId || !proyectoId) {
    throw new Error("Falta el usuario o el proyecto.");
  }

  if (PROVIDER === "local") {
    return localProvider.setAlert(usuarioId, proyectoId, activar, projectSnapshot);
  }

  const { data, error } = await supabase.rpc("configurar_alerta_favorito", {
    p_proyecto_id: proyectoId,
    p_activar: Boolean(activar),
  });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo configurar la alerta para este proyecto.");
  }

  return {
    usuario_id: usuarioId,
    proyecto_id: data?.proyecto_id || proyectoId,
    notificar_cambios: Boolean(data?.notificar_cambios ?? activar),
    umbral_precio_min_uf: toFiniteNumberOrNull(data?.umbral_precio_min_uf),
    umbral_precio_max_uf: toFiniteNumberOrNull(data?.umbral_precio_max_uf),
    umbral_bono_pie_pct: toFiniteNumberOrNull(data?.umbral_bono_pie_pct) ?? 0,
    alerta_activada_at: data?.alerta_activada_at || null,
  };
}
