import { supabase } from "../utils/supabase";
import { getAuthenticatedUser, isSupabaseDataConfigured, logSupabaseError } from "./profileService";

const LOCAL_KEY = "RutaHogar_mortgage_scenarios";
const clone = (value) => JSON.parse(JSON.stringify(value));
const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; } catch { return []; } };
const writeLocal = (items) => localStorage.setItem(LOCAL_KEY, JSON.stringify(items));

export async function listMortgageScenarios(evaluationId) {
  if (!isSupabaseDataConfigured) return readLocal().filter((item) => item.evaluation_id === evaluationId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("Debes iniciar sesiÃ³n para cargar simulaciones.");
  const { data, error } = await supabase.from("mortgage_scenarios").select("*").eq("evaluation_id", evaluationId).eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) { logSupabaseError(error); throw error; }
  return data || [];
}

export async function saveMortgageScenario({ evaluationId, projectId = null, parentScenarioId = null, name, projectSnapshot, inputSnapshot, resultSnapshot, marketReferenceSnapshot, benefitCatalogueSnapshot }) {
  const user = await getAuthenticatedUser();
  if (isSupabaseDataConfigured && !user?.id) throw new Error("Debes iniciar sesiÃ³n para guardar simulaciones.");
  const row = { user_id: user?.id || "local-user", evaluation_id: evaluationId, project_id: projectId, parent_scenario_id: parentScenarioId, name: String(name || "Escenario sin nombre").trim() || "Escenario sin nombre", project_snapshot: clone(projectSnapshot), input_snapshot: clone(inputSnapshot), result_snapshot: clone(resultSnapshot), market_reference_snapshot: clone(marketReferenceSnapshot), benefit_catalogue_snapshot: clone(benefitCatalogueSnapshot), created_at: new Date().toISOString() };
  if (!isSupabaseDataConfigured) { row.id = window.crypto?.randomUUID?.() || String(Date.now()); writeLocal([row, ...readLocal()]); return row; }
  const { data, error } = await supabase.from("mortgage_scenarios").insert(row).select("*").single();
  if (error) { logSupabaseError(error); throw error; }
  return data;
}

export async function deleteMortgageScenario(id) {
  if (!isSupabaseDataConfigured) { writeLocal(readLocal().filter((item) => item.id !== id)); return; }
  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("Debes iniciar sesiÃ³n para eliminar simulaciones.");
  const { error } = await supabase.from("mortgage_scenarios").delete().eq("id", id).eq("user_id", user.id);
  if (error) { logSupabaseError(error); throw error; }
}

export function draftFromMortgageScenario(scenario) {
  return { ...clone(scenario?.input_snapshot || {}), parent_scenario_id: scenario?.id || null };
}
