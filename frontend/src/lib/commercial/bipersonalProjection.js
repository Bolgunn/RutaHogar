export const participationFilters = [
  ["all", "Todos"], ["individual", "Titular individual"], ["bipersonal_confirmed", "Con co-deudor"],
];
export const staffTypeLabels = {
  individual: "Titular individual", bipersonal_confirmed: "Bipersonal confirmado",
  declared_complement: "Complemento declarado", unverifiable_origin: "Origen no verificable",
};
export function staffEvaluationType(projection) {
  return projection?.version === "hu30-projection-v1" && Object.hasOwn(staffTypeLabels, projection.evaluation_type)
    ? projection.evaluation_type : null;
}
export function matchesParticipationFilter(projection, filter) {
  return filter === "all" || (staffEvaluationType(projection) === filter && ["individual", "bipersonal_confirmed"].includes(filter));
}
export const staffSourceLabels = {
  co_debtor_confirmed: "Antecedentes confirmados por el co-deudor y utilizados en esta evaluación",
  lead_declared: "Antecedentes declarados por el titular, sin confirmación utilizada",
  unverifiable_origin: "No se puede verificar el origen de los antecedentes utilizados",
};
export const staffRiskLabels = {
  complemento_debil: "Complemento de renta débil", complemento_incompleto: "Antecedentes complementarios incompletos",
  morosidad_vigente: "Morosidad vigente", carga_total_alta: "Carga financiera total alta",
  deuda_actual_alta: "Deuda actual alta", pie_insuficiente: "Pie insuficiente",
  dividendo_exigente: "Dividendo exigente", edad_plazo_riesgoso: "Plazo y edad requieren revisión",
};
export const staffRiskSeverities = {
  info: ["Informativo", "info"], low: ["Leve", "info"], medium: ["Media", "warning"],
  high: ["Alta", "warning"], critical: ["Crítica", "warning"],
};
