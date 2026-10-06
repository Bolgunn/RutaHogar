// Prioridad comercial guardada en el resultado de una evaluación → clave de acción.
// Espejo de COMMERCIAL_ACTIONS en backend/app/scoring_engine/constants.py: el motor guarda la
// etiqueta en español en commercial_priority_detail.action, no la clave (ALG-18 R1b, G18).
// Un test compara este mapa con constants.py para que un cambio de etiqueta rompa el build.
export const PRIORITY_ACTIONS = {
  contact_now: "Contactar ahora",
  contact_with_review: "Contactar con revisión",
  nurture: "Nutrir con plan de mejora",
  reorient: "Reorientar a otro proyecto",
  request_info: "Solicitar antecedentes",
  do_not_route: "No derivar todavía",
};

export const SIN_PRIORIDAD = "sin_prioridad";

const KEY_BY_LABEL = new Map(Object.entries(PRIORITY_ACTIONS).map(([key, label]) => [label, key]));

// reconocida es false solo en P4: hay una etiqueta guardada que no coincide con ninguna acción.
export function priorityKeyFromDetail(detail) {
  if (detail?.action_key != null && Object.hasOwn(PRIORITY_ACTIONS, detail.action_key)) {
    return { key: detail.action_key, reconocida: true };
  }
  if (detail?.action == null) return { key: SIN_PRIORIDAD, reconocida: true };
  if (KEY_BY_LABEL.has(detail.action)) return { key: KEY_BY_LABEL.get(detail.action), reconocida: true };
  return { key: SIN_PRIORIDAD, reconocida: false };
}
