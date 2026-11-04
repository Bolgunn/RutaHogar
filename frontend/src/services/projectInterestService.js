import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

// HU 26 — interés por proyecto. Migración 20261103220000_hu26_project_interest.sql y Edge Function
// project-interest-metrics.

export const FORBIDDEN_MESSAGE = "Solo el administrador de una inmobiliaria puede ver el interés por proyecto.";

// Devuelve { now, proyectos, metrics }: el navegador recibe solo los conteos de ALG-20, calculados en
// el servidor como las métricas de HU 15. Sin Supabase devuelve null: el camino local no tiene métricas.
export async function getProjectInterestMetrics() {
  if (!isSupabaseDataConfigured) return null;

  const { data, error } = await supabase.functions.invoke("project-interest-metrics", { body: {} });
  if (error || !data?.metrics) {
    if (error?.context?.status === 403 || data?.code === "forbidden") throw new Error(FORBIDDEN_MESSAGE);
    throw new Error("No se pudieron cargar las métricas de interés por proyecto.");
  }
  return { now: data.now, proyectos: data.proyectos, metrics: data.metrics };
}

// Una visualización por lead, proyecto y día (ALG-20 A2); la base ignora al staff y a los avisos
// del portal. Nunca lanza: medir el interés no puede interrumpir al lead.
export async function registerProjectView(proyectoId) {
  if (!isSupabaseDataConfigured || !proyectoId) return;

  const { error } = await supabase.rpc("registrar_visualizacion_proyecto", { p_proyecto: proyectoId });
  // 42501: visitante sin sesión. No es un lead todavía, así que no hay nada que registrar.
  if (error && error.code !== "42501") logSupabaseError(error);
}
