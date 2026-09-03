import { supabase } from "../utils/supabase";
import { ensureUserProfile, getAuthenticatedUser, isSupabaseDataConfigured, logSupabaseError } from "./profileService";

const SCORING_HISTORY_KEY = "RutaHogar_scoring_history";
const HISTORY_CLASSIFICATIONS = new Set(["Alto", "Medio", "Bajo"]);

function readLocalScoringHistory() {
  try {
    return (JSON.parse(localStorage.getItem(SCORING_HISTORY_KEY)) || [])
      .map(normalizeScoringHistoryRow)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocalScoringHistory(history) {
  localStorage.setItem(SCORING_HISTORY_KEY, JSON.stringify(history));
}

function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function normalizeScoreForColumn(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.max(0, Math.min(100, Math.round(numericScore)));
}

function normalizeClassificationForColumn(result) {
  if (HISTORY_CLASSIFICATIONS.has(result.classification)) return result.classification;
  if (HISTORY_CLASSIFICATIONS.has(result.original_classification)) return result.original_classification;
  return "Bajo";
}

function resolveCalculationReason(evaluationPayload) {
  return evaluationPayload.calculation_reason || evaluationPayload.calculationReason || evaluationPayload.reason || "new_evaluation";
}

function buildSnapshot(evaluationPayload) {
  const input = cloneJson(evaluationPayload.input, {});
  const onboarding = cloneJson(evaluationPayload.onboarding, {});
  const result = cloneJson(evaluationPayload.result, {});
  const calculationReason = resolveCalculationReason(evaluationPayload);
  const calculatedAt = new Date().toISOString();

  return {
    ...input,
    input,
    input_snapshot: input,
    onboarding,
    result,
    result_snapshot: result,
    calculation_reason: calculationReason,
    calculated_at: calculatedAt,
  };
}

function normalizeScoringHistoryRow(row) {
  if (!row) return null;

  const snapshot = row.snapshot || {};
  const resultSnapshot = snapshot.result || snapshot.result_snapshot || {};
  const snapshotComponentScores = resultSnapshot.component_scores || {};
  const rowComponentScores = row.component_scores || {};

  return {
    ...row,
    score: resultSnapshot.score ?? row.score,
    base_score: resultSnapshot.base_score,
    adjusted_score: resultSnapshot.adjusted_score,
    score_adjustment_reason: resultSnapshot.score_adjustment_reason || "",
    original_classification: resultSnapshot.original_classification || "",
    classification: resultSnapshot.classification || row.classification,
    snapshot,
    component_scores: Object.keys(rowComponentScores).length > 0 ? rowComponentScores : snapshotComponentScores,
    algorithm_version: row.algorithm_version || resultSnapshot.algorithm_version || "",
  };
}

function buildScoringHistoryRow(userId, evaluationId, evaluationPayload) {
  const result = evaluationPayload.result || {};
  return {
    evaluation_id: evaluationId,
    user_id: userId,
    score: normalizeScoreForColumn(result.score),
    classification: normalizeClassificationForColumn(result),
    snapshot: buildSnapshot(evaluationPayload),
    component_scores: cloneJson(result.component_scores, {}),
    algorithm_version: result.algorithm_version || "",
    channel: evaluationPayload.channel || "web",
  };
}

const scoringHistorySelectColumns = [
  "id",
  "evaluation_id",
  "user_id",
  "score",
  "classification",
  "snapshot",
  "component_scores",
  "algorithm_version",
  "channel",
  "events",
  "created_at",
].join(", ");

export async function getScoringHistory(userId) {
  if (!isSupabaseDataConfigured) {
    return readLocalScoringHistory().filter((item) => item.user_id === userId);
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) {
    throw new Error("No hay usuario autenticado para cargar el historial.");
  }
  await ensureUserProfile(user);

  const { data, error } = await supabase
    .from("scoring_history")
    .select(scoringHistorySelectColumns)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return (data || []).map(normalizeScoringHistoryRow);
}

export async function getScoringHistoryByEvaluation(evaluationId) {
  if (!isSupabaseDataConfigured) {
    return readLocalScoringHistory().filter((item) => item.evaluation_id === evaluationId);
  }

  const { data, error } = await supabase
    .from("scoring_history")
    .select(scoringHistorySelectColumns)
    .eq("evaluation_id", evaluationId)
    .order("created_at", { ascending: false });

  if (error) {
    logSupabaseError(error);
    throw error;
  }
  return (data || []).map(normalizeScoringHistoryRow);
}

function shouldSkipEvent(existingEvents, event) {
  const events = Array.isArray(existingEvents) ? existingEvents : [];

  if (event?.type === "no_viable_shown") {
    return events.some((item) => item.type === "no_viable_shown");
  }

  if (event?.type === "simulate_success") {
    const last = events[events.length - 1];
    return last?.type === "simulate_success";
  }

  if (event?.type === "register_savings") {
    const last = events[events.length - 1];
    return last?.type === "register_savings" &&
      Number(last.details?.total_registered) === Number(event.details?.total_registered);
  }

  return false;
}

/**
 * Registra un evento de trazabilidad en el ScoringRecord de la evaluación
 * (estado "No viable" presentado y acciones posteriores del usuario).
 */
export async function appendScoringEvent(evaluationId, userId, event) {
  if (!evaluationId) return null;
  const payload = { type: event?.type, at: new Date().toISOString(), details: event?.details || {} };

  if (!isSupabaseDataConfigured) {
    const history = readLocalScoringHistory();
    const target = history.find((item) => item.evaluation_id === evaluationId);
    if (!target) return null;
    const existingEvents = Array.isArray(target.events) ? target.events : [];
    if (shouldSkipEvent(existingEvents, payload)) return target;

    const next = history.map((item) =>
      item.evaluation_id === evaluationId
        ? { ...item, events: [...existingEvents, payload] }
        : item,
    );
    writeLocalScoringHistory(next);
    return next.find((item) => item.evaluation_id === evaluationId) || null;
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para registrar el evento.");

  const { data: row, error: rowError } = await supabase
    .from("scoring_history")
    .select(scoringHistorySelectColumns)
    .eq("evaluation_id", evaluationId)
    .single();

  if (rowError || !row) {
    if (rowError) logSupabaseError(rowError);
    return null;
  }

  const existingEvents = Array.isArray(row.events) ? row.events : [];
  if (shouldSkipEvent(existingEvents, payload)) return row;

  const { data, error } = await supabase
    .from("scoring_history")
    .update({ events: [...existingEvents, payload] })
    .eq("evaluation_id", evaluationId)
    .select(scoringHistorySelectColumns)
    .single();

  if (error) { logSupabaseError(error); throw error; }
  return data;
}

export { buildScoringHistoryRow, readLocalScoringHistory, writeLocalScoringHistory };
