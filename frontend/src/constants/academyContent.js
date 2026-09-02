// HU12 - Academia Financiera
//
// Contenido educativo contextual para RutaHogar.
// Las afirmaciones financieras deben estar respaldadas por fuentes oficiales
// chilenas. El contenido es estático; las condiciones de subsidios o productos
// financieros que cambien con el tiempo deben derivar al sitio oficial.
//
// Fuentes principales:
// - SERNAC: educación y derechos del consumidor financiero
// - CMF: información y regulación del mercado financiero
// - MINVU: subsidios y beneficios habitacionales
// - ChileAtiende: RSH y trámites del Estado
// - Banco Central de Chile: UF e indicadores económicos

export const ACADEMY_TOPICS = [
  {
    id: "credito",
    label: "Crédito hipotecario",
    description: "Cómo funciona un crédito hipotecario y qué evalúa el banco.",
    icon: "ti-building-bank",
    accent: "#1d4ed8",
  },
  {
    id: "endeudamiento",
    label: "Endeudamiento",
    description: "Cuánto pedir y cómo mantener tus deudas bajo control.",
    icon: "ti-chart-pie",
    accent: "#7c3aed",
  },
  {
    id: "carga",
    label: "Carga financiera",
    description: "Qué parte de tus ingresos ya está comprometida.",
    icon: "ti-scale",
    accent: "#c2410c",
  },
  {
    id: "ahorro",
    label: "Ahorro y pie",
    description: "Cuánto ahorrar y cómo preparar el pie de tu compra.",
    icon: "ti-pig",
    accent: "#246354",
  },
  {
    id: "costos",
    label: "Tasas y costos",
    description: "Tasa, CAE, dividendo y el costo total del crédito.",
    icon: "ti-percentage",
    accent: "#b42318",
  },
  {
    id: "plazos",
    label: "Plazos",
    description: "Cómo el plazo cambia tu cuota y el costo total.",
    icon: "ti-calendar-time",
    accent: "#0e7490",
  },
  {
    id: "uf",
    label: "UF e inflación",
    description: "Qué es la UF y cómo reajusta tu crédito en el tiempo.",
    icon: "ti-chart-line",
    accent: "#0369a1",
  },
  {
    id: "subsidios",
    label: "Subsidios",
    description: "Apoyo estatal para comprar vivienda y dónde revisarlo.",
    icon: "ti-gift",
    accent: "#9a5b00",
  },
  {
    id: "rsh",
    label: "RSH y beneficios",
    description: "El Registro Social de Hogares y su rol en los beneficios.",
    icon: "ti-file-description",
    accent: "#0f766e",
  },
  {
    id: "vivienda",
    label: "Compra de vivienda",
    description: "Vivienda nueva o usada y otros aspectos de la compra.",
    icon: "ti-home",
    accent: "#6d28d9",
  },
  {
    id: "documentos",
    label: "Documentación bancaria",
    description: "Dónde y cómo obtener los antecedentes para tu evaluación.",
    icon: "ti-file-text",
    accent: "#475569",
  },
];


// -----------------------------------------------------------------------------
// ARTÍCULOS
// -----------------------------------------------------------------------------

export const ACADEMY_ARTICLES = [

  // ===========================================================================
  // CRÉDITO HIPOTECARIO
  // ===========================================================================

  {
    id: "credito-1",
    topic: "credito",
    title: "¿Qué es un crédito hipotecario?",
    summary:
      "Entiende qué financia un crédito hipotecario, cómo se estructura y qué significa comprometer una propiedad como garantía.",
    level: "Básico",
    minutes: 4,
    tags: ["crédito hipotecario", "dividendo", "plazo"],
    body:
      "Un crédito hipotecario es un financiamiento de largo plazo destinado, entre otros fines, a la adquisición de una vivienda. El crédito queda asociado a una garantía sobre el inmueble, de acuerdo con las condiciones del contrato.\n\nEl monto solicitado, el plazo, la tasa de interés y otros costos determinan cuánto terminarás pagando. Por eso no basta con mirar solamente el monto del dividendo mensual: también es importante revisar la información completa de la cotización y comparar alternativas equivalentes.\n\nAntes de contratar, revisa especialmente la tasa de interés, la CAE, el costo total, los seguros, los gastos y las demás condiciones informadas por la institución.",
    sources: [
      {
        institution: "SERNAC",
        title: "Consumidor Financiero",
        url: "https://www.sernac.cl/portal/604/w3-article-64924.html",
      },
      {
        institution: "CMF",
        title: "Simulador de Crédito Hipotecario",
        url: "https://servicios.cmfchile.cl/simuladorhipotecario/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "credito-2",
    topic: "credito",
    title: "¿Qué evalúa una institución financiera?",
    summary:
      "Conoce por qué una evaluación hipotecaria considera más que tu ingreso mensual.",
    level: "Básico",
    minutes: 4,
    tags: [
      "crédito hipotecario",
      "ingresos",
      "deuda",
      "capacidad de pago",
    ],
    body:
      "Una institución financiera analiza la solvencia y capacidad de pago antes de contratar una operación de crédito. La evaluación no depende exclusivamente del ingreso mensual: también puede considerar las obligaciones financieras existentes y la información necesaria para evaluar la operación.\n\nPor eso, tener un ingreso determinado no garantiza por sí solo la aprobación de un crédito hipotecario. La decisión corresponde a la institución financiera y depende de sus políticas de evaluación y de las características concretas de la operación.\n\nEn RutaHogar, la evaluación sirve como una referencia orientativa para identificar fortalezas y posibles bloqueadores del perfil. No reemplaza la evaluación formal de una institución financiera.",
    sources: [
      {
        institution: "SERNAC",
        title: "Consumidor Financiero",
        url: "https://www.sernac.cl/portal/604/w3-article-64924.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "credito-3",
    topic: "credito",
    title: "Simulación, preaprobación y aprobación: ¿qué cambia?",
    summary:
      "Diferencia una simulación, una evaluación preliminar y la aprobación formal de un crédito.",
    level: "Intermedio",
    minutes: 4,
    tags: ["preaprobación", "crédito hipotecario", "evaluación"],
    body:
      "Una simulación permite estimar cuánto podrías pagar bajo determinadas condiciones. Una evaluación preliminar o preaprobación puede entregar una referencia sobre la posibilidad de acceder a financiamiento, pero no debe confundirse automáticamente con la aprobación definitiva del crédito.\n\nLa aprobación formal depende de la evaluación que realice la institución financiera y de los antecedentes que correspondan a la operación concreta, incluida la propiedad que se pretende financiar.\n\nPor eso, una simulación o una evaluación preliminar no debería interpretarse como una garantía de que el crédito será finalmente otorgado.",
    sources: [
      {
        institution: "CMF",
        title: "Simulador de Crédito Hipotecario",
        url: "https://servicios.cmfchile.cl/simuladorhipotecario/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "credito-4",
    topic: "credito",
    title: "Renta complementada y codeudor",
    summary:
      "Qué significa complementar ingresos y por qué también deben considerarse las obligaciones de la otra persona.",
    level: "Intermedio",
    minutes: 5,
    tags: ["codeudor", "renta complementada", "deuda"],
    body:
      "En algunas operaciones es posible que más de una persona participe en la evaluación del financiamiento. La forma concreta en que se considera la renta conjunta depende de las condiciones de la institución y del contrato.\n\nComplementar ingresos no significa simplemente sumar dos sueldos. La evaluación también debe considerar las obligaciones y antecedentes financieros que correspondan a las personas involucradas.\n\nAntes de comprometer a otra persona como codeudor o participante de una operación, es importante entender las responsabilidades que asumirá y revisar las condiciones específicas del crédito.",
    sources: [
      {
        institution: "SERNAC",
        title: "Consumidor Financiero",
        url: "https://www.sernac.cl/portal/604/w3-article-64924.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // ENDEUDAMIENTO
  // ===========================================================================

  {
    id: "endeudamiento-1",
    topic: "endeudamiento",
    title: "Pedir el máximo posible no siempre es la mejor decisión",
    summary:
      "El monto máximo que una institución podría prestarte no es necesariamente el monto más conveniente para tu presupuesto.",
    level: "Básico",
    minutes: 4,
    tags: ["endeudamiento responsable", "deuda", "presupuesto"],
    body:
      "Que una institución financiera esté dispuesta a prestarte un monto determinado no significa que ese sea el monto más conveniente para tu situación. La evaluación bancaria mide capacidad de pago bajo ciertos criterios, pero no reemplaza tu propio análisis del presupuesto familiar.\n\nAntes de definir cuánto crédito solicitar, conviene revisar tus deudas vigentes, tus gastos habituales, el margen que te quedaría disponible después del nuevo dividendo y tu capacidad para enfrentar cambios en tus ingresos o gastos, como una baja temporal de ingresos o un gasto imprevisto.\n\nUn endeudamiento responsable considera el conjunto de estos factores, no solamente el monto máximo que podrías obtener.",
    sources: [
      {
        institution: "SERNAC",
        title: "Cuida tus lucas: endeudamiento",
        url: "https://www.sernac.cl/604/w3-article-9163.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "endeudamiento-2",
    topic: "endeudamiento",
    title: "¿Cómo afectan tus otras deudas a un hipotecario?",
    summary:
      "Un crédito automotriz, tarjetas u otras obligaciones pueden reducir el margen disponible para una nueva deuda.",
    level: "Básico",
    minutes: 4,
    tags: ["deuda", "carga financiera", "tarjetas"],
    body:
      "Cuando solicitas un nuevo crédito, tus obligaciones financieras existentes forman parte del contexto que puede utilizarse para evaluar tu capacidad de pago.\n\nPor ejemplo, una cuota de crédito automotriz o compromisos derivados de otros productos financieros pueden disminuir el margen disponible para asumir un dividendo hipotecario.\n\nPor eso, antes de buscar una vivienda es útil elaborar un presupuesto que incluya todas tus cuotas y obligaciones, en lugar de considerar solamente el futuro dividendo.",
    sources: [
      {
        institution: "SERNAC",
        title: "Consumidor Financiero",
        url: "https://www.sernac.cl/portal/604/w3-article-64924.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "endeudamiento-3",
    topic: "endeudamiento",
    title: "Tarjetas y líneas de crédito: ¿por qué importan?",
    summary:
      "Entiende por qué tus productos de crédito de consumo deben formar parte de tu presupuesto.",
    level: "Básico",
    minutes: 3,
    tags: ["tarjetas", "línea de crédito", "deuda"],
    body:
      "Las tarjetas de crédito y líneas de crédito forman parte de tus productos financieros y pueden generar obligaciones que debes considerar al analizar tu presupuesto.\n\nTener una tarjeta no significa necesariamente que estés endeudado por el total del cupo disponible. Sin embargo, los compromisos efectivamente adquiridos y las condiciones del producto deben incorporarse al análisis de tus finanzas.\n\nAntes de solicitar un hipotecario, revisa tus estados de cuenta y calcula cuánto de tus ingresos ya está comprometido con deudas y gastos recurrentes.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación financiera",
        url: "https://www.sernac.cl/educacion-para-el-consumo/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "endeudamiento-4",
    topic: "endeudamiento",
    title: "Cómo ordenar tus deudas antes de buscar vivienda",
    summary:
      "Una estrategia sencilla para conocer tu situación financiera antes de comprometerte con una nueva deuda.",
    level: "Básico",
    minutes: 4,
    tags: ["deuda", "presupuesto", "carga financiera"],
    body:
      "Antes de solicitar un crédito hipotecario, reúne información sobre todas tus obligaciones: saldo pendiente, cuota, plazo y condiciones principales.\n\nDespués, construye un presupuesto mensual que incluya ingresos, gastos habituales y cuotas de crédito. Esto permite conocer cuánto margen tienes realmente y evitar decidir solamente en función del precio máximo de una vivienda.\n\nSi tienes varias deudas, no asumas que prepagar una de ellas siempre será la mejor alternativa. Compara los costos, las condiciones y el efecto que tendría esa decisión sobre tus ahorros y tu capacidad de pago.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación financiera",
        url: "https://www.sernac.cl/educacion-para-el-consumo/",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // CARGA FINANCIERA
  // ===========================================================================

  {
    id: "carga-1",
    topic: "carga",
    title: "¿Qué es la carga financiera?",
    summary:
      "Aprende a relacionar tus ingresos con las obligaciones que ya tienes antes de asumir una nueva deuda.",
    level: "Básico",
    minutes: 4,
    tags: ["carga financiera", "deuda", "ingresos"],
    body:
      "La carga financiera permite analizar qué parte de los ingresos de una persona o familia está comprometida con obligaciones financieras. Es una medida útil para evaluar cuánto margen queda disponible para asumir nuevas cuotas.\n\nUna carga elevada puede reducir la capacidad para enfrentar imprevistos o asumir una nueva deuda. Por eso, antes de solicitar un crédito hipotecario conviene considerar no solamente el futuro dividendo, sino también las cuotas y obligaciones que ya existen.\n\nSERNAC entrega recomendaciones generales sobre endeudamiento, pero los criterios utilizados por cada institución financiera para evaluar una solicitud pueden ser diferentes. No existe un porcentaje único de carga financiera que aplique como requisito universal: los criterios y ponderaciones pueden variar entre instituciones y productos.",
    sources: [
      {
        institution: "SERNAC",
        title: "Cuida tus lucas: endeudamiento",
        url: "https://www.sernac.cl/604/w3-article-9163.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // AHORRO Y PIE
  // ===========================================================================

  {
    id: "ahorro-1",
    topic: "ahorro",
    title: "¿Qué es el pie de una vivienda?",
    summary:
      "Entiende qué parte del valor de una propiedad debes financiar con recursos propios según las condiciones de tu operación.",
    level: "Básico",
    minutes: 3,
    tags: ["pie", "ahorro", "vivienda"],
    body:
      "El pie corresponde a la parte del valor de la vivienda que no se financia mediante el crédito hipotecario y que debe cubrirse con recursos propios u otras fuentes permitidas por la operación.\n\nNo existe un único porcentaje de pie que se aplique de manera universal a todos los créditos hipotecarios. El porcentaje financiado depende de las condiciones de la institución, del producto y de las características de la operación.\n\nUn mayor aporte propio puede reducir el monto que necesitas financiar, pero no debe interpretarse automáticamente como una garantía de aprobación o de una determinada tasa de interés.",
    sources: [
      {
        institution: "CMF",
        title: "Simulador de Crédito Hipotecario",
        url: "https://servicios.cmfchile.cl/simuladorhipotecario/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "ahorro-2",
    topic: "ahorro",
    title: "Cómo planificar el ahorro para una vivienda",
    summary:
      "Convierte una meta de ahorro en un objetivo mensual que puedas seguir y revisar.",
    level: "Básico",
    minutes: 4,
    tags: ["ahorro", "pie", "presupuesto"],
    body:
      "Para construir un plan de ahorro comienza definiendo cuánto necesitas reunir y en qué plazo. Divide el monto pendiente por la cantidad de meses disponibles para obtener una referencia del ahorro mensual necesario.\n\nDespués compara esa meta con tu presupuesto real. Si el monto mensual no es sostenible, puedes evaluar ampliar el plazo, ajustar el objetivo de vivienda o revisar tus gastos.\n\nEl ahorro también debe considerar que la compra de una vivienda puede involucrar otros costos además del pie. Por eso conviene no destinar automáticamente todos tus recursos disponibles al pie.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación financiera",
        url: "https://www.sernac.cl/educacion-para-el-consumo/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "ahorro-3",
    topic: "ahorro",
    title: "Cuenta de ahorro para la vivienda",
    summary:
      "Conoce por qué este instrumento aparece en varios programas habitacionales y cómo acreditar el ahorro.",
    level: "Intermedio",
    minutes: 4,
    tags: ["ahorro", "cuenta de ahorro", "subsidio"],
    body:
      "La cuenta de ahorro para la vivienda es utilizada en distintos programas habitacionales para acreditar ahorro. Los requisitos concretos dependen del programa y del llamado correspondiente.\n\nPor ejemplo, el primer llamado nacional DS1 de 2026 exigió una cuenta de ahorro para la vivienda con al menos 12 meses de antigüedad y un ahorro mínimo que variaba según el tramo y la modalidad de postulación.\n\nEstos requisitos pueden cambiar entre llamados, por lo que antes de postular siempre debes revisar las condiciones oficiales del llamado vigente.",
    sources: [
      {
        institution: "MINVU",
        title: "Primer llamado nacional DS1 2026",
        url: "https://www.minvu.gob.cl/postulacion/primer-llamado-nacional-2026-para-postular-al-subsidio-para-sectores-medios-d-s-1/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "ahorro-4",
    topic: "ahorro",
    title: "Pie, ahorro y fondo de emergencia",
    summary:
      "Ahorrar para el pie es importante, pero también conviene considerar la liquidez necesaria para enfrentar imprevistos.",
    level: "Intermedio",
    minutes: 4,
    tags: ["pie", "ahorro", "fondo de emergencia"],
    body:
      "El objetivo de reunir un pie no debería analizarse de manera aislada. Comprar una vivienda también implica asumir una obligación financiera de largo plazo y enfrentar gastos que pueden aparecer antes o después de la compra.\n\nPor eso es útil distinguir entre el dinero destinado al pie y los recursos que necesitas mantener disponibles para gastos inesperados y obligaciones habituales.\n\nLa cantidad adecuada de ahorro disponible depende de cada hogar y de sus gastos. La idea central es evitar que la compra de la vivienda deje al hogar sin liquidez para enfrentar un imprevisto.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación financiera",
        url: "https://www.sernac.cl/educacion-para-el-consumo/",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // TASAS Y COSTOS
  // ===========================================================================

  {
    id: "costos-1",
    topic: "costos",
    title: "¿Qué es la tasa de interés?",
    summary:
      "La tasa es solo una parte del costo de un crédito. Aprende a distinguirla de otros indicadores.",
    level: "Básico",
    minutes: 3,
    tags: ["tasa", "crédito", "costo"],
    body:
      "La tasa de interés representa el costo asociado al financiamiento y es una de las variables que determinan el valor de los pagos de un crédito.\n\nSin embargo, comparar solamente la tasa puede ser insuficiente. Un crédito puede incluir seguros, gastos y otros cargos que también influyen en su costo.\n\nPor eso, cuando compares ofertas, revisa las condiciones completas y utiliza indicadores como la CAE y el Costo Total del Crédito cuando correspondan.",
    sources: [
      {
        institution: "SERNAC",
        title: "Carga Anual Equivalente (CAE)",
        url: "https://www.sernac.cl/portal/607/w3-propertyvalue-15048.html",
      },
      {
        institution: "CMF",
        title: "Simulador de Crédito Hipotecario",
        url: "https://servicios.cmfchile.cl/simuladorhipotecario/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "costos-2",
    topic: "costos",
    title: "¿Qué es la CAE?",
    summary:
      "La Carga Anual Equivalente permite comparar alternativas financieras bajo condiciones comparables.",
    level: "Básico",
    minutes: 4,
    tags: ["CAE", "tasa", "costo"],
    body:
      "La Carga Anual Equivalente, conocida como CAE, es un indicador expresado como porcentaje que permite comparar distintas alternativas de productos financieros.\n\nEn una operación de crédito hipotecario, la CAE considera elementos del financiamiento que permiten expresar su costo de una manera comparable, incluyendo factores como tasa, plazo, seguros y determinados cargos según corresponda.\n\nLa comparación debe hacerse entre operaciones con características equivalentes, especialmente respecto del monto, plazo y condiciones. Una CAE menor no significa que cualquier crédito sea automáticamente adecuado para ti: también debes revisar el resto de las condiciones.",
    sources: [
      {
        institution: "SERNAC",
        title: "Carga Anual Equivalente (CAE)",
        url: "https://www.sernac.cl/portal/607/w3-propertyvalue-15048.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "costos-3",
    topic: "costos",
    title: "Costo Total del Crédito",
    summary:
      "Descubre cuánto terminarías pagando considerando los pagos del crédito durante todo el plazo.",
    level: "Básico",
    minutes: 4,
    tags: ["costo total", "CAE", "dividendo"],
    body:
      "El Costo Total del Crédito permite conocer cuánto se pagará durante toda la operación bajo las condiciones informadas.\n\nEste indicador es especialmente útil porque una cuota mensual baja no necesariamente significa que el crédito sea más barato. Un plazo más largo puede reducir el pago mensual, pero aumentar el monto total pagado.\n\nAl comparar alternativas, revisa el Costo Total junto con la CAE, la tasa, el plazo, los seguros y los demás costos informados.",
    sources: [
      {
        institution: "SERNAC",
        title: "Carga Anual Equivalente y Crédito Hipotecario",
        url: "https://www.sernac.cl/portal/607/w3-propertyvalue-15048.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "costos-4",
    topic: "costos",
    title: "Gastos operacionales de un crédito hipotecario",
    summary:
      "El costo de financiar una vivienda no se limita al pie y al dividendo.",
    level: "Intermedio",
    minutes: 4,
    tags: ["gastos operacionales", "crédito", "costos"],
    body:
      "Además del capital y los intereses, una operación hipotecaria puede involucrar gastos asociados a su formalización y operación. Estos costos deben revisarse en la información entregada por la institución financiera.\n\nEntre los conceptos que pueden aparecer se encuentran gastos relacionados con tasación, estudio de títulos, escritura y otras gestiones, según las características de la operación.\n\nNo todos los créditos tienen exactamente los mismos costos. Por eso es importante revisar la hoja resumen y la cotización específica antes de tomar una decisión.",
    sources: [
      {
        institution: "SERNAC",
        title: "Hoja resumen y educación financiera",
        url: "https://www.sernac.cl/educacion-para-el-consumo/videos/serie-para-vivir-mejor-educacion-financiera/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "costos-5",
    topic: "costos",
    title: "Seguros asociados al crédito hipotecario",
    summary:
      "Conoce los seguros que la normativa exige para las operaciones hipotecarias.",
    level: "Intermedio",
    minutes: 4,
    tags: ["seguro de desgravamen", "seguro de incendio", "seguros"],
    body:
      "En las operaciones de crédito hipotecario existen seguros obligatorios establecidos por la normativa. La CMF señala específicamente el seguro de desgravamen y el seguro de incendio.\n\nEl seguro de desgravamen cubre el saldo de la deuda en caso de fallecimiento del deudor, de acuerdo con las condiciones de la póliza. El seguro de incendio protege el inmueble frente a los riesgos cubiertos por la póliza correspondiente.\n\nAntes de contratar debes revisar las coberturas, exclusiones y costos de los seguros ofrecidos. También es importante diferenciar los seguros obligatorios de otros productos voluntarios.",
    sources: [
      {
        institution: "CMF",
        title: "¿Hay seguros obligatorios en los créditos hipotecarios?",
        url: "https://www.cmfchile.cl/educa/621/w3-article-27508.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "costos-6",
    topic: "costos",
    title: "Cómo comparar dos créditos hipotecarios",
    summary:
      "Una metodología simple para comparar ofertas sin quedarse solamente con la tasa.",
    level: "Intermedio",
    minutes: 5,
    tags: ["CAE", "costo total", "tasa", "comparación"],
    body:
      "Para comparar dos créditos hipotecarios comienza asegurándote de que las alternativas tengan características comparables: monto, plazo, tipo de crédito y condiciones similares.\n\nDespués revisa la tasa de interés, la CAE, el Costo Total del Crédito, el dividendo, los seguros y los gastos informados. La CMF cuenta con un simulador que permite comparar instituciones bajo determinados parámetros.\n\nSERNAC también destaca la importancia de revisar la hoja resumen, donde deben presentarse elementos relevantes como cuota, costo total, CAE, cargos, seguros y gastos adicionales.\n\nLa alternativa con menor tasa no necesariamente será la de menor costo total. Por eso conviene comparar el conjunto de condiciones.",
    sources: [
      {
        institution: "CMF",
        title: "Simulador de Crédito Hipotecario",
        url: "https://servicios.cmfchile.cl/simuladorhipotecario/",
      },
      {
        institution: "SERNAC",
        title: "Educación financiera: Hoja de resumen",
        url: "https://www.sernac.cl/educacion-para-el-consumo/videos/serie-para-vivir-mejor-educacion-financiera/",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // PLAZOS
  // ===========================================================================

  {
    id: "plazos-1",
    topic: "plazos",
    title: "El plazo del crédito: cuota baja no siempre es costo bajo",
    summary:
      "El plazo influye tanto en la cuota mensual como en el costo total del crédito. Aprende a comparar alternativas mirando ambos.",
    level: "Básico",
    minutes: 4,
    tags: ["plazo", "cuota", "costo total"],
    body:
      "El plazo de un crédito hipotecario es el período establecido para pagarlo, y es uno de los factores que más influye en el resultado final de la operación.\n\nUn plazo más largo generalmente reduce el monto de la cuota mensual, lo que puede hacer que un crédito parezca más accesible. Sin embargo, un plazo más largo también suele aumentar el costo total pagado durante toda la operación, porque se pagan intereses durante más tiempo.\n\nPor eso, al comparar alternativas de crédito, no basta con mirar cuál tiene la cuota mensual más baja. Conviene revisar en conjunto la tasa, la CAE, el costo total y el plazo de cada alternativa, y evaluar qué combinación es sostenible para tu presupuesto sin comprometer tu margen disponible.",
    sources: [
      {
        institution: "SERNAC",
        title: "Carga Anual Equivalente y Crédito Hipotecario",
        url: "https://www.sernac.cl/portal/607/w3-propertyvalue-15048.html",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // UF E INFLACIÓN
  // ===========================================================================

  {
    id: "uf-1",
    topic: "uf",
    title: "¿Qué es la UF?",
    summary:
      "Conoce la Unidad de Fomento y por qué aparece frecuentemente en los créditos hipotecarios en Chile.",
    level: "Básico",
    minutes: 3,
    tags: ["UF", "crédito", "inflación"],
    body:
      "La Unidad de Fomento, UF, es un índice de reajustabilidad autorizado por el Banco Central de Chile para determinadas operaciones de crédito de dinero en moneda nacional.\n\nSu valor se reajusta diariamente entre el día 10 de un mes y el día 9 del siguiente, de acuerdo con la variación del Índice de Precios al Consumidor correspondiente al período utilizado para su cálculo.\n\nPor eso, cuando una obligación está expresada en UF, su equivalente en pesos puede cambiar aunque la cantidad de UF permanezca igual.",
    sources: [
      {
        institution: "Banco Central de Chile",
        title: "Unidad de Fomento",
        url: "https://si3.bcentral.cl/Bdemovil/BDE/Series/MOV_ID_IR1",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "uf-2",
    topic: "uf",
    title: "UF e inflación",
    summary:
      "Entiende la relación entre la UF y el IPC sin confundir ambos conceptos.",
    level: "Básico",
    minutes: 3,
    tags: ["UF", "IPC", "inflación"],
    body:
      "La UF y el IPC no son lo mismo. El IPC mide la variación de los precios de una canasta de bienes y servicios, mientras que la UF es una unidad de reajustabilidad cuyo valor se ajusta utilizando la variación del IPC.\n\nEl Banco Central señala que, si el IPC registra una variación positiva, la UF aumenta gradualmente durante su período de reajuste. Si el IPC es cero, la UF permanece constante durante ese período. Si el IPC es negativo, la UF disminuye.",
    sources: [
      {
        institution: "Banco Central de Chile",
        title: "Preguntas frecuentes: UF e inflación",
        url: "https://www.bcentral.cl/es/web/banco-central/preguntas-frecuentes",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "uf-3",
    topic: "uf",
    title: "¿Cómo afecta la UF a tu dividendo?",
    summary:
      "Una cuota expresada en UF puede representar distintos montos en pesos a lo largo del tiempo.",
    level: "Intermedio",
    minutes: 4,
    tags: ["UF", "dividendo", "crédito"],
    body:
      "Cuando un crédito y su dividendo están expresados en UF, el número de UF que debes pagar puede mantenerse según las condiciones del crédito, mientras que su equivalente en pesos cambia con el valor de la UF.\n\nPor ejemplo, un dividendo de una determinada cantidad de UF tendrá un valor en pesos diferente si la UF aumenta.\n\nEsto no significa que la tasa de interés esté cambiando necesariamente. Son conceptos diferentes: la tasa determina el costo financiero del crédito, mientras que la UF es una unidad de reajustabilidad cuyo valor en pesos cambia con el tiempo.",
    sources: [
      {
        institution: "Banco Central de Chile",
        title: "Unidad de Fomento",
        url: "https://si3.bcentral.cl/Bdemovil/BDE/Series/MOV_ID_IR1",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "uf-4",
    topic: "uf",
    title: "¿Qué significa que un crédito esté en UF?",
    summary:
      "Comprende qué implica expresar una deuda en UF y por qué debes mirar también su equivalente en pesos.",
    level: "Intermedio",
    minutes: 4,
    tags: ["UF", "crédito hipotecario", "dividendo"],
    body:
      "Un crédito denominado en UF expresa el capital y las obligaciones asociadas utilizando esta unidad de reajustabilidad. Como la UF cambia su valor en pesos, el monto equivalente en pesos de una obligación puede variar.\n\nEsto es especialmente importante para el presupuesto mensual de un hogar: no basta con conocer el número de UF del dividendo, también debes considerar cómo ese pago se traduce a pesos.\n\nAl evaluar un crédito de largo plazo conviene simular el presupuesto bajo distintos escenarios y no asumir que el valor en pesos será idéntico durante todo el período.",
    sources: [
      {
        institution: "Banco Central de Chile",
        title: "Unidad de Fomento",
        url: "https://si3.bcentral.cl/Bdemovil/BDE/Series/MOV_ID_IR1",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // SUBSIDIOS
  // ===========================================================================

  {
    id: "subsidios-1",
    topic: "subsidios",
    title: "¿Qué es un subsidio habitacional?",
    summary:
      "Los subsidios habitacionales son beneficios estatales que buscan apoyar el acceso a una solución habitacional bajo determinadas condiciones.",
    level: "Básico",
    minutes: 4,
    tags: ["subsidio", "vivienda", "MINVU"],
    body:
      "Los subsidios habitacionales son beneficios otorgados por el Estado a personas o familias que cumplen los requisitos establecidos en cada programa.\n\nLos programas pueden tener objetivos, beneficiarios, montos, requisitos de ahorro y tipos de vivienda diferentes. Por eso no existe un único conjunto de requisitos que sirva para todos los subsidios.\n\nAntes de postular, revisa siempre el programa y el llamado específico publicado por MINVU. La información de RutaHogar es educativa y no reemplaza la postulación ni la evaluación oficial.",
    sources: [
      {
        institution: "MINVU",
        title: "Beneficios de vivienda",
        url: "https://www.minvu.gob.cl/beneficios/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "subsidios-2",
    topic: "subsidios",
    title: "DS1: ¿cómo funciona?",
    summary:
      "Conoce el propósito general del Subsidio para Sectores Medios y por qué sus requisitos deben revisarse por llamado.",
    level: "Intermedio",
    minutes: 5,
    tags: ["DS1", "subsidio", "RSH", "ahorro"],
    body:
      "El Subsidio para Sectores Medios, conocido como DS1, está destinado a familias que buscan acceder a una vivienda y cumplen las condiciones establecidas por el programa.\n\nEn el primer llamado nacional de 2026, MINVU informó tres tramos para adquisición de vivienda y requisitos diferenciados de ahorro y Registro Social de Hogares. Las condiciones concretas, fechas y montos corresponden a ese llamado y no deben interpretarse como requisitos permanentes para futuros procesos.\n\nCuando quieras postular, revisa directamente el llamado vigente de MINVU para conocer los requisitos, fechas, ahorro mínimo y condiciones de la vivienda.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación de la entidad correspondiente.",
    sources: [
      {
        institution: "MINVU",
        title: "Primer llamado nacional 2026 DS1",
        url: "https://www.minvu.gob.cl/postulacion/primer-llamado-nacional-2026-para-postular-al-subsidio-para-sectores-medios-d-s-1/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "subsidios-3",
    topic: "subsidios",
    title: "Subsidio, ahorro y crédito: ¿cómo se combinan?",
    summary:
      "Un subsidio puede formar parte de una estructura de financiamiento junto con ahorro propio y, cuando corresponda, crédito hipotecario.",
    level: "Intermedio",
    minutes: 4,
    tags: ["subsidio", "pie", "crédito"],
    body:
      "En algunos programas habitacionales, el valor de la vivienda puede financiarse combinando el aporte del subsidio con ahorro propio y, cuando corresponda, un crédito hipotecario.\n\nLa forma exacta de combinar estos componentes depende del programa y de sus requisitos. Por eso no es correcto asumir que cualquier subsidio puede utilizarse con cualquier vivienda o crédito.\n\nUna buena práctica es identificar primero el programa al que podrías acceder y después verificar las condiciones de la vivienda y del financiamiento compatible con ese beneficio.",
    sources: [
      {
        institution: "MINVU",
        title: "Subsidio para Sectores Medios DS1",
        url: "https://www.minvu.gob.cl/postulacion/primer-llamado-nacional-2026-para-postular-al-subsidio-para-sectores-medios-d-s-1/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "subsidios-4",
    topic: "subsidios",
    title: "¿Por qué los requisitos de un subsidio pueden cambiar?",
    summary:
      "Distingue entre las características generales de un programa y las condiciones de un llamado específico.",
    level: "Básico",
    minutes: 3,
    tags: ["subsidio", "MINVU", "requisitos"],
    body:
      "Los programas habitacionales tienen reglas establecidas por su normativa, pero los llamados específicos pueden establecer fechas, cupos, montos, condiciones y procedimientos determinados.\n\nPor ejemplo, el primer llamado nacional DS1 de 2026 tuvo fechas de postulación, ahorro mínimo y condiciones específicas para ese proceso.\n\nPor esta razón, una aplicación educativa no debería presentar los requisitos de un llamado antiguo como si fueran válidos para siempre. RutaHogar debe entregar orientación general y derivar al sitio oficial de MINVU para comprobar las condiciones vigentes.",
    sources: [
      {
        institution: "MINVU",
        title: "Primer llamado nacional 2026 DS1",
        url: "https://www.minvu.gob.cl/postulacion/primer-llamado-nacional-2026-para-postular-al-subsidio-para-sectores-medios-d-s-1/",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // RSH
  // ===========================================================================

  {
    id: "rsh-1",
    topic: "rsh",
    title: "¿Qué es el Registro Social de Hogares?",
    summary:
      "El RSH ayuda a determinar la calificación socioeconómica de los hogares para distintos procesos de beneficios estatales.",
    level: "Básico",
    minutes: 4,
    tags: ["RSH", "beneficios", "subsidio"],
    body:
      "El Registro Social de Hogares es un sistema que ayuda a identificar a personas y familias que pueden acceder a la oferta de beneficios del Estado.\n\nLa calificación socioeconómica considera variables como ingresos, composición familiar, vivienda, educación y salud, entre otras. Además, combina información proporcionada por las personas con información disponible en bases de datos del Estado.\n\nEl RSH no significa que una persona reciba automáticamente un beneficio. Cada programa estatal establece sus propios requisitos y condiciones.",
    sources: [
      {
        institution: "ChileAtiende",
        title: "Registro Social de Hogares y Cartola Hogar",
        url: "https://www.chileatiende.gob.cl/fichas/42344-registro-social-de-hogares-rsh-y-cartola-hogar",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "rsh-2",
    topic: "rsh",
    title: "¿Qué significa tu porcentaje del RSH?",
    summary:
      "El porcentaje del RSH corresponde a un tramo de calificación socioeconómica y no equivale por sí solo a un beneficio.",
    level: "Básico",
    minutes: 4,
    tags: ["RSH", "tramo", "subsidio"],
    body:
      "El Registro Social de Hogares asigna a cada hogar un tramo de calificación socioeconómica. Ese tramo se utiliza en los procesos de selección de distintos beneficios estatales.\n\nEstar dentro de un determinado porcentaje no significa automáticamente que tengas derecho a un subsidio. El programa correspondiente puede establecer otros requisitos relacionados con ahorro, ingresos, composición del hogar, vivienda u otras condiciones.\n\nPor eso, para saber si puedes acceder a un beneficio debes revisar los requisitos completos del programa y no solamente tu porcentaje del RSH.",
    sources: [
      {
        institution: "ChileAtiende",
        title: "Registro Social de Hogares",
        url: "https://www.chileatiende.gob.cl/fichas/42344-registro-social-de-hogares-rsh-y-cartola-hogar",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "rsh-3",
    topic: "rsh",
    title: "RSH y subsidios habitacionales",
    summary:
      "El RSH puede ser uno de los requisitos para postular a determinados programas habitacionales.",
    level: "Intermedio",
    minutes: 4,
    tags: ["RSH", "subsidio", "DS1"],
    body:
      "Algunos programas habitacionales utilizan el Registro Social de Hogares como parte de sus requisitos. El porcentaje exigido puede variar según el programa y el tramo de postulación.\n\nPor ejemplo, el primer llamado nacional DS1 de 2026 estableció condiciones diferentes para los tramos 1, 2 y 3, incluyendo límites asociados al RSH.\n\nPor eso, antes de interpretar tu porcentaje como una posibilidad de acceso a un subsidio, revisa las condiciones del llamado vigente publicado por MINVU.",
    sources: [
      {
        institution: "MINVU",
        title: "Primer llamado nacional 2026 DS1",
        url: "https://www.minvu.gob.cl/postulacion/primer-llamado-nacional-2026-para-postular-al-subsidio-para-sectores-medios-d-s-1/",
      },
      {
        institution: "ChileAtiende",
        title: "Registro Social de Hogares",
        url: "https://www.chileatiende.gob.cl/fichas/42344-registro-social-de-hogares-rsh-y-cartola-hogar",
      },
    ],
    reviewedAt: "2026-08",
  },

  // ===========================================================================
  // COMPRA DE VIVIENDA
  // ===========================================================================

  {
    id: "vivienda-1",
    topic: "vivienda",
    title: "Vivienda nueva vs. usada",
    summary:
      "Ambas alternativas pueden ser válidas, pero debes evaluar costos, condiciones de la propiedad y financiamiento.",
    level: "Básico",
    minutes: 4,
    tags: ["vivienda", "nueva", "usada"],
    body:
      "Comprar una vivienda nueva o usada implica revisar aspectos diferentes de la propiedad y de la operación. En ambos casos debes considerar el precio, las condiciones de financiamiento, la documentación y los costos asociados a la compra.\n\nEn una vivienda usada puede ser especialmente importante revisar los antecedentes de la propiedad y su situación jurídica. En una vivienda nueva también debes revisar cuidadosamente las condiciones del proyecto y del contrato.\n\nLa decisión no debería basarse solamente en si la vivienda es nueva o usada: también importa si la operación completa es compatible con tu presupuesto y necesidades.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación financiera",
        url: "https://www.sernac.cl/educacion-para-el-consumo/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "vivienda-2",
    topic: "vivienda",
    title: "¿Qué es una tasación?",
    summary:
      "La tasación busca determinar un valor de referencia de la propiedad para efectos de la operación financiera.",
    level: "Intermedio",
    minutes: 3,
    tags: ["tasación", "vivienda", "crédito"],
    body:
      "La tasación es una valoración de la propiedad realizada para la operación correspondiente. En el contexto de un crédito hipotecario, la información de la propiedad forma parte de los antecedentes que se consideran para evaluar el financiamiento.\n\nEl precio acordado entre comprador y vendedor y el valor determinado en una tasación no son necesariamente idénticos.\n\nPor eso, antes de comprometer una compra conviene entender cómo una eventual diferencia entre el precio de compra y el valor considerado para el financiamiento puede afectar la estructura de recursos necesarios.",
    sources: [
      {
        institution: "CMF",
        title: "Simulador de Crédito Hipotecario",
        url: "https://servicios.cmfchile.cl/simuladorhipotecario/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "vivienda-3",
    topic: "vivienda",
    title: "¿Qué es un estudio de títulos?",
    summary:
      "Conoce por qué los antecedentes jurídicos de una propiedad son relevantes antes de comprar.",
    level: "Intermedio",
    minutes: 4,
    tags: ["estudio de títulos", "propiedad", "compra"],
    body:
      "El estudio de títulos consiste en revisar los antecedentes jurídicos de una propiedad para determinar si existen situaciones que deban considerarse antes de concretar una operación.\n\nEn una compra financiada con crédito hipotecario, la institución puede requerir antecedentes de la propiedad para verificar las condiciones necesarias para constituir la garantía.\n\nAntes de firmar compromisos importantes conviene asegurarse de conocer qué antecedentes deben revisarse y quién será responsable de realizar las gestiones correspondientes.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación para el consumo",
        url: "https://www.sernac.cl/educacion-para-el-consumo/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "vivienda-4",
    topic: "vivienda",
    title: "Costos que debes considerar al comprar una vivienda",
    summary:
      "El precio de la propiedad y el pie no representan necesariamente todos los recursos que necesitarás.",
    level: "Básico",
    minutes: 4,
    tags: ["gastos", "vivienda", "pie"],
    body:
      "El precio de una vivienda no es necesariamente el único desembolso asociado a la compra. Dependiendo de la operación pueden existir costos relacionados con tasación, estudio de títulos, escritura, inscripción y otros trámites o servicios.\n\nEn una compra financiada también debes considerar los costos asociados al crédito, como intereses, seguros y otros cargos informados en la cotización.\n\nAntes de comprometerte, construye un presupuesto que contemple tanto el precio de la vivienda como los costos de la operación y la capacidad de mantener el financiamiento posteriormente.",
    sources: [
      {
        institution: "SERNAC",
        title: "Educación financiera: Hoja de resumen",
        url: "https://www.sernac.cl/educacion-para-el-consumo/videos/serie-para-vivir-mejor-educacion-financiera/",
      },
    ],
    reviewedAt: "2026-08",
  },

  {
    id: "vivienda-5",
    topic: "vivienda",
    title: "Qué revisar antes de comprometer la compra",
    summary:
      "Antes de firmar una promesa o asumir una obligación importante, revisa la vivienda, el financiamiento y las condiciones del contrato.",
    level: "Intermedio",
    minutes: 5,
    tags: ["promesa", "contrato", "vivienda"],
    body:
      "Antes de asumir un compromiso de compra es recomendable revisar cuidadosamente las condiciones de la operación: precio, forma de pago, condiciones de financiamiento, plazos, gastos y obligaciones de las partes.\n\nTambién debes verificar que los antecedentes relevantes de la propiedad estén siendo revisados y que las condiciones del crédito sean compatibles con tu presupuesto.\n\nUna decisión de compra responsable no consiste solamente en saber si puedes pagar el pie. Debes evaluar si puedes sostener la obligación financiera y si entiendes las condiciones contractuales antes de firmar.",
    sources: [
      {
        institution: "SERNAC",
        title: "Consumidor Financiero",
        url: "https://www.sernac.cl/portal/604/w3-article-64924.html",
      },
    ],
    reviewedAt: "2026-08",
  },
  {
    id: "subsidios-fogaes",
    topic: "subsidios",
    title: "FOGAES: financiamiento para vivienda nueva",
    summary: "Qué es FOGAES, quién puede postular y cómo esta garantía estatal facilita el acceso a un crédito hipotecario con menor pie.",
    level: "Básico",
    minutes: 4,
    tags: ["subsidio", "pie", "vivienda"],
    body:
      "FOGAES (Fondo de Garantías para Empresas de Seguros) es un sistema de garantías estatales diseñado para facilitar el acceso a crédito hipotecario. Su objetivo es que más personas puedan financiar una vivienda nueva con un pie más bajo del que los bancos usualmente exigen.\n\nCómo funciona: el Estado respalda parcialmente el crédito, lo que reduce el riesgo para el banco y permite ofrecer mejores condiciones al solicitante. Esto significa que puedes acceder a un crédito hipotecario con un pie mínimo del 10%, cuando normalmente los bancos piden entre 15% y 20%.\n\nRequisitos principales: la vivienda debe ser nueva (no usada), el valor de la propiedad no puede exceder las 4.000 UF, y debes contar con un pie mínimo equivalente al 10% del valor de la propiedad. El banco evaluará también tu renta, continuidad laboral y comportamiento de pago.\n\nDónde postular: los bancos adheridos al sistema FOGAES. Puedes consultar la lista de entidades autorizadas en el sitio oficial de FOGAES o preguntar directamente en tu banco.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación bancaria formal.",
  },
  {
    id: "subsidios-ds49",
    topic: "subsidios",
    title: "DS49: Fondo Solidario de Elección de Vivienda",
    summary: "El subsidio estatal para familias en situación de vulnerabilidad que buscan su primera vivienda.",
    level: "Básico",
    minutes: 4,
    tags: ["subsidio", "vivienda"],
    body:
      "El DS49 (Decreto Supremo 49) es el Fondo Solidario de Elección de Vivienda, un subsidio estatal no reembolsable dirigido a familias en situación de vulnerabilidad socioeconómica.\n\nQuién puede postular: personas mayores de 18 años, inscritas en el Registro Social de Hogares (RSH) con un tramo de vulnerabilidad de hasta el 40% (o hasta el 100% si eres adulto mayor de 60 años), que no sean propietarias de otra vivienda, que cuenten con un ahorro mínimo de 10 UF en una cuenta de ahorro para la vivienda, y que postulen con un grupo familiar acreditado.\n\nEl monto del subsidio varía según el tramo de vulnerabilidad y la zona geográfica. Es un aporte estatal directo que reduce el monto que necesitas financiar con crédito.\n\nProceso de postulación: se realiza a través del SERVIU (Servicio de Vivienda y Urbanismo). Es importante reunir la documentación requerida (certificado de RSH, comprobante de ahorro, certificado de grupo familiar) antes de iniciar el proceso.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación del SERVIU.",
  },
  {
    id: "subsidios-padhi",
    topic: "subsidios",
    title: "PADHI: Acompañamiento a Deudores Hipotecarios",
    summary: "Programa de orientación para personas con deuda hipotecaria vigente que fueron beneficiarias previas de subsidios.",
    level: "Intermedio",
    minutes: 3,
    tags: ["subsidio", "morosidad"],
    body:
      "PADHI (Programa de Acompañamiento a Deudores Hipotecarios) no es un subsidio nuevo, sino un programa de orientación y acompañamiento para personas que ya tienen una deuda hipotecaria vigente y que anteriormente fueron beneficiarias de un subsidio habitacional.\n\nQuién puede acceder: debes contar con una deuda hipotecaria activa y haber sido beneficiario previo de un subsidio habitacional (como DS49, DS1 u otro programa similar).\n\nQué ofrece el programa: orientación financiera para reestructurar deudas, asesoría sobre opciones de pago, y acompañamiento durante el proceso de normalización de la deuda. El objetivo es ayudarte a salir de la morosidad y recuperar la estabilidad financiera.\n\nEste programa es parte del conjunto de herramientas que el Estado ofrece para proteger a las familias que ya accedieron a una vivienda con apoyo estatal.\n\nSi no cumples con los requisitos de PADHI pero tienes deuda hipotecaria, te recomendamos revisar la sección de Crédito Hipotecario en la Academia Financiera para entender tus opciones.\n\nRecuerda: esta información es referencial. El acceso al programa depende de la entidad administradora.",
  },
  {
    id: "subsidios-ds1",
    topic: "subsidios",
    title: "DS1: Subsidio Clase Media para compra de vivienda",
    summary: "El subsidio para la clase media que busca facilitar la compra de una primera vivienda con ahorro previo.",
    level: "Intermedio",
    minutes: 4,
    tags: ["subsidio", "ahorro", "vivienda"],
    body:
      "El DS1 (Decreto Supremo 1) es el Subsidio Clase Media para Compra de Viviendas, dirigido a personas que desean adquirir su primera vivienda y que cuentan con un ahorro acumulado.\n\nEl subsidio se organiza en tres tramos, cada uno con requisitos distintos de ahorro, valor de propiedad y tramo RSH:\n\nTramo I: ahorro mínimo de 30 UF, valor de propiedad hasta 1.100 UF, RSH hasta el 60% (o hasta 90% si eres adulto mayor).\n\nTramo II: ahorro mínimo de 40 UF, valor de propiedad hasta 1.600 UF, RSH hasta el 80% (o hasta 90% si eres adulto mayor).\n\nTramo III: ahorro mínimo de 80 UF, valor de propiedad hasta 2.200 UF, con inscripción en el RSH.\n\nRequisitos comunes: no ser propietario de otra vivienda, contar con antigüedad mínima de 12 meses en la cuenta de ahorro para la vivienda, y cumplir con los requisitos del tramo al que postulas.\n\nEl monto del subsidio varía según el tramo y se entrega como aporte estatal no reembolsable que complementa tu pie o reduce el monto del crédito.\n\nRecuerda: esta información es referencial. La aprobación final depende de la evaluación del SERVIU.",
  },
  {
    id: "subsidios-leasing",
    topic: "subsidios",
    title: "Leasing Habitacional: arrendamiento con promesa de compraventa",
    summary: "Una alternativa al crédito hipotecario que te permite arrendar una vivienda con la opción de comprarla eventualmente.",
    level: "Intermedio",
    minutes: 3,
    tags: ["subsidio", "vivienda"],
    body:
      "El Leasing Habitacional es un subsidio que funciona como arrendamiento con promesa de compraventa de vivienda. En lugar de obtener un crédito hipotecario convencional, arriendas la vivienda con la opción de comprarla en el futuro.\n\nCómo funciona: pagas una cuota mensual por el arrendamiento, y una parte de esa cuota se acumula como descuento del precio de compra. Al final del plazo, tienes la opción de comprar la vivienda con el descuento acumulado.\n\nRequisitos: ser mayor de 18 años, estar inscrito en el Registro Único de Inscritos (RUI), no ser propietario de otra vivienda, y no haber sido beneficiario previo de un subsidio habitacional.\n\nVentajas: es una alternativa para quienes no califican para un crédito hipotecario convencional pero tienen la capacidad de pagar una cuota mensual. También permite acumular ahorro para el pie mientras habitas la vivienda.\n\nEl leasing habitacional es gestionado por entidades autorizadas por el Estado. Consulta las opciones disponibles en tu zona.\n\nRecuerda: esta información es referencial. Las condiciones específicas dependen de la entidad administradora.",
  },
  {
    id: "subsidios-ley21748",
    topic: "subsidios",
    title: "Ley 21.748: reducción de tasa para vivienda nueva",
    summary: "Beneficio que reduce la tasa de interés en 0.60 puntos porcentuales para créditos de vivienda nueva.",
    level: "Básico",
    minutes: 3,
    tags: ["subsidio", "tasa", "vivienda"],
    body:
      "La Ley N° 21.748 establece una reducción de la tasa de interés de 0.60 puntos porcentuales para créditos hipotecarios destinados a la compra de vivienda nueva.\n\nQué significa en la práctica: si tu tasa de interés es de, por ejemplo, 3.50%, con la Ley 21.748 pasaría a 2.90%. Esto reduce directamente tu dividendo mensual durante toda la vida del crédito, lo que puede representar un ahorro significativo.\n\nRequisitos: la vivienda debe ser nueva (no usada), debes ser persona natural (no empresa), y el valor de la propiedad no puede exceder las 4.000 UF.\n\nCómo se aplica: el banco aplica la reducción automáticamente cuando el crédito cumple con los requisitos de la ley. No necesitas realizar un trámite adicional; el banco verifica que la vivienda sea nueva y que el valor esté dentro del tope.\n\nEste beneficio es acumulable con otros subsidios habitacionales, lo que puede mejorar significativamente las condiciones de tu crédito.\n\nRecuerda: esta información es referencial. La aplicación efectiva de la reducción depende de la entidad bancaria.",
  },

  // ===========================================================================
  // DOCUMENTACIÓN
  // ===========================================================================

  {
    id: "docs-1",
    topic: "documentos",
    title: "Guía: Dónde obtener tus documentos para la evaluación hipotecaria",
    summary:
      "Aprende dónde y cómo conseguir cada uno de los antecedentes necesarios para tu evaluación bancaria.",
    level: "Básico",
    minutes: 6,
    tags: ["documentos", "requisitos", "evaluación"],
    body:
      "Reunir los antecedentes para tu evaluación hipotecaria es un paso clave. A continuación, te detallamos dónde puedes obtener cada uno de los documentos habituales:\n\n" +
      "• Cédula de identidad vigente: Se obtiene directamente en las oficinas del Registro Civil. Asegúrate de que no esté vencida ni bloqueada.\n\n" +
      "• Certificado de residencia o Boleta de servicios: El certificado de residencia se solicita en tu Junta de Vecinos o mediante una Notaría Digital. Como alternativa, los bancos suelen aceptar una boleta de servicios básicos (luz, agua, gas) a tu nombre emitida por las respectivas empresas de servicios (idealmente con menos de 3 meses de antigüedad).\n\n" +
      "• Comprobante de ahorro o pie: Puedes descargar la cartola de tu cuenta de ahorro para la vivienda, fondos mutuos o depósitos directamente desde los canales digitales de tu institución financiera (por ejemplo, BancoEstado, Coopeuch, u otra entidad bancaria).\n\n" +
      "• Últimas liquidaciones de sueldo (3 a 6): Solicítalas a tu Empleador o al departamento de Recursos Humanos (RRHH) de tu empresa. Generalmente se piden 3 si tienes renta fija y 6 si tienes renta variable.\n\n" +
      "• Certificado de cotizaciones previsionales: Se descarga desde el sitio web de tu AFP utilizando tu ClaveÚnica o tu Clave AFP. Suele solicitarse el historial de los últimos 12 a 24 meses con el RUT de tu empleador.\n\n" +
      "• Certificado de antigüedad laboral: Es emitido por tu Empleador. Debe ser un documento oficial que especifique tu cargo, tipo de contrato y fecha de ingreso.\n\n" +
      "• Certificados de aclaración, regularización y deuda al día: En caso de morosidades previas, puedes obtener estos certificados a través de Equifax Dicom o el Boletín Comercial, presentando la documentación que acredite el pago.\n\n" +
      "• Certificados de pago total o finiquitos de deudas liquidadas: Si prepagaste un crédito de consumo o cerraste una tarjeta, debes solicitar el certificado de deuda saldada directamente a tu Banco o Acreedor.",
    sources: [
      {
        institution: "RutaHogar",
        title: "Guía de Documentación Hipotecaria",
        url: "#",
      },
    ],
    reviewedAt: "2026-09",
  },
];

// Mapeo academy_module (backend) → articleId (frontend) para deep-link
// desde tarjetas de beneficios directamente a la cápsula educativa.
export const ACADEMY_BENEFIT_CAPSULES = {
  fogaes: "subsidios-fogaes",
  ds49: "subsidios-ds49",
  padhi: "subsidios-padhi",
  ds1: "subsidios-ds1",
  leasing: "subsidios-leasing",
  ley_21748: "subsidios-ley21748",
};

// Glosario contextual (HU12 - E3): términos que aparecen en Resultado, Plan de
// mejora o Mapa y que deben ofrecer acceso directo a contenido de la Academia.

// -----------------------------------------------------------------------------
// GLOSARIO
// -----------------------------------------------------------------------------

export const ACADEMY_GLOSSARY = {
  pie: {
    label: "pie",
    definition:
      "Parte del valor de la vivienda que no se financia mediante el crédito hipotecario y que debe cubrirse según las condiciones de la operación.",
    articleId: "ahorro-1",
  },

  tasa: {
    label: "tasa",
    definition:
      "Porcentaje utilizado para determinar el costo financiero asociado al crédito.",
    articleId: "costos-1",
  },

  cae: {
    label: "CAE",
    definition:
      "Indicador expresado como porcentaje que permite comparar alternativas financieras bajo condiciones comparables.",
    articleId: "costos-2",
  },

  "costo total": {
    label: "costo total",
    definition:
      "Monto total que se pagará durante la operación bajo las condiciones informadas.",
    articleId: "costos-3",
  },

  subsidio: {
    label: "subsidio",
    definition:
      "Beneficio estatal que se entrega bajo las condiciones establecidas por un determinado programa habitacional.",
    articleId: "subsidios-1",
  },

  "carga financiera": {
    label: "carga financiera",
    definition:
      "Medida utilizada para analizar qué parte de los ingresos está comprometida con obligaciones financieras.",
    articleId: "carga-1",
  },

  dividendo: {
    label: "dividendo",
    definition:
      "Pago periódico asociado al crédito hipotecario según las condiciones de la operación.",
    articleId: "uf-3",
  },

  UF: {
    label: "UF",
    definition:
      "Unidad de Fomento, un índice de reajustabilidad cuyo valor se expresa en pesos y se ajusta de acuerdo con la variación del IPC.",
    articleId: "uf-1",
  },

  IPC: {
    label: "IPC",
    definition:
      "Índice de Precios al Consumidor, utilizado como referencia para medir la variación de los precios de una canasta de bienes y servicios.",
    articleId: "uf-2",
  },

  codeudor: {
    label: "codeudor",
    definition:
      "Persona que participa en una operación de crédito junto con el deudor, según las condiciones establecidas por la institución y el contrato.",
    articleId: "credito-4",
  },

  RSH: {
    label: "RSH",
    definition:
      "Registro Social de Hogares, sistema utilizado para apoyar la identificación de personas y hogares que pueden acceder a beneficios estatales.",
    articleId: "rsh-1",
  },

  "registro social de hogares": {
    label: "Registro Social de Hogares",
    definition:
      "Sistema que establece la calificación socioeconómica de los hogares para distintos procesos de beneficios estatales.",
    articleId: "rsh-1",
  },

  tasación: {
    label: "tasación",
    definition:
      "Valoración de una propiedad realizada para la operación correspondiente.",
    articleId: "vivienda-2",
  },

  "estudio de títulos": {
    label: "estudio de títulos",
    definition:
      "Revisión de antecedentes jurídicos relevantes de una propiedad antes de una operación inmobiliaria.",
    articleId: "vivienda-3",
  },

  "gastos operacionales": {
    label: "gastos operacionales",
    definition:
      "Costos asociados a la formalización y operación del financiamiento o de la compra, según corresponda.",
    articleId: "costos-4",
  },

  "seguro de desgravamen": {
    label: "seguro de desgravamen",
    definition:
      "Seguro obligatorio en operaciones hipotecarias que cubre el saldo de la deuda ante el fallecimiento del deudor, según las condiciones de la póliza.",
    articleId: "costos-5",
  },

  "seguro de incendio": {
    label: "seguro de incendio",
    definition:
      "Seguro obligatorio asociado a operaciones hipotecarias que cubre los riesgos establecidos en la póliza.",
    articleId: "costos-5",
  },

  plazo: {
    label: "plazo",
    definition:
      "Período establecido para pagar el crédito.",
    articleId: "plazos-1",
  },

  preaprobación: {
    label: "preaprobación",
    definition:
      "Evaluación preliminar que puede entregar una referencia sobre la posibilidad de acceder a financiamiento, sin equivaler necesariamente a una aprobación definitiva.",
    articleId: "credito-3",
  },

  endeudamiento: {
    label: "endeudamiento",
    definition:
      "Situación financiera asociada a las obligaciones de deuda que mantiene una persona o familia.",
    articleId: "endeudamiento-4",
  },

  // --- Términos adicionales para cubrir la mayoría de las etiquetas ---

  "crédito hipotecario": {
    label: "crédito hipotecario",
    definition:
      "Financiamiento de largo plazo destinado, entre otros fines, a la compra de una vivienda y garantizado sobre el inmueble.",
    articleId: "credito-1",
  },

  ingresos: {
    label: "ingresos",
    definition:
      "Dinero que recibe una persona o hogar de forma periódica y que constituye la base para evaluar su capacidad de pago.",
    articleId: "credito-2",
  },

  "capacidad de pago": {
    label: "capacidad de pago",
    definition:
      "Margen que tiene una persona para asumir una nueva obligación financiera considerando sus ingresos y sus deudas actuales.",
    articleId: "credito-2",
  },

  "renta complementada": {
    label: "renta complementada",
    definition:
      "Suma de ingresos de más de una persona para evaluar un financiamiento, considerando también las obligaciones de cada participante.",
    articleId: "credito-4",
  },

  deuda: {
    label: "deuda",
    definition:
      "Obligación financiera adquirida con una institución u otra persona, que debe pagarse en condiciones definidas.",
    articleId: "endeudamiento-1",
  },

  "endeudamiento responsable": {
    label: "endeudamiento responsable",
    definition:
      "Decisión de endeudarse considerando el presupuesto completo, el margen disponible y los posibles imprevistos.",
    articleId: "endeudamiento-1",
  },

  presupuesto: {
    label: "presupuesto",
    definition:
      "Comparación entre ingresos y gastos de un hogar que permite conocer cuánto margen hay realmente.",
    articleId: "endeudamiento-4",
  },

  tarjetas: {
    label: "tarjetas",
    definition:
      "Productos financieros que permiten comprar a crédito; sus compromisos deben incluirse en el análisis del presupuesto.",
    articleId: "endeudamiento-3",
  },

  "línea de crédito": {
    label: "línea de crédito",
    definition:
      "Monto máximo disponible para usar a crédito; solo lo efectivamente utilizado genera obligaciones.",
    articleId: "endeudamiento-3",
  },

  "cuenta de ahorro": {
    label: "cuenta de ahorro",
    definition:
      "Instrumento utilizado en varios programas habitacionales para acreditar ahorro previo del postulante.",
    articleId: "ahorro-3",
  },

  "fondo de emergencia": {
    label: "fondo de emergencia",
    definition:
      "Recursos mantenidos disponibles para enfrentar gastos inesperados sin comprometer la estabilidad del hogar.",
    articleId: "ahorro-4",
  },

  seguros: {
    label: "seguros",
    definition:
      "Productos de cobertura de riesgos; algunos son obligatorios en operaciones hipotecarias según la normativa.",
    articleId: "costos-5",
  },

  comparación: {
    label: "comparación",
    definition:
      "Ejercicio de revisar ofertas equivalentes (monto, plazo y condiciones) usando indicadores como CAE y costo total.",
    articleId: "costos-6",
  },

  cuota: {
    label: "cuota",
    definition:
      "Pago periódico que se realiza para pagar un crédito; su valor depende del monto, plazo y condiciones.",
    articleId: "plazos-1",
  },

  inflación: {
    label: "inflación",
    definition:
      "Aumento generalizado y sostenido de los precios de bienes y servicios, medido a través de variaciones del IPC.",
    articleId: "uf-2",
  },

  DS1: {
    label: "DS1",
    definition:
      "Subsidio habitacional para Sectores Medios cuyos requisitos, montos y fechas se definen en cada llamado.",
    articleId: "subsidios-2",
  },

  tramo: {
    label: "tramo",
    definition:
      "Segmento de calificación socioeconómica o de postulación utilizado por distintos programas y beneficios.",
    articleId: "rsh-2",
  },

  beneficios: {
    label: "beneficios",
    definition:
      "Apoyos otorgados por el Estado bajo condiciones establecidas por cada programa específico.",
    articleId: "subsidios-1",
  },

  promesa: {
    label: "promesa",
    definition:
      "Compromiso previo a la escritura de compraventa; conviene revisar bien sus condiciones antes de firmarlo.",
    articleId: "vivienda-5",
  },

  contrato: {
    label: "contrato",
    definition:
      "Documento que establece derechos y obligaciones de las partes; debe revisarse completo antes de firmar.",
    articleId: "vivienda-5",
  },

  ahorro: {
    label: "ahorro",
    definition:
      "Parte del ingreso que se destina deliberadamente a metas futuras en lugar de gastarse.",
    articleId: "ahorro-2",
  },

  crédito: {
    label: "crédito",
    definition:
      "Operación en que una institución entrega dinero u otro bien para pagarlo después bajo condiciones definidas.",
    articleId: "credito-1",
  },

  costo: {
    label: "costo",
    definition:
      "Desembolso asociado a una operación financiera; incluye más elementos que la sola tasa de interés.",
    articleId: "costos-1",
  },

  costos: {
    label: "costos",
    definition:
      "Conjunto de desembolsos asociados a una operación: capital, intereses, seguros, cargos y trámites.",
    articleId: "costos-4",
  },

  gastos: {
    label: "gastos",
    definition:
      "Egresos habituales o eventuales del hogar que deben considerarse al construir un presupuesto.",
    articleId: "costos-4",
  },

  evaluación: {
    label: "evaluación",
    definition:
      "Análisis que realiza la institución financiera sobre la solicitud y sus antecedentes antes de decidir.",
    articleId: "credito-3",
  },

  requisitos: {
    label: "requisitos",
    definition:
      "Condiciones exigidas por cada programa o producto; varían entre llamados e instituciones.",
    articleId: "subsidios-4",
  },

  propiedad: {
    label: "propiedad",
    definition:
      "Inmueble objeto de la compra o garantía; sus antecedentes deben revisarse antes de operar.",
    articleId: "vivienda-2",
  },

  compra: {
    label: "compra",
    definition:
      "Operación de adquisición de una vivienda, que involucra precio, trámites, financiamiento y costos asociados.",
    articleId: "vivienda-4",
  },

  MINVU: {
    label: "MINVU",
    definition:
      "Ministerio de Vivienda y Urbanismo, autoridad que define los programas habitacionales y publica los llamados oficiales.",
    articleId: "subsidios-1",
  },
};


// -----------------------------------------------------------------------------
// MAPEO DE RIESGOS DEL SCORE → CONTENIDO EDUCATIVO
// -----------------------------------------------------------------------------

export function classifyRiskText(riskText = "") {
  const text = riskText.toLowerCase();

  if (
    text.includes("co-deudor") ||
    text.includes("codeudor") ||
    text.includes("complementari") ||
    text.includes("complemento")
  ) {
    return {
      topic: "credito",
      term: "codeudor",
      articleId: "credito-4",
    };
  }

  if (text.includes("moros") || text.includes("pagos")) {
    return {
      topic: "carga",
      term: "carga financiera",
      articleId: "carga-1",
    };
  }

  if (
    text.includes("ahorro") ||
    text.includes("pie")
  ) {
    return {
      topic: "ahorro",
      term: "pie",
      articleId: "ahorro-1",
    };
  }

  if (
    text.includes("dividendo") ||
    text.includes("cuota")
  ) {
    return {
      topic: "uf",
      term: "dividendo",
      articleId: "uf-3",
    };
  }

  if (
    text.includes("carga") ||
    text.includes("tarjetas")
  ) {
    return {
      topic: "carga",
      term: "carga financiera",
      articleId: "carga-1",
    };
  }

  if (
    text.includes("deuda") ||
    text.includes("endeud")
  ) {
    return {
      topic: "endeudamiento",
      term: "endeudamiento",
      articleId: "endeudamiento-1",
    };
  }

  if (
    text.includes("continuidad") ||
    text.includes("contrato") ||
    text.includes("independiente") ||
    text.includes("honorarios")
  ) {
    return {
      topic: "credito",
      term: "crédito hipotecario",
      articleId: "credito-2",
    };
  }

  if (
    text.includes("edad") ||
    text.includes("plazo")
  ) {
    return {
      topic: "plazos",
      term: "plazo",
      articleId: "plazos-1",
    };
  }

  return {
    topic: "credito",
    term: null,
    articleId: "credito-2",
  };
}


// -----------------------------------------------------------------------------
// ARTÍCULOS INICIALES
// -----------------------------------------------------------------------------

export const STARTER_ARTICLE_IDS = [
  "credito-1",
  "ahorro-1",
  "costos-2",
];


// -----------------------------------------------------------------------------
// CASOS PRÁCTICOS
// -----------------------------------------------------------------------------
//
// `tag.classification` es solo la etiqueta ilustrativa del perfil del caso.
//
// La similitud con la evaluación del usuario se determina ÚNICAMENTE por
// `match.keywordGroups`: grupos de frases que provienen de los textos de
// riesgo reales que genera el motor de scoring (ver backend/app/scoring.py).
// Un caso coincide cuando al menos uno de sus grupos aparece en algún riesgo
// declarado, y entre los casos que coinciden gana el que acumule más grupos.
// Los casos sin `match` son puramente educativos: sus temas no forman parte
// del scoring, por lo que nunca se anuncian como "parecidos a tu situación".

export const CASE_STUDIES = [
  {
    id: "caso-dividendo-ajustado",
    title: "El dividendo deja poco margen mensual",
    tag: { classification: "Medio" },
    match: {
      // Riesgo real: "El dividendo objetivo podría exigir más holgura financiera."
      keywordGroups: [["dividendo objetivo", "holgura"]],
    },
    situation:
      "El ingreso permite cubrir el dividendo estimado, pero después de considerar las demás obligaciones y gastos queda poco margen para enfrentar imprevistos.",
    why:
      "La capacidad de pago no debería analizarse solamente preguntando si una persona puede pagar una cuota. También es importante considerar el resto de sus obligaciones y su presupuesto mensual.",
    action:
      "Comparar alternativas de menor precio, mayor ahorro o diferentes condiciones de financiamiento y evaluar cómo cambia el presupuesto mensual.",
    relatedArticleIds: [
      "carga-1",
      "endeudamiento-2",
      "endeudamiento-4",
    ],
  },

  {
    id: "caso-pie-insuficiente",
    title: "Buen perfil, pero el ahorro todavía no alcanza",
    tag: { classification: "Alto" },
    match: {
      // Riesgo real: "El ahorro disponible podría ser bajo para..."
      keywordGroups: [["ahorro disponible"]],
    },
    situation:
      "Una persona tiene ingresos suficientes y pocas obligaciones financieras, pero todavía no reúne los recursos propios necesarios para estructurar la compra de la vivienda que está evaluando.",
    why:
      "Tener capacidad de pago no elimina la necesidad de contar con los recursos propios requeridos por la operación. El porcentaje de financiamiento depende de las condiciones del crédito y de la institución.",
    action:
      "Determinar cuánto ahorro falta, establecer una meta mensual y revisar si la vivienda objetivo es compatible con los recursos disponibles.",
    relatedArticleIds: [
      "ahorro-1",
      "ahorro-2",
      "ahorro-4",
    ],
  },

  {
    id: "caso-deuda",
    title: "El ingreso parece suficiente, pero existen otras deudas",
    tag: { classification: "Bajo" },
    match: {
      // Riesgo real: "La carga mensual de deudas podría afectar la evaluación."
      keywordGroups: [["carga mensual de deudas"]],
    },
    situation:
      "Una persona tiene un ingreso que parece suficiente para el dividendo objetivo, pero además mantiene cuotas de otros créditos y obligaciones financieras.",
    why:
      "La capacidad de pago debe considerar el conjunto de obligaciones financieras y no solamente la nueva cuota que se pretende contratar.",
    action:
      "Revisar todas las cuotas, construir un presupuesto completo y evaluar el efecto de las deudas existentes antes de comprometer una nueva obligación.",
    relatedArticleIds: [
      "carga-1",
      "endeudamiento-1",
      "endeudamiento-4",
    ],
  },

  {
    id: "caso-codeudor",
    title: "Complementar renta ayuda solo si el respaldo acompaña",
    tag: { classification: "Medio" },
    match: {
      // Riesgos reales asociados al co-deudor / complemento de renta.
      // Va ANTES que el caso de estabilidad a propósito: varios riesgos del
      // co-deudor mencionan continuidad o contrato, y al empatar debe ganar
      // el caso más específico.
      keywordGroups: [
        ["co-deudor"],
        ["persona complementaria", "complementaria declara"],
        ["complementar renta podría requerir"],
      ],
    },
    situation:
      "Una persona suma a otra para complementar renta, pero esa persona tiene deudas elevadas, morosidad reciente o poca continuidad laboral.",
    why:
      "Complementar ingresos no consiste solo en sumar sueldos: las obligaciones y antecedentes de quienes participan en la operación también forman parte de la evaluación.",
    action:
      "Revisar con transparencia la situación financiera del acompañante y evaluar alternativas antes de comprometerlo en la operación.",
    relatedArticleIds: [
      "credito-4",
      "endeudamiento-3",
      "credito-2",
    ],
  },

  {
    id: "caso-estabilidad",
    title: "Ingreso suficiente, pero falta respaldo de estabilidad",
    tag: { classification: "Medio" },
    match: {
      // Riesgos reales de contrato y continuidad laboral propios del usuario.
      keywordGroups: [
        ["plazo fijo"],
        ["honorarios", "variables pueden requerir"],
        ["independiente", "independientes"],
        ["continuidad laboral"],
      ],
    },
    situation:
      "Una persona tiene ingresos suficientes para el dividendo objetivo, pero trabaja con contrato a plazo fijo, por honorarios o lleva pocos meses en su empleo actual.",
    why:
      "Las instituciones analizan solvencia y estabilidad antes de contratar una operación. La forma de contrato y su continuidad forman parte de los antecedentes que pueden considerar en la evaluación.",
    action:
      "Fortalecer los respaldos de ingresos y continuidad, y revisar con anticipación qué antecedentes solicita cada institución antes de una evaluación formal.",
    relatedArticleIds: [
      "credito-2",
      "credito-3",
    ],
  },

  {
    id: "caso-morosidad",
    title: "Un pago pendiente puede pesar más que el ingreso",
    tag: { classification: "Bajo" },
    match: {
      // Riesgos reales: morosidad declarada o incertidumbre sobre pagos.
      keywordGroups: [
        ["morosidad declarada"],
        ["incertidumbre sobre la situación de pagos"],
      ],
    },
    situation:
      "Una persona con ingresos adecuados descubre pagos pendientes, o simplemente no sabe si su situación de pagos está al día, justo cuando quiere iniciar una evaluación para comprar vivienda.",
    why:
      "El historial de pagos forma parte del análisis que realiza la institución financiera. Un compromiso irregular o desconocido puede influir más en la decisión que un buen nivel de ingreso.",
    action:
      "Identificar y regularizar compromisos pendientes, y confirmar la situación real ante las instituciones correspondientes antes de iniciar trámites.",
    relatedArticleIds: [
      "endeudamiento-1",
      "endeudamiento-4",
      "carga-1",
    ],
  },

  {
    id: "caso-plazo-edad",
    title: "La edad y el plazo del crédito también se combinan",
    tag: { classification: "Medio" },
    match: {
      // Riesgo real: "La edad declarada y el plazo hipotecario podrían..."
      keywordGroups: [["edad declarada"]],
    },
    situation:
      "Una persona cercana a la edad de jubilación busca un plazo largo para reducir el dividendo, pero la suma de edad más plazo complica la estructura de la operación.",
    why:
      "El plazo influye tanto en la cuota como en las condiciones generales del crédito, y algunas instituciones aplican criterios adicionales según la edad del deudor.",
    action:
      "Comparar plazos menores, revisar el efecto en cuota y costo total, y validar las condiciones posibles antes de comprometer la compra.",
    relatedArticleIds: [
      "plazos-1",
      "costos-1",
      "costos-3",
    ],
  },

  // --- Casos educativos: sin `match`, nunca se muestran como "parecidos" ---

  {
    id: "caso-costo-total",
    title: "La tasa más baja no siempre cuenta toda la historia",
    tag: { classification: "Medio" },
    situation:
      "Una persona encuentra dos alternativas hipotecarias. Una tiene una tasa de interés ligeramente menor, pero la otra presenta una CAE y un costo total más convenientes bajo condiciones comparables.",
    why:
      "La tasa de interés es solamente uno de los componentes del costo del crédito. La CAE y el Costo Total permiten incorporar otros elementos relevantes de la operación.",
    action:
      "Comparar ofertas equivalentes revisando tasa, CAE, costo total, seguros, gastos y plazo antes de elegir.",
    relatedArticleIds: [
      "costos-2",
      "costos-3",
      "costos-6",
    ],
  },

  {
    id: "caso-uf",
    title: "El dividendo está en UF, pero el presupuesto está en pesos",
    tag: { classification: "Medio" },
    situation:
      "Una persona conoce el número de UF de su dividendo, pero no ha considerado que el equivalente en pesos puede cambiar cuando cambia el valor de la UF.",
    why:
      "La UF es una unidad de reajustabilidad cuyo valor en pesos cambia de acuerdo con su mecanismo de actualización asociado al IPC.",
    action:
      "Incorporar al presupuesto el equivalente en pesos y evaluar escenarios para comprobar que el hogar pueda mantener la obligación.",
    relatedArticleIds: [
      "uf-1",
      "uf-2",
      "uf-3",
    ],
  },

  {
    id: "caso-rsh",
    title: "Tener un RSH no significa tener automáticamente un subsidio",
    tag: { classification: "Medio" },
    situation:
      "Una persona conoce su porcentaje del RSH y asume que ese porcentaje por sí solo significa que puede recibir un subsidio habitacional.",
    why:
      "El RSH es uno de los elementos que pueden utilizarse en los procesos de selección de beneficios, pero cada programa establece sus propios requisitos.",
    action:
      "Identificar el programa habitacional concreto y revisar sus requisitos completos en MINVU o ChileAtiende.",
    relatedArticleIds: [
      "rsh-1",
      "rsh-2",
      "subsidios-1",
    ],
  },
];


// -----------------------------------------------------------------------------
// BUSCAR CASO RELACIONADO CON LA EVALUACIÓN REAL
// -----------------------------------------------------------------------------
//
// Reglas de similitud:
// 1. Solo se analizan los riesgos declarados por la evaluación; sin riesgos
//    no hay caso parecido.
// 2. Cada grupo de palabras clave de un caso cuenta como un punto si alguna
//    de sus variantes aparece en cualquier texto de riesgo.
// 3. Gana el caso con más grupos presentes; en empate decide el orden de la
//    lista. Si ningún caso alcanza al menos un punto, no hay similitud.

export function findMatchingCase(evaluation) {
  const risks = evaluation?.result?.risks;

  if (!Array.isArray(risks) || risks.length === 0) {
    return null;
  }

  const texts = risks.map((risk) => String(risk).toLowerCase());

  let bestCase = null;
  let bestScore = 0;

  for (const item of CASE_STUDIES) {
    const groups = item.match?.keywordGroups;

    if (!Array.isArray(groups) || groups.length === 0) continue;

    let score = 0;

    for (const group of groups) {
      const hit = texts.some((text) =>
        group.some((keyword) => text.includes(keyword))
      );

      if (hit) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCase = item;
    }
  }

  return bestScore > 0 ? bestCase : null;
}


// -----------------------------------------------------------------------------
// CÁPSULAS / VIDEOS POR TEMA
// -----------------------------------------------------------------------------
//
// Cada tema de la Academia tiene al menos una cápsula: una mini-lección corta
// (2-3 ideas clave) pensada para leerse en un minuto o verse como video.
//
// Para publicar el video real de una cápsula, solo completa `videoUrl`
// (URL de YouTube o Vimeo). Mientras sea `null`, la cápsula se muestra como
// mini-lección interactiva dentro de la app; cuando tenga URL, la interfaz
// la convierte automáticamente en reproductor embebido.
//
// Las dos cápsulas con `videoUrl` usan videos públicos de referencia
// (Meganoticias y Subsecretaría de Bienes Nacionales) solo como ejemplo;
// reemplázalos por los videos propios del producto cuando estén disponibles.
//
// `articleId` conecta la cápsula con su artículo de referencia.

export const ACADEMY_CAPSULES = [
  {
    id: "cap-credito-1",
    topicId: "credito",
    title: "Crédito hipotecario en 4 ideas",
    description:
      "Qué financia realmente, qué lo garantiza y qué revisar antes de contratar.",
    minutes: 2,
    takeaways: [
      "Financia la compra de una vivienda y queda garantizado sobre el inmueble.",
      "El dividendo mensual no es el costo completo: revisa CAE, seguros y gastos.",
      "Compara cotizaciones equivalentes antes de comprometerte.",
    ],
    articleId: "credito-1",
    videoUrl: null,
  },
  {
    id: "cap-credito-2",
    topicId: "credito",
    title: "¿Por qué te evalúan más allá del sueldo?",
    description:
      "Deudas actuales, codeudores y continuidad de ingresos también pesan en la decisión.",
    minutes: 2,
    takeaways: [
      "La evaluación considera tus obligaciones financieras existentes.",
      "Un ingreso alto por sí solo no garantiza la aprobación.",
      "El codeudor asume responsabilidades: entiéndelas antes de sumarlo.",
    ],
    articleId: "credito-2",
    videoUrl: null,
  },
  {
    id: "cap-endeudamiento-1",
    topicId: "endeudamiento",
    title: "El máximo aprobado no es tu meta",
    description:
      "Cómo decidir cuánto pedir mirando tu presupuesto real, no el techo del banco.",
    minutes: 2,
    takeaways: [
      "El monto máximo que te aprueban puede exceder lo conveniente para ti.",
      "Suma todas tus cuotas al presupuesto antes de decidir.",
      "Deja margen para imprevistos y variaciones de ingresos.",
    ],
    articleId: "endeudamiento-1",
    videoUrl: null,
  },
  {
    id: "cap-carga-1",
    topicId: "carga",
    title: "Cuánto de tus ingresos ya está comprometido",
    description:
      "La carga financiera explicada sin fórmulas mágicas ni porcentajes universales.",
    minutes: 2,
    takeaways: [
      "Mide qué parte de tus ingresos ya se va en cuotas y obligaciones.",
      "No existe un porcentaje único válido para todos los bancos.",
      "Una carga alta reduce tu margen para imprevistos y nuevas deudas.",
    ],
    articleId: "carga-1",
    videoUrl: null,
  },
  {
    id: "cap-ahorro-1",
    topicId: "ahorro",
    title: "El pie: tu primera meta de ahorro",
    description:
      "Qué es el pie, cuánto juntar y cómo no descuidar tu fondo de emergencia.",
    minutes: 2,
    takeaways: [
      "El pie es la parte del valor que pagas con recursos propios.",
      "El porcentaje financiado varía según institución y operación.",
      "Separa el ahorro del pie de tu fondo de emergencia.",
    ],
    articleId: "ahorro-1",
    videoUrl: null,
  },
  {
    id: "cap-costos-1",
    topicId: "costos",
    title: "Tasa, CAE y costo total: no son lo mismo",
    description:
      "Los tres números que debes mirar antes de firmar cualquier crédito.",
    minutes: 3,
    takeaways: [
      "La tasa es solo uno de los componentes del costo.",
      "La CAE permite comparar ofertas en condiciones equivalentes.",
      "El costo total muestra cuánto pagarás en todo el plazo.",
    ],
    articleId: "costos-2",
    videoUrl: null,
  },
  {
    id: "cap-plazos-1",
    topicId: "plazos",
    title: "Plazo largo: cuota menor, costo mayor",
    description:
      "El trade-off entre lo que pagas cada mes y lo que pagas en total.",
    minutes: 2,
    takeaways: [
      "A mayor plazo, la cuota baja pero pagas intereses por más tiempo.",
      "Cuota baja no significa crédito barato.",
      "Compara siempre plazo, CAE y costo total en conjunto.",
    ],
    articleId: "plazos-1",
    videoUrl: null,
  },
  {
    id: "cap-uf-1",
    topicId: "uf",
    title: "UF: por qué tu dividendo cambia en pesos",
    description:
      "Cómo funciona la reajustabilidad y qué significa para tu presupuesto mensual.",
    minutes: 6,
    takeaways: [
      "La UF se reajusta diariamente según la variación del IPC.",
      "Las UF de tu dividendo pueden mantenerse, pero sus pesos cambian.",
      "Simula tu presupuesto considerando distintos escenarios de UF.",
    ],
    articleId: "uf-1",
    // Video de ejemplo público; reemplazar por el video propio del producto.
    videoUrl: "https://www.youtube.com/watch?v=Ijt_aa0qtJY",
  },
  {
    id: "cap-subsidios-1",
    topicId: "subsidios",
    title: "Subsidio: un beneficio con reglas propias",
    description:
      "Por qué cada programa (y cada llamado) tiene requisitos distintos.",
    minutes: 2,
    takeaways: [
      "Cada programa define sus propios beneficiarios, montos y requisitos.",
      "Los llamados fijan condiciones específicas que pueden cambiar.",
      "Revisa siempre el llamado vigente en MINVU antes de postular.",
    ],
    articleId: "subsidios-1",
    videoUrl: null,
  },
  {
    id: "cap-rsh-1",
    topicId: "rsh",
    title: "Tu % RSH no es un subsidio automático",
    description:
      "Qué mide realmente el Registro Social de Hogares y cómo se usa.",
    minutes: 2,
    takeaways: [
      "El RSH califica socioeconómicamente a tu hogar, no otorga beneficios.",
      "Cada programa puede pedir requisitos adicionales al tramo.",
      "Revisa los requisitos completos, no solo tu porcentaje.",
    ],
    articleId: "rsh-1",
    videoUrl: null,
  },
  {
    id: "cap-vivienda-1",
    topicId: "vivienda",
    title: "Los gastos que vienen con la vivienda",
    description:
      "Tasación, estudio de títulos, escritura: el precio no es el único desembolso.",
    minutes: 4,
    takeaways: [
      "La compra puede incluir tasación, estudio de títulos y escritura.",
      "En compras financiadas súmales intereses, seguros y cargos.",
      "Presupuesta el precio más los costos de la operación completa.",
    ],
    articleId: "vivienda-4",
    // Video de ejemplo público (Bienes Nacionales); reemplazar por el video propio.
    videoUrl: "https://www.youtube.com/watch?v=h0Gd_rwttGw",
  },
];


// -----------------------------------------------------------------------------
// HELPERS DE CÁPSULAS
// -----------------------------------------------------------------------------

export function getCapsulesForTopic(topicId) {
  return ACADEMY_CAPSULES.filter(
    (capsule) => capsule.topicId === topicId
  );
}

export function findCapsule(id) {
  return ACADEMY_CAPSULES.find(
    (capsule) => capsule.id === id
  ) || null;
}
