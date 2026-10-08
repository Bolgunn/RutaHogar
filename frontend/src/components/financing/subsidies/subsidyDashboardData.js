export const SUBSIDY_DASHBOARD_ITEMS = [
  {
    id: "ds49", benefitIdentifier: "DS49", icon: "people", title: "DS49 — Fondo Solidario", tag: "Construcción / compra", segment: "Hasta 40% RSH", benefit: "Base 314 UF", probable: true, officialUrl: "https://www.minvu.gob.cl/beneficio/vivienda/subsidio-para-comprar-una-vivienda-construida-de-hasta-950-uf-ds49/",
    description: "Aporte para familias en situación de vulnerabilidad que buscan comprar una vivienda sin crédito hipotecario.",
    profile: "Hogares dentro del 40% del RSH, con necesidad habitacional y sin vivienda propia.",
    requirements: ["Tener 18 años o más.", "Pertenecer hasta el 40% del RSH.", "Acreditar un grupo familiar, salvo excepciones.", "Tener ahorro mínimo para vivienda."],
    summary: { benefit: "Base 314 UF", savings: "Desde 10 UF", housing: "Hasta 950 UF", compatibility: "Según llamado" },
  },
  {
    id: "ley-21748", benefitIdentifier: "LEY_21748", icon: "percent", title: "Subsidio al Dividendo — Ley N.º 21.748", tag: "Apoyo al dividendo", segment: "Vivienda nueva", benefit: "≈ 1 pp en tasa", probable: true, officialUrl: "https://www.minvu.gob.cl/fogaes/",
    description: "Beneficio asociado al crédito hipotecario que puede reducir el dividendo mediante una menor tasa de interés.",
    profile: "Personas naturales que compran una vivienda nueva y obtienen un crédito en una entidad adherida.",
    requirements: ["Comprar una vivienda nueva.", "Ser persona natural.", "Obtener crédito hipotecario en una entidad adherida.", "Cumplir las condiciones vigentes del beneficio."],
    summary: { benefit: "≈ 1 pp en tasa", savings: "Pie desde 10%", housing: "Nueva hasta 6.000 UF", compatibility: "Compatible" },
  },
  {
    id: "fogaes", benefitIdentifier: "FOGAES", icon: "percent", title: "FOGAES y subsidio al crédito hipotecario", tag: "Garantía y menor tasa", segment: "Vivienda nueva", benefit: "Pie desde 10%", probable: true, officialUrl: "https://www.minvu.gob.cl/fogaes/",
    description: "Apoyo estatal para financiar la compra de una vivienda nueva mediante garantía y subsidio a la tasa, sujeto a aprobación de una entidad financiera adherida.",
    profile: "Personas naturales que buscan comprar una vivienda nueva y pueden obtener un crédito hipotecario.",
    requirements: ["Ser persona natural.", "Comprar una vivienda nueva de hasta 6.000 UF.", "Obtener aprobación de crédito en una entidad financiera adherida.", "El programa puede permitir financiar con un pie desde 10%."],
    summary: { benefit: "Garantía y menor tasa", savings: "Pie desde 10%", housing: "Nueva hasta 6.000 UF", compatibility: "Según evaluación" },
  },
  {
    id: "padhi", benefitIdentifier: "PADHI", icon: "coins", title: "Programa de Acompañamiento a Deudores Hipotecarios", tag: "Apoyo a deudores", segment: "Crédito con subsidio", benefit: "Rebaja de dividendo", probable: false, officialUrl: "https://www.ventanillaunicasocial.gob.cl/ficha/351/programa-acompanamiento-deudores-hipotecarios",
    description: "Programa para hogares que compraron con subsidio y crédito hipotecario, orientado a sostener el pago y resolver dificultades financieras.",
    profile: "Personas beneficiarias de subsidio habitacional que mantienen un crédito hipotecario.",
    requirements: ["Tener crédito hipotecario asociado a una vivienda con subsidio habitacional.", "Crédito original menor a 1.200 UF.", "Mantener el dividendo al día.", "Que la vivienda subsidiada sea la única propiedad."],
    summary: { benefit: "Rebaja o apoyo al dividendo", savings: "Según evaluación", housing: "Vivienda subsidiada", compatibility: "Según evaluación" },
  },
  {
    id: "leasing", benefitIdentifier: "LEASING", icon: "building", title: "Leasing Habitacional", tag: "Arriendo con promesa", segment: "Nueva o usada", benefit: "Subsidio variable", probable: false, officialUrl: "https://www.minvu.gob.cl/beneficio/vivienda/leasing-habitacional/",
    description: "Permite acceder a una vivienda mediante arriendo con promesa de compraventa mientras se completa su pago.",
    profile: "Personas que pueden pagar arriendo, pero no alcanzan el ahorro previo exigido por otros programas.",
    requirements: ["Ser mayor de edad e inscribirse en el Registro Único de Inscritos del SERVIU.", "No ser propietario ni haber recibido previamente vivienda o subsidio estatal.", "Tener Cuenta de Ahorro para Arrendamiento de Viviendas con Promesa de Compraventa.", "No mantener otro contrato de arrendamiento con promesa de compraventa."],
    summary: { benefit: "Subsidio según vivienda", savings: "Sin ahorro previo exigido", housing: "Nueva o usada hasta 2.000 UF", compatibility: "Según evaluación" },
  },
  {
    id: "ds1", benefitIdentifier: "DS1", icon: "building", title: "Subsidio para Sectores Medios — DS1", tag: "Según tramo evaluado", segment: "RSH o renta máxima", benefit: "250 a 750 UF", probable: false, officialUrl: "https://www.minvu.gob.cl/wp-content/uploads/2019/05/DS1_guia_compra_VF_062026.pdf",
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
