import { displayValue } from "./display";

const goalCopy = Object.freeze({
  increase_savings: {
    description: "Aumenta tu ahorro disponible hasta alcanzar el monto objetivo de pie.",
  },
  reduce_debt: {
    description: "Reduce tus pagos mensuales para mejorar tu carga financiera.",
  },
  adjust_property_goal: {
    title: "Reducir dividendo estimado",
    description: "Ajusta pie, plazo o valor de la vivienda para acercar el dividendo a un nivel más sostenible.",
  },
  regularize_debt: {
    description: "Reduce o elimina el monto pendiente de morosidad.",
  },
  verify_credit_status: {
    description: "Confirma tu situación crediticia antes de continuar.",
  },
  improve_job_stability: {
    description: "Fortalece tu continuidad laboral antes de avanzar.",
  },
  complete_complement_data: {
    description: "Completa los antecedentes del complementario para evaluar el plan.",
  },
  adjust_credit_term: {
    description: "Acerca el plazo del crédito al rango definido por el plan.",
  },
  review_installment_down_payment: {
    description: "Revisa si puedes organizar el pago del pie en cuotas.",
  },
});

export function goalPresentation(definition = {}) {
  const copy = goalCopy[definition.source_action_type] || {};
  return {
    title: copy.title || definition.title || "Meta del plan",
    description: copy.description || definition.description || "Sigue esta meta según tu plan.",
  };
}

export function formatGoalValue(value, unit) {
  if (value === null || value === undefined) return "Sin datos";
  const formatted = displayValue(value);
  if (unit === "CLP") return `$${formatted}`;
  if (unit === "CLP/month") return `$${formatted} / mes`;
  if (unit === "UF") return `${formatted} UF`;
  if (unit === "%") return `${formatted}%`;
  if (unit === "years") return `${formatted} ${Number(value) === 1 ? "año" : "años"}`;
  return unit ? `${formatted} ${unit}` : formatted;
}
