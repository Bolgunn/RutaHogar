// Reviewed informational baseline used only while no published catalogue version is available.
// It never represents an award and published catalogue entries always take precedence.
export const BENEFIT_ESTIMATION_BASELINE = {
  version: "estimate-v2-2026-09-28",
  entries: [
    {
      identifier: "DS1",
      name: "DS1",
      kind: "range",
      amount_range_uf: {
        I: [570, 750],
        II: [250, 700],
        III: [250, 550],
        default: [250, 750],
      },
      source_label: "Guía de compra DS1 MINVU, junio 2026",
      source_url: "https://www.minvu.gob.cl/wp-content/uploads/2019/05/DS1_guia_compra_VF_062026.pdf",
      note: "El monto cambia según tramo, precio y zona; verifica el llamado vigente.",
    },
    {
      identifier: "DS49",
      name: "DS49",
      kind: "base",
      amount_uf: 314,
      eligibility: { max_precio_uf: 950 },
      source_label: "Beneficio DS49 MINVU",
      source_url: "https://www.minvu.gob.cl/beneficio/vivienda/subsidio-para-comprar-una-vivienda-construida-de-hasta-950-uf-ds49/",
      note: "Es el aporte base; la zona y la situación familiar pueden agregar complementos.",
    },
    {
      identifier: "FOGAES",
      name: "FOGAES",
      kind: "information",
      source_label: "FOGAES MINVU",
      source_url: "https://www.minvu.gob.cl/fogaes/",
      note: "Puede reducir tasa y permitir un pie desde 10%, sujeto a la entidad financiera.",
    },
    {
      identifier: "PADHI",
      name: "PADHI",
      kind: "information",
      source_label: "Ventanilla Única Social — PADHI",
      source_url: "https://www.ventanillaunicasocial.gob.cl/ficha/351/programa-acompanamiento-deudores-hipotecarios",
      note: "Acompaña a deudores hipotecarios con subsidio previo; no reduce el precio de una nueva compra.",
    },
    {
      identifier: "LEASING",
      name: "Leasing",
      kind: "information",
      source_label: "Leasing Habitacional MINVU",
      source_url: "https://www.minvu.gob.cl/beneficio/vivienda/leasing-habitacional/",
      note: "Es una alternativa de arrendamiento con promesa de compraventa, no un crédito hipotecario convencional.",
    },
    {
      identifier: "LEY_21748",
      name: "Subsidio al Dividendo — Ley N.º 21.748",
      kind: "information",
      rate_reduction_percentage_points: 0.60,
      source_label: "FOGAES MINVU",
      source_url: "https://www.minvu.gob.cl/fogaes/",
      note: "El subsidio a la tasa depende del crédito y de la entidad financiera que lo otorgue.",
    },
  ],
};

const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function ds1AmountRangeUf(evaluation = {}) {
  const assessment = (evaluation?.result?.housing_benefits?.applicable_benefits || [])
    .find((item) => item?.type === "DS1");
  const note = String(assessment?.notes || "");
  const match = note.match(/Tramo\s+(I{1,3})/i);
  return BENEFIT_ESTIMATION_BASELINE.entries[0].amount_range_uf[match?.[1]?.toUpperCase() || "default"];
}

export function baselineAmountRangeClp(entry, evaluation, ufValue) {
  if (entry?.identifier !== "DS1") return null;
  const [min, max] = ds1AmountRangeUf(evaluation);
  const uf = numeric(ufValue);
  return uf > 0 ? [min * uf, max * uf] : null;
}
