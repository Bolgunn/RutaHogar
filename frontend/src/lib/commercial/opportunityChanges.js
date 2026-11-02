import { formatFormValue } from "../../constants";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const number = (value) => {
  if (value == null || value === "" || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const text = (value) => value == null || value === "" ? null : typeof value === "boolean" ? (value ? "si" : "no") : String(value).trim().toLowerCase();

// Display observed input changes; these are not contributions to score points.
export function buildOpportunityChanges(previous, latest) {
  if (!previous || !latest) return [];
  const before = previous.input || {}, after = latest.input || {};
  const changes = [];
  for (const [key, label, direction] of [
    ["ahorro_disponible", "Ahorro disponible", 1],
    ["ingreso_mensual", "Ingreso mensual", 1],
    ["deuda_mensual", "Deuda mensual", -1],
    ["dividendo_estimado", "Dividendo estimado", -1],
    ["monto_morosidad", "Monto de morosidad", -1],
    ["ingreso_mensual_complementario", "Ingreso complementario", 1],
    ["deuda_mensual_complementario", "Deuda complementaria", -1],
  ]) {
    // Inactive complement inputs can be stale; do not present them as effective income.
    if (key.endsWith("_complementario") && (text(before.complemento_renta) !== "si" || text(after.complemento_renta) !== "si")) continue;
    const oldValue = number(before[key]), newValue = number(after[key]);
    if (oldValue == null || newValue == null || oldValue === newValue) continue;
    const delta = newValue - oldValue;
    changes.push({ key, label, difference: `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`, before: money(oldValue), after: money(newValue), tone: delta * direction > 0 ? "positive" : "negative" });
  }
  for (const [key, label] of [
    ["tipo_contrato", "Tipo de contrato"],
    ["continuidad_laboral", "Continuidad laboral"],
    ["morosidad_actual", "Morosidad actual"],
    ["antiguedad_morosidad", "Antigüedad de morosidad"],
    ["complemento_renta", "Complemento de renta"],
    ["plazo_credito_hipotecario", "Plazo del crédito"],
    ["tipo_contrato_complementario", "Contrato complementario"],
    ["continuidad_laboral_complementario", "Continuidad complementaria"],
    ["morosidad_complementario", "Morosidad complementaria"],
  ]) {
    if (key.endsWith("_complementario") && (text(before.complemento_renta) !== "si" || text(after.complemento_renta) !== "si")) continue;
    const oldValue = text(before[key]), newValue = text(after[key]);
    if (oldValue == null || newValue == null || oldValue === newValue) continue;
    const format = (value) => key === "plazo_credito_hipotecario" && /^\d+$/.test(value) ? `${value} años` : formatFormValue(value);
    changes.push({ key, label, difference: "Actualizado", before: format(oldValue), after: format(newValue), tone: "neutral" });
  }
  return changes;
}
