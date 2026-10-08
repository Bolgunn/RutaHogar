const supportedStatuses = new Set(["Cercano", "Requiere ajuste"]);
const scenarioStatuses = new Set(["Compatible", "Cercano", "Requiere ajuste"]);

export function persistedScenarioStatus(resultSnapshot) {
  const status = resultSnapshot?.financial_status;
  return scenarioStatuses.has(status) ? status : "Requiere ajuste";
}

export function suggestedDraftFromResult(draft, result) {
  const adjustment = result?.reference_adjustment;
  if (!adjustment) return { ...draft, composition_mode: draft?.composition_mode || "pie", isAdjusted: false };
  return {
    ...draft,
    pie_clp: adjustment.pie_clp,
    credito_clp: adjustment.credito_clp,
    composition_mode: "pie",
    isAdjusted: true,
  };
}

export function referenceAlternatives(draft, result) {
  if (!supportedStatuses.has(result?.financial_status) || !result?.reference_adjustment) return [];
  const nextDraft = suggestedDraftFromResult(draft, result);
  return [{
    id: "reference-down-payment",
    title: "Aumentar el pie",
    current: Number(result.pie_clp) || 0,
    suggested: Number(nextDraft.pie_clp) || 0,
    difference: Math.max(0, Number(nextDraft.pie_clp || 0) - Number(result.pie_clp || 0)),
    draft: nextDraft,
  }];
}
