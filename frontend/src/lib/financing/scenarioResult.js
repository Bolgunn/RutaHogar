import { calculateMortgageDividendFromPrincipal } from "../mortgage";
import { displayStatus } from "./benefitScenario";

const HEALTHY = 0.25;
const DIVIDEND_MAX = 0.30;
const BURDEN_MAX = 0.45;
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

function appliedAnnualRate(draft, benefit) {
  const annualRate = Math.max(0, Number(draft?.tasa_anual || 0));
  if (benefit?.selected !== "LEY_21748" || !benefit?.eligible) return { annualRate, reduction: 0 };
  const reduction = Math.max(0, Number(benefit?.entry?.rate_reduction_percentage_points || 0) / 100);
  return { annualRate: Math.max(0, annualRate - reduction), reduction };
}

export function classifyFinancialScenario({ precio_clp, credito_clp, dividendo_clp, renta_total_clp, deuda_mensual_clp, ltv_referencial }) {
  const price = finite(precio_clp); const credit = finite(credito_clp); const dividend = finite(dividendo_clp);
  const income = finite(renta_total_clp); const debt = finite(deuda_mensual_clp); const ltvLimit = finite(ltv_referencial);
  if (!(price > 0) || !(income > 0) || credit === null || dividend === null || !(ltvLimit > 0)) {
    return { financial_status: "Sin datos suficientes", reasons: ["Faltan datos para calcular las referencias."], ratios: {} };
  }
  const dividendRatio = dividend / income;
  const burdenRatio = (debt + dividend) / income;
  const ltvRatio = credit / price;
  let financial_status = "Requiere ajuste";
  if (dividendRatio <= HEALTHY && burdenRatio <= BURDEN_MAX && ltvRatio <= ltvLimit) financial_status = "Compatible";
  else if (dividendRatio <= DIVIDEND_MAX && burdenRatio <= BURDEN_MAX && ltvRatio <= ltvLimit) financial_status = "Cercano";
  const reasons = [];
  if (dividendRatio > DIVIDEND_MAX) reasons.push("El dividendo supera la referencia máxima.");
  if (burdenRatio > BURDEN_MAX) reasons.push("La carga total supera la referencia.");
  if (ltvRatio > ltvLimit) reasons.push("El financiamiento supera la referencia LTV.");
  return { financial_status, reasons, ratios: { dividend_ratio: dividendRatio, total_burden_ratio: burdenRatio, ltv_ratio: ltvRatio } };
}

export function buildReferenceAdjustment(result, draft, ltvLimit) {
  if (!result || !["Cercano", "Requiere ajuste"].includes(result.financial_status)) return null;
  const income = Number(draft.renta_propia_clp) + (draft.usar_renta_complementaria !== false ? Number(draft.renta_complementaria_clp) : 0);
  const debt = Number(draft.deuda_mensual_clp);
  const byDividend = income * HEALTHY;
  const byBurden = income * BURDEN_MAX - debt;
  const principal = Number(result.credito_clp);
  const payment = Number(result.dividendo_clp);
  const ratioLimit = Math.max(0, Math.min(byDividend, byBurden));
  if (!Number.isFinite(ratioLimit) || payment <= 0) return null;
  const principalByPayment = principal * Math.min(1, ratioLimit / payment);
  const price = Number(result.precio_clp);
  const adjustedCredit = Math.max(0, Math.min(principalByPayment, price * Number(ltvLimit)));
  if (!Number.isFinite(adjustedCredit) || adjustedCredit >= principal) return null;
  return { credito_clp: Math.round(adjustedCredit), pie_clp: Math.round(price - adjustedCredit - Number(result.subsidio_principal_clp || 0)) };
}

function benefitRangeImpact({ range, precio_clp, pie_clp, draft }) {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [low, high] = range.map(Number).sort((left, right) => left - right);
  if (!(low >= 0) || !(high >= low) || !(precio_clp > 0)) return null;
  const creditFor = (subsidy) => Math.max(0, precio_clp - Number(pie_clp || 0) - subsidy);
  const dividendFor = (credit) => calculateMortgageDividendFromPrincipal({ principalClp: credit, termYears: draft?.plazo_anios, annualRate: draft?.tasa_anual }).dividend;
  const creditHigh = creditFor(low);
  const creditLow = creditFor(high);
  return {
    subsidio_min_clp: low,
    subsidio_max_clp: high,
    credito_min_clp: creditLow,
    credito_max_clp: creditHigh,
    dividendo_min_clp: dividendFor(creditLow),
    dividendo_max_clp: dividendFor(creditHigh),
  };
}

export function calculateScenarioResult({ draft, ufReference, marketReference, benefit }) {
  const uf = finite(ufReference?.uf_value_clp);
  const precio_clp = Number(draft?.precio_uf) * uf;
  const subsidy = Number(benefit?.amount_clp) || 0;
  const availableAfterSubsidy = Math.max(0, precio_clp - subsidy);
  const manualCredit = draft?.composition_mode === "credito";
  const credito = manualCredit
    ? Math.min(availableAfterSubsidy, Math.max(0, Number(draft?.credito_clp || 0)))
    : Math.max(0, availableAfterSubsidy - Number(draft?.pie_clp || 0));
  const pie = manualCredit
    ? Math.max(0, precio_clp - subsidy - credito)
    : Math.min(availableAfterSubsidy, Math.max(0, Number(draft?.pie_clp || 0)));
  const rate = appliedAnnualRate(draft, benefit);
  const mortgage = calculateMortgageDividendFromPrincipal({ principalClp: credito, termYears: draft?.plazo_anios, annualRate: rate.annualRate });
  const renta_total = Number(draft?.renta_propia_clp || 0) + (draft?.usar_renta_complementaria !== false ? Number(draft?.renta_complementaria_clp || 0) : 0);
  const classification = classifyFinancialScenario({ precio_clp, credito_clp: credito, dividendo_clp: mortgage.dividend, renta_total_clp: renta_total, deuda_mensual_clp: draft?.deuda_mensual_clp, ltv_referencial: marketReference?.ltv_referencial });
  const result = {
    precio_uf: Number(draft?.precio_uf), precio_clp, pie_clp: pie, credito_clp: credito,
    subsidio_principal_clp: subsidy, dividendo_clp: mortgage.dividend, renta_total_clp: renta_total,
    tasa_anual_aplicada: rate.annualRate, tasa_reduccion_anual: rate.reduction,
    ...classification, benefit, uf_reference: ufReference,
    benefit_range_impact: benefitRangeImpact({ range: benefit?.estimated_range_clp, precio_clp, pie_clp: pie, draft }),
  };
  return { ...result, display_status: displayStatus(result.financial_status, benefit), reference_adjustment: buildReferenceAdjustment(result, draft, marketReference?.ltv_referencial) };
}
