const summaries = {
  Alto: "Tu perfil se ve mejor preparado para iniciar conversaciones formales, manteniendo siempre una revisión responsable.",
  Medio: "Tu perfil podría fortalecerse antes de avanzar con una evaluación formal.",
  Bajo: "Conviene preparar mejor tu situación financiera antes de avanzar con el proceso.",
};

const primaryRecommendations = {
  Alto: [
    { text: "Mantén tu estabilidad financiera y evita aumentar tus deudas antes de iniciar una evaluación formal.", benefit: "Preservar tu clasificación actual y no generar nuevas alertas." },
    { text: "Conserva el ahorro disponible para pie, gastos iniciales y margen de seguridad.", benefit: "Contar con los recursos necesarios al momento de la evaluación formal." },
  ],
  Medio: [
    { text: "Podrías fortalecer tu perfil financiero antes de avanzar. Revisa tus niveles de deuda, ahorro y estabilidad declarada.", benefit: "Subir a clasificación Alto y acceder a mejores condiciones." },
    { text: "Evalúa si el dividendo esperado sigue siendo sostenible para tu situación actual.", benefit: "Evitar comprometerte con una cuota que pueda afectar tus finanzas." },
  ],
  Bajo: [
    { text: "Conviene preparar mejor tu situación financiera antes de avanzar. Enfócate en ordenar deudas, aumentar ahorro o revisar tu objetivo inmobiliario.", benefit: "Construir una base sólida que te permita ser evaluado exitosamente." },
    { text: "Considera ajustar el plazo de compra o revisar alternativas de comuna antes de una evaluación formal.", benefit: "Alinear tu objetivo con tu capacidad de pago real." },
  ],
};

export function buildRecommendations(evaluation) {
  if (!evaluation) return null;

  const result = evaluation.result || {};
  const classification = result.classification || "Bajo";
  const input = evaluation.input || {};
  const onboarding = evaluation.onboarding || {};
  const backendRecommendations = Array.isArray(result.recommendations)
    ? result.recommendations
    : [];
  const recommendations = [
    ...(primaryRecommendations[classification] || primaryRecommendations.Bajo),
    ...backendRecommendations,
  ];
  const actions = [];

  if (input.morosidad_actual === "si" || input.morosidad_actual === "no_lo_se") {
    recommendations.push({ text: "Revisa y regulariza cualquier situación de morosidad declarada antes de avanzar.", benefit: "Limpiar tu historial crediticio para no afectar la evaluación formal." });
    actions.push("Confirmar estado de pagos y compromisos vigentes.");
  }

  if (input.continuidad_laboral === "menos_6_meses" || input.continuidad_laboral === "entre_6_y_12_meses") {
    recommendations.push({ text: "Fortalecer la continuidad laboral puede ayudar a preparar mejor una futura evaluación.", benefit: "Demostrar solvencia y estabilidad a quien evalúe tu perfil." });
    actions.push("Mantener estabilidad laboral y respaldos simples de ingresos.");
  }

  if (input.complemento_renta) {
    recommendations.push({ text: "Si usarás complemento de renta, ordena los antecedentes de esa persona con anticipación.", benefit: "Asegurar que el co-deudor aporte valor real a tu perfil." });
    actions.push("Validar documentos básicos de quien complementará renta.");
  }

  if (onboarding.comuna_interes || input.comuna_objetivo) {
    actions.push(`Revisar si ${onboarding.comuna_interes || input.comuna_objetivo} sigue siendo una comuna objetivo realista.`);
  }

  if (onboarding.tipo_propiedad) {
    actions.push("Comparar alternativas de propiedad manteniendo una cuota mensual sostenible.");
  }

  if (onboarding.plazo_compra) {
    actions.push("Alinear el plazo de compra con ahorro, estabilidad laboral y nivel de deuda actual.");
  }

  actions.push("Solicitar una evaluación bancaria formal solo cuando tengas antecedentes actualizados.");

  return {
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    original_classification: result.original_classification || "",
    score_adjustment_reason: result.score_adjustment_reason || "",
    score: result.score,
    classification,
    summary: summaries[classification] || summaries.Bajo,
    recommendations: recommendations.filter((item, index, self) => self.findIndex(i => i.text === item.text) === index),
    actions: [...new Set(actions)],
    main_blocker: result.main_blocker || null,
    project_fit: result.project_fit || null,
    structured_improvement_plan: Array.isArray(result.structured_improvement_plan)
      ? result.structured_improvement_plan
      : [],
    user_explanation_deterministic: result.user_explanation_deterministic || "",
    housing_benefits: result.housing_benefits || { applicable_benefits: [], summary: "", disclaimer: "" },
  };
}
