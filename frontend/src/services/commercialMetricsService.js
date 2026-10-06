import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

export const FORBIDDEN_MESSAGE = "Tu cuenta no tiene una inmobiliaria asignada para ver métricas comerciales.";

// Hechos del embudo comercial (HU 15): public.commercial_funnel_facts(), migración
// 20261005150000. Devuelve { now, proyectos, facts } tal como los lee ALG-18; `now` es la hora de
// la base (G27). Sin Supabase devuelve null: el camino local no tiene métricas.
export async function getCommercialFunnelFacts() {
  if (!isSupabaseDataConfigured) return null;

  const { data, error } = await supabase.rpc("commercial_funnel_facts");
  if (error) {
    if (error.code === "42501" || error.message?.includes("forbidden")) throw new Error(FORBIDDEN_MESSAGE);
    logSupabaseError(error);
    throw new Error("No se pudieron cargar las métricas comerciales.");
  }
  return { now: data.now, proyectos: data.proyectos, facts: data.facts };
}
