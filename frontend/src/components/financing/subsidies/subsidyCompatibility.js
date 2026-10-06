const normalized = (value) => String(value || "").replace(/\s+/g, " ").trim();

function assessmentFor(evaluation, identifier) {
  return (evaluation?.result?.housing_benefits?.applicable_benefits || [])
    .find((item) => item?.type === identifier) || null;
}

function ds1Tramo(assessment) {
  return normalized(assessment?.notes).match(/Tramo\s+(I{1,3})/i)?.[1]?.toUpperCase() || null;
}

export function subsidyCompatibility(subsidy, evaluation, benefitStates = {}) {
  const state = benefitStates[subsidy.benefitIdentifier] || { eligible: false, reasons: [] };
  if (subsidy.benefitIdentifier !== "DS1" || !subsidy.tramo) {
    return { compatible: state.eligible, reasons: state.reasons || [] };
  }
  const assessment = assessmentFor(evaluation, "DS1");
  if (!state.eligible) return { compatible: false, reasons: state.reasons || assessment?.conditions_not_met || [] };
  const detectedTramo = ds1Tramo(assessment);
  if (!detectedTramo || detectedTramo === subsidy.tramo) return { compatible: true, reasons: [] };
  return { compatible: false, reasons: [`Tu evaluación actual se ajusta al DS1 Tramo ${detectedTramo}, no al Tramo ${subsidy.tramo}.`] };
}
