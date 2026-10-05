import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

// Códigos que levanta public.change_commercial_stage (migraciones 20260930120000 y 20261005120000).
const ERROR_MESSAGES = {
  forbidden: "Tu cuenta no puede gestionar etapas comerciales.",
  lead_not_in_scope: "Este lead no está asociado a tu inmobiliaria.",
  proyecto_not_in_scope: "No estás vinculado a ese proyecto.",
  project_required: "Negociación, reserva y venta se registran en un proyecto; perder al lead se marca en cada proyecto.",
  stale_stage: "Otra persona actualizó esta etapa. Recarga la ficha para ver el cambio.",
  same_stage: "El lead ya está en esa etapa.",
  reason_required: "Este cambio requiere un motivo.",
  admin_required: "Solo un administrador puede revertir una venta cerrada.",
  invalid_transition: "Ese cambio de etapa no está permitido.",
  invalid_stage: "Etapa desconocida.",
};

const EMPTY_SCOPE = { lead_level_writable: false, lead_level: null, proyectos: [] };

function stageErrorMessage(error) {
  const code = Object.keys(ERROR_MESSAGES).find((key) => error?.message?.includes(key));
  return code ? ERROR_MESSAGES[code] : "No se pudo actualizar la etapa comercial.";
}

// Registros comerciales de cada lead: el general (proyecto_id null) y uno por proyecto, con el
// actor de su último evento para overallStage. RLS entrega solo los de la inmobiliaria del
// usuario; un lead sin registros está en "nuevo". El admin global ve todas las inmobiliarias:
// sin inmobiliariaId se queda con la inmobiliaria cuyo registro se actualizó más recientemente.
export async function getCommercialRecords(leadIds = [], inmobiliariaId = null) {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!isSupabaseDataConfigured || !ids.length) return {};

  // Lotes para no exceder el largo de URL de PostgREST con muchos leads.
  const batches = [];
  for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100));
  const queries = batches.flatMap((batch) => [
    ["lead_commercial_stage", "subject_user_id, inmobiliaria_id, stage, updated_at"],
    ["lead_project_commercial_stage", "subject_user_id, inmobiliaria_id, proyecto_id, stage, updated_at"],
  ].map(([table, columns]) => {
    let query = supabase
      .from(table)
      .select(`${columns}, last_event:commercial_stage_events!last_event_id(actor_role)`)
      .in("subject_user_id", batch);
    if (inmobiliariaId) query = query.eq("inmobiliaria_id", inmobiliariaId);
    return query;
  }));
  const results = await Promise.all(queries);

  const failed = results.find((result) => result.error);
  if (failed) {
    logSupabaseError(failed.error);
    return {};
  }

  const byLeadAndTenant = {};
  for (const row of results.flatMap((result) => result.data || [])) {
    const tenants = (byLeadAndTenant[row.subject_user_id] ||= {});
    (tenants[row.inmobiliaria_id] ||= []).push(row);
  }

  const records = {};
  for (const [leadId, tenants] of Object.entries(byLeadAndTenant)) {
    const latest = (rows) => rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), "");
    const rows = Object.values(tenants).reduce((best, candidate) => (latest(candidate) > latest(best) ? candidate : best));
    records[leadId] = rows.map((row) => ({
      proyecto_id: row.proyecto_id ?? null,
      stage: row.stage,
      at: row.updated_at,
      por_sistema: row.last_event?.actor_role === "sistema",
    }));
  }
  return records;
}

// Qué registros ve quien llama y cuáles puede escribir. Lo calcula la base con la misma regla
// que usa change_commercial_stage, así la interfaz no puede discrepar.
export async function getCommercialStageScope(leadId) {
  if (!isSupabaseDataConfigured || !leadId) return EMPTY_SCOPE;

  const { data, error } = await supabase.rpc("commercial_stage_scope", { p_lead: leadId });
  if (error) {
    logSupabaseError(error);
    return EMPTY_SCOPE;
  }
  return data || EMPTY_SCOPE;
}

export async function getCommercialStageHistory(leadId) {
  if (!isSupabaseDataConfigured || !leadId) return [];

  const { data, error } = await supabase
    .from("commercial_stage_events")
    .select("id, occurred_at, proyecto_id, actor_role, stage_before, stage_after, reason")
    .eq("subject_user_id", leadId)
    .order("occurred_at", { ascending: true });

  if (error) {
    logSupabaseError(error);
    return [];
  }
  return data || [];
}

export async function changeCommercialStage({ leadId, toStage, reason, expectedStage, proyectoId }) {
  if (!isSupabaseDataConfigured) throw new Error("La gestión de etapas requiere conexión con la base de datos.");

  const { data, error } = await supabase.rpc("change_commercial_stage", {
    p_lead: leadId,
    p_to_stage: toStage,
    p_reason: reason?.trim() || null,
    p_expected_stage: expectedStage || null,
    p_proyecto: proyectoId || null,
  });

  if (error) {
    logSupabaseError(error);
    throw new Error(stageErrorMessage(error));
  }
  return data;
}
