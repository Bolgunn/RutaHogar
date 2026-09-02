const DEFAULT_UF_CLP = 40695;
const MIN_DOWN_PAYMENT_RATE = 0.10;
const RECOMMENDED_DOWN_PAYMENT_RATE = 0.20;
const PRUDENT_DIVIDEND_RATE = 0.25;
const HIGH_DEBT_RATE = 0.40;
const MODERATE_DOWN_PAYMENT_GAP_RATE = 0.25;
const CLEAR_DIVIDEND_EXCESS_RATE = 1.15;

const statusRank = {
  Compatible: 0,
  Cercano: 1,
  "Requiere ajuste": 2,
};

const statusLevel = {
  Compatible: 3,
  Cercano: 2,
  "Requiere ajuste": 1,
};

const timelineLabels = {
  "0_3_meses": "Tu horizonte es corto, por eso conviene mirar primero brechas inmediatas de pie, deuda y dividendo.",
  "3_6_meses": "Tu horizonte permite ajustar algunas brechas, pero conviene priorizar escenarios con baja diferencia de pie y dividendo.",
  "6_12_meses": "Tu horizonte permite planificar ahorro o reducción de deuda antes de avanzar con mayor seguridad.",
  mas_12_meses: "Tu horizonte permite explorar mejoras graduales, manteniendo la simulación como referencia.",
};

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeType(value) {
  const text = normalizeText(value);
  if (text.includes("departamento")) return "departamento";
  if (text.includes("casa") || text.includes("vivienda")) return "casa";
  return text || "";
}

function getUfValue(input = {}) {
  return toNumber(input.uf_value_clp) || DEFAULT_UF_CLP;
}

function projectToScenario(project, ufValueClp) {
  const valueUf = toNumber(project?.valor_uf);
  const valueClp = toNumber(project?.valor_clp) || Math.round(valueUf * ufValueClp);
  return {
    id: project?.id || "manual",
    source: "project",
    label: project?.nombre || "Proyecto referencial",
    comuna: project?.comuna || "",
    tipo_vivienda: project?.tipo_vivienda || "",
    valueUf,
    valueClp,
    project,
  };
}

export function getScenarioFromManualValue(value, ufValueClp, unit = "uf") {
  const safeUfValueClp = toNumber(ufValueClp) || DEFAULT_UF_CLP;
  const normalizedUnit = normalizeText(unit);
  const numericValue = toNumber(value);
  const isClp = normalizedUnit === "clp";
  const valueClp = isClp ? numericValue : Math.round(numericValue * safeUfValueClp);
  const valueUf = isClp && safeUfValueClp > 0 ? valueClp / safeUfValueClp : numericValue;
  return {
    id: "manual",
    source: "manual",
    label: "Valor manual",
    comuna: "",
    tipo_vivienda: "",
    valueUf,
    valueClp,
    project: null,
  };
}

function getIncomeForCapacity(input = {}) {
  const ownIncome = toNumber(input.ingreso_mensual);
  const ownDebt = toNumber(input.deuda_mensual);
  const hasComplement = input.complemento_renta === true || input.complemento_renta === "si";
  const complementIncome = hasComplement ? toNumber(input.ingreso_mensual_complementario) : 0;
  const complementDebt = hasComplement ? toNumber(input.deuda_mensual_complementario) : 0;

  return {
    income: ownIncome + complementIncome,
    debt: ownDebt + complementDebt,
    ownIncome,
    ownDebt,
    complementIncome,
    complementDebt,
    hasComplement,
  };
}

function getDividendForScenario(input = {}, scenario) {
  const declaredDividend = toNumber(input.dividendo_estimado);
  if (declaredDividend > 0) return declaredDividend;

  return 0;
}

function getScoreNumber(input = {}) {
  const score = toNumber(input.score);
  return score || toNumber(input.financial_score);
}

function hasMediumHighScore(input = {}) {
  const classification = String(input.classification || "").toLowerCase();
  const score = getScoreNumber(input);
  return classification === "alto" || classification === "medio" || score >= 60;
}

function getMainGap({ income, debtRatio, gapMinimo, gapRecomendado, dividend, prudentDividend, valueClp, maxByMinDownPayment }) {
  if (income <= 0) return "ingreso";
  if (gapMinimo > 0) return "pie";
  if (debtRatio > HIGH_DEBT_RATE) return "deuda";
  if (dividend > 0 && dividend > prudentDividend) return "plazo/dividendo";
  if (maxByMinDownPayment > 0 && valueClp > maxByMinDownPayment) return "valor objetivo";
  if (gapRecomendado > 0) return "pie";
  return null;
}

function buildStatus({ input, income, debtRatio, gapMinimo, pieMinimo, gapRecomendado, dividend, prudentDividend, valueClp, maxByMinDownPayment }) {
  const missingCritical = income <= 0 || valueClp <= 0;
  const highDebt = debtRatio > HIGH_DEBT_RATE;
  const dividendTooHigh = dividend > 0 && dividend > prudentDividend;
  const dividendClearlyTooHigh = dividend > 0 && dividend > prudentDividend * CLEAR_DIVIDEND_EXCESS_RATE;
  const missingDownPayment = gapMinimo > 0;
  const downPaymentGapRate = pieMinimo > 0 ? gapMinimo / pieMinimo : 0;
  const largeDownPaymentGap = missingDownPayment && downPaymentGapRate > MODERATE_DOWN_PAYMENT_GAP_RATE;
  const valueAboveRange = maxByMinDownPayment > 0 && valueClp > maxByMinDownPayment;
  const valueClearlyAboveRange = valueAboveRange && largeDownPaymentGap;
  const canBeNear =
    hasMediumHighScore(input) &&
    !missingCritical &&
    !highDebt &&
    !dividendClearlyTooHigh &&
    !largeDownPaymentGap;

  if (missingCritical || highDebt || dividendClearlyTooHigh || largeDownPaymentGap || valueClearlyAboveRange) {
    return "Requiere ajuste";
  }

  if ((missingDownPayment || dividendTooHigh || valueAboveRange) && canBeNear) return "Cercano";
  if (missingDownPayment || dividendTooHigh || valueAboveRange) return "Requiere ajuste";

  const closeToDividendLimit = dividend > 0 && dividend > prudentDividend * 0.9;
  const closeToMinDownPayment = gapRecomendado > 0;

  if (closeToMinDownPayment || closeToDividendLimit) return "Cercano";
  return "Compatible";
}

function getRecommendation(mainGap) {
  const recommendations = {
    ingreso: "Revisa si puedes aumentar ingreso acreditable o buscar un escenario de menor valor.",
    pie: "Aumentar el ahorro disponible o elegir una alternativa de menor valor puede acercarte al objetivo.",
    deuda: "Reducir compromisos mensuales puede mejorar tu holgura para asumir un dividendo.",
    "plazo/dividendo": "Revisa plazo, dividendo esperado o un valor de vivienda menor antes de avanzar.",
    "valor objetivo": "Compara con alternativas de menor valor o con comunas más accesibles.",
  };
  return recommendations[mainGap] || "Mantén tus antecedentes actualizados antes de una evaluación formal.";
}

function getStatusMessage(status, mainGap, horizon, details = {}) {
  if (status === "Compatible") {
    return "Este escenario es Compatible porque tu ahorro cubre el pie mínimo y la carga estimada se mantiene dentro de un rango prudente.";
  }
  if (status === "Cercano") {
    if (mainGap === "pie" && details.gapMinimoUf > 0) {
      return `Este escenario es Cercano porque tu perfil general ayuda, pero aún existe una brecha de pie de ${Math.ceil(details.gapMinimoUf).toLocaleString("es-CL")} UF.`;
    }
    return horizon === "0_3_meses"
      ? "Este escenario esta cerca, pero conviene resolver la brecha inmediata antes de avanzar."
      : "Este escenario esta cerca de tu capacidad actual y podria mejorar con ahorro o ajuste gradual.";
  }

  const byGap = {
    ingreso: "El ingreso declarado no sostiene con holgura el dividendo de este escenario.",
    pie:
      details.gapMinimoUf > 0
        ? `Este escenario Requiere ajuste porque el pie mínimo requerido es de ${Math.ceil(details.pieMinimoUf).toLocaleString("es-CL")} UF y tu ahorro disponible es de ${Math.floor(details.savingsUf).toLocaleString("es-CL")} UF.`
        : "La principal brecha es el pie disponible para este valor de vivienda.",
    deuda: "La deuda mensual actual reduce tu holgura para asumir un dividendo.",
    "plazo/dividendo": "El dividendo estimado podria ser alto para tu ingreso actual.",
    "valor objetivo": "El valor objetivo esta sobre el rango referencial por ahorro disponible.",
  };
  return byGap[mainGap] || "Este escenario requiere ajustes importantes antes de avanzar.";
}

// `capacidad` es el override de ALG-9 (HU 10). Sin él, el escenario se evalúa
// exactamente como antes: ningún consumidor previo cambia de comportamiento.
export function evaluateScenario(input = {}, scenario, capacidad = null) {
  const ufValueClp = getUfValue(input);
  const valueClp = toNumber(scenario?.valueClp);
  const valueUf = toNumber(scenario?.valueUf) || (ufValueClp > 0 ? valueClp / ufValueClp : 0);
  const savings = toNumber(input.ahorro_disponible);
  const savingsUf = ufValueClp > 0 ? savings / ufValueClp : 0;
  const { income, debt } = getIncomeForCapacity(input);
  const dividend = getDividendForScenario(input, scenario);
  const pieMinimo = Math.round(valueClp * MIN_DOWN_PAYMENT_RATE);
  const pieRecomendado = Math.round(valueClp * RECOMMENDED_DOWN_PAYMENT_RATE);
  const pieMinimoUf = valueUf * MIN_DOWN_PAYMENT_RATE;
  const pieRecomendadoUf = valueUf * RECOMMENDED_DOWN_PAYMENT_RATE;
  const gapMinimo = Math.max(pieMinimo - savings, 0);
  const gapRecomendado = Math.max(pieRecomendado - savings, 0);
  const gapMinimoUf = ufValueClp > 0 ? gapMinimo / ufValueClp : 0;
  const gapRecomendadoUf = ufValueClp > 0 ? gapRecomendado / ufValueClp : 0;
  const prudentDividend = capacidad
    ? capacidad.dividendoMaximoClp
    : Math.round(income * PRUDENT_DIVIDEND_RATE);
  const debtRatio = income > 0 ? debt / income : 0;
  const maxByMinDownPayment = capacidad
    ? capacidad.maxValueClp
    : savings > 0
      ? savings / MIN_DOWN_PAYMENT_RATE
      : 0;
  const maxByRecommendedDownPayment = savings > 0 ? savings / RECOMMENDED_DOWN_PAYMENT_RATE : 0;
  const status = buildStatus({
    input,
    income,
    debtRatio,
    gapMinimo,
    pieMinimo,
    gapRecomendado,
    dividend,
    prudentDividend,
    valueClp,
    maxByMinDownPayment,
  });
  const mainGap = getMainGap({
    income,
    debtRatio,
    gapMinimo,
    gapRecomendado,
    dividend,
    prudentDividend,
    valueClp,
    maxByMinDownPayment,
  });

  return {
    scenario,
    status,
    mainGap,
    message: getStatusMessage(status, mainGap, input.plazo_compra, { gapMinimoUf, pieMinimoUf, savingsUf }),
    recommendation: getRecommendation(mainGap),
    valueClp,
    valueUf,
    savings,
    savingsUf,
    income,
    debt,
    dividend,
    prudentDividend,
    debtRatio,
    pieMinimo,
    pieRecomendado,
    pieMinimoUf,
    pieRecomendadoUf,
    gapMinimo,
    gapRecomendado,
    gapMinimoUf,
    gapRecomendadoUf,
    maxByMinDownPayment,
    maxByRecommendedDownPayment,
    maxByMinDownPaymentUf: ufValueClp > 0 ? maxByMinDownPayment / ufValueClp : 0,
    maxByRecommendedDownPaymentUf: ufValueClp > 0 ? maxByRecommendedDownPayment / ufValueClp : 0,
    ufValueClp,
    horizonMessage: timelineLabels[input.plazo_compra] || timelineLabels["6_12_meses"],
  };
}

function getPreferenceScore(project, onboarding = {}) {
  const targetCommune = normalizeText(onboarding.comuna_interes || onboarding.comuna_objetivo);
  const projectCommune = normalizeText(project?.comuna);
  const preferredType = normalizeType(onboarding.tipo_propiedad || onboarding.tipo_vivienda_preferida);
  const projectType = normalizeType(project?.tipo_vivienda);

  return {
    communeMatch: Boolean(targetCommune && projectCommune && targetCommune === projectCommune),
    typeMatch: Boolean(preferredType && projectType && preferredType === projectType),
  };
}

function getScenarioPreference(result, preferences = {}) {
  const scenario = result?.scenario || {};
  const project = result?.project || scenario.project || {};
  const targetCommune = normalizeText(preferences.comuna_interes || preferences.comuna_objetivo);
  const scenarioCommune = normalizeText(scenario.comuna || project.comuna);
  const preferredType = normalizeType(preferences.tipo_propiedad || preferences.tipo_vivienda_preferida);
  const scenarioType = normalizeType(scenario.tipo_vivienda || project.tipo_vivienda);

  return {
    communeMatch: Boolean(targetCommune && scenarioCommune && targetCommune === scenarioCommune),
    typeMatch: Boolean(preferredType && scenarioType && preferredType === scenarioType),
  };
}

function getScenarioLabel(result) {
  return result?.scenario?.label || result?.project?.nombre || "escenario";
}

function addAdvantage(target, condition, message) {
  if (condition) target.push(message);
}

function compareNumber(currentValue, alternativeValue, tolerance = 0) {
  const current = toNumber(currentValue);
  const alternative = toNumber(alternativeValue);
  if (Math.abs(current - alternative) <= tolerance) return 0;
  return current < alternative ? -1 : 1;
}

export function buildComparisonInsights(current, alternative, preferences = {}) {
  if (!current || !alternative) {
    return {
      recommendation: "sin_datos_suficientes",
      title: "Faltan datos para comparar",
      summary: "Primero selecciona un escenario actual y una alternativa.",
      advantages: { current: [], alternative: [] },
      considerations: ["Selecciona una alternativa para generar un análisis comparativo."],
      metrics: [],
    };
  }

  const currentPreference = getScenarioPreference(current, preferences);
  const alternativePreference = getScenarioPreference(alternative, preferences);
  const currentAdvantages = [];
  const alternativeAdvantages = [];
  const considerations = [];
  const currentName = getScenarioLabel(current);
  const alternativeName = getScenarioLabel(alternative);
  const valueComparison = compareNumber(current.valueUf, alternative.valueUf, 1);
  const minDownPaymentComparison = compareNumber(current.pieMinimoUf, alternative.pieMinimoUf, 1);
  const recommendedDownPaymentComparison = compareNumber(current.pieRecomendadoUf, alternative.pieRecomendadoUf, 1);
  const gapComparison = compareNumber(current.gapMinimoUf, alternative.gapMinimoUf, 1);
  const currentStatusRank = statusRank[current.status] ?? 9;
  const alternativeStatusRank = statusRank[alternative.status] ?? 9;

  addAdvantage(currentAdvantages, currentStatusRank < alternativeStatusRank, "Tiene mejor estado de compatibilidad.");
  addAdvantage(alternativeAdvantages, alternativeStatusRank < currentStatusRank, "Tiene mejor estado de compatibilidad.");
  addAdvantage(currentAdvantages, valueComparison < 0, "Tiene menor valor de vivienda.");
  addAdvantage(alternativeAdvantages, valueComparison > 0, "Tiene menor valor de vivienda.");
  addAdvantage(currentAdvantages, minDownPaymentComparison < 0, "Requiere menor pie mínimo.");
  addAdvantage(alternativeAdvantages, minDownPaymentComparison > 0, "Requiere menor pie mínimo.");
  addAdvantage(currentAdvantages, recommendedDownPaymentComparison < 0, "Requiere menor pie recomendado.");
  addAdvantage(alternativeAdvantages, recommendedDownPaymentComparison > 0, "Requiere menor pie recomendado.");
  addAdvantage(currentAdvantages, gapComparison < 0, "Tiene menor brecha de pie.");
  addAdvantage(alternativeAdvantages, gapComparison > 0, "Tiene menor brecha de pie.");
  addAdvantage(currentAdvantages, currentPreference.communeMatch && !alternativePreference.communeMatch, "Coincide con tu comuna objetivo.");
  addAdvantage(alternativeAdvantages, alternativePreference.communeMatch && !currentPreference.communeMatch, "Coincide con tu comuna objetivo.");
  addAdvantage(currentAdvantages, currentPreference.typeMatch && !alternativePreference.typeMatch, "Coincide con tu tipo de vivienda preferido.");
  addAdvantage(alternativeAdvantages, alternativePreference.typeMatch && !currentPreference.typeMatch, "Coincide con tu tipo de vivienda preferido.");

  if (gapComparison > 0 && !alternativePreference.communeMatch && currentPreference.communeMatch) {
    considerations.push("La alternativa reduce la brecha de pie, pero no coincide con tu comuna objetivo.");
  }
  if (gapComparison > 0 && !alternativePreference.typeMatch && currentPreference.typeMatch) {
    considerations.push("La alternativa exige menos ahorro, pero no coincide con tu tipo de vivienda preferido.");
  }
  if (gapComparison < 0 && !currentPreference.communeMatch && alternativePreference.communeMatch) {
    considerations.push("El escenario actual tiene menor brecha, pero la alternativa calza mejor con tu comuna objetivo.");
  }
  if (gapComparison < 0 && !currentPreference.typeMatch && alternativePreference.typeMatch) {
    considerations.push("El escenario actual tiene menor brecha, pero la alternativa calza mejor con tu tipo de vivienda preferido.");
  }
  if (currentStatusRank < alternativeStatusRank && alternativePreference.communeMatch && !currentPreference.communeMatch) {
    considerations.push("El escenario actual tiene mejor compatibilidad, pero la alternativa se acerca mas a tu comuna objetivo.");
  }
  if (alternativeStatusRank < currentStatusRank && currentPreference.communeMatch && !alternativePreference.communeMatch) {
    considerations.push("La alternativa tiene mejor compatibilidad, pero el escenario actual se acerca mas a tu comuna objetivo.");
  }
  if (considerations.length === 0 && valueComparison === 0 && gapComparison === 0 && currentStatusRank === alternativeStatusRank) {
    considerations.push("Ambos escenarios son similares financieramente; la decision depende mas de comuna, tipo de vivienda u horizonte.");
  }
  if (considerations.length === 0) {
    considerations.push("No se detecta una diferencia decisiva");
  }

  const currentFinancialWins =
    (currentStatusRank < alternativeStatusRank ? 1 : 0) +
    (valueComparison < 0 ? 1 : 0) +
    (gapComparison < 0 ? 1 : 0);
  const alternativeFinancialWins =
    (alternativeStatusRank < currentStatusRank ? 1 : 0) +
    (valueComparison > 0 ? 1 : 0) +
    (gapComparison > 0 ? 1 : 0);
  const currentPreferenceMatches = (currentPreference.communeMatch ? 1 : 0) + (currentPreference.typeMatch ? 1 : 0);
  const alternativePreferenceMatches =
    (alternativePreference.communeMatch ? 1 : 0) + (alternativePreference.typeMatch ? 1 : 0);

  let recommendation = "similar";
  if (currentFinancialWins >= 2 && currentFinancialWins > alternativeFinancialWins) {
    recommendation = "escenario_actual";
  } else if (alternativeFinancialWins >= 2 && alternativeFinancialWins > currentFinancialWins) {
    recommendation = "alternativa";
  } else if (currentStatusRank < alternativeStatusRank && gapComparison <= 0) {
    recommendation = "escenario_actual";
  } else if (alternativeStatusRank < currentStatusRank && gapComparison >= 0) {
    recommendation = "alternativa";
  } else if (currentAdvantages.length === 0 && alternativeAdvantages.length === 0) {
    recommendation = "similar";
  }

  const titleByRecommendation = {
    escenario_actual: `Escenario mas conveniente de forma referencial: ${currentName}`,
    alternativa: `Escenario mas conveniente de forma referencial: ${alternativeName}`,
    similar: "Ambos escenarios son similares",
    sin_datos_suficientes: "Faltan datos para comparar",
  };

  const maxValueUf = Math.max(toNumber(current.valueUf), toNumber(alternative.valueUf), 1);
  const maxPieMinUf = Math.max(toNumber(current.pieMinimoUf), toNumber(alternative.pieMinimoUf), 1);
  const maxPieRecommendedUf = Math.max(toNumber(current.pieRecomendadoUf), toNumber(alternative.pieRecomendadoUf), 1);
  const maxGapUf = Math.max(toNumber(current.gapMinimoUf), toNumber(alternative.gapMinimoUf), 1);

  return {
    recommendation,
    title: titleByRecommendation[recommendation],
    summary: "",
    advantages: {
      current: currentAdvantages.length ? currentAdvantages : ["No presenta una ventaja clara frente a la alternativa."],
      alternative: alternativeAdvantages.length ? alternativeAdvantages : ["No presenta una ventaja clara frente al escenario actual."],
    },
    considerations,
    preference: {
      current: currentPreference,
      alternative: alternativePreference,
    },
    deltas: {
      valueUf: toNumber(alternative.valueUf) - toNumber(current.valueUf),
      pieMinimoUf: toNumber(alternative.pieMinimoUf) - toNumber(current.pieMinimoUf),
      pieRecomendadoUf: toNumber(alternative.pieRecomendadoUf) - toNumber(current.pieRecomendadoUf),
      gapMinimoUf: toNumber(alternative.gapMinimoUf) - toNumber(current.gapMinimoUf),
      statusChanged: current.status !== alternative.status,
      communeDifferent:
        normalizeText(current.scenario?.comuna || current.project?.comuna) !==
        normalizeText(alternative.scenario?.comuna || alternative.project?.comuna),
      typeDifferent:
        normalizeType(current.scenario?.tipo_vivienda || current.project?.tipo_vivienda) !==
        normalizeType(alternative.scenario?.tipo_vivienda || alternative.project?.tipo_vivienda),
    },
    metrics: [
      {
        id: "valor",
        label: "Valor vivienda",
        current: toNumber(current.valueUf),
        alternative: toNumber(alternative.valueUf),
        max: maxValueUf,
        lowerIsBetter: true,
        unit: "UF",
      },
      {
        id: "pie-minimo",
        label: "Pie mínimo requerido",
        current: toNumber(current.pieMinimoUf),
        alternative: toNumber(alternative.pieMinimoUf),
        max: maxPieMinUf,
        lowerIsBetter: true,
        unit: "UF",
      },
      {
        id: "pie-recomendado",
        label: "Pie recomendado",
        current: toNumber(current.pieRecomendadoUf),
        alternative: toNumber(alternative.pieRecomendadoUf),
        max: maxPieRecommendedUf,
        lowerIsBetter: true,
        unit: "UF",
      },
      {
        id: "brecha-pie",
        label: "Brecha de pie",
        current: toNumber(current.gapMinimoUf),
        alternative: toNumber(alternative.gapMinimoUf),
        max: maxGapUf,
        lowerIsBetter: true,
        unit: "UF",
      },
      {
        id: "compatibilidad",
        label: "Compatibilidad",
        current: statusLevel[current.status] || 0,
        alternative: statusLevel[alternative.status] || 0,
        max: 3,
        lowerIsBetter: false,
        unit: "",
        currentLabel: current.status,
        alternativeLabel: alternative.status,
      },
      {
        id: "preferencias",
        label: "Preferencias",
        current: currentPreferenceMatches,
        alternative: alternativePreferenceMatches,
        max: 2,
        lowerIsBetter: false,
        unit: "",
        currentLabel: `${currentPreferenceMatches}/2`,
        alternativeLabel: `${alternativePreferenceMatches}/2`,
      },
    ],
  };
}

function getGapAmount(evaluation) {
  if (!evaluation) return Number.MAX_SAFE_INTEGER;
  if (evaluation.mainGap === "pie") return evaluation.gapMinimo || evaluation.gapRecomendado || 0;
  if (evaluation.mainGap === "deuda") return Math.max(evaluation.debt - evaluation.income * HIGH_DEBT_RATE, 0);
  if (evaluation.mainGap === "plazo/dividendo") return Math.max(evaluation.dividend - evaluation.prudentDividend, 0);
  if (evaluation.mainGap === "valor objetivo") return Math.max(evaluation.valueClp - evaluation.maxByMinDownPayment, 0);
  if (evaluation.mainGap === "ingreso") return Number.MAX_SAFE_INTEGER - 1;
  return 0;
}

export function buildSimulationContext(evaluation, onboarding) {
  return {
    ...(evaluation?.input || {}),
    plazo_compra: onboarding?.plazo_compra || evaluation?.onboarding?.plazo_compra || evaluation?.input?.plazo_compra,
    comuna_objetivo:
      onboarding?.comuna_interes ||
      onboarding?.comuna_objetivo ||
      evaluation?.onboarding?.comuna_interes ||
      evaluation?.input?.comuna_objetivo,
    tipo_vivienda_preferida:
      onboarding?.tipo_propiedad ||
      onboarding?.tipo_vivienda_preferida ||
      evaluation?.onboarding?.tipo_propiedad,
    classification: evaluation?.result?.classification,
    score: evaluation?.result?.score,
    risks: evaluation?.result?.risks || [],
    // Sin esto la capacidad de ALG-9 nunca llega a esta pantalla.
    financial_indicators: evaluation?.result?.financial_indicators,
  };
}

// ALG-9 es la única fuente de "qué puede comprar este lead". El cálculo local
// (savings / 0.10, sin puerta de ingreso, y 0.25 en cálculo donde ALG-9 resolvió
// 0.30) difiere en un orden de magnitud para un lead limitado por renta; dos
// pantallas no pueden discrepar sobre eso. El orden de esta lista NO cambia.
function capacidadDesdeIndicadores(input) {
  const indicadores = input?.financial_indicators;
  if (!indicadores || indicadores.capacidad_status === "requires_info") return null;
  const capacidadUf = indicadores.capacidad_compra_estimada_uf;
  if (typeof capacidadUf !== "number") return null;
  const ufValueClp = getUfValue(input);
  return {
    maxValueClp: capacidadUf * ufValueClp,
    dividendoMaximoClp: indicadores.dividendo_maximo_sostenible_clp ?? 0,
  };
}

export function buildAccessibleAlternatives(projects = [], input = {}, onboarding = {}, limit = 4) {
  const ufValueClp = getUfValue(input);
  const capacidad = capacidadDesdeIndicadores(input);
  return projects
    .map((project) => {
      const scenarioEvaluation = evaluateScenario(
        input,
        projectToScenario(project, ufValueClp),
        capacidad,
      );
      const preference = getPreferenceScore(project, onboarding);
      return {
        ...scenarioEvaluation,
        project,
        preference,
        gapAmount: getGapAmount(scenarioEvaluation),
      };
    })
    .sort((a, b) => {
      const statusDiff = (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      const gapDiff = a.gapAmount - b.gapAmount;
      if (gapDiff !== 0) return gapDiff;
      if (a.preference.communeMatch !== b.preference.communeMatch) return a.preference.communeMatch ? -1 : 1;
      if (a.preference.typeMatch !== b.preference.typeMatch) return a.preference.typeMatch ? -1 : 1;
      return a.valueClp - b.valueClp;
    })
    .slice(0, limit);
}

export function getMaxValueRange(input = {}) {
  const ufValueClp = getUfValue(input);
  const savings = toNumber(input.ahorro_disponible);
  const minRangeClp = savings > 0 ? savings / RECOMMENDED_DOWN_PAYMENT_RATE : 0;
  const maxRangeClp = savings > 0 ? savings / MIN_DOWN_PAYMENT_RATE : 0;
  return {
    minClp: minRangeClp,
    maxClp: maxRangeClp,
    minUf: ufValueClp > 0 ? minRangeClp / ufValueClp : 0,
    maxUf: ufValueClp > 0 ? maxRangeClp / ufValueClp : 0,
    ufValueClp,
  };
}

export { DEFAULT_UF_CLP, HIGH_DEBT_RATE };
