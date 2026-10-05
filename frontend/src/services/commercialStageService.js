import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

// Códigos que levanta public.change_commercial_stage (migración 20260930120000).
const ERROR_MESSAGES = {
  forbidden: "Tu cuenta no puede gestionar etapas comerciales.",
  lead_not_in_scope: "Este lead no está asociado a tu inmobiliaria.",
  stale_stage: "Otra persona actualizó esta etapa. Recarga la ficha para ver el cambio.",
  same_stage: "El lead ya está en esa etapa.",
  reason_required: "Este cambio requiere un motivo.",
  admin_required: "Solo un administrador puede revertir una venta cerrada.",
  invalid_transition: "Ese cambio de etapa no está permitido.",
  invalid_stage: "Etapa desconocida.",
};

function stageErrorMessage(error) {
  const code = Object.keys(ERROR_MESSAGES).find((key) => error?.message?.includes(key));
  return code ? ERROR_MESSAGES[code] : "No se pudo actualizar la etapa comercial.";
}

// RLS entrega solo las filas de la inmobiliaria del usuario; un lead sin fila está en "nuevo".
// El admin global ve todas las inmobiliarias: sin inmobiliariaId se queda con la etapa más reciente.
export async function getCommercialStages(leadIds = [], inmobiliariaId = null) {
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (!isSupabaseDataConfigured || !ids.length) return {};

  // Lotes para no exceder el largo de URL de PostgREST con muchos leads.
  const batches = [];
  for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100));
  const results = await Promise.all(batches.map((batch) => {
    let query = supabase
      .from("lead_commercial_stage")
      .select("subject_user_id, stage, updated_at")
      .in("subject_user_id", batch);
    if (inmobiliariaId) query = query.eq("inmobiliaria_id", inmobiliariaId);
    return query;
  }));

  const failed = results.find((result) => result.error);
  if (failed) {
    logSupabaseError(failed.error);
    return {};
  }
  const stages = {};
  for (const row of results.flatMap((result) => result.data || [])) {
    const current = stages[row.subject_user_id];
    if (!current || row.updated_at > current.updated_at) stages[row.subject_user_id] = row;
  }
  return stages;
}

export async function getCommercialStageHistory(leadId) {
  if (!isSupabaseDataConfigured || !leadId) return [];

  const { data, error } = await supabase
    .from("commercial_stage_events")
    .select("id, occurred_at, actor_role, stage_before, stage_after, reason")
    .eq("subject_user_id", leadId)
    .order("occurred_at", { ascending: true });

  if (error) {
    logSupabaseError(error);
    return [];
  }
  return data || [];
}

export async function canManageLeadStage(leadId) {
  if (!isSupabaseDataConfigured || !leadId) return false;

  const { data, error } = await supabase.rpc("lead_in_my_inmobiliaria", { p_lead: leadId });
  if (error) {
    logSupabaseError(error);
    return false;
  }
  return data === true;
}

export async function changeCommercialStage({ leadId, toStage, reason, expectedStage }) {
  if (!isSupabaseDataConfigured) throw new Error("La gestión de etapas requiere conexión con la base de datos.");

  const { data, error } = await supabase.rpc("change_commercial_stage", {
    p_lead: leadId,
    p_to_stage: toStage,
    p_reason: reason?.trim() || null,
    p_expected_stage: expectedStage || null,
  });

  if (error) {
    logSupabaseError(error);
    throw new Error(stageErrorMessage(error));
  }
  return data;
}
