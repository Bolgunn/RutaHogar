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

export function currentTrackingEvaluation(trackingState, evaluations = [], userId = null) {
  if (trackingState?.status === "active") {
    const current = evaluations.find((row) => row.id === trackingState.current_evaluation_id) ||
      (trackingState.current_evaluation ? {
        id: trackingState.current_evaluation_id,
        user_id: userId,
        input: trackingState.latest_effective_snapshot,
        result: trackingState.current_evaluation,
      } : null);
    return preservePlanChoice(current, evaluations);
  }
  const latest = [...evaluations].sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
  return preservePlanChoice(latest, evaluations);
}
