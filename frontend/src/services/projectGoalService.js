import { buildFinancialInput } from "../lib/financialInput";
import { buildProjectGoalInput } from "../lib/projectGoalInput";
import { createEvaluation } from "./evaluationService";

export class ProjectGoalFlowError extends Error {
  constructor(stage, message, { status = null, detail = null, cause = null } = {}) {
    super(message);
    this.name = "ProjectGoalFlowError";
    this.stage = stage;
    this.status = status;
    this.detail = detail;
    this.cause = cause;
  }
}

function responseDetail(body) {
  if (typeof body?.detail === "string") return body.detail;
  if (Array.isArray(body?.detail)) {
    return body.detail
      .map((item) => `${(item.loc || []).join(".")}: ${item.msg || item.type || "invalid"}`)
      .join("; ");
  }
  return null;
}

export function projectGoalUserMessage(error) {
  if (error?.stage === "persistence") {
    return "Recalculamos tu plan, pero no pudimos guardarlo. Intenta nuevamente.";
  }
  if (["payload", "score_request", "score_response"].includes(error?.stage)) {
    return "No pudimos recalcular tu plan para este proyecto. Revisa tu precalificación e intenta nuevamente.";
  }
  return "No pudimos fijar el proyecto como meta. Intenta nuevamente.";
}

export async function setProjectGoal({
  apiBase,
  consentGranted,
  currentEvaluation,
  normalizeResult = (value) => value,
  onboarding,
  profile,
  project,
  fetchImpl = fetch,
  createEvaluationImpl = createEvaluation,
}) {
  if (!currentEvaluation?.input) {
    throw new ProjectGoalFlowError("payload", "No hay una precalificación base disponible.");
  }
  if (!profile?.id) {
    throw new ProjectGoalFlowError("persistence", "No hay un perfil autenticado para guardar la meta.");
  }

  const consentimiento = currentEvaluation.input.consentimiento === true || consentGranted === true;
  if (!consentimiento) {
    throw new ProjectGoalFlowError("payload", "La precalificación no contiene un consentimiento vigente.");
  }

  const goalInput = buildProjectGoalInput(
    { ...currentEvaluation.input, consentimiento },
    project,
  );
  const payload = buildFinancialInput(goalInput);

  let response;
  try {
    response = await fetchImpl(`${String(apiBase || "").replace(/\/$/, "")}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new ProjectGoalFlowError("score_request", "No fue posible contactar el motor de precalificación.", { cause });
  }

  let scoreResult;
  try {
    scoreResult = await response.json();
  } catch (cause) {
    throw new ProjectGoalFlowError("score_response", "El motor devolvió una respuesta inválida.", {
      status: response.status,
      cause,
    });
  }

  if (!response.ok) {
    throw new ProjectGoalFlowError("score_request", "El motor rechazó la precalificación.", {
      status: response.status,
      detail: responseDetail(scoreResult),
    });
  }

  const marketSnapshot = scoreResult?.financial_indicators?.capacidad_supuestos?.market_snapshot;
  if (!marketSnapshot || typeof scoreResult?.score !== "number") {
    throw new ProjectGoalFlowError("score_response", "La respuesta no contiene el snapshot de mercado utilizado.", {
      status: response.status,
    });
  }

  try {
    return await createEvaluationImpl(profile.id, {
      email: profile.email || "sin-email",
      onboarding: onboarding || null,
      input: { ...payload, project_goal: goalInput.project_goal },
      result: normalizeResult(scoreResult),
      // project_selection remains explicit in input.property_value_source.
      // scoring_history.channel only accepts documented acquisition channels.
      channel: "web",
    });
  } catch (cause) {
    throw new ProjectGoalFlowError("persistence", "No fue posible guardar la evaluación del proyecto.", { cause });
  }
}
