import { supabase } from "../utils/supabase";
import { isSupabaseDataConfigured, logSupabaseError } from "./profileService";

export async function reportLead(leadId, reporterId, reason) {
  if (!isSupabaseDataConfigured) return null;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("reliability_status")
    .eq("id", leadId)
    .single();

  if (profileError) {
    logSupabaseError(profileError);
    throw new Error("No se pudo obtener el perfil del lead.");
  }

  const newStatus = "en_revision";

  const { error } = await supabase.rpc("update_lead_reliability", {
    p_lead_id: leadId,
    p_reporter_id: reporterId,
    p_new_status: newStatus,
    p_reason: reason || "Reportado por ejecutivo comercial"
  });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo actualizar el estado del lead. Revisa los permisos.");
  }

  return true;
}

export async function resolveLeadStatus(leadId, adminId, newStatus, reason) {
  if (!isSupabaseDataConfigured) return null;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("reliability_status")
    .eq("id", leadId)
    .single();

  if (profileError) {
    logSupabaseError(profileError);
    throw new Error("No se pudo obtener el perfil del lead.");
  }

  const { error } = await supabase.rpc("update_lead_reliability", {
    p_lead_id: leadId,
    p_reporter_id: adminId,
    p_new_status: newStatus,
    p_reason: reason || `Estado cambiado a ${newStatus} por administrador`
  });

  if (error) {
    logSupabaseError(error);
    throw new Error("No se pudo actualizar el estado del lead. Revisa los permisos.");
  }

  return true;
}

export async function getLeadsInReview() {
  if (!isSupabaseDataConfigured) return [];

  const { data, error } = await supabase
    .from("evaluations")
    .select(`
      id,
      email,
      created_at,
      user_id,
      profiles!inner (
        full_name,
        phone,
        rut,
        reliability_status
      )
    `)
    .eq("profiles.reliability_status", "en_revision")
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError(error);
    return [];
  }

  const rawLeads = data || [];
  if (rawLeads.length === 0) return [];

  const leads = rawLeads.map(item => ({
    id: item.user_id, // We use the user_id as the ID for the profile so we can resolve it
    email: item.email,
    created_at: item.created_at,
    full_name: item.profiles?.full_name,
    phone: item.profiles?.phone,
    rut: item.profiles?.rut,
    reliability_status: item.profiles?.reliability_status
  }));

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
