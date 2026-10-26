import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

// HU 26 — interés por proyecto. Migración 20261026120000_hu26_project_interest.sql.

export const FORBIDDEN_MESSAGE = "Solo el administrador de una inmobiliaria puede ver el interés por proyecto.";

// Devuelve { now, proyectos, leads } tal como los lee ALG-19. Sin Supabase devuelve null: el
// camino local no tiene métricas.
export async function getProjectInterestFacts() {
  if (!isSupabaseDataConfigured) return null;

  const { data, error } = await supabase.rpc("project_interest_facts");
  if (error) {
    if (error.code === "42501" || error.message?.includes("forbidden")) throw new Error(FORBIDDEN_MESSAGE);
    logSupabaseError(error);
    throw new Error("No se pudieron cargar las métricas de interés por proyecto.");
  }
  return { now: data.now, proyectos: data.proyectos, leads: data.leads };
}

// Una visualización por lead, proyecto y día (ALG-19 A2); la base ignora al staff y a los avisos
// del portal. Nunca lanza: medir el interés no puede interrumpir al lead.
export async function registerProjectView(proyectoId) {
  if (!isSupabaseDataConfigured || !proyectoId) return;

  const { error } = await supabase.rpc("registrar_visualizacion_proyecto", { p_proyecto: proyectoId });
  // 42501: visitante sin sesión. No es un lead todavía, así que no hay nada que registrar.
  if (error && error.code !== "42501") logSupabaseError(error);
}
