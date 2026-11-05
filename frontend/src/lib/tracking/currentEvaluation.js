// The Plan de mejora and project catalog use the latest effective evaluation,
// while ALG-13 reads the separate frozen target in the tracking payload.
function projectGoalId(evaluation) {
  const id = evaluation?.input?.project_goal?.id;
  return id == null || id === "" ? null : id;
}

function latestPersistedPlan(evaluations, targetProjectId) {
  if (targetProjectId == null) return null;
  return [...evaluations]
    .filter((evaluation) => projectGoalId(evaluation) === targetProjectId
      && (evaluation?.plan_type || evaluation?.housing_plan?.plan_type))
    .sort((left, right) => new Date(right.plan_accepted_at || right.created_at)
      - new Date(left.plan_accepted_at || left.created_at))[0] || null;
}

function preservePlanChoice(evaluation, evaluations) {
  if (!evaluation || evaluation.plan_type || evaluation.housing_plan?.plan_type) return evaluation;
  const savedPlan = latestPersistedPlan(evaluations, projectGoalId(evaluation));
  if (!savedPlan) return evaluation;
  const planType = savedPlan.plan_type || savedPlan.housing_plan?.plan_type;
  return {
    ...evaluation,
    plan_type: planType,
    housing_plan: { ...(evaluation.housing_plan || {}), plan_type: planType },
  };
}

// HU 29 E4: la meta de ahorro en verde es periódica y vive en el housing_plan de
// la evaluación donde se fijó. Cada actualización mensual (HU 13) crea una
// evaluación nueva sin esa anotación; sin este traspaso la meta desaparecería
// del dashboard después del primer registro. Se conserva la meta más reciente
// mientras siga apuntando al mismo proyecto objetivo (o no tenga proyecto).
function goalTime(goal) {
  const time = new Date(goal?.fixed_at || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function preserveGreenSavingsGoal(evaluation, evaluations = []) {
  if (!evaluation || evaluation.housing_plan?.green_savings_goal) return evaluation;
  const targetProjectId = projectGoalId(evaluation);
  const latestGoal = evaluations
    .map((row) => row?.housing_plan?.green_savings_goal)
    .filter((goal) => goal && Number(goal.cuota_mensual_uf) > 0)
    .filter((goal) => goal.project_id == null || targetProjectId == null
      || String(goal.project_id) === String(targetProjectId))
    .sort((left, right) => goalTime(right) - goalTime(left))[0];
  if (!latestGoal) return evaluation;
  return {
    ...evaluation,
    housing_plan: { ...(evaluation.housing_plan || {}), green_savings_goal: latestGoal },
  };
}

export function currentTrackingEvaluation(trackingState, evaluations = [], userId = null) {
  evaluations = evaluations.filter((row) => !userId || !row.user_id || row.user_id === userId);
  if (userId && trackingState?.baseline?.user_id && trackingState.baseline.user_id !== userId) return null;
  if (trackingState?.status === "active") {
    const current = evaluations.find((row) => row.id === trackingState.current_evaluation_id) ||
      (trackingState.current_evaluation ? {
        id: trackingState.current_evaluation_id,
        user_id: userId,
        input: trackingState.latest_effective_snapshot,
        result: trackingState.current_evaluation,
        co_debtor: trackingState.co_debtor || null,
      } : null);
    return preserveGreenSavingsGoal(preservePlanChoice(current, evaluations), evaluations);
  }
  const latest = [...evaluations].sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
  return preserveGreenSavingsGoal(preservePlanChoice(latest, evaluations), evaluations);
}
