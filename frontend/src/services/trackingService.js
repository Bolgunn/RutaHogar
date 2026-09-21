import { supabase } from "../utils/supabase";

const apiBase = () => (import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "")).replace(/\/$/, "");

export async function trackingRequest(path = "", body) {
  if (!supabase) throw new Error("El seguimiento requiere una conexión configurada.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error("Inicia sesión para acceder a tu progreso.");
  let response;
  try {
    response = await fetch(`${apiBase()}/tracking${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("No se pudo conectar. Puedes reintentar sin duplicar el registro.");
  }
  const payload = await response.json();
  if (!response.ok) {
    const code = payload?.detail?.code || "invalid_request";
    const messages = {
      idempotency_conflict: "Este envío ya existe con otros datos.",
      lineage_conflict: "Hay una actualización más reciente. Recarga antes de guardar.",
      invalid_patch: "Revisa los datos enviados; no cumplen el contrato financiero.",
      verifiable_data_contradiction: "Esta meta se verifica con tus datos y no admite confirmación manual.",
      persistence_unavailable: "El seguimiento no está disponible temporalmente.",
      not_found: "No se encontró el registro en tu seguimiento.",
    };
    const failure = new Error(messages[code] || "No se pudo completar la operación.");
    failure.code = code;
    throw failure;
  }
  return payload;
}

export const getTracking = () => trackingRequest();
export const getProjection = () => trackingRequest("/projection");
export const appendTrackingEvent = (command) => trackingRequest("/events", command);
export const correctTrackingEvent = (target, command) => trackingRequest(`/events/${target}/corrections`, command);
export const confirmTrackingGoal = (goal, command) => trackingRequest(`/goals/${goal}/confirmations`, command);
export const annotateEvaluation = (evaluation, kind, payload, eventId = crypto.randomUUID()) =>
  trackingRequest(`/evaluations/${evaluation}/events`, {
    event_id: eventId, effective_at: new Date().toISOString(), kind, payload,
  });

export function newTrackingCommand(patch, previous, kind = "data_update") {
  return { event_id: crypto.randomUUID(), effective_at: new Date().toISOString(),
    reason: kind === "evaluation" ? "Nueva evaluación" : "Actualización de antecedentes",
    previous_event_id: previous || null, event_kind: kind, patch };
}
