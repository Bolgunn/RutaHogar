export const SUBSIDY_DASHBOARD_ITEMS = [
  {
    id: "ds1-tramo-1", benefitIdentifier: "DS1", tramo: "I", icon: "home", title: "DS1 — Tramo 1", tag: "Compra de vivienda", segment: "Hasta 60% RSH", benefit: "570 a 750 UF", probable: true, officialUrl: "https://www.minvu.gob.cl/wp-content/uploads/2019/05/DS1_guia_compra_VF_062026.pdf",
    description: "Apoyo para comprar una vivienda nueva o usada, dirigido a familias de menores ingresos.",
    profile: "Familias dentro del 60% del Registro Social de Hogares que no tienen vivienda propia.",
    requirements: ["Estar inscrito en el Registro Social de Hogares.", "Pertenecer hasta el 60% de menores ingresos.", "No ser propietario de una vivienda.", "Contar con cédula de identidad vigente."],
    summary: { benefit: "570 a 750 UF", savings: "Desde 30 UF", housing: "Nueva o usada", compatibility: "Compatible" },
  },
  {
    id: "ds1-tramo-2", benefitIdentifier: "DS1", tramo: "II", icon: "home", title: "DS1 — Tramo 2", tag: "Compra de vivienda", segment: "Hasta 80% RSH", benefit: "250 a 700 UF", probable: true, officialUrl: "https://www.minvu.gob.cl/wp-content/uploads/2019/05/DS1_guia_compra_VF_062026.pdf",
    description: "Alternativa de compra para hogares de sectores medios que cuentan con ahorro previo.",
    profile: "Familias dentro del 80% del RSH que buscan complementar ahorro con recursos propios o crédito.",
    requirements: ["Estar inscrito en el Registro Social de Hogares.", "Pertenecer hasta el 80% de menores ingresos.", "Contar con ahorro para la vivienda.", "No ser propietario de una vivienda."],
    summary: { benefit: "250 a 700 UF", savings: "Desde 40 UF", housing: "Nueva o usada", compatibility: "Compatible" },
  },
  {
    id: "ds1-tramo-3", benefitIdentifier: "DS1", tramo: "III", icon: "home", title: "DS1 — Tramo 3", tag: "Compra de vivienda", segment: "RSH o renta máxima", benefit: "250 a 550 UF", probable: false, officialUrl: "https://www.minvu.gob.cl/wp-content/uploads/2019/05/DS1_guia_compra_VF_062026.pdf",
    description: "Apoyo de compra para hogares de sectores medios con condiciones de ahorro e ingreso acordes al tramo.",
    profile: "Personas inscritas en el RSH que buscan una vivienda de sectores medios.",
    requirements: ["Estar inscrito en el Registro Social de Hogares.", "Contar con ahorro para la vivienda.", "No ser propietario de una vivienda.", "Cumplir con las condiciones del llamado vigente."],
    summary: { benefit: "250 a 550 UF", savings: "Desde 80 UF", housing: "Nueva o usada", compatibility: "Compatible" },
  },
  {
    id: "ds49", benefitIdentifier: "DS49", icon: "people", title: "DS49 — Fondo Solidario", tag: "Construcción / compra", segment: "Hasta 40% RSH", benefit: "Base 314 UF", probable: true, officialUrl: "https://www.minvu.gob.cl/beneficio/vivienda/subsidio-para-comprar-una-vivienda-construida-de-hasta-950-uf-ds49/",
    description: "Aporte para familias en situación de vulnerabilidad que buscan comprar una vivienda sin crédito hipotecario.",
    profile: "Hogares dentro del 40% del RSH, con necesidad habitacional y sin vivienda propia.",
    requirements: ["Tener 18 años o más.", "Pertenecer hasta el 40% del RSH.", "Acreditar un grupo familiar, salvo excepciones.", "Tener ahorro mínimo para vivienda."],
    summary: { benefit: "Base 314 UF", savings: "Desde 10 UF", housing: "Hasta 950 UF", compatibility: "Según llamado" },
  },
  {
    id: "credito-hipotecario", benefitIdentifier: "LEY_21748", icon: "percent", title: "Subsidio al Crédito Hipotecario", tag: "Apoyo al dividendo", segment: "Vivienda nueva", benefit: "≈ 1 pp en tasa", probable: true, officialUrl: "https://www.minvu.gob.cl/fogaes/",
    description: "Beneficio asociado al crédito hipotecario que puede reducir el dividendo mediante una menor tasa de interés.",
    profile: "Personas naturales que compran una vivienda nueva y obtienen un crédito en una entidad adherida.",
    requirements: ["Comprar una vivienda nueva.", "Ser persona natural.", "Obtener crédito hipotecario en una entidad adherida.", "Cumplir las condiciones vigentes del beneficio."],
    summary: { benefit: "≈ 1 pp en tasa", savings: "Pie desde 10%", housing: "Nueva hasta 6.000 UF", compatibility: "Compatible" },
  },
  {
    id: "sectores-medios", benefitIdentifier: "DS1", icon: "building", title: "Subsidio para Sectores Medios", tag: "Resumen DS1", segment: "RSH o renta máxima", benefit: "250 a 750 UF", probable: false, officialUrl: "https://www.minvu.gob.cl/wp-content/uploads/2019/05/DS1_guia_compra_VF_062026.pdf",
    description: "Vista general de las alternativas DS1 para familias que buscan financiar la compra de una vivienda.",
    profile: "Hogares con capacidad de ahorro y condiciones para complementar el valor de su vivienda.",
    requirements: ["Estar inscrito en el RSH.", "No ser propietario de una vivienda.", "Contar con ahorro para la vivienda.", "Revisar el tramo que corresponde a tu perfil."],
    summary: { benefit: "250 a 750 UF", savings: "30 / 40 / 80 UF", housing: "Nueva o usada", compatibility: "Compatible" },
  },
];

export const SUBSIDY_FILTERS = [
  { id: "all", label: "Todos los subsidios" },
  { id: "probable", label: "Más probables para ti" },
  { id: "savings", label: "Con ahorro previo" },
];
