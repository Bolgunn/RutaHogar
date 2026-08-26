export function resolveActiveComparison(comparison, selectorComparison) {
  if (comparison?.source === "accessible-option" && comparison.current && comparison.alternative) {
    return comparison;
  }
  if (selectorComparison?.current && selectorComparison.alternative) {
    return selectorComparison;
  }
  return null;
}

export function shouldShowComparisonWarning(comparison, activeComparison, showScenarioWarning) {
  return Boolean(comparison?.error && !activeComparison && !showScenarioWarning);
}
