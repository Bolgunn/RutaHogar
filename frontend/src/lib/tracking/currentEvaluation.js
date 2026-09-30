// The Plan de mejora and project catalog use the latest effective evaluation,
// while ALG-13 reads the separate frozen target in the tracking payload.
export function currentTrackingEvaluation(trackingState, evaluations = [], userId = null) {
  if (trackingState?.status === "active") {
    return evaluations.find((row) => row.id === trackingState.current_evaluation_id) ||
      (trackingState.current_evaluation ? {
        id: trackingState.current_evaluation_id,
        user_id: userId,
        input: trackingState.latest_effective_snapshot,
        result: trackingState.current_evaluation,
      } : null);
  }
  return [...evaluations].sort((left, right) => new Date(right.created_at) - new Date(left.created_at))[0] || null;
}
