import { BENEFIT_ESTIMATION_BASELINE, baselineAmountRangeClp } from "./benefitEstimationBaseline";

const PRIMARY = new Set(["DS1", "DS49"]);
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const normalizeBenefitIdentifier = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function normalizedRange(range) {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const values = range.map(Number);
  if (!values.every(Number.isFinite) || values.some((value) => value < 0)) return null;
  return values.sort((left, right) => left - right);
}

// The middle option is only a deterministic reference for this simulation.
// It is derived from the reviewed range and never becomes catalogue data.
export function rangeSimulationOptions(range) {
  const bounds = normalizedRange(range);
  if (!bounds) return [];
  const [minimum, maximum] = bounds;
  if (minimum === maximum) return [{ kind: "single", label: "Monto disponible", amount: minimum }];
  return [
    { kind: "minimum", label: "Mínimo", amount: minimum },
    { kind: "middle", label: "Intermedio", amount: (minimum + maximum) / 2 },
    { kind: "maximum", label: "Máximo", amount: maximum },
  ];
}

function conditions(entry, evaluation = {}, project = {}) {
  const rules = entry?.eligibility || {};
  const input = evaluation?.input || evaluation || {};
  const reasons = [];
  if (rules.vivienda_nueva === true && project?.vivienda_nueva !== true) reasons.push("Requiere vivienda nueva.");
  if (Number.isFinite(Number(rules.max_precio_uf)) && Number(project?.precio_uf) > Number(rules.max_precio_uf)) reasons.push("El precio supera el máximo informado.");
  if (Number.isFinite(Number(rules.min_ahorro_clp)) && Number(input.ahorro_disponible) < Number(rules.min_ahorro_clp)) reasons.push("El ahorro declarado no alcanza el mínimo informado.");
  return reasons;
}

function assessedBenefit(entry, evaluation) {
  const id = normalizeBenefitIdentifier(entry?.identifier);
  return (evaluation?.result?.housing_benefits?.applicable_benefits || [])
    .find((item) => normalizeBenefitIdentifier(item?.type) === id);
}

function baselineEntry(identifier) {
  return BENEFIT_ESTIMATION_BASELINE.entries.find((item) => item.identifier === identifier) || null;
}

export function benefitOptions(catalogue) {
  const published = catalogue?.entries || [];
  if (!published.length) return BENEFIT_ESTIMATION_BASELINE.entries;
  return published;
}

export function benefitDisplay(entry, evaluation, ufValue) {
  if (!entry) return { label: "Sin beneficio", detail: "" };
  const baseline = baselineEntry(entry.identifier);
  const catalogueAmount = numeric(entry?.value?.amount_clp);
  if (catalogueAmount > 0) return { label: "Monto oficial", amount_clp: catalogueAmount, detail: "Monto revisado para esta simulación." };
  if (baseline?.kind === "base") return { label: "Aporte base", amount_clp: baseline.amount_uf * numeric(ufValue), amount_uf: baseline.amount_uf, detail: baseline.note };
  const range = baselineAmountRangeClp(baseline, evaluation, ufValue);
  if (range) return { label: "Rango referencial", amount_range_clp: range, amount_range_uf: baseline.amount_range_uf, detail: baseline.note };
  return { label: "Revisar condiciones", detail: baseline?.note || "Revisa las condiciones del beneficio." };
}

export function evaluateBenefit(entry, evaluation, project, ufValue) {
  if (!entry) return { selected: null, eligible: true, amount_clp: 0, reasons: [] };
  const assessed = assessedBenefit(entry, evaluation);
  const baseline = baselineEntry(entry.identifier);
  const reasons = [...new Set([
    ...(assessed?.conditions_not_met?.filter(Boolean) || []),
    ...conditions(entry, evaluation, project),
    ...conditions(baseline, evaluation, project),
  ])];
  const isPrimary = PRIMARY.has(entry.identifier);
  const display = benefitDisplay(entry, evaluation, ufValue);
  const amount = isPrimary ? Math.max(0, numeric(display.amount_clp)) : 0;
  return {
    selected: entry.identifier,
    eligible: reasons.length === 0,
    amount_clp: amount,
    estimated_range_clp: display.amount_range_clp || null,
    amount_kind: display.amount_clp ? (numeric(entry?.value?.amount_clp) > 0 ? "official" : "base") : display.amount_range_clp ? "range" : "information",
    label: display.label,
    note: display.detail,
    reasons,
    entry,
  };
}

export function applyRangeReferenceAmount(benefit, selectedAmount) {
  if (benefit?.amount_kind !== "range" || !Array.isArray(benefit.estimated_range_clp)) return benefit;
  const bounds = normalizedRange(benefit.estimated_range_clp);
  if (!bounds) return benefit;
  const [minimum, maximum] = bounds;
  const amount = Number(selectedAmount);
  if (!Number.isFinite(amount) || amount < minimum || amount > maximum) return benefit;
  return {
    ...benefit,
    amount_clp: amount,
    amount_kind: "range_selected",
    selected_range_amount_clp: amount,
    range_reference_clp: [minimum, maximum],
    note: "Monto de referencia elegido dentro del rango.",
  };
}

export function displayStatus(financialStatus, benefit) {
  return benefit?.selected && !benefit.eligible ? "No aplicable actualmente" : financialStatus;
}
