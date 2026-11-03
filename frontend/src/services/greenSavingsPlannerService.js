import { CLP_FORMATTER, ESTIMATED_ANNUAL_UF_INCREASE } from "./financialTracking";

export const DEFAULT_GREEN_UF_CLP = 38500;
export const GREEN_PLANNER_TERM_PRESETS = Object.freeze([12, 18, 24, 30]);
export const DEFAULT_ANNUAL_UF_INFLATION_RATE = ESTIMATED_ANNUAL_UF_INCREASE; // 4.0% anual
export const DEFAULT_UF_ACCOUNT_REAL_RATE = 0.005; // UF + 0.5% anual referencial
export const DEFAULT_DAP_NOMINAL_ANNUAL_RATE = 0.045; // 4.5% nominal anual referencial
export const GREEN_SAVINGS_GOAL_STORAGE_KEY = "rutahogar_green_savings_goal";

export function formatClpExact(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "$0";
  return CLP_FORMATTER.format(Math.round(number));
}

export function formatUfAmount(value, decimals = 2) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "0 UF";
  return `${number.toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} UF`;
}

/**
 * Resuelve el valor de la UF hoy y su trazabilidad (provenance) de forma transparente.
 */
export function resolveGreenPlannerUfReference(evaluation, marketReference = null) {
  const persistedSnapshot =
    evaluation?.result?.financial_indicators?.capacidad_supuestos?.market_snapshot;
  const snapshotUf = Number(persistedSnapshot?.uf_value_clp);
  if (Number.isFinite(snapshotUf) && snapshotUf > 0) {
    return {
      ufValueClp: snapshotUf,
      effectiveDate: persistedSnapshot.effective_date || null,
      sourceLabel: persistedSnapshot.source?.uf_value_clp?.provider || "Snapshot BCCh evaluación",
      isFallback: false,
    };
  }

  const marketUf = Number(marketReference?.uf_value_clp);
  if (Number.isFinite(marketUf) && marketUf > 0) {
    return {
      ufValueClp: marketUf,
      effectiveDate: marketReference.effective_date || marketReference.snapshot_effective_date || null,
      sourceLabel: marketReference.source || "Referencia de mercado BCCh",
      isFallback: false,
    };
  }

  const inputUf = Number(evaluation?.input?.uf_value_clp);
  if (Number.isFinite(inputUf) && inputUf > 0) {
    return {
      ufValueClp: inputUf,
      effectiveDate: null,
      sourceLabel: "UF declarada en precalificación",
      isFallback: false,
    };
  }

  return {
    ufValueClp: DEFAULT_GREEN_UF_CLP,
    effectiveDate: null,
    sourceLabel: "Valor UF referencial local",
    isFallback: true,
  };
}

/**
 * Calcula los meses restantes desde una fecha de referencia hasta la entrega estimada ('YYYY-MM').
 */
export function calculateMonthsUntilDelivery(entregaEstimada, referenceDate = new Date()) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(entregaEstimada || "").trim());
  if (!match) return null;
  const targetYear = Number(match[1]);
  const targetMonth = Number(match[2]);
  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth() + 1;
  const diff = (targetYear - refYear) * 12 + (targetMonth - refMonth);
  return diff > 0 ? diff : null;
}

/**
 * Resuelve el valor inicial sugerido del pie en UF a partir del proyecto o evaluación.
 */
export function resolveInitialPieUf({ project = null, evaluation = null, ufValueClp = DEFAULT_GREEN_UF_CLP, piePercentage = 0.10 } = {}) {
  const safePct = Number(piePercentage) > 0 ? Number(piePercentage) : 0.10;
  const projectUf = Number(project?.precio_min_uf) || Number(project?.valor_uf) || 0;
  const evalPropertyUf = Number(evaluation?.input?.property_value_uf) || 0;
  const evalPropertyClp = Number(evaluation?.input?.property_value_clp) || Number(evaluation?.input?.property_value) || 0;
  const safeUf = Number(ufValueClp) > 0 ? Number(ufValueClp) : DEFAULT_GREEN_UF_CLP;

  let propertyUf = 0;
  if (projectUf > 0) {
    propertyUf = projectUf;
  } else if (evalPropertyUf > 0) {
    propertyUf = evalPropertyUf;
  } else if (evalPropertyClp > 0) {
    propertyUf = Math.round((evalPropertyClp / safeUf) * 100) / 100;
  } else {
    propertyUf = 3000;
  }

  const pieUf = Math.round(propertyUf * safePct * 100) / 100;
  return {
    propertyUf,
    pieUf,
    piePercentage: safePct,
  };
}

/**
 * E1 - Cálculo de cuotas de ahorro en UF y equivalente en pesos a valor de hoy.
 * Calcula directamente sobre el monto total del pie en UF ingresado y el plazo restante en meses.
 */
export function calculateGreenSavingsSchedule({
  pieUf,
  plazoMeses,
  ufValueClp = DEFAULT_GREEN_UF_CLP,
  entregaEstimada = null,
  ufEffectiveDate = null,
  ufSourceLabel = "Valor UF de referencia",
} = {}) {
  const numericPieUf = Number(pieUf);
  const numericPlazo = Math.round(Number(plazoMeses));
  const numericUfClp = Number(ufValueClp);

  if (!Number.isFinite(numericPieUf) || numericPieUf <= 0) {
    return {
      isValid: false,
      error: "Ingresa un valor de pie en UF mayor a 0.",
      pieUf: 0,
      plazoMeses: numericPlazo > 0 ? numericPlazo : 0,
      ufValueClp: numericUfClp > 0 ? numericUfClp : DEFAULT_GREEN_UF_CLP,
      cuotaMensualUf: 0,
      cuotaMensualUfDisplay: 0,
      cuotaMensualClpHoy: 0,
      pieTotalClpHoy: 0,
      cronograma: [],
      supuestos: null,
    };
  }

  if (!Number.isFinite(numericPlazo) || numericPlazo <= 0) {
    return {
      isValid: false,
      error: "Ingresa un plazo restante en meses mayor a 0.",
      pieUf: numericPieUf,
      plazoMeses: 0,
      ufValueClp: numericUfClp > 0 ? numericUfClp : DEFAULT_GREEN_UF_CLP,
      cuotaMensualUf: 0,
      cuotaMensualUfDisplay: 0,
      cuotaMensualClpHoy: 0,
      pieTotalClpHoy: 0,
      cronograma: [],
      supuestos: null,
    };
  }

  const safeUfClp = Number.isFinite(numericUfClp) && numericUfClp > 0 ? numericUfClp : DEFAULT_GREEN_UF_CLP;
  const rawCuotaUf = numericPieUf / numericPlazo;
  const cuotaMensualUf = Number(rawCuotaUf.toFixed(4));
  const cuotaMensualUfDisplay = Number(rawCuotaUf.toFixed(2));
  const cuotaMensualClpHoy = Math.round(rawCuotaUf * safeUfClp);
  const pieTotalClpHoy = Math.round(numericPieUf * safeUfClp);

  const cronograma = Array.from({ length: numericPlazo }, (_, index) => {
    const mes = index + 1;
    const acumuladoRawUf = rawCuotaUf * mes;
    const restanteRawUf = Math.max(numericPieUf - acumuladoRawUf, 0);
    return {
      mes,
      cuotaUf: cuotaMensualUfDisplay,
      cuotaClpHoy: cuotaMensualClpHoy,
      acumuladoUf: Number(acumuladoRawUf.toFixed(2)),
      acumuladoClpHoy: Math.round(acumuladoRawUf * safeUfClp),
      restanteUf: Number(restanteRawUf.toFixed(2)),
      restanteClpHoy: Math.round(restanteRawUf * safeUfClp),
    };
  });

  return {
    isValid: true,
    error: null,
    pieUf: numericPieUf,
    plazoMeses: numericPlazo,
    entregaEstimada: entregaEstimada || null,
    ufValueClp: safeUfClp,
    cuotaMensualUf,
    cuotaMensualUfDisplay,
    cuotaMensualClpHoy,
    pieTotalClpHoy,
    cronograma,
    supuestos: {
      ufValueClp: safeUfClp,
      ufEffectiveDate: ufEffectiveDate || null,
      ufSourceLabel: ufSourceLabel || "Valor UF de referencia",
      pieUf: numericPieUf,
      plazoMeses: numericPlazo,
      entregaEstimada: entregaEstimada || null,
      formula: "Cuota mensual UF = Pie total en UF ÷ Plazo en meses · Equivalente hoy CLP = Cuota mensual UF × Valor UF hoy",
    },
  };
}

const MODALIDAD_META = {
  tarjeta_credito: {
    id: "tarjeta_credito",
    nombre: "Cuotas con Tarjeta de Crédito",
    instrumento: "Tarjeta de crédito bancaria",
    custodia: "Inmobiliaria (cupo bloqueado)",
    rendimiento: "0% a tu favor (deuda bancaria)",
    notaCosto: "No incluye intereses ni comisiones del emisor de la tarjeta; consúltalos con tu banco.",
    riesgoSobreendeudamiento:
      "Compromete el cupo total de la tarjeta de crédito y figura como deuda en el sistema financiero (CMF), elevando tu carga financiera (DTI) y arriesgando el rechazo del hipotecario.",
  },
  pagares: {
    id: "pagares",
    nombre: "Pagarés Directos Inmobiliaria",
    instrumento: "Pagarés en UF con la inmobiliaria",
    custodia: "Entregado a la inmobiliaria",
    rendimiento: "0% a tu favor (aplica recargo si hay mora)",
    riesgoSobreendeudamiento:
      "Obligación contractual directa en UF exigible mes a mes ante notaría. Si te atrasas antes de escriturar, aplica interés penal o rescisión de promesa con pérdida de las arras.",
  },
};

/**
 * E2 - Lee el esquema de pago del pie en cuotas que informa la inmobiliaria.
 *
 * Solo se considera ofrecido cuando el proyecto trae `esquema_pie_inmobiliaria`
 * con `ofrece_cuotas: true`. No se infieren condiciones comerciales a partir del
 * estado o la fecha de entrega: mostrar cuotas que la inmobiliaria no ofrece
 * sería presentar como del proyecto un calendario inventado.
 *
 * Formato admitido:
 * {
 *   ofrece_cuotas: true,
 *   modalidades: ["tarjeta_credito", "pagares"],
 *   numero_cuotas: 18,              // común a todas las modalidades
 *   recargo_porcentaje: 0,          // común a todas las modalidades
 *   condiciones: {                  // opcional, sobrescribe por modalidad
 *     tarjeta_credito: { numero_cuotas: 12, recargo_porcentaje: 0 },
 *     pagares: { numero_cuotas: 24, recargo_porcentaje: 3 }
 *   }
 * }
 */
export function getDeveloperInstallmentScheme(project) {
  if (!project || typeof project !== "object") return null;

  const config = project.esquema_pie_inmobiliaria || project.pie_cuotas_config;
  if (!config || typeof config !== "object" || config.ofrece_cuotas !== true) return null;

  const modalidades = (Array.isArray(config.modalidades) && config.modalidades.length > 0
    ? config.modalidades
    : ["tarjeta_credito", "pagares"]
  ).filter((m) => m === "tarjeta_credito" || m === "pagares");

  if (modalidades.length === 0) return null;

  const cuotasBase = Number(config.numero_cuotas);
  const recargoBase = Number(config.recargo_porcentaje);
  const condiciones = config.condiciones && typeof config.condiciones === "object" ? config.condiciones : {};

  const terminos = {};
  for (const modalidad of modalidades) {
    const propia = condiciones[modalidad] || {};
    const cuotas = Number(propia.numero_cuotas ?? cuotasBase);
    const recargo = Number(propia.recargo_porcentaje ?? recargoBase);
    if (!Number.isFinite(cuotas) || cuotas < 1) continue;
    terminos[modalidad] = {
      numero_cuotas: Math.round(cuotas),
      recargo_porcentaje: Number.isFinite(recargo) && recargo > 0 ? recargo : 0,
    };
  }

  const modalidadesValidas = modalidades.filter((m) => terminos[m]);
  if (modalidadesValidas.length === 0) return null;

  return {
    ofrece_cuotas: true,
    modalidades: modalidadesValidas,
    terminos,
  };
}

/**
 * Motivo por el que E2 no muestra comparación, para que la UI lo explique
 * sin inventar cifras: "sin_proyecto" | "no_ofrece" | "no_informado".
 */
export function getDeveloperInstallmentStatus(project) {
  if (!project || typeof project !== "object") return "sin_proyecto";
  const config = project.esquema_pie_inmobiliaria || project.pie_cuotas_config;
  if (config && typeof config === "object" && config.ofrece_cuotas === false) return "no_ofrece";
  return getDeveloperInstallmentScheme(project) ? "ofrece" : "no_informado";
}

/**
 * E2 - Comparación entre el plan de ahorro personal y el calendario de cuotas de pie de la inmobiliaria.
 * Solo devuelve disponible = true cuando el proyecto ofrece esa opción.
 */
export function buildDeveloperInstallmentComparison({
  project,
  pieUf,
  plazoPersonalMeses,
  ufValueClp = DEFAULT_GREEN_UF_CLP,
} = {}) {
  const estado = getDeveloperInstallmentStatus(project);
  const scheme = getDeveloperInstallmentScheme(project);
  const noDisponible = {
    disponible: false,
    estado,
    esquemas: [],
    planPersonal: null,
    calendarioComparativo: [],
    supuestos: null,
  };
  if (!scheme) return noDisponible;

  const personal = calculateGreenSavingsSchedule({
    pieUf,
    plazoMeses: plazoPersonalMeses,
    ufValueClp,
    entregaEstimada: project?.entrega_estimada,
  });

  if (!personal.isValid) return noDisponible;

  const esquemas = scheme.modalidades.map((modalidadId) => {
    const meta = MODALIDAD_META[modalidadId];
    const { numero_cuotas: numeroCuotas, recargo_porcentaje: recargoPorcentaje } = scheme.terminos[modalidadId];

    const pieTotalUf = Number((personal.pieUf * (1 + recargoPorcentaje / 100)).toFixed(2));
    const cuotaExactaUf = pieTotalUf / numeroCuotas;
    const cuotaMensualUf = Number(cuotaExactaUf.toFixed(2));
    const cuotaMensualClpHoy = Math.round(cuotaExactaUf * personal.ufValueClp);
    const pieTotalClpHoy = Math.round(pieTotalUf * personal.ufValueClp);

    const costoAdicionalUf = Number((pieTotalUf - personal.pieUf).toFixed(2));

    return {
      id: meta.id,
      nombre: meta.nombre,
      instrumento: meta.instrumento,
      custodia: meta.custodia,
      rendimiento: meta.rendimiento,
      numeroCuotas,
      recargoPorcentaje,
      pieTotalUf,
      pieTotalClpHoy,
      cuotaMensualUf,
      cuotaMensualClpHoy,
      diferenciaMensualUf: Number((cuotaMensualUf - personal.cuotaMensualUfDisplay).toFixed(2)),
      diferenciaMensualClpHoy: cuotaMensualClpHoy - personal.cuotaMensualClpHoy,
      diferenciaPlazoMeses: numeroCuotas - personal.plazoMeses,
      costoAdicionalUf,
      costoAdicionalClpHoy: Math.round(costoAdicionalUf * personal.ufValueClp),
      riesgoSobreendeudamiento: meta.riesgoSobreendeudamiento,
      notaCosto: meta.notaCosto || null,
    };
  });

  const maxMeses = Math.max(personal.plazoMeses, ...esquemas.map((e) => e.numeroCuotas));
  const calendarioComparativo = Array.from({ length: maxMeses }, (_, index) => {
    const mes = index + 1;
    const fila = {
      mes,
      cuotaPersonalUf: mes <= personal.plazoMeses ? personal.cuotaMensualUfDisplay : 0,
      cuotaPersonalClpHoy: mes <= personal.plazoMeses ? personal.cuotaMensualClpHoy : 0,
    };
    for (const esq of esquemas) {
      fila[esq.id] = {
        cuotaUf: mes <= esq.numeroCuotas ? esq.cuotaMensualUf : 0,
        cuotaClpHoy: mes <= esq.numeroCuotas ? esq.cuotaMensualClpHoy : 0,
      };
    }
    return fila;
  });

  return {
    disponible: true,
    estado,
    planPersonal: {
      nombre: "Plan de Ahorro Personal",
      instrumento: "Ahorro propio (sin deuda ni cupo comprometido)",
      custodia: "En tu poder (tu propia cuenta)",
      rendimiento: "Reajuste UF e intereses según el instrumento",
      numeroCuotas: personal.plazoMeses,
      recargoPorcentaje: 0,
      pieTotalUf: personal.pieUf,
      pieTotalClpHoy: personal.pieTotalClpHoy,
      cuotaMensualUf: personal.cuotaMensualUfDisplay,
      cuotaMensualClpHoy: personal.cuotaMensualClpHoy,
      riesgoSobreendeudamiento: "Sin deuda comercial ni uso de cupo bancario; puedes ajustar el aporte si cambian tus ingresos.",
    },
    esquemas,
    calendarioComparativo,
    supuestos: {
      // Compatibilidad: cantidad de cuotas de la primera modalidad informada.
      numeroCuotasInmobiliaria: esquemas[0].numeroCuotas,
      modalidades: scheme.modalidades,
      terminos: scheme.terminos,
      ufValueClp: personal.ufValueClp,
    },
  };
}

/**
 * E3 - Simulación de protección inflacionaria en el mediano plazo.
 * Estima cómo ahorrar en instrumentos reajustables (cuentas en UF o depósitos a plazo)
 * protege el poder adquisitivo frente al encarecimiento de la propiedad expresada en UF.
 */
export function simulateInflationProtection({
  pieUf,
  plazoMeses,
  ufValueClp = DEFAULT_GREEN_UF_CLP,
  propertyUf = null,
  annualInflationRate = DEFAULT_ANNUAL_UF_INFLATION_RATE,
  ufAccountRealRate = DEFAULT_UF_ACCOUNT_REAL_RATE,
  dapNominalAnnualRate = DEFAULT_DAP_NOMINAL_ANNUAL_RATE,
} = {}) {
  const schedule = calculateGreenSavingsSchedule({ pieUf, plazoMeses, ufValueClp });
  if (!schedule.isValid) {
    return {
      isValid: false,
      error: schedule.error,
      instrumentos: [],
      propiedad: null,
      pie: null,
      supuestos: null,
    };
  }

  const safeInflation = Math.max(0, Number(annualInflationRate) || 0);
  const safeUfReal = Math.max(0, Number(ufAccountRealRate) || 0);
  const safeDapNominal = Math.max(0, Number(dapNominalAnnualRate) || 0);
  const safePropertyUf = Number(propertyUf) > 0 ? Number(propertyUf) : Number((schedule.pieUf / 0.10).toFixed(2));

  const monthlyInflationRate = Math.pow(1 + safeInflation, 1 / 12) - 1;
  const monthlyUfRealRate = Math.pow(1 + safeUfReal, 1 / 12) - 1;
  const monthlyDapNominalRate = Math.pow(1 + safeDapNominal, 1 / 12) - 1;

  const ufFinalEstimadaClp = schedule.ufValueClp * Math.pow(1 + monthlyInflationRate, schedule.plazoMeses);

  // Encarecimiento en CLP de la propiedad y del pie (expresados en UF)
  const propiedadClpHoy = Math.round(safePropertyUf * schedule.ufValueClp);
  const propiedadClpEntrega = Math.round(safePropertyUf * ufFinalEstimadaClp);
  const encarecimientoPropiedadClp = Math.max(propiedadClpEntrega - propiedadClpHoy, 0);

  const pieClpHoy = schedule.pieTotalClpHoy;
  const pieClpEntrega = Math.round(schedule.pieUf * ufFinalEstimadaClp);
  const encarecimientoPieClp = Math.max(pieClpEntrega - pieClpHoy, 0);

  // 1) Ahorro sin reajuste (Cuenta vista / efectivo en pesos: ahorra cuotaClpHoy fija por mes)
  const nominalTotalClp = schedule.cuotaMensualClpHoy * schedule.plazoMeses;
  const nominalUfAlFinal = nominalTotalClp / ufFinalEstimadaClp;
  const nominalPerdidaUf = Math.max(schedule.pieUf - nominalUfAlFinal, 0);
  const nominalDeficitClp = Math.max(pieClpEntrega - nominalTotalClp, 0);
  const nominalCoberturaPct = Math.min(100, Math.round((nominalUfAlFinal / schedule.pieUf) * 1000) / 10);

  // 2) Cuenta de ahorro en UF (ahorra cuotaMensualUf cada mes, reajustada 100% IPC/UF + tasa real)
  let ufAccountFinalUf = 0;
  for (let m = 1; m <= schedule.plazoMeses; m += 1) {
    const monthsInvested = schedule.plazoMeses - m + 1;
    ufAccountFinalUf += schedule.cuotaMensualUf * Math.pow(1 + monthlyUfRealRate, monthsInvested);
  }
  const ufAccountFinalClp = Math.round(ufAccountFinalUf * ufFinalEstimadaClp);
  const ufAccountGananciaUf = Math.max(ufAccountFinalUf - schedule.pieUf, 0);
  const ufAccountProteccionClp = Math.max(ufAccountFinalClp - nominalTotalClp, 0);
  const ufAccountCoberturaPct = Math.round((ufAccountFinalUf / schedule.pieUf) * 1000) / 10;

  // 3) Depósito a Plazo (DAP renovable: ahorra cuota reajustada o capitaliza a tasa nominal anual)
  let dapFinalClp = 0;
  for (let m = 1; m <= schedule.plazoMeses; m += 1) {
    const monthsInvested = schedule.plazoMeses - m + 1;
    dapFinalClp += schedule.cuotaMensualClpHoy * Math.pow(1 + monthlyDapNominalRate, monthsInvested);
  }
  dapFinalClp = Math.round(dapFinalClp);
  const dapFinalUf = dapFinalClp / ufFinalEstimadaClp;
  const dapProteccionClp = Math.max(dapFinalClp - nominalTotalClp, 0);
  const dapDeficitClp = Math.max(pieClpEntrega - dapFinalClp, 0);
  const dapCoberturaPct = Math.round((dapFinalUf / schedule.pieUf) * 1000) / 10;

  const instrumentos = [
    {
      id: "sin_reajuste",
      nombre: "Ahorro en pesos sin reajuste (Cuenta corriente / Efectivo)",
      esReajustable: false,
      tasaDescripcion: "0% reajuste anual (nominal en CLP)",
      montoFinalClp: nominalTotalClp,
      ufAcumuladas: Number(nominalUfAlFinal.toFixed(2)),
      coberturaPiePct: nominalCoberturaPct,
      diferenciaUfContraMeta: Number((nominalUfAlFinal - schedule.pieUf).toFixed(2)),
      perdidaPoderAdquisitivoUf: Number(nominalPerdidaUf.toFixed(2)),
      proteccionGanadaClp: 0,
      deficitFinalClp: nominalDeficitClp,
      protegePoderAdquisitivo: false,
      explicacion: `Al subir la UF, tus ${formatClpExact(nominalTotalClp)} equivalen solo a ${formatUfAmount(nominalUfAlFinal)} al momento de la entrega (pierdes ${formatUfAmount(nominalPerdidaUf)} de poder de compra).`,
    },
    {
      id: "cuenta_uf",
      nombre: "Cuenta de Ahorro en UF (Reajustable)",
      esReajustable: true,
      tasaDescripcion: `UF + ${(safeUfReal * 100).toFixed(1)}% real anual`,
      montoFinalClp: ufAccountFinalClp,
      ufAcumuladas: Number(ufAccountFinalUf.toFixed(2)),
      coberturaPiePct: ufAccountCoberturaPct,
      diferenciaUfContraMeta: Number((ufAccountFinalUf - schedule.pieUf).toFixed(2)),
      perdidaPoderAdquisitivoUf: 0,
      proteccionGanadaClp: ufAccountProteccionClp,
      deficitFinalClp: 0,
      protegePoderAdquisitivo: true,
      explicacion: `Protege el 100% de tu pie en UF frente al alza de la vivienda y genera +${formatUfAmount(ufAccountGananciaUf)} adicionales (${formatClpExact(ufAccountProteccionClp)} más que ahorrar sin reajuste).`,
    },
    {
      id: "deposito_plazo",
      nombre: "Depósito a Plazo Renovable (DAP)",
      esReajustable: true,
      tasaDescripcion: `${(safeDapNominal * 100).toFixed(1)}% tasa anual referencial`,
      montoFinalClp: dapFinalClp,
      ufAcumuladas: Number(dapFinalUf.toFixed(2)),
      coberturaPiePct: dapCoberturaPct,
      diferenciaUfContraMeta: Number((dapFinalUf - schedule.pieUf).toFixed(2)),
      perdidaPoderAdquisitivoUf: Number(Math.max(schedule.pieUf - dapFinalUf, 0).toFixed(2)),
      proteccionGanadaClp: dapProteccionClp,
      deficitFinalClp: dapDeficitClp,
      protegePoderAdquisitivo: dapCoberturaPct >= 95,
      explicacion: `Capitaliza intereses mes a mes sumando ${formatClpExact(dapProteccionClp)} de retorno para amortiguar el alza de la UF (${dapCoberturaPct}% de cobertura del pie en UF).`,
    },
  ];

  return {
    isValid: true,
    error: null,
    propiedad: {
      valorUf: safePropertyUf,
      valorClpHoy: propiedadClpHoy,
      valorClpEntrega: propiedadClpEntrega,
      encarecimientoClp: encarecimientoPropiedadClp,
    },
    pie: {
      valorUf: schedule.pieUf,
      valorClpHoy: pieClpHoy,
      valorClpEntrega: pieClpEntrega,
      encarecimientoClp: encarecimientoPieClp,
    },
    instrumentos,
    supuestos: {
      ufInicialClp: Math.round(schedule.ufValueClp),
      ufFinalEstimadaClp: Math.round(ufFinalEstimadaClp),
      inflacionAnualUfPct: Number((safeInflation * 100).toFixed(1)),
      tasaRealCuentaUfPct: Number((safeUfReal * 100).toFixed(1)),
      tasaNominalDapPct: Number((safeDapNominal * 100).toFixed(1)),
      plazoMeses: schedule.plazoMeses,
    },
  };
}

/**
 * E4 - Verifica si el lead tiene activo el seguimiento del plan de mejora (HU 13).
 */
export function isTrackingPlanActive(evaluation, trackingState = null) {
  if (trackingState?.status === "active") return true;
  if (evaluation?.plan_type) return true;
  if (evaluation?.plan_accepted_at) return true;
  if (evaluation?.housing_plan?.status === "en_curso") return true;
  if (evaluation?.housing_plan?.green_savings_goal) return true;
  return false;
}

/**
 * Construye el payload de la meta mensual de ahorro en verde/blanco para el dashboard personal (E4).
 */
export function buildGreenSavingsGoalPayload({
  schedule,
  project = null,
  instrument = "cuenta_uf",
  fixedAt = new Date().toISOString(),
} = {}) {
  if (!schedule?.isValid) {
    throw new Error("No se puede fijar una meta de ahorro con un cálculo inválido.");
  }

  return {
    type: "pie_en_verde_blanco",
    project_id: project?.id || null,
    project_name: project?.nombre || "Proyecto en verde / blanco",
    entrega_estimada: project?.entrega_estimada || schedule.entregaEstimada || null,
    pie_total_uf: schedule.pieUf,
    pie_total_clp_hoy: schedule.pieTotalClpHoy,
    plazo_meses: schedule.plazoMeses,
    cuota_mensual_uf: schedule.cuotaMensualUfDisplay,
    cuota_mensual_clp: schedule.cuotaMensualClpHoy,
    uf_value_clp: schedule.ufValueClp,
    instrumento_sugerido: instrument,
    fixed_at: fixedAt,
  };
}

/**
 * Persistencia local auxiliar (fallback cuando Supabase no está configurada o para lectura inmediata en ProgressPage).
 */
export function saveLocalGreenSavingsGoal(goalPayload, evaluationId = null) {
  if (!goalPayload) return null;
  try {
    if (typeof localStorage !== "undefined") {
      const stored = JSON.parse(localStorage.getItem(GREEN_SAVINGS_GOAL_STORAGE_KEY) || "{}");
      const next = {
        ...stored,
        latest: goalPayload,
        ...(evaluationId ? { [String(evaluationId)]: goalPayload } : {}),
      };
      localStorage.setItem(GREEN_SAVINGS_GOAL_STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Entorno sin localStorage disponible
  }
  return goalPayload;
}

export function getEffectiveGreenSavingsGoal(evaluation = null, trackingState = null) {
  const fromEval = evaluation?.housing_plan?.green_savings_goal;
  if (fromEval && Number(fromEval.cuota_mensual_uf) > 0) return fromEval;

  const fromTracking = trackingState?.green_savings_goal;
  if (fromTracking && Number(fromTracking.cuota_mensual_uf) > 0) return fromTracking;

  try {
    if (typeof localStorage !== "undefined") {
      const stored = JSON.parse(localStorage.getItem(GREEN_SAVINGS_GOAL_STORAGE_KEY) || "{}");
      const evalId = evaluation?.id || trackingState?.current_evaluation_id;
      if (evalId && stored[String(evalId)]) return stored[String(evalId)];
      if (stored.latest) return stored.latest;
    }
  } catch {
    // Entorno sin localStorage disponible
  }
  return null;
}
