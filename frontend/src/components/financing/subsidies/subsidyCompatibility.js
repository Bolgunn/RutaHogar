import { normalizeBenefitIdentifier } from "../../../lib/financing/benefitScenario";

const normalized = (value) => String(value || "").replace(/\s+/g, " ").trim();

function assessmentFor(evaluation, identifier) {
  return (evaluation?.result?.housing_benefits?.applicable_benefits || [])
    .find((item) => normalizeBenefitIdentifier(item?.type) === normalizeBenefitIdentifier(identifier)) || null;
}

function ds1Tramo(assessment) {
  return normalized(assessment?.notes).match(/Tramo\s+(I{1,3})/i)?.[1]?.toUpperCase() || null;
}

export function subsidyCompatibility(subsidy, evaluation) {
  const assessment = assessmentFor(evaluation, subsidy.benefitIdentifier);
  const reasons = assessment?.conditions_not_met || [];
  if (!assessment) return { compatible: false, reasons: ["No hay una evaluación disponible para este beneficio."] };
  if (subsidy.benefitIdentifier !== "DS1" || !subsidy.tramo) {
    return { compatible: assessment.eligible === true, reasons };
  }
  if (!assessment.eligible) return { compatible: false, reasons };
  const detectedTramo = ds1Tramo(assessment);
  if (!detectedTramo || detectedTramo === subsidy.tramo) return { compatible: true, reasons: [] };
  return { compatible: false, reasons: [`Tu evaluación actual se ajusta al DS1 Tramo ${detectedTramo}, no al Tramo ${subsidy.tramo}.`] };
}
