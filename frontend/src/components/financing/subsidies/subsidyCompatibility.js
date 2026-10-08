import { normalizeBenefitIdentifier } from "../../../lib/financing/benefitScenario";

function assessmentFor(evaluation, identifier) {
  return (evaluation?.result?.housing_benefits?.applicable_benefits || [])
    .find((item) => normalizeBenefitIdentifier(item?.type) === normalizeBenefitIdentifier(identifier)) || null;
}

export function subsidyCompatibility(subsidy, evaluation) {
  const assessment = assessmentFor(evaluation, subsidy.benefitIdentifier);
  const reasons = assessment?.conditions_not_met || [];
  if (!assessment) return { compatible: false, reasons: ["No hay una evaluación disponible para este beneficio."] };
  return { compatible: assessment.eligible === true, reasons };
}
