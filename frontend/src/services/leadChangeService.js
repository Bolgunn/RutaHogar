import { supabase } from "../utils/supabase";

export async function getUnseenLeadChanges() {
  if (!supabase) return [];
  const [{ data, error }, preferences] = await Promise.all([
    supabase
    .from("lead_change_events")
    .select("id, event_type, occurred_at, project_name, tone, title, summary, previous_value, current_value, payload")
    .is("seen_at", null)
      .order("occurred_at", { ascending: false }),
    getLeadNotificationPreferences(),
  ]);
  if (error) throw new Error(error.message || "No se pudieron cargar los cambios recientes.");
  const disabledInAppTypes = new Set(
    preferences.filter((item) => item.channel === "in_app" && item.enabled === false).map((item) => item.event_type),
  );
  return (data || []).filter((item) => !disabledInAppTypes.has(item.event_type));
}

export async function markLeadChangeSeen(eventId) {
  if (!supabase || !eventId) return null;
  const { data, error } = await supabase
    .from("lead_change_events")
    .update({ seen_at: new Date().toISOString() })
    .eq("id", eventId)
    .select("id")
    .single();
  if (error) throw new Error(error.message || "No se pudo marcar el cambio como visto.");
  return data;
}

export async function getLeadNotificationPreferences() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("lead_notification_preferences")
    .select("event_type, channel, enabled")
    .order("event_type", { ascending: true });
  if (error) throw new Error(error.message || "No se pudieron cargar las preferencias de avisos.");
  return data || [];
}

export async function setLeadNotificationPreference(eventType, enabled, channel = "email") {
  if (!supabase || !eventType) return null;
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !sessionData?.user?.id) throw new Error("No hay sesión válida para actualizar avisos.");
  const { data, error } = await supabase
    .from("lead_notification_preferences")
    .upsert({ user_id: sessionData.user.id, event_type: eventType, channel, enabled, updated_at: new Date().toISOString() }, {
      onConflict: "user_id,event_type,channel",
    })
    .select("event_type, channel, enabled")
    .single();
  if (error) throw new Error(error.message || "No se pudo actualizar la preferencia de avisos.");
  return data;
}

export async function recordQuickUpdateChange(event) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("lead_changes_record_quick_update", { p_event: event });
  if (error) throw new Error(error.message || "No se pudo registrar el cambio rápido.");
  return data;
}
