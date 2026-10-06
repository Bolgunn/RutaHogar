import { supabase } from "../utils/supabase";
import { normalizeDisplayList, normalizeDisplayText, normalizeImprovementPlan, sanitizeAiText } from "../utils/text";
import { ensureUserProfile, getAuthenticatedUser, logSupabaseError } from "./profileService";
import { isStaffRole } from "../lib/roles";
import { annotateEvaluation, appendTrackingEvent, getStaffEvaluations, getTracking, newTrackingCommand } from "./trackingService";

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
  const contact = contactsMap[row.user_id] || row;
  const input = financialData.input || financialData.input_snapshot || financialData;
  const onboardingSnapshot = input?.onboarding_snapshot;
  const hasSnapshotField = (field) => Object.prototype.hasOwnProperty.call(onboardingSnapshot || {}, field);

  const onboarding = {
    objetivo_principal: hasSnapshotField("objetivo_principal") ? onboardingSnapshot.objetivo_principal : row.objective || "",
    tipo_propiedad: hasSnapshotField("tipo_propiedad") ? onboardingSnapshot.tipo_propiedad : row.property_type || "",
    comuna_interes: hasSnapshotField("comuna_interes") ? onboardingSnapshot.comuna_interes : input?.comuna_objetivo || row.target_commune || "",
    comuna_alternativa: hasSnapshotField("comuna_alternativa") ? onboardingSnapshot.comuna_alternativa : input?.comuna_alternativa || row.alternative_commune || "",
    plazo_compra: hasSnapshotField("plazo_compra") ? onboardingSnapshot.plazo_compra : input?.plazo_compra || row.purchase_timeline || "",
    tiene_propiedad_vista: hasSnapshotField("tiene_propiedad_vista")
      ? onboardingSnapshot.tiene_propiedad_vista === true
      : input?.tiene_propiedad_vista,
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
    profile: {
      nombre: contact.nombre || null,
      apellido_paterno: contact.apellido_paterno || null,
      apellido_materno: contact.apellido_materno || null,
      rut: contact.rut || null,
      phone: contact.phone || null,
    },
    user_id: row.user_id,
    onboarding,
    input,
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
    plan_type: entry.plan_type || entry.housing_plan?.plan_type || null,
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
    fraud_score_probability: result.fraud_score_probability ?? null,
    shap_top_factors: result.shap_top_factors ?? null,
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
  return isStaffRole(role) ? null : userId;
}

export async function getEvaluations(userId, role) {
  requireConnection();
  const user = await getAuthenticatedUser();
  if (!user?.id) throw new Error("No hay usuario autenticado para cargar calificaciones.");
  await ensureUserProfile(user);
  const isSales = isStaffRole(role);
  if (isSales) {
    // HU18: staff lee evaluaciones solo vía la proyección del backend (redacta datos del codeudor).
    const projection = await getStaffEvaluations();
    const rows = projection.items || [];
    const contactsMap = await listLeadContacts(rows);
    return rows.map((row) => normalizeEvaluation(row, contactsMap));
  }
  const { data, error } = await supabase.from("evaluations").select("*")
    .eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  if (!data?.length) return [];
  let annotationQuery = supabase.from("evaluation_events").select("*")
    .in("evaluation_id", data.map((row) => row.id));
  const annotationOwner = evaluationAnnotationOwner(role, user.id);
  if (annotationOwner) annotationQuery = annotationQuery.eq("user_id", annotationOwner);
  const { data: annotations, error: annotationError } = await annotationQuery
    .order("recorded_at", { ascending: true });
  if (annotationError) throw annotationError;
  return data.map((row) => normalizeEvaluation(
    applyEvaluationAnnotations(row, (annotations || []).filter((event) => event.evaluation_id === row.id)), {}));
}

// OVERLAP: HU12/HU16 leen nombre, RUT y reliability_status de list_lead_contacts; HU18 trae solo
// nombre y teléfono en la proyección. Se mantienen ambos hasta unificar la proyección staff.
async function listLeadContacts(rows) {
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (!userIds.length) return {};
  const { data: contactsData, error: contactsError } = await supabase
    .rpc("list_lead_contacts", { p_user_ids: userIds });
  if (contactsError) {
    logSupabaseError(contactsError);
    return {};
  }
  return Object.fromEntries((contactsData || []).map((contact) => [
    contact.id,
    { ...contact, reliability_status: contact.reliability_status || "normal" },
  ]));
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
