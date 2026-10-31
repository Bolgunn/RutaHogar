import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured } from "./profileService";

export const FORBIDDEN_MESSAGE = "Tu cuenta no tiene una inmobiliaria asignada para ver métricas comerciales.";

// The browser receives aggregates only. JWT and tenant scope are rechecked by Edge/SQL.
export async function getCommercialFunnelMetrics({ filtros, granularidad } = {}) {
  if (!isSupabaseDataConfigured) return null;
  const { data, error } = await supabase.functions.invoke("commercial-funnel-metrics", {
    body: { filtros, granularidad },
  });
  if (error || !data?.metrics) {
    if (error?.context?.status === 403 || data?.code === "forbidden") throw new Error(FORBIDDEN_MESSAGE);
    throw new Error("No se pudieron cargar las métricas comerciales.");
  }
  return { now: data.now, proyectos: data.proyectos, total_leads: data.total_leads,
    privacy_hidden: data.privacy_hidden, refresh_at: data.refresh_at ?? null, metrics: data.metrics };
}
