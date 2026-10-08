const TERMS = [10, 15, 20, 25, 30];
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function allowedTerms(age) {
  const parsedAge = number(age, null);
  return TERMS.filter((term) => parsedAge === null || parsedAge <= 0 || parsedAge + term <= 70);
}

export function createScenarioDraft({ evaluation, project, marketReference } = {}) {
  const input = evaluation?.input || {};
  const priceUf = number(project?.precio_min_uf || project?.valor_uf || input?.project_goal?.precio_min_uf);
  const available = allowedTerms(input.edad);
  const term = available.includes(number(input.plazo_credito_hipotecario))
    ? number(input.plazo_credito_hipotecario) : available.at(-1) || 30;
  const priceClp = priceUf * number(marketReference?.uf_value_clp);
  const pie = Math.min(Math.max(0, number(input.ahorro_disponible)), priceClp);
  return {
    project: project ? { ...project, precio_uf: priceUf } : { id: null, nombre: "Vivienda manual", precio_uf: priceUf },
    precio_uf: priceUf,
    uf_mode: "current",
    fecha_compra: null,
    pie_clp: pie,
    credito_clp: Math.max(0, priceClp - pie),
    composition_mode: "pie",
    plazo_anios: term,
    tasa_anual: number(marketReference?.tasa_anual_uf, 0),
    renta_propia_clp: number(input.ingreso_mensual),
    renta_complementaria_clp: number(input.ingreso_mensual_complementario),
    usar_renta_complementaria: number(input.ingreso_mensual_complementario) > 0,
    deuda_mensual_clp: number(input.deuda_mensual),
    selected_benefit: null,
    // Keeps the dashboard option visible in a saved draft. The financing
    // calculation still relies on the canonical selected_benefit identifier.
    selected_benefit_variant: null,
    selected_benefit_range_amount_clp: null,
  };
}

export function closeComposition(draft, field, value, subsidyClp = 0, priceClp) {
  const next = { ...draft, [field]: Math.max(0, number(value)), composition_mode: field === "credito_clp" ? "credito" : "pie" };
  if (!Number.isFinite(Number(priceClp)) || priceClp <= 0) return next;
  if (field === "pie_clp") next.credito_clp = Math.max(0, priceClp - next.pie_clp - subsidyClp);
  if (field === "credito_clp") next.pie_clp = Math.max(0, priceClp - next.credito_clp - subsidyClp);
  return next;
}
