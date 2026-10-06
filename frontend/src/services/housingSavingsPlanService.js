import { CLP_FORMATTER } from "./financialTracking";

export const COSTO_VIDA_FIJO = 550000;

export const PIE_PORCENTAJE = {
  minimo: 0.10,
  recomendado: 0.20,
};

export function formatClp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "$0";
  return CLP_FORMATTER.format(Math.round(number / 1000) * 1000);
}

function monthLabel(date) {
  const text = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildMonthSkeleton(months, startDate) {
  const start = startDate || new Date();
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    return {
      id: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: monthLabel(date),
      savedAmount: "",
      status: "pendiente",
    };
  });
}

export function calculateHousingSavings(input, propertyPrice, overrides) {
  const baseIncome = Number(input.ingreso_mensual) || 0;
  const baseDebt = Number(input.deuda_mensual) || 0;
  const baseSavings = Number(input.ahorro_disponible) || 0;
  const basePrice = Number(propertyPrice) || 0;

  const ownIncome = overrides?.income != null ? Number(overrides.income) : baseIncome;
  const ownDebt = overrides?.debt != null ? Number(overrides.debt) : baseDebt;
  const costOfLiving = overrides?.costOfLiving != null ? Number(overrides.costOfLiving) : COSTO_VIDA_FIJO;
  const savings = overrides?.savings != null ? Number(overrides.savings) : baseSavings;
  const price = overrides?.price != null ? Number(overrides.price) : basePrice;

  const includeCodeudor = overrides?.includeCodeudor === true;
  const codeudorIncome =
    overrides?.codeudorIncome != null
      ? Number(overrides.codeudorIncome)
      : Number(input.ingreso_mensual_complementario) || 0;
  const codeudorDebt =
    overrides?.codeudorDebt != null
      ? Number(overrides.codeudorDebt)
      : Number(input.deuda_mensual_complementario) || 0;

  const income = includeCodeudor ? ownIncome + codeudorIncome : ownIncome;
  const debt = includeCodeudor ? ownDebt + codeudorDebt : ownDebt;

  if (price <= 0) {
    return {
      price: 0,
      pieMinimo: 0,
      pieRecomendado: 0,
      currentSavings: savings,
      gapMinimo: 0,
      gapRecomendado: 0,
      monthlyCapacity: 0,
      monthsMinimo: null,
      monthsRecomendado: null,
      isViable: false,
      error: "No hay precio de vivienda de referencia para calcular el plan.",
    };
  }

  const pieMinimo = Math.round(price * PIE_PORCENTAJE.minimo);
  const pieRecomendado = Math.round(price * PIE_PORCENTAJE.recomendado);
  const gapMinimo = Math.max(pieMinimo - savings, 0);
  const gapRecomendado = Math.max(pieRecomendado - savings, 0);
  const net = income - debt - costOfLiving;
  const monthlyCapacity = Math.max(net, 0);
  const isViable = net > 0;

  return {
    price,
    pieMinimo,
    pieRecomendado,
    currentSavings: savings,
    gapMinimo,
    gapRecomendado,
    monthlyCapacity,
    monthsMinimo: isViable ? Math.ceil(gapMinimo / monthlyCapacity) : null,
    monthsRecomendado: isViable ? Math.ceil(gapRecomendado / monthlyCapacity) : null,
    isViable,
    error: null,
    income,
    debt,
    costOfLiving,
    ownIncome,
    ownDebt,
    includeCodeudor,
    codeudorIncome,
    codeudorDebt,
  };
}

export function buildMonthlyHousingPlan(input, propertyPrice, pieType, progressData, overrides) {
  const savingsInfo = calculateHousingSavings(input, propertyPrice, overrides);
  if (savingsInfo.error) {
    return {
      ...savingsInfo,
      monthsData: [],
      progressPercent: 0,
      remainingGap: 0,
      monthsUntilPie: null,
      isCompleted: false,
    };
  }

  const isRecomendado = pieType === 'recomendado';
  const gap = isRecomendado ? savingsInfo.gapRecomendado : savingsInfo.gapMinimo;
  const pieRequired = isRecomendado ? savingsInfo.pieRecomendado : savingsInfo.pieMinimo;
  const totalMonths = savingsInfo.monthsRecomendado || savingsInfo.monthsMinimo || 12;
  const months = Math.min(totalMonths, 60);

  const storedMonths = Array.isArray(progressData?.months) ? progressData.months : [];
  const skeleton = buildMonthSkeleton(months);
  let accumulated = 0;
  let carriedDeficit = 0;

  const monthsData = skeleton.map((month, index) => {
    const stored = storedMonths.find((item) => item.id === month.id) || storedMonths[index] || {};
    const savedAmount = stored.savedAmount === "" || stored.savedAmount === undefined ? "" : Number(stored.savedAmount);
    const baseTarget = savingsInfo.monthlyCapacity;
    const adjustedTarget = Math.max(baseTarget + carriedDeficit, 0);
    const achieved = Number(savedAmount) || 0;
    const hasInput = savedAmount !== "";
    const deficit = hasInput ? Math.max(adjustedTarget - achieved, 0) : carriedDeficit;
    const status = hasInput ? (achieved >= adjustedTarget ? "logrado" : "no_logrado") : "pendiente";

    accumulated += achieved;
    carriedDeficit = hasInput ? deficit : carriedDeficit;

    return {
      ...month,
      income: savingsInfo.income,
      debt: savingsInfo.debt,
      costOfLiving: savingsInfo.costOfLiving,
      savedAmount,
      baseTarget,
      previousDeficit: adjustedTarget - baseTarget,
      adjustedTarget,
      expectedAccumulated: Math.min(gap, baseTarget * (index + 1)),
      accumulated,
      deficit,
      status,
      remainingBeforePie: Math.max(savingsInfo.currentSavings + accumulated - pieRequired, 0) > 0
        ? 0
        : pieRequired - (savingsInfo.currentSavings + accumulated),
    };
  });

  const totalSaved = monthsData.reduce((sum, item) => sum + (Number(item.savedAmount) || 0), 0);
  const progressPercent = gap > 0 ? Math.min(100, Math.round((totalSaved / gap) * 100)) : 0;

  const pieReachedIndex = monthsData.findIndex((item) => item.remainingBeforePie <= 0);
  const monthsUntilPie = pieReachedIndex >= 0 ? pieReachedIndex + 1 : null;

  return {
    ...savingsInfo,
    pieRequired,
    gap,
    remainingGap: Math.max(gap - totalSaved, 0),
    monthsUntilPie,
    isCompleted: monthsUntilPie != null,
    isRecomendado,
    months,
    totalSaved,
    progressPercent,
    monthsData,
    hasValidTarget: gap > 0 && savingsInfo.monthlyCapacity > 0,
  };
}

export function serializeHousingProgress(monthsData) {
  return {
    months: monthsData.map((item) => ({
      id: item.id,
      label: item.label,
      savedAmount: item.savedAmount,
      status: item.status,
    })),
    updated_at: new Date().toISOString(),
  };
}

export function isHousingSavingsGoal(goal) {
  const title = (goal?.title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return title.includes("plan de ahorro para la vivienda") || title.includes("ahorro para la vivienda");
}

/**
 * Determina el estado automático del plan según el progreso registrado.
 * - "alcanzado": el ahorro total (disponible + registrado) cubre el pie del escenario activo
 * - "en_curso": el plan fue confirmado con "Aceptar plan"
 * - "en_progreso": hay al menos un mes con ahorro registrado y brecha > 0 (sin confirmar)
 * - "pendiente": no hay actividad registrada ni plan confirmado
 */
export function determinePlanStatus(savingsInfo, progressData, pieType, accepted) {
  const isRecomendado = pieType === 'recomendado';
  const pieRequired = isRecomendado ? savingsInfo.pieRecomendado : savingsInfo.pieMinimo;
  const months = Array.isArray(progressData?.months) ? progressData.months : [];
  const totalRegistered = months.reduce((sum, m) => sum + (Number(m.savedAmount) || 0), 0);
  const totalAvailable = savingsInfo.currentSavings + totalRegistered;
  const remainingGap = Math.max(pieRequired - totalAvailable, 0);

  if (totalAvailable >= pieRequired) {
    return { status: "alcanzado", label: "Alcanzado", totalRegistered, totalAvailable, pieRequired, remainingGap };
  }

  if (accepted) {
    return { status: "en_curso", label: "En curso", totalRegistered, totalAvailable, pieRequired, remainingGap };
  }

  const hasActivity = months.some((m) => {
    const val = Number(m.savedAmount);
    return Number.isFinite(val) && val > 0;
  });

  if (hasActivity) {
    return { status: "en_progreso", label: "En progreso", totalRegistered, totalAvailable, pieRequired, remainingGap };
  }

  return { status: "pendiente", label: "Pendiente", totalRegistered, totalAvailable, pieRequired, remainingGap };
}

/**
 * Construye el snapshot del plan de ahorro confirmado al aceptarlo.
 */
export function buildHousingPlanSnapshot(savingsInfo, pieType) {
  const isRecomendado = pieType === "recomendado";
  return {
    pie_type: pieType,
    property_price: savingsInfo.price,
    pie_required: isRecomendado ? savingsInfo.pieRecomendado : savingsInfo.pieMinimo,
    monthly_target: savingsInfo.monthlyCapacity,
    months: isRecomendado ? savingsInfo.monthsRecomendado : savingsInfo.monthsMinimo,
    gap: isRecomendado ? savingsInfo.gapRecomendado : savingsInfo.gapMinimo,
    current_savings: savingsInfo.currentSavings,
    progress: null,
  };
}

function roundUpToThousand(value) {
  return Math.ceil((Number(value) || 0) / 1000) * 1000;
}

/**
 * Entrega una recomendación accionable cuando el plan no es viable: el déficit
 * entre deuda + costo de vida e ingreso, expresado como reducción de deuda o
 * aumento de ingreso necesario para generar una meta de ahorro mensual.
 */
export function buildHousingNotViableRecommendation(savingsInfo) {
  const income = Number(savingsInfo?.income) || 0;
  const debt = Number(savingsInfo?.debt) || 0;
  const costOfLiving = Number(savingsInfo?.costOfLiving) || COSTO_VIDA_FIJO;

  const shortfall = Math.max(costOfLiving + debt - income, 0);
  const incomeIncrease = roundUpToThousand(shortfall);
  const hasDebtFix = income > costOfLiving;
  const debtReduction = hasDebtFix ? roundUpToThousand(shortfall) : null;

  const message = hasDebtFix
    ? `Con tu capacidad actual no es posible cubrir el costo de vida. Reduce tu deuda en ${formatClp(debtReduction)} o aumenta tu ingreso en ${formatClp(incomeIncrease)} para generar una meta de ahorro.`
    : `Con tu ingreso actual no cubres el costo de vida, incluso sin deudas. Aumenta tu ingreso en ${formatClp(incomeIncrease)} para generar una meta de ahorro.`;

  return { shortfall, incomeIncrease, debtReduction, hasDebtFix, message };
}

export function getHousingPropertyPrice(evaluation) {
  const input = evaluation?.input || {};
  if (input.property_value_clp) return Number(input.property_value_clp);

  const persistedMarketSnapshot =
    evaluation?.result?.financial_indicators?.capacidad_supuestos?.market_snapshot;
  const ufValueClp =
    Number(persistedMarketSnapshot?.uf_value_clp) || Number(input.uf_value_clp) || 0;

  const priceRef = {
    "Buin": 2800, "Calera de Tango": 4300, "Cerrillos": 3000, "Cerro Navia": 2400,
    "Conchalí": 2800, "El Bosque": 2300, "Estación Central": 3100, "Huechuraba": 4700,
    "Independencia": 3300, "La Cisterna": 3200, "La Florida": 3900, "La Granja": 2500,
    "La Pintana": 2200, "La Reina": 7200, "Las Condes": 9200, "Lo Barnechea": 10500,
    "Lo Espejo": 2200, "Lo Prado": 2700, "Macul": 4100, "Maipú": 3600,
    "Melipilla": 2400, "Ñuñoa": 6200, "Padre Hurtado": 3000, "Paine": 2700,
    "Pedro Aguirre Cerda": 2600, "Peñaflor": 2900, "Peñalolén": 4700, "Pirque": 4300,
    "Providencia": 7600, "Pudahuel": 2900, "Puente Alto": 3100, "Quilicura": 3200,
    "Quinta Normal": 3300, "Recoleta": 3400, "Renca": 2600, "San Bernardo": 2800,
    "San Joaquín": 3500, "San José de Maipo": 3300, "San Miguel": 4500, "San Ramón": 2400,
    "Santiago": 3800, "Talagante": 3100, "Vitacura": 12000
  };

  const commune = input.comuna_objetivo || evaluation?.onboarding?.comuna_interes;
  if (commune && priceRef[commune] && ufValueClp > 0) {
    return priceRef[commune] * ufValueClp;
  }

  return 0;
}

export { formatMoneyInput, stripMoneyInput } from "./moneyFormat";

/**
 * Entrega las alternativas concretas para un plan que no es viable o cuyo plazo
 * supera el horizonte recomendado. Cada alternativa incluye el payload de
 * overrides para aplicar en el simulador de escenarios.
 */
export function buildHousingAlternatives(evaluation, propertyPrice, pieType, options = {}) {
  const input = evaluation?.input || {};
  const horizonMonths = Math.max(Number(options.horizonMonths) || 60, 1);
  const baseIncome = Number(input.ingreso_mensual) || 0;
  const baseDebt = Number(input.deuda_mensual) || 0;
  const baseSavings = Number(input.ahorro_disponible) || 0;
  const price = Number(propertyPrice) || 0;
  const piePct = PIE_PORCENTAJE[pieType] || PIE_PORCENTAJE.minimo;
  const netBase = baseIncome - baseDebt - COSTO_VIDA_FIJO;
  const baseCapacity = Math.max(netBase, 0);

  const debtAlternative = (() => {
    if (baseIncome <= COSTO_VIDA_FIJO) {
      return {
        id: "deuda",
        title: "Reestructurar deuda",
        description: "Reducir tu carga de deuda mensual para liberar capacidad de ahorro.",
        changeLabel: null,
        benefitLabel: null,
        applicable: false,
        disabledReason:
          "Tu ingreso no cubre el costo de vida base. Primero aumenta ingreso o agrega codeudor.",
        applyOverrides: null,
      };
    }

    const suggestedDebt = Math.max(Math.round((baseIncome - COSTO_VIDA_FIJO) * 0.75), 0);
    const reduction = Math.max(baseDebt - suggestedDebt, 0);
    const newCapacity = Math.max(baseIncome - suggestedDebt - COSTO_VIDA_FIJO, 0);

    return {
      id: "deuda",
      title: "Reestructurar deuda",
      description: "Reducir tu carga de deuda mensual para liberar capacidad de ahorro.",
      changeLabel:
        reduction > 0
          ? `Reducir deuda mensual de ${formatClp(baseDebt)} a ${formatClp(suggestedDebt)}`
          : `Mantener deuda en ${formatClp(baseDebt)}`,
      benefitLabel: `Libera ${formatClp(reduction)} y logra capacidad de ${formatClp(newCapacity)} mensual`,
      applicable: reduction > 0,
      disabledReason: reduction > 0 ? "" : "Tu deuda ya está en un nivel que permite ahorrar.",
      applyOverrides: { debt: suggestedDebt, includeCodeudor: false },
    };
  })();

  const declaredCodeudorIncome = Number(input.ingreso_mensual_complementario) || 0;
  const declaredCodeudorDebt = Number(input.deuda_mensual_complementario) || 0;
  const suggestedCodeudorIncome =
    declaredCodeudorIncome > 0
      ? declaredCodeudorIncome
      : Math.max(Math.round((COSTO_VIDA_FIJO + baseDebt - baseIncome) * 1.25), 500000);
  const suggestedCodeudorDebt = declaredCodeudorDebt;
  const capacityWithCodeudor = Math.max(
    baseIncome + suggestedCodeudorIncome - baseDebt - suggestedCodeudorDebt - COSTO_VIDA_FIJO,
    0,
  );

  const codeudorAlternative = {
    id: "codeudor",
    title: "Agregar codeudor",
    description: "Sumar ingreso de una persona complementaria para mejorar tu capacidad de ahorro.",
    changeLabel:
      declaredCodeudorIncome > 0
        ? `Usar codeudor declarado con ingreso de ${formatClp(declaredCodeudorIncome)}`
        : `Añadir codeudor con ingreso de ${formatClp(suggestedCodeudorIncome)}`,
    benefitLabel: `Capacidad mensual pasa de ${formatClp(baseCapacity)} a ${formatClp(capacityWithCodeudor)}`,
    applicable: capacityWithCodeudor > 0,
    disabledReason: capacityWithCodeudor > 0 ? "" : "El codeudor sugerido no alcanza para cubrir el déficit.",
    applyOverrides: {
      includeCodeudor: true,
      codeudorIncome: suggestedCodeudorIncome,
      codeudorDebt: suggestedCodeudorDebt,
    },
  };

  const affordablePie = baseSavings + baseCapacity * horizonMonths;
  const suggestedPrice = affordablePie > 0 ? Math.max(Math.round(affordablePie / piePct), 0) : 0;

  const housingAlternative = {
    id: "vivienda",
    title: "Simular otro monto de vivienda",
    description: `Ajustar el precio objetivo para que el PIE (${Math.round(piePct * 100)}%) sea alcanzable en ${horizonMonths} meses.`,
    changeLabel:
      suggestedPrice > 0 ? `Bajar precio objetivo a ${formatClp(suggestedPrice)}` : "Sin precio alcanzable aún",
    benefitLabel:
      baseCapacity > 0
        ? `PIE ${Math.round(piePct * 100)}% alcanzable en ${horizonMonths} meses ahorrando ${formatClp(baseCapacity)}`
        : `Solo alcanzas el PIE con tu ahorro actual (${formatClp(baseSavings)})`,
    applicable: suggestedPrice > 0 && suggestedPrice < price,
    disabledReason:
      suggestedPrice > 0
        ? "El precio ya es el mínimo alcanzable."
        : "Sin ahorro inicial ni capacidad mensual, ajusta primero deuda o ingreso.",
    applyOverrides: { price: suggestedPrice },
  };

  return [debtAlternative, codeudorAlternative, housingAlternative];
}
