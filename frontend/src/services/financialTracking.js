import { formatClp, isMonetaryPlanAction } from "../utils/helpers";

export const goalStatuses = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  completada: "Completada",
};

export const ESTIMATED_ANNUAL_UF_INCREASE = 0.04;

const classificationMessages = {
  Alto: "Tu perfil se ve mejor preparado, pero igualmente conviene mantener estabilidad financiera.",
  Medio: "Tu perfil podría mejorar antes de avanzar con una evaluación formal.",
  Bajo: "Conviene preparar mejor tu situación financiera antes de avanzar.",
};

export const CLP_FORMATTER = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export const timelineMonths = {
  "0_3_meses": 3,
  "3_6_meses": 6,
  "6_12_meses": 12,
  mas_12_meses: 18,
};

function goalIdFromTitle(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return CLP_FORMATTER.format(Math.round(number / 1000) * 1000);
}

export function getTimelineMonths(onboarding) {
  return timelineMonths[onboarding?.plazo_compra] || 12;
}

function getMonthlySavingsTarget(input, months, classification) {
  const income = Number(input.ingreso_mensual) || 0;
  const currentSavings = Number(input.ahorro_disponible) || 0;
  const expectedDividend = Number(input.dividendo_estimado) || 0;
  const baseTarget = Math.max(expectedDividend * 8, income * (classification === "Alto" ? 2 : 3), 1500000);
  const remaining = Math.max(baseTarget - currentSavings, 0);

  return {
    totalTarget: baseTarget,
    monthlyTarget: Math.ceil(remaining / Math.max(months, 1)),
  };
}

function getDebtReductionTarget(input, classification) {
  const income = Number(input.ingreso_mensual) || 0;
  const debt = Number(input.deuda_mensual) || 0;
  if (!income || !debt) return 0;

  const suggestedDebt = income * (classification === "Alto" ? 0.3 : 0.25);
  return Math.max(debt - suggestedDebt, 0);
}

function isShortTimelineUnrealistic({ classification, input, months }) {
  const income = Number(input.ingreso_mensual) || 0;
  const savings = Number(input.ahorro_disponible) || 0;
  const debt = Number(input.deuda_mensual) || 0;
  const hasLowSavings = income > 0 ? savings < income : savings < 1000000;
  const hasHighDebt = income > 0 && debt > income * 0.35;
  const hasMorosity = input.morosidad_actual === "si" || input.morosidad_actual === "no_lo_se";

  return months <= 3 && (classification === "Bajo" || hasLowSavings || hasHighDebt || hasMorosity);
}

function buildGoal(title, description, months, status = "pendiente", category = null, impact_level = null) {
  return {
    id: goalIdFromTitle(title),
    title,
    description,
    timeline: months === 1 ? "1 mes" : `${months} meses`,
    status,
    category,
    impact_level
  };
}

function goalsFromEvaluation(evaluation, months) {
  const result = evaluation?.result || {};
  const input = evaluation?.input || {};
  const onboarding = evaluation?.onboarding || {};
  const classification = result.classification || "Bajo";
  const savingsPlan = getMonthlySavingsTarget(input, months, classification);
  const debtReduction = getDebtReductionTarget(input, classification);
  const goals = [];

  if (classification === "Alto") {
    goals.push(
      buildGoal(
        "Mantener estabilidad financiera",
        "Mantente sin nuevas deudas relevantes y conserva tus antecedentes de ingresos actualizados antes de iniciar una evaluación formal.",
        Math.min(months, 6),
      ),
    );
  }

  if (savingsPlan.monthlyTarget > 0) {
    goals.push(
      buildGoal(
        "Aumentar ahorro disponible",
        `Para acercarte a tu objetivo en ${months} meses, intenta ahorrar aproximadamente ${money(savingsPlan.monthlyTarget)} mensuales. Como referencia financiera, una meta saludable sería llegar cerca de ${money(savingsPlan.totalTarget)} de ahorro disponible.`,
        months,
      ),
    );
  } else {
    goals.push(
      buildGoal(
        "Mantener fondo de ahorro",
        "Tu ahorro declarado ya entrega una base inicial. Evita usarlo en gastos no vinculados al proceso y mantén un margen para pie, gastos iniciales y seguridad.",
        Math.min(months, 6),
      ),
    );
  }

  if (debtReduction > 0) {
    goals.push(
      buildGoal(
        "Reducir deuda mensual",
        `Intenta reducir cerca de ${money(debtReduction)} de carga mensual antes de volver a evaluar. Esto puede dar más holgura frente al dividendo esperado.`,
        Math.min(months, 6),
      ),
    );
  }

  if (input.morosidad_actual === "si" || input.morosidad_actual === "no_lo_se") {
    goals.push(
      buildGoal(
        "Regularizar situación de morosidad",
        "Revisa y aclara compromisos pendientes antes de avanzar. Vuelve a precalificar cuando tu situación declarada esté ordenada.",
        Math.min(months, 3),
      ),
    );
  }

  if (input.continuidad_laboral === "menos_6_meses" || input.continuidad_laboral === "entre_6_y_12_meses") {
    goals.push(
      buildGoal(
        "Fortalecer continuidad laboral",
        "Mantener estabilidad durante los próximos meses puede ayudarte a preparar una evaluación formal con mejores antecedentes.",
        Math.max(6, Math.min(months, 12)),
      ),
    );
  }

  if (input.tipo_contrato === "independiente") {
    goals.push(
      buildGoal(
        "Ordenar antecedentes de ingresos",
        "Si trabajas independiente, prepara respaldos simples y consistentes de ingresos antes de iniciar una evaluación formal.",
        Math.min(months, 6),
      ),
    );
  }

  if (input.complemento_renta) {
    goals.push(
      buildGoal(
        "Validar complemento de renta",
        "Ordena los antecedentes de la persona que complementará renta y revisa si ese apoyo se mantiene en el plazo declarado.",
        Math.min(months, 6),
      ),
    );
  }

  if (classification !== "Alto" || months <= 6) {
    goals.push(
      buildGoal(
        "Revisar objetivo inmobiliario",
        `Revisa si ${onboarding.comuna_interes || input.comuna_objetivo || "la comuna objetivo"} y el dividendo esperado siguen siendo sostenibles. Si el objetivo se ve exigente, considera aumentar el plazo, ajustar el dividendo o comparar con la comuna alternativa.`,
        Math.min(months, 6),
      ),
    );
  }

  goals.push(
    buildGoal(
      "Volver a precalificar en el momento correcto",
      "No recomendamos repetir la precalificación inmediatamente. Vuelve a evaluar cuando hayas reducido deuda, aumentado ahorro o cambiado tu objetivo inmobiliario.",
      Math.min(months, 6),
    ),
  );

  return goals;
}

function goalsFromStructuredPlan(result, fallbackMonths) {
  const plan = Array.isArray(result?.improvement_plan)
    ? result.improvement_plan
    : [];

  return plan
    .map((action, index) => {
      if (!action || typeof action !== "object") return null;

      const title = action.title || action.category || `Acción sugerida ${index + 1}`;
      const estimatedMonths = Number(action.estimated_months);
      const months = Number.isFinite(estimatedMonths) && estimatedMonths > 0
        ? Math.round(estimatedMonths)
        : Math.max(1, fallbackMonths);
      const details = [];

      if (action.description) details.push(action.description);
      if (action.expected_benefit) details.push(`Beneficio esperado: ${action.expected_benefit}`);

      return buildGoal(
        title,
        details.join(" ") || "Acción sugerida desde tu última precalificación.",
        months,
        "pendiente",
        action.category,
        action.impact_level
      );
    })
    .filter(Boolean);
}

export function buildFinancialTracking(evaluation) {
  if (!evaluation) return null;
  const input = evaluation.input || {};
  const onboarding = evaluation.onboarding || {};
  const hasMinimumData = ["ingreso_mensual", "deuda_mensual", "ahorro_disponible", "dividendo_estimado"].every(
    (key) => input[key] !== undefined && input[key] !== null && input[key] !== "",
  );
  const months = getTimelineMonths(onboarding);
  const classification = evaluation.result?.classification || "Bajo";
  const unrealisticTimeline = isShortTimelineUnrealistic({ classification, input, months });
  const structuredGoals = goalsFromStructuredPlan(evaluation.result, months);

  if (!hasMinimumData) {
    return {
      score: evaluation.result?.score,
      classification,
      message: structuredGoals.length
        ? "Usa el plan sugerido de tu última precalificación como guía inicial mientras completas tus metas de seguimiento."
        : "Aún no tienes metas de seguimiento guardadas. Puedes usar el plan sugerido de tu última precalificación como guía inicial.",
      months,
      goals: structuredGoals,
      warning: "",
      ufNote: "",
    };
  }

  return {
    score: evaluation.result?.score,
    classification,
    message: unrealisticTimeline
      ? "Con la información actual, el plazo declarado no parece realista. Te recomendamos reevaluar el tipo de propiedad, comuna objetivo o aumentar el plazo antes de una nueva precalificación."
      : classificationMessages[classification] || classificationMessages.Bajo,
    months,
    targetCommune: onboarding.comuna_interes || input.comuna_objetivo || "",
    propertyType: onboarding.tipo_propiedad || "",
    goals: structuredGoals.length ? structuredGoals : goalsFromEvaluation(evaluation, months),
    warning: unrealisticTimeline
      ? "Esto no significa rechazo ni imposibilidad definitiva; es una señal para ajustar el objetivo antes de una evaluación formal."
      : "",
    ufNote: `Esta proyección es referencial y no corresponde a una predicción oficial del valor de la UF. Para escenarios ligados a UF se usa una variación anual estimada de ${(ESTIMATED_ANNUAL_UF_INCREASE * 100).toFixed(0)}% solo como supuesto financiero.`,
  };
}
