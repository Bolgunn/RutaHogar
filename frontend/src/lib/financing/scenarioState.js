export function synchronizeScenario(draft) {
  return draft ? { ...draft } : null;
}

export function applyDraftScenario(draft, result) {
  if (!draft) return null;
  return {
    ...draft,
    credito_clp: Number.isFinite(Number(result?.credito_clp)) ? Number(result.credito_clp) : draft.credito_clp,
  };
}
