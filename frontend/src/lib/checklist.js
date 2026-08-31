/**
 * Pure logic module for HU11: Banking Preparation Checklist (RutaHogar).
 *
 * Rules:
 * 1. Pure functions only — no DOM, React, side effects, or external I/O.
 * 2. Domain concepts strictly in Spanish (ingreso_mensual, clasificacion, etc.).
 * 3. Technical code identifiers and function names strictly in English.
 * 4. Centralized constants for all thresholds, checklist items, and disclaimers.
 */

export const DISCLAIMER_TEXTS = {
  bannerTitle: "Checklist Formativo y Referencial",
  bannerText: "No se deben subir ni ingresar documentos sensibles ni claves bancarias en esta etapa.",
  legalNote: "Este checklist es meramente orientativo y educacional; no genera compromisos financieros ni constituye aprobación de crédito ni asesoría formal.",
};

export const CHECKLIST_ITEMS = {
  common: [
    {
      id: "cedula",
      category: "Identificación y Residencia",
      title: "Cédula de identidad vigente (RUT titular / cónyuge / codeudor)",
      subtitle: "Fotocopia legible por ambos lados.",
      mitigatesRisks: [],
      mitigatesFactors: [],
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "domicilio",
      category: "Identificación y Residencia",
      title: "Certificado de residencia o comprobante de cuenta de servicios",
      subtitle: "Boleta de servicio básico (luz, agua, gas) a tu nombre (< 90 días).",
      mitigatesRisks: [],
      mitigatesFactors: [],
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "ahorro_pie",
      category: "Identificación y Residencia",
      title: "Comprobante de ahorro o pie",
      subtitle: "Cartola de cuenta de ahorro vivienda, fondos mutuos o libreta de ahorro.",
      mitigatesRisks: ["ahorro_bajo", "precio_objetivo", "pie_insuficiente"],
      mitigatesFactors: ["ahorro_pie", "pie"],
      priorityBadge: "Prioritario: Pie Insuficiente",
      priorityReason: "Acredita el capital inicial requerido para el pie.",
      academyArticleId: "pie-1",
      academyTopicId: "pie",
    },
  ],
  dependiente: [
    {
      id: "liquidaciones",
      category: "Acreditación Laboral e Ingresos",
      title: "Últimas 3 a 6 liquidaciones de sueldo",
      subtitle: "3 si la renta es fija, 6 si incluye renta variable.",
      mitigatesRisks: ["renta_insuficiente", "ingreso_bajo"],
      mitigatesFactors: ["ingreso_mensual", "renta"],
      priorityBadge: "Prioritario: Ingresos",
      priorityReason: "Acredita tu nivel de ingresos mensuales recurrentes.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "cotizaciones_afp",
      category: "Acreditación Laboral e Ingresos",
      title: "Certificado de cotizaciones previsionales AFP",
      subtitle: "Histórico de cotizaciones de los últimos 12 a 24 meses con RUT del empleador.",
      mitigatesRisks: ["continuidad_baja", "continuidad_media", "continuidad_laboral_baja", "contrato_inestable"],
      mitigatesFactors: ["estabilidad_laboral", "continuidad"],
      priorityBadge: "Prioritario: Continuidad Laboral",
      priorityReason: "Demuestra estabilidad e historial previsional continuo.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "antiguedad_laboral",
      category: "Acreditación Laboral e Ingresos",
      title: "Certificado de antigüedad laboral emitido por el empleador",
      subtitle: "Documento oficial que especifica cargo, tipo de contrato y fecha de ingreso.",
      mitigatesRisks: ["continuidad_baja", "continuidad_laboral_baja", "contrato_plazo_fijo"],
      mitigatesFactors: ["estabilidad_laboral", "contrato"],
      priorityBadge: "Prioritario: Antigüedad Laboral",
      priorityReason: "Confirma permanencia contractual vigente.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
  ],
  independiente: [
    {
      id: "f22_sii",
      category: "Acreditación Laboral e Ingresos",
      title: "Últimas 2 declaraciones de renta anual (Formulario 22 SII)",
      subtitle: "Declaraciones de impuesto a la renta de los últimos 2 períodos tributarios.",
      mitigatesRisks: ["contrato_independiente"],
      mitigatesFactors: ["estabilidad_laboral", "independiente"],
      priorityBadge: "Prioritario: Ingresos Independientes",
      priorityReason: "Valida la rentabilidad y renta anual declarada.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "boletas_honorarios",
      category: "Acreditación Laboral e Ingresos",
      title: "Resumen de boletas de honorarios electrónicas emitidas",
      subtitle: "Informe emitido en el portal SII correspondiente a los últimos 12 a 24 meses.",
      mitigatesRisks: ["contrato_independiente", "contrato_honorarios_variable"],
      mitigatesFactors: ["estabilidad_laboral", "honorarios"],
      priorityBadge: "Prioritario: Boletas de Honorarios",
      priorityReason: "Respalda la regularidad mensual de ingresos.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "carpeta_tributaria",
      category: "Acreditación Laboral e Ingresos",
      title: "Carpeta Tributaria Electrónica para solicitud de créditos (SII)",
      subtitle: "Carpeta SII oficial que consolida Formularios 22 y 29 de los últimos 24 meses.",
      mitigatesRisks: ["contrato_independiente", "continuidad_baja", "continuidad_laboral_baja"],
      mitigatesFactors: ["estabilidad_laboral", "independiente"],
      priorityBadge: "Prioritario: Carpeta Tributaria SII",
      priorityReason: "Requisito formal clave para la evaluación bancaria de independientes.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
  ],
  mitigacion: [
    {
      id: "aclaracion_dicom",
      category: "Antecedentes de Mitigación Comercial",
      title: "Certificados de aclaración, regularización y deuda al día",
      subtitle: "Comprobantes de pago o carta de aclaración emitida por el acreedor (DICOM / Boletín).",
      mitigatesRisks: ["morosidad_alta", "morosidad_media", "morosidad_vigente", "morosidad_desconocida"],
      mitigatesFactors: ["morosidad", "comportamiento_pago"],
      priorityBadge: "Prioritario: Aclaración de Morosidad",
      priorityReason: "Indispensable para levantar observaciones de morosidad comercial.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
    {
      id: "finiquito_deudas",
      category: "Antecedentes de Mitigación Comercial",
      title: "Certificados de pago total o finiquitos de deudas liquidadas",
      subtitle: "Comprobante de prepago de créditos de consumo o tarjetas extinguidas.",
      mitigatesRisks: ["deuda_alta", "deuda_actual_alta", "carga_total_alta"],
      mitigatesFactors: ["nivel_endeudamiento", "carga_financiera", "deuda"],
      priorityBadge: "Prioritario: Reducción de Carga",
      priorityReason: "Demuestra la liberación de capacidad de pago mensual.",
      academyArticleId: "credito-1",
      academyTopicId: "credito",
    },
  ],
};

/**
 * Returns complete checklist items array for the given employment regime.
 * @param {string} workRegime - "dependiente" or "independiente"
 * @returns {Array} List of checklist item objects.
 */
export function getChecklistForRegime(workRegime = "dependiente") {
  const regime = workRegime === "independiente" ? "independiente" : "dependiente";
  return [
    ...CHECKLIST_ITEMS.common,
    ...(regime === "independiente" ? CHECKLIST_ITEMS.independiente : CHECKLIST_ITEMS.dependiente),
    ...CHECKLIST_ITEMS.mitigacion,
  ];
}

/**
 * Extracts active risk codes and determining factors from an evaluation object.
 * @param {Object} result - Evaluation result object from backend.
 * @param {Object} input - Evaluation input object from lead.
 * @returns {Object} Object containing active risk codes set and active factor keys set.
 */
export function getActiveRiskCodesAndFactors(result = {}, input = {}) {
  const activeRiskCodes = new Set();
  const activeFactors = new Set();

  if (Array.isArray(result?.risk_codes)) {
    result.risk_codes.forEach((c) => activeRiskCodes.add(c));
  }
  if (Array.isArray(result?.blockers)) {
    result.blockers.forEach((b) => b?.code && activeRiskCodes.add(b.code));
  }
  if (result?.main_blocker?.code) {
    activeRiskCodes.add(result.main_blocker.code);
  }

  // Derive risk codes from user input fallbacks
  if (input.morosidad_actual === "si") activeRiskCodes.add("morosidad_alta");
  if (input.morosidad_actual === "no_lo_se") activeRiskCodes.add("morosidad_media");
  if (input.tipo_contrato === "independiente" || input.tipo_contrato === "honorarios_variable") {
    activeRiskCodes.add("contrato_independiente");
  }
  if (input.continuidad_laboral === "menos_6_meses") activeRiskCodes.add("continuidad_baja");

  // Derive determining factor keys
  if (Array.isArray(result?.factors)) {
    result.factors.forEach((f) => {
      const title = (f?.title || "").toLowerCase();
      if (title.includes("endeudamiento") || title.includes("carga")) activeFactors.add("nivel_endeudamiento");
      if (title.includes("estabilidad") || title.includes("continuidad")) activeFactors.add("estabilidad_laboral");
      if (title.includes("renta") || title.includes("ingreso")) activeFactors.add("ingreso_mensual");
      if (title.includes("ahorro") || title.includes("pie")) activeFactors.add("ahorro_pie");
      if (title.includes("morosidad") || title.includes("pago")) activeFactors.add("morosidad");
    });
  }

  return { activeRiskCodes, activeFactors };
}

/**
 * Filters items that dynamically mitigate active risks or match determining factors (Criterio E2).
 * @param {Array} items - List of checklist items.
 * @param {Set} activeRiskCodes - Active risk codes set.
 * @param {Set} activeFactors - Active determining factors set.
 * @returns {Array} Filtered list of priority checklist items.
 */
export function getPriorityChecklistItems(items = [], activeRiskCodes = new Set(), activeFactors = new Set()) {
  return items.filter((item) => {
    const matchesRisk = item.mitigatesRisks.some((risk) => activeRiskCodes.has(risk));
    const matchesFactor = item.mitigatesFactors.some((factor) => activeFactors.has(factor));
    return matchesRisk || matchesFactor;
  });
}
