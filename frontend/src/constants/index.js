export const plazoLabels = {
  "0_3_meses": "0 a 3 meses",
  "3_6_meses": "3 a 6 meses",
  "6_12_meses": "6 a 12 meses",
  mas_12_meses: "Más de 12 meses",
};

export const propertyLabels = {
  departamento: "Departamento",
  casa: "Casa",
  aun_no_lo_se: "Aun no lo sé",
  indiferente: "Indiferente",
};

export const formValueLabels = {
  comprar_ahora: "Comprar ahora",
  prepararme: "Prepararme para comprar más adelante",
  evaluar_capacidad: "Evaluar mi capacidad de compra",
  conocer_propiedad: "Conocer qué tipo de propiedad podría buscar",
  indefinido: "Contrato indefinido",
  independiente: "Trabajador independiente",
  plazo_fijo: "Contrato a plazo fijo",
  honorarios_variable: "Honorarios o renta variable",
  menos_6_meses: "Menos de 6 meses",
  entre_6_y_12_meses: "Entre 6 y 12 meses",
  entre_1_y_3_anios: "Entre 1 y 3 años",
  mas_3_anios: "Más de 3 años",
  menos_3_meses: "Menos de 3 meses",
  "3_a_12_meses": "Entre 3 y 12 meses",
  "1_a_3_anios": "Entre 1 y 3 años",
  "3_y_6_meses": "Entre 3 y 6 meses",
  "6_y_12_meses": "Entre 6 y 12 meses",
  no: "No",
  si: "Sí",
  conyuge: "Cónyuge",
  pareja_conviviente: "Pareja conviviente",
  pareja_hijos_comun: "Pareja con hijos en común",
  padre_madre: "Padre o madre",
  hijo_hija: "Hijo o hija",
  hermano_hermana: "Hermano o hermana",
  otro_familiar: "Otro familiar",
  amigo: "Amigo o amiga",
  otro: "Otro",
};

export function formatFormValue(value, fallback = "No declarado") {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(value).toLowerCase();
  if (formValueLabels[normalized]) return formValueLabels[normalized];
  if (plazoLabels[normalized]) return plazoLabels[normalized];
  if (propertyLabels[normalized]) return propertyLabels[normalized];
  return String(value)
    .replace(/_/g, " ")
    .replace(/ anios\b/gi, " años")
    .replace(/^./, (letter) => letter.toUpperCase());
}
