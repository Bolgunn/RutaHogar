import { supabase } from "../utils/supabase";
import { normalizeDisplayList, normalizeDisplayText, normalizeImprovementPlan, sanitizeAiText } from "../utils/text";
import { ensureUserProfile, getAuthenticatedUser } from "./profileService";
import { annotateEvaluation, appendTrackingEvent, getTracking, newTrackingCommand } from "./trackingService";

function cloneJson(value, fallback) {
  if (value === undefined || value === null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

// HU13 events remain the persistence authority; the helper preserves the
// exact server-resolved market bundle in an immutable evaluation payload.
export function buildFinancialDataSnapshot(evaluationPayload) {
  const input = cloneJson(evaluationPayload.input, {});
  const result = cloneJson(evaluationPayload.result, {});
  return {
    ...input,
    input,
    input_snapshot: input,
    result,
    result_snapshot: result,
    calculation_reason: evaluationPayload.calculation_reason || evaluationPayload.calculationReason || evaluationPayload.reason || "new_evaluation",
    calculated_at: new Date().toISOString(),
  };
}

export function normalizeEvaluation(row, contactsMap = {}) {
  if (!row) return null;

  const recommendationData = row.recommendations || {};
  const recommendations = Array.isArray(recommendationData)
    ? recommendationData
    : recommendationData.items || [];
  const financialData = row.financial_data || {};
  const storedResult = financialData.result || financialData.result_snapshot || {};
  const contact = contactsMap[row.user_id] || {};

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
    full_name: contact.full_name || null,
    phone: contact.phone || null,
    reliability_status: contact.reliability_status || "normal",
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
      financial_indicators: storedResult.financial_indicators || row.financial_indicators || {},
    },
    plan_accepted_at: row.plan_accepted_at || null,
    plan_type: row.plan_type || row.housing_plan?.plan_type || null,
  };
}


const pendingCommands = new WeakMap();

function requireConnection() {
  if (!supabase) throw new Error("La persistencia de evaluaciones no está disponible.");
}

export async function createEvaluation(userId, evaluationPayload) {
  requireConnection();
  const user = await getAuthenticatedUser();
  if (!user?.id || (userId && userId !== user.id)) throw new Error("No hay una sesión válida para guardar.");
  await ensureUserProfile(user);
  let command = pendingCommands.get(evaluationPayload);
  if (!command) {
    const tracking = await getTracking();
    command = newTrackingCommand(evaluationPayload.input || {}, tracking.latest_event_id, "evaluation");
    pendingCommands.set(evaluationPayload, command);
  }
  // Client score is a preview only. The authenticated backend calculates the saved result.
  const saved = await appendTrackingEvent(command);
  const evaluation = saved.evaluation;
  return normalizeEvaluation({
    id: evaluation.id, user_id: user.id, created_at: command.effective_at,
    financial_data: { input: evaluation.snapshot, result: evaluation.result, provenance: evaluation.provenance },
  });
}

export function applyEvaluationAnnotations(row, annotations) {
  const view = { ...row };
  for (const event of [...annotations].sort((a, b) =>
    a.recorded_at.localeCompare(b.recorded_at) || a.event_id.localeCompare(b.event_id))) {
    const payload = event.payload || {};
    if (event.kind === "plan_accepted") {
      view.plan_accepted_at = event.effective_at;
      view.housing_plan = {
        ...(view.housing_plan || {}), ...(payload.housing_plan || {}),
        ...(payload.plan_type ? { plan_type: payload.plan_type } : {})
      };
    } else if (event.kind === "housing_plan") {
      view.housing_plan = payload.housing_plan;
    } else if (event.kind === "narrative") {
      // Overlay for display only; the immutable stored result remains untouched.
      view.financial_data = {
        ...(view.financial_data || {}), result: {
          ...(view.financial_data?.result || {}),
          ...Object.fromEntries(["ai_explanation", "executive_summary", "commercial_guidance"]
            .filter((key) => payload[key] !== undefined).map((key) => [key, sanitizeAiText(payload[key])])),
        }
      };
    }
  }
  return view;
}

export function evaluationAnnotationOwner(role, userId) {
  return role === "ejecutivo" || role === "admin" ? null : userId;
}

export async function getEvaluations(userId, role) {
  requireConnection();
  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para cargar calificaciones.");
  await ensureUserProfile(user);
  const isSales = role === "ejecutivo" || role === "admin";
  let query = supabase.from("evaluations").select("*").order("created_at", { ascending: false });
  if (!isSales) query = query.eq("user_id", user.id);
  const { data, error } = await query;
  if (error) throw error;
  let contactsMap = {};
  if (isSales && data?.length) {
    const { data: contacts } = await supabase.rpc("list_lead_contacts", {
      p_user_ids: [...new Set(data.map((row) => row.user_id))],
    });
    contactsMap = Object.fromEntries((contacts || []).map((contact) => [contact.id, contact]));
  }
  if (!data?.length) return [];
  let annotationQuery = supabase.from("evaluation_events").select("*")
    .in("evaluation_id", data.map((row) => row.id));
  const annotationOwner = evaluationAnnotationOwner(role, user.id);
  if (annotationOwner) annotationQuery = annotationQuery.eq("user_id", annotationOwner);
  const { data: annotations, error: annotationError } = await annotationQuery
    .order("recorded_at", { ascending: true });
  if (annotationError) throw annotationError;
  return (data || []).map((row) => normalizeEvaluation(
    applyEvaluationAnnotations(row, (annotations || []).filter((event) => event.evaluation_id === row.id)), contactsMap));
}

export async function getLatestEvaluation(userId) {
  const tracking = await getTracking();
  if (!tracking.current_evaluation_id) return null;
  return (await getEvaluations(userId)).find((row) => row.id === tracking.current_evaluation_id) || null;
}

export async function deleteEvaluation() {
  throw new Error("El historial es inmutable. Usa una corrección o anulación desde Mi progreso.");
}

async function annotateAndRead(evaluationId, userId, kind, payload, { tolerateReadFailure = false } = {}) {
  const event = await annotateEvaluation(evaluationId, kind, payload);
  try {
    const evaluation = (await getEvaluations(userId)).find((row) => row.id === evaluationId) || null;
    if (!tolerateReadFailure) return evaluation;
    return {
      event,
      evaluation,
      refreshError: evaluation ? null : new Error("No se encontró la evaluación después de persistir la anotación."),
    };
  } catch (refreshError) {
    if (!tolerateReadFailure) throw refreshError;
    return { event, evaluation: null, refreshError };
  }
}

export async function acceptEvaluationPlan(evaluationId, userId, updates = {}) {
  // La anotación ya quedó confirmada antes de leer nuevamente. Una falla de
  // refresco no puede convertir esa escritura persistida en un falso error.
  return annotateAndRead(evaluationId, userId, "plan_accepted", updates, {
    tolerateReadFailure: true,
  });
}

export function applyAcceptedPlanEvent(evaluation, event) {
  if (!evaluation || !event) return evaluation;
  const payload = event.payload || {};
  const housingPlan = {
    ...(evaluation.housing_plan || {}),
    ...(payload.housing_plan || {}),
    ...(payload.plan_type ? { plan_type: payload.plan_type } : {}),
  };

  return {
    ...evaluation,
    plan_accepted_at: event.effective_at || evaluation.plan_accepted_at || null,
    housing_plan: housingPlan,
    plan_type: payload.plan_type || housingPlan.plan_type || evaluation.plan_type || null,
  };
}

export async function saveHousingPlanProgress(evaluationId, userId, housingPlan) {
  return annotateAndRead(evaluationId, userId, "housing_plan", { housing_plan: housingPlan });
}

export async function updateEvaluationAiContent(evaluationId, updates = {}) {
  if (!evaluationId || !Object.keys(updates).length) return null;
  return annotateAndRead(evaluationId, null, "narrative", updates);
}
