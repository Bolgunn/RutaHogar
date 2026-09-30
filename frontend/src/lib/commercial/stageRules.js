// Etapa comercial del lead por inmobiliaria.
// Espejo de public.commercial_stage_transition_check (migración 20260930120000):
// la base es la autoridad; esto solo guía la interfaz.
// Diseño: docs/stories/commercial-stage/PLAN.md.
export const STAGES = [
  { value: "nuevo", label: "Nuevo" },
  { value: "contactado", label: "Contactado" },
  { value: "en_plan_mejora", label: "En plan de mejora" },
  { value: "en_negociacion", label: "En negociación" },
  { value: "reserva", label: "Reserva" },
  { value: "venta_cerrada", label: "Venta cerrada" },
  { value: "perdido", label: "Perdido" },
];

export const DEFAULT_STAGE = "nuevo";

const RANKED = STAGES.map((stage) => stage.value).filter((value) => value !== "perdido");
const ADMIN_ROLES = new Set(["admin", "admin_inmobiliario"]);

function rank(stage) {
  const index = RANKED.indexOf(stage);
  return index === -1 ? null : index;
}

export function stageLabel(stage) {
  return STAGES.find((item) => item.value === stage)?.label || "Nuevo";
}

export function isTransitionAllowed(from, to, role) {
  if (from === to || !STAGES.some((item) => item.value === to)) return false;
  if (from === "venta_cerrada") return to === "perdido" && ADMIN_ROLES.has(role);
  if (from === "perdido") return to !== "venta_cerrada";
  return true;
}

export function reasonRequired(from, to) {
  if (from === "perdido" || from === "venta_cerrada" || to === "perdido") return true;
  return rank(to) < rank(from);
}

export function allowedTargets(from, role) {
  return STAGES.filter((item) => isTransitionAllowed(from, item.value, role));
}
