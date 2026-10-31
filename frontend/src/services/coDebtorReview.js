export const REVIEW_FIELDS = ["ingreso_mensual_complementario", "deuda_mensual_complementario", "tipo_contrato_complementario", "continuidad_laboral_complementario", "morosidad_complementario"];
export const CONTRACTS = ["indefinido", "plazo_fijo", "independiente", "honorarios_variable"];
export const CONTINUITIES = ["menos_6_meses", "entre_6_y_12_meses", "entre_1_y_3_anios", "mas_3_anios"];
export const RELATION_LABELS = { conyuge: "Cónyuge", pareja_conviviente: "Pareja conviviente", pareja_hijos_comun: "Pareja con hijos en común", padre_madre: "Padre o madre", hijo_hija: "Hijo o hija", hermano_hermana: "Hermano o hermana", otro_familiar: "Otro familiar", amigo: "Amistad", otro: "Otra relación" };
export function reviewForm(values = {}) {
  return Object.fromEntries(REVIEW_FIELDS.map(field => [field, values[field] === undefined || values[field] === null ? "" : String(values[field])]));
}
export function reviewCommand(review, form, acceptRelation, consent) {
  if (!review.relation?.event_id) throw new Error("El titular debe declarar la relación y corregir o reemplazar la invitación.");
  if (review.requires_relation_acceptance && !acceptRelation) throw new Error("Debes aceptar la relación declarada o rechazar la participación.");
  if (!consent) throw new Error("Debes autorizar expresamente tu participación y el tratamiento de estos antecedentes.");
  const values = Object.fromEntries(REVIEW_FIELDS.map(field => [field, form[field]]));
  for (const field of REVIEW_FIELDS.slice(0, 2)) {
    if (!/^\d+(?:\.\d+)?$/.test(String(values[field] ?? "")) || !Number.isFinite(Number(values[field]))
      || Number(values[field]) > Number.MAX_SAFE_INTEGER) throw new Error("Ingreso y deuda deben ser importes válidos no negativos. Completa ambos campos.");
    values[field] = Number(values[field]);
  }
  if (!CONTRACTS.includes(values.tipo_contrato_complementario) || !CONTINUITIES.includes(values.continuidad_laboral_complementario)
    || !["si", "no"].includes(values.morosidad_complementario)) throw new Error("Completa los antecedentes laborales y la morosidad con opciones válidas.");
  return { expected_revision: review.revision_number, relation_event_id: review.relation.event_id,
    accept_relation: review.requires_relation_acceptance ? acceptRelation : false, participation_consent: consent, values };
}
export const participationPath = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "") ? `/co-deudor/invitacion?participation=${encodeURIComponent(id)}` : null;
