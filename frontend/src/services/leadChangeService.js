import { supabase } from "../utils/supabase";

const LOCAL_LEAD_CHANGES_KEY = "scoreleads_lead_change_events";
const LOCAL_LEAD_PREFS_KEY = "scoreleads_lead_notification_preferences";

function readLocalEvents() {
  try {
    const raw = localStorage.getItem(LOCAL_LEAD_CHANGES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalEvents(events) {
  try {
    localStorage.setItem(LOCAL_LEAD_CHANGES_KEY, JSON.stringify(events));
  } catch {
    // ignore storage errors
  }
}

function readLocalPreferences() {
  try {
    const raw = localStorage.getItem(LOCAL_LEAD_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalPreferences(preferences) {
  try {
    localStorage.setItem(LOCAL_LEAD_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // ignore storage errors
  }
}

export const localLeadChangesProvider = {
  recordEvent(event) {
    return recordLocalLeadChangeEvent(event);
  },
  getUnseen() {
    const localEvents = readLocalEvents().filter((item) => !item.seen_at);
    const preferences = readLocalPreferences();
    const disabledInAppTypes = new Set(
      preferences
        .filter((item) => item.channel === "in_app" && item.enabled === false)
        .map((item) => item.event_type),
    );
    return localEvents.filter((item) => !disabledInAppTypes.has(item.event_type));
  },
  markSeen(eventId) {
    if (!eventId) return null;
    const localEvents = readLocalEvents();
    const localIndex = localEvents.findIndex((item) => item.id === eventId);
    if (localIndex >= 0) {
      localEvents[localIndex] = {
        ...localEvents[localIndex],
        seen_at: new Date().toISOString(),
      };
      writeLocalEvents(localEvents);
      return { id: eventId };
    }
    return null;
  },
};

export function recordLocalLeadChangeEvent(event) {
  if (!event || typeof event !== "object") return null;
  const events = readLocalEvents();
  const materialityKey = event.materiality_key || event.id;
  const existingIndex = events.findIndex(
    (item) =>
      (materialityKey && item.materiality_key === materialityKey && item.user_id === event.user_id) ||
      (event.id && item.id === event.id),
  );
  const record = {
    id: event.id || `local-event-${Date.now()}`,
    seen_at: null,
    occurred_at: event.occurred_at || new Date().toISOString(),
    ...event,
  };
  if (existingIndex >= 0) {
    events[existingIndex] = { ...events[existingIndex], ...record, seen_at: null };
  } else {
    events.unshift(record);
  }
  writeLocalEvents(events);
  return record;
}

export async function getUnseenLeadChanges() {
  const localEvents = readLocalEvents().filter((item) => !item.seen_at);
  if (!supabase) {
    const preferences = readLocalPreferences();
    const disabledInAppTypes = new Set(
      preferences
        .filter((item) => item.channel === "in_app" && item.enabled === false)
        .map((item) => item.event_type),
    );
    return localEvents.filter((item) => !disabledInAppTypes.has(item.event_type));
  }
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
  const merged = [...(data || []), ...localEvents];
  const seenIds = new Set();
  return merged.filter((item) => {
    if (!item || seenIds.has(item.id) || disabledInAppTypes.has(item.event_type)) return false;
    seenIds.add(item.id);
    return true;
  });
}

export async function markLeadChangeSeen(eventId) {
  if (!eventId) return null;
  const localEvents = readLocalEvents();
  const localIndex = localEvents.findIndex((item) => item.id === eventId);
  if (localIndex >= 0) {
    localEvents[localIndex] = {
      ...localEvents[localIndex],
      seen_at: new Date().toISOString(),
    };
    writeLocalEvents(localEvents);
    if (!supabase) return { id: eventId };
  }
  if (!supabase) return null;
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
  if (!supabase) return readLocalPreferences();
  const { data, error } = await supabase
    .from("lead_notification_preferences")
    .select("event_type, channel, enabled")
    .order("event_type", { ascending: true });
  if (error) throw new Error(error.message || "No se pudieron cargar las preferencias de avisos.");
  return data || [];
}

export async function setLeadNotificationPreference(eventType, enabled, channel = "email") {
  if (!eventType) return null;
  if (!supabase) {
    const prefs = readLocalPreferences();
    const index = prefs.findIndex(
      (item) => item.event_type === eventType && item.channel === channel,
    );
    const nextItem = { event_type: eventType, channel, enabled: Boolean(enabled) };
    if (index >= 0) prefs[index] = nextItem;
    else prefs.push(nextItem);
    writeLocalPreferences(prefs);
    return nextItem;
  }
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
  if (!supabase) return recordLocalLeadChangeEvent(event);
  const { data, error } = await supabase.rpc("lead_changes_record_quick_update", { p_event: event });
  if (error) throw new Error(error.message || "No se pudo registrar el cambio rápido.");
  return data;
}
