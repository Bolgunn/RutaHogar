// Dividendo hipotecario referencial.
//
// Vivia dentro de ScoreForm.jsx como funcion privada. Se extrajo porque "Fijar
// como mi Meta" (HU 9) necesita exactamente el mismo calculo: al cambiar el
// valor de la vivienda cambia el monto del credito y, con el, el dividendo.
// Reimplementarlo alli habria sido la misma clase de duplicacion que HU 9
// acaba de eliminar en el veredicto de compatibilidad.
//
// Puro: sin React, sin red, sin almacenamiento.

const FALLBACK_MORTGAGE_ANNUAL_RATE = 0.049;
const configuredMortgageRate = Number(import.meta.env.VITE_REFERENTIAL_MORTGAGE_RATE);

export const REFERENTIAL_MORTGAGE_ANNUAL_RATE =
  Number.isFinite(configuredMortgageRate) && configuredMortgageRate > 0
    ? configuredMortgageRate
    : FALLBACK_MORTGAGE_ANNUAL_RATE;

export function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

// El credito es el valor de la vivienda menos el ahorro que se pone de pie.
// Devuelve dividend === null cuando no hay datos suficientes, para que quien
// llame distinga "no se puede calcular" de "el dividendo es 0".
export function calculateMortgageDividend({ propertyValueClp, savingsClp, termYears, annualRate }) {
  const propertyValue = Number(propertyValueClp) || 0;
  const principal = Math.max(0, propertyValue - (Number(savingsClp) || 0));
  const months = Number(termYears) * 12;
  const monthlyRate = Number(annualRate) / 12;

  if (!Number.isFinite(months) || months <= 0 || propertyValue <= 0) {
    return { dividend: null, principalClp: principal };
  }

  if (principal <= 0) {
    return { dividend: 0, principalClp: principal };
  }

  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
    return {
      dividend: Math.round(principal / months),
      principalClp: principal,
    };
  }

  const compound = Math.pow(1 + monthlyRate, months);
  const dividend = principal * ((monthlyRate * compound) / (compound - 1));

  return {
    dividend: Math.round(dividend),
    principalClp: Math.round(principal),
  };
}
