import {
  calculateMortgageDividend,
  REFERENTIAL_MORTGAGE_ANNUAL_RATE,
  roundCurrency,
} from "./mortgage";

// Payload de /score para "Fijar como mi Meta" (HU 9).
//
// TRAMPA, y la razon de que esto exista como modulo propio. Pisar solo
// `property_value` NO cambia el valor de la vivienda: el resolutor del backend
// (scoring_engine/property_value.py) consulta `property_value_clp` y despues
// `property_value_uf` ANTES de mirar `property_value`, y esos dos vienen
// copiados de la evaluacion anterior. El resultado era una re-evaluacion
// identica a la previa mientras la UI anunciaba que el plan se habia ajustado.
//
// Por eso se reescribe la familia completa de campos derivados en vez de un
// solo campo. Lo mismo con el dividendo: depende del monto del credito, o sea
// del valor de la vivienda, y el backend no lo recalcula — solo lo lee
// (indicators.py) y rellena desde `dividendo_esperado` / `_manual` /
// `_calculado` cuando `dividendo_estimado` viene en null (main.py).
export function buildProjectGoalInput(baseInput = {}, project = {}, ufValueClp) {
  const valorUf = Number(project.precio_min_uf) || Number(project.valor_uf) || 0;
  const ufValue = Number(ufValueClp) || Number(baseInput.uf_value_clp) || 0;
  const valorClp = ufValue > 0 ? Math.round(valorUf * ufValue) : 0;

  const { dividend, principalClp } = calculateMortgageDividend({
    propertyValueClp: valorClp,
    savingsClp: baseInput.ahorro_disponible,
    termYears: baseInput.plazo_credito_hipotecario,
    annualRate: REFERENTIAL_MORTGAGE_ANNUAL_RATE,
  });

  // Si no se pudo calcular (sin plazo, sin valor) se conserva el dividendo
  // declarado: es viejo, pero un 0 le diria al motor que no hay carga y eso
  // inflaria el score en vez de solo desactualizarlo.
  const dividendoEstimado = dividend == null ? baseInput.dividendo_estimado : dividend;

  return {
    ...baseInput,
    property_value: valorUf,
    property_value_unit: "uf",
    property_value_uf: roundCurrency(valorUf),
    property_value_clp: valorClp,
    property_value_source: "project_selection",
    // Este resumen solo identifica la meta en la experiencia; el motor recibe
    // los campos financieros ya normalizados y no depende de esta metadata.
    project_goal: {
      id: project.id || null,
      nombre: project.nombre || "Proyecto seleccionado",
      comuna: project.comuna || "",
      tipo_vivienda: project.tipo_vivienda || "",
      estado: project.estado || "",
      entrega_estimada: project.entrega_estimada || "",
      inmobiliaria: project.inmobiliaria || "",
      precio_min_uf: valorUf,
      precio_max_uf: Number(project.precio_max_uf) || valorUf,
    },
    // Un proyecto en construcción corresponde a vivienda nueva para los
    // requisitos que dependen de esa condición, como FOGAES y Ley 21.748.
    vivienda_nueva: project.estado === "en_construccion",
    dividendo_estimado: dividendoEstimado,
    dividendo_esperado: dividendoEstimado,
    dividendo_estimado_origen: dividend == null ? baseInput.dividendo_estimado_origen : "calculado",
    dividendo_estimado_calculado: dividend == null ? undefined : dividend,
    dividendo_estimado_manual: undefined,
    dividendo_tasa_anual_referencial: REFERENTIAL_MORTGAGE_ANNUAL_RATE,
    dividendo_monto_credito_estimado_clp: principalClp,
    dividendo_monto_credito_estimado_uf: ufValue > 0 ? roundCurrency(principalClp / ufValue) : undefined,
    dividendo_uf_referencial_clp: ufValue || undefined,
  };
}
