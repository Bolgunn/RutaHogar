import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

export async function reportLead(leadId, reporterId, reason) {
  if (!isSupabaseDataConfigured) return null;

  const newStatus = "en_revision";

  const { error } = await supabase.rpc("update_lead_reliability", {
    p_lead_id: leadId,
    p_reporter_id: reporterId || null,
    p_new_status: newStatus,
    p_reason: reason || "Reportado por ejecutivo comercial"
  });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo actualizar el estado del lead. " + (error.message || "Revisa los permisos."));
  }

  return true;
}

export async function resolveLeadStatus(leadId, adminId, newStatus, reason) {
  if (!isSupabaseDataConfigured) return null;

  const { error } = await supabase.rpc("update_lead_reliability", {
    p_lead_id: leadId,
    p_reporter_id: adminId || null,
    p_new_status: newStatus,
    p_reason: reason || `Estado cambiado a ${newStatus} por administrador`
  });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo actualizar el estado del lead. " + (error.message || "Revisa los permisos."));
  }

  return true;
}

export async function getLeadsInReview() {
  if (!isSupabaseDataConfigured) return [];

  const { data, error } = await supabase.rpc("get_reported_leads_for_admin");

  if (error) {
    logSupabaseError(error);
    return [];
  }

  const leads = data || [];
  if (leads.length === 0) return [];

  const profileIds = leads.map(l => l.id);
  const { data: historyData } = await supabase
    .from("lead_status_history")
    .select("*")
    .in("profile_id", profileIds)
    .order("created_at", { ascending: false });

  if (historyData) {
    leads.forEach(lead => {
      const leadHistory = historyData.find(h => h.profile_id === lead.id);
      if (leadHistory) {
        lead.report_reason = leadHistory.reason;
        lead.reported_at = leadHistory.created_at;
      }
    });
  }

  return leads;
}
