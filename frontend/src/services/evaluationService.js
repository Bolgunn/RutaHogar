import { supabase } from "../utils/supabase";
import { normalizeDisplayList, normalizeDisplayText, normalizeImprovementPlan, sanitizeAiText } from "../utils/text";
import { ensureUserProfile, getAuthenticatedUser, isSupabaseDataConfigured, logSupabaseError } from "./profileService";
import { buildScoringHistoryRow, readLocalScoringHistory, writeLocalScoringHistory } from "./getScoringHistory";

const EVALUATIONS_KEY = "scoreleads_evaluations";
const SUPABASE_CLASSIFICATIONS = new Set(["Alto", "Medio", "Bajo"]);

function readLocalEvaluations() {
  try {
    return (JSON.parse(localStorage.getItem(EVALUATIONS_KEY)) || []).map(normalizeLocalEvaluation);
  } catch {
    return [];
  }
}

function writeLocalEvaluations(evaluations) {
  localStorage.setItem(EVALUATIONS_KEY, JSON.stringify(evaluations));
}

function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeScoreForSupabase(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.max(0, Math.min(100, Math.round(numericScore)));
}

function normalizeClassificationForSupabase(result = {}) {
  if (SUPABASE_CLASSIFICATIONS.has(result.classification)) return result.classification;
  if (SUPABASE_CLASSIFICATIONS.has(result.original_classification)) return result.original_classification;
  return "Bajo";
}

function resolveCalculationReason(evaluationPayload) {
  return evaluationPayload.calculation_reason || evaluationPayload.calculationReason || evaluationPayload.reason || "new_evaluation";
}

function buildFinancialDataSnapshot(evaluationPayload) {
  const input = cloneJson(evaluationPayload.input, {});
  const result = cloneJson(evaluationPayload.result, {});
  const calculationReason = resolveCalculationReason(evaluationPayload);

  return {
    ...input,
    input,
    input_snapshot: input,
    result,
    result_snapshot: result,
    calculation_reason: calculationReason,
    calculated_at: new Date().toISOString(),
  };
}

export function normalizeEvaluation(row, profilesMap = {}) {
  if (!row) return null;

  const recommendationData = row.recommendations || {};
  const recommendations = Array.isArray(recommendationData)
    ? recommendationData
    : recommendationData.items || [];
  const financialData = row.financial_data || {};
  const storedResult = financialData.result || financialData.result_snapshot || {};

  const onboarding = {
    objetivo_principal: row.objective || "",
    tipo_propiedad: row.property_type || "",
    comuna_interes: row.target_commune || "",
    comuna_alternativa: row.alternative_commune || "",
    plazo_compra: row.purchase_timeline || "",
  };

  return {
    id: row.id,
    created_at: row.created_at || new Date().toISOString(),
    email: row.email,
    housing_plan: row.housing_plan || null,
    plan_accepted_at: row.plan_accepted_at || null,
    // Busca el nombre en el mapa de profiles por user_id
    full_name: profilesMap[row.user_id] || null,
    user_id: row.user_id,
    onboarding,
    input: financialData.input || financialData.input_snapshot || financialData,
    result: {
      ...storedResult,
      score: storedResult.score ?? row.score,
      classification: storedResult.classification || row.classification,
      risks: normalizeDisplayList(storedResult.risks ?? recommendationData.risks),
      recommendations: normalizeDisplayList(storedResult.recommendations ?? recommendations),
      ai_explanation: sanitizeAiText(normalizeDisplayText(storedResult.ai_explanation ?? row.explanation ?? "")),
      improvement_plan: normalizeImprovementPlan(storedResult.improvement_plan ?? recommendationData.improvement_plan),
      positive_indicators: normalizeDisplayList(storedResult.positive_indicators ?? recommendationData.positive_indicators),
      executive_summary: sanitizeAiText(normalizeDisplayText(storedResult.executive_summary ?? row.executive_summary ?? "")),
      commercial_guidance: sanitizeAiText(normalizeDisplayText(storedResult.commercial_guidance ?? row.commercial_guidance ?? "")),
    },
  };
}

function normalizeLocalEvaluation(entry) {
  if (!entry) return null;
  const result = entry.result || {};

  return {
    ...entry,
    result: {
      ...result,
      risks: normalizeDisplayList(result.risks),
      recommendations: normalizeDisplayList(result.recommendations),
      ai_explanation: sanitizeAiText(normalizeDisplayText(result.ai_explanation || "")),
      improvement_plan: normalizeImprovementPlan(result.improvement_plan),
      positive_indicators: normalizeDisplayList(result.positive_indicators),
      executive_summary: sanitizeAiText(result.executive_summary),
      commercial_guidance: sanitizeAiText(result.commercial_guidance),
    },
  };
}

function buildRow(userId, evaluationPayload) {
  const result = evaluationPayload.result || {};
  const onboarding = evaluationPayload.onboarding || {};

  return {
    user_id: userId,
    email: evaluationPayload.email || null,
    score: normalizeScoreForSupabase(result.score),
    classification: normalizeClassificationForSupabase(result),
    created_at: new Date().toISOString(),
    objective: onboarding.objetivo_principal || null,
    property_type: onboarding.tipo_propiedad || null,
    target_commune: onboarding.comuna_interes || evaluationPayload.input?.comuna_objetivo || null,
    alternative_commune: onboarding.comuna_alternativa || null,
    purchase_timeline: onboarding.plazo_compra || null,
    financial_data: buildFinancialDataSnapshot(evaluationPayload),
    explanation: sanitizeAiText(result.ai_explanation),
    recommendations: {
      items: result.recommendations || [],
      risks: result.risks || [],
      improvement_plan: result.improvement_plan || [],
      positive_indicators: result.positive_indicators || [],
    },
    executive_summary: result.executive_summary || null,
    commercial_guidance: result.commercial_guidance || null,
  };
}

const evaluationSelectColumns = [
  "id",
  "user_id",
  "email",
  "score",
  "classification",
  "objective",
  "property_type",
  "target_commune",
  "alternative_commune",
  "purchase_timeline",
  "financial_data",
  "explanation",
  "recommendations",
  "executive_summary",
  "commercial_guidance",
  "housing_plan",
  "created_at",
].join(", ");

export async function createEvaluation(userId, evaluationPayload) {
  if (!isSupabaseDataConfigured) {
    const entry = {
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      created_at: new Date().toISOString(),
      email: evaluationPayload.email,
      full_name: evaluationPayload.full_name || null,
      user_id: userId,
      onboarding: evaluationPayload.onboarding || null,
      input: evaluationPayload.input || {},
      result: evaluationPayload.result,
    };
    const next = [entry, ...readLocalEvaluations()].slice(0, 25);
    writeLocalEvaluations(next);

    const historyEntry = {
      ...buildScoringHistoryRow(userId, entry.id, evaluationPayload),
      id: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
      created_at: new Date().toISOString(),
    };
    const historyNext = [historyEntry, ...readLocalScoringHistory()];
    writeLocalScoringHistory(historyNext);

    return normalizeLocalEvaluation(entry);
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para guardar la preevaluación.");
  await ensureUserProfile(user);

  let { data, error } = await supabase
    .from("evaluations")
    .insert(buildRow(user.id, evaluationPayload))
    .select(evaluationSelectColumns)
    .single();

  if (error) { logSupabaseError(error); throw error; }

  const historyRow = buildScoringHistoryRow(user.id, data.id, evaluationPayload);
  const { error: historyError } = await supabase
    .from("scoring_history")
    .insert(historyRow);

  if (historyError) {
    logSupabaseError(historyError);
    const traceabilityData = {
      ...(data.financial_data || {}),
      score_traceability: {
        scoring_history_insert_failed: true,
        failed_at: new Date().toISOString(),
        code: historyError.code || null,
        message: historyError.message || "No se pudo insertar scoring_history.",
      },
    };
    const { data: updatedEvaluation, error: traceabilityError } = await supabase
      .from("evaluations")
      .update({ financial_data: traceabilityData })
      .eq("id", data.id)
      .select(evaluationSelectColumns)
      .maybeSingle();

    if (traceabilityError) {
      logSupabaseError(traceabilityError);
    } else if (updatedEvaluation) {
      data = updatedEvaluation;
    }
  }

  return normalizeEvaluation(data);
}

export async function getEvaluations(userId, role) {
  if (!isSupabaseDataConfigured) {
    const isSales = role === "ejecutivo" || role === "admin";
    if (isSales) return readLocalEvaluations();
    return readLocalEvaluations().filter((item) => item.user_id === userId || item.email === userId);
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para cargar evaluaciones.");
  await ensureUserProfile(user);

  const isSales = role === "ejecutivo" || role === "admin";

  let query = supabase
    .from("evaluations")
    .select(evaluationSelectColumns)
    .order("created_at", { ascending: false });

  if (!isSales) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;
  if (error) { logSupabaseError(error); throw error; }

  // Para ejecutivos: buscar los full_name de los profiles en una segunda query.
  // Necesario porque evaluations.user_id apunta a auth.users (no a public.profiles),
  // y la política RLS de profiles solo permite leer el propio — usamos service-level
  // a través del email guardado en la evaluación como fallback.
  let profilesMap = {};
  if (isSales && data?.length) {
    const userIds = [...new Set(data.map((r) => r.user_id).filter(Boolean))];
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    if (profilesData) {
      profilesMap = Object.fromEntries(profilesData.map((p) => [p.id, p.full_name]));
    }
  }

  return (data || []).map((row) => normalizeEvaluation(row, profilesMap));
}

export async function getLatestEvaluation(userId) {
  if (!isSupabaseDataConfigured) {
    return (await getEvaluations(userId))[0] || null;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para cargar la evaluación actual.");

  const { data, error } = await supabase
    .from("evaluations")
    .select(evaluationSelectColumns)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) { logSupabaseError(error); throw error; }
  return normalizeEvaluation(data);
}

export async function deleteEvaluation(evaluationId, userId) {
  if (!isSupabaseDataConfigured) {
    writeLocalEvaluations(readLocalEvaluations().filter((item) => item.id !== evaluationId));
    return;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para eliminar evaluaciones.");

  const { error } = await supabase
    .from("evaluations")
    .delete()
    .eq("id", evaluationId)
    .eq("user_id", user.id);

  if (error) { logSupabaseError(error); throw error; }
}

export async function acceptEvaluationPlan(evaluationId, userId, planSnapshot) {
  const acceptedAt = new Date().toISOString();
  const housingPlan = {
    status: "en_curso",
    accepted_at: acceptedAt,
    ...planSnapshot,
  };

  if (!isSupabaseDataConfigured) {
    const next = readLocalEvaluations().map((item) =>
      item.id === evaluationId ? { ...item, plan_accepted_at: acceptedAt, housing_plan: housingPlan } : item,
    );
    writeLocalEvaluations(next);
    return normalizeLocalEvaluation(next.find((item) => item.id === evaluationId) || null);
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para aceptar el plan.");

  const { data, error } = await supabase
    .from("evaluations")
    .update({ housing_plan: housingPlan })
    .eq("id", evaluationId)
    .eq("user_id", user.id)
    .select(evaluationSelectColumns)
    .single();

  if (error) { logSupabaseError(error); throw error; }
  return normalizeEvaluation(data);
}

export async function saveHousingPlanProgress(evaluationId, userId, housingPlan) {
  if (!isSupabaseDataConfigured) {
    const next = readLocalEvaluations().map((item) =>
      item.id === evaluationId ? { ...item, housing_plan: housingPlan } : item,
    );
    writeLocalEvaluations(next);
    return normalizeLocalEvaluation(next.find((item) => item.id === evaluationId) || null);
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para guardar el progreso del plan.");

  const { data, error } = await supabase
    .from("evaluations")
    .update({ housing_plan: housingPlan })
    .eq("id", evaluationId)
    .eq("user_id", user.id)
    .select(evaluationSelectColumns)
    .single();

  if (error) { logSupabaseError(error); throw error; }
  return normalizeEvaluation(data);
}

// Persiste los textos de IA regenerados para una evaluación existente.
// Devuelve la evaluación normalizada actualizada, o null si no se encontró.
export async function updateEvaluationAiContent(
  evaluationId,
  { ai_explanation, executive_summary, commercial_guidance } = {},
) {
  const updates = {};
  if (ai_explanation !== undefined) updates.explanation = sanitizeAiText(ai_explanation);
  if (executive_summary !== undefined) updates.executive_summary = sanitizeAiText(executive_summary);
  if (commercial_guidance !== undefined) updates.commercial_guidance = sanitizeAiText(commercial_guidance);

  if (!Object.keys(updates).length || !evaluationId) return null;

  if (!isSupabaseDataConfigured) {
    let updated = null;
    const next = readLocalEvaluations().map((item) => {
      if (item.id !== evaluationId) return item;
      updated = normalizeLocalEvaluation({
        ...item,
        result: { ...(item.result || {}), ...updates },
      });
      return updated;
    });
    writeLocalEvaluations(next);
    return updated;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para actualizar la preevaluación.");
  await ensureUserProfile(user);

  const { data, error } = await supabase
    .from("evaluations")
    .update(updates)
    .eq("id", evaluationId)
    .eq("user_id", user.id)
    .select(evaluationSelectColumns)
    .maybeSingle();

  if (error) { logSupabaseError(error); throw error; }
  return data ? normalizeEvaluation(data) : null;
}
