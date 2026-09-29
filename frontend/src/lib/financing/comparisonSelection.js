export function toggleComparisonSelection(ids = [], scenarioId) {
  const current = Array.isArray(ids) ? ids : [];
  if (current.includes(scenarioId)) return { ids: current.filter((id) => id !== scenarioId), limited: false };
  if (current.length >= 2) return { ids: current, limited: true };
  return { ids: [...current, scenarioId], limited: false };
}
