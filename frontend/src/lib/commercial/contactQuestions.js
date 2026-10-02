// ALG-15 - Preguntas sugeridas para abordaje comercial.
// Normativa: docs/algorithms/ALG-15-commercial-contact-questions.md.
const BASE_QUESTIONS = [
  {
    id: "purchase_motivation",
    category: "Motivación de compra",
    question: "¿Qué te motivó a empezar a buscar vivienda ahora?",
    reason: "Ayuda a entender urgencia real y gatilladores de decisión que no aparecen en la evaluación financiera.",
    priority: 78,
  },
  {
    id: "decision_makers",
    category: "Decisión",
    question: "¿Hay otra persona que participe en la decisión de compra?",
    reason: "Permite anticipar tiempos, objeciones y próximos pasos del proceso comercial.",
    priority: 74,
  },
  {
    id: "purchase_tradeoff",
    category: "Prioridades",
    question: "Si tuvieras que priorizar, ¿qué pesa más: comuna, precio, plazo de entrega o tipo de vivienda?",
    reason: "Aclara criterios de decisión que no se infieren solo desde ingreso, deuda o ahorro.",
    priority: 70,
  },
];

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addQuestion(questions, question) {
  if (questions.some((item) => item.id === question.id)) return;
  questions.push(question);
}

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function declaredCommunes(input, onboarding) {
  return [
    input.comuna_objetivo,
    onboarding.comuna_interes,
    onboarding.comuna_alternativa,
  ].filter(Boolean);
}

function scoreOf(result) {
  return toNumber(result.adjusted_score ?? result.score);
}

function projectGoalMatchesSelected(projectGoal, project) {
  if (!projectGoal || !project) return false;
  if (projectGoal.id != null && project.id != null && String(projectGoal.id) === String(project.id)) return true;
  const sameName = projectGoal.nombre && project.nombre && projectGoal.nombre.trim().toLowerCase() === project.nombre.trim().toLowerCase();
  const sameCommune = projectGoal.comuna && project.comuna && projectGoal.comuna.trim().toLowerCase() === project.comuna.trim().toLowerCase();
  return Boolean(sameName && sameCommune);
}

export function buildContactQuestions({ lead, selectedProject = null, selectedMatch = null } = {}) {
  const input = lead?.input || {};
  const onboarding = lead?.onboarding || {};
  const result = lead?.result || {};
  const indicators = result.financial_indicators || {};
  const communes = declaredCommunes(input, onboarding);
  const classification = result.classification || "";
  const score = scoreOf(result);
  const questions = [...BASE_QUESTIONS];

  if (!selectedProject) {
    addQuestion(questions, {
      id: "no_project_goal_priority",
      category: "Foco de búsqueda",
      question: "Antes de revisar alternativas, ¿qué condición es irrenunciable para ti: comuna, precio, entrega, tamaño o tipo de vivienda?",
      reason: "Sin proyecto seleccionado, esta respuesta ayuda a orientar la conversación hacia opciones relevantes.",
      priority: 102,
    });
  }

  if (classification === "Alto" || (score != null && score >= 80)) {
    addQuestion(questions, {
      id: "high_score_next_step",
      category: "Cierre de avance",
      question: "Dado que tu evaluación se ve favorable, ¿qué tendría que pasar para que agendemos una visita o revisión de proyecto?",
      reason: "Un lead con alta preparación requiere confirmar intención y siguiente acción, no solo validar números.",
      priority: 106,
    });
  }

  if (classification === "Medio" || (score != null && score >= 50 && score < 80)) {
    addQuestion(questions, {
      id: "medium_score_blocker",
      category: "Desbloqueo",
      question: "¿Qué aspecto sientes que hoy te frena más: pie, dividendo, documentación, plazo o elección del proyecto?",
      reason: "Permite distinguir una barrera financiera real de una objeción contextual o de decisión.",
      priority: 101,
    });
  }

  if (classification === "Bajo" || (score != null && score < 50)) {
    addQuestion(questions, {
      id: "low_score_timeline",
      category: "Plan de preparación",
      question: "¿Estás buscando comprar ahora o prefieres construir un plan para mejorar tu preparación en los próximos meses?",
      reason: "Ayuda a definir si corresponde vender una alternativa inmediata o acompañar preparación futura.",
      priority: 103,
    });
  }

  if (selectedProject) {
    const projectCommune = selectedProject.comuna;
    const projectCommuneDeclared = communes.some((commune) => normalized(commune) === normalized(projectCommune));
    const isCompatible = selectedMatch?.clasificacion === "Compatible" && !selectedMatch?.motivo_exclusion;

    if (projectCommune && !projectCommuneDeclared) {
      addQuestion(questions, {
        id: "selected_project_commune_openness",
        category: "Flexibilidad territorial",
        question: `Este proyecto está en ${projectCommune}. ¿Qué tan dispuesto estarías a evaluar una comuna fuera de tus opciones declaradas?`,
        reason: isCompatible
          ? "Aunque el proyecto calza financieramente, la comuna no aparece entre las preferencias registradas del lead."
          : "La comuna puede ser una objeción relevante antes de profundizar en números o beneficios.",
        priority: isCompatible ? 109 : 99,
      });
    }

    if (isCompatible) {
      addQuestion(questions, {
        id: "compatible_project_decision_trigger",
        category: "Proyecto compatible",
        question: `Para ${selectedProject.nombre}, ¿qué información necesitarías para decidir si vale la pena avanzar: ubicación, entrega, precio, financiamiento o características del proyecto?`,
        reason: "Cuando ya hay compatibilidad, la conversación debe descubrir criterios de decisión no financieros.",
        priority: 105,
      });
    }

    if (selectedMatch?.bloqueador_principal?.brecha_recurso_tipo === "ahorro") {
      addQuestion(questions, {
        id: "project_down_payment_gap",
        category: "Pie del proyecto",
        question: `Para acercarte a ${selectedProject.nombre}, ¿podrías complementar el pie con ahorro adicional, apoyo familiar u otra fuente?`,
        reason: "La brecha de pie requiere validar recursos disponibles que no siempre quedan reflejados en la evaluación.",
        priority: 100,
      });
    }

    if (selectedMatch?.bloqueador_principal?.brecha_recurso_tipo === "ingreso") {
      addQuestion(questions, {
        id: "project_income_gap",
        category: "Ingreso del proyecto",
        question: `Para evaluar ${selectedProject.nombre}, ¿existe opción de complementar renta con otra persona o ingresos adicionales?`,
        reason: "La brecha de ingreso puede cambiar si existe codeudor, complemento de renta o ingresos no registrados.",
        priority: 100,
      });
    }
  }

  if (input.tiene_propiedad_vista === false || input.tiene_propiedad_vista === "false" || !hasValue(input.tiene_propiedad_vista)) {
    addQuestion(questions, {
      id: "property_search_stage",
      category: "Búsqueda",
      question: "¿Ya has visitado proyectos o estás recién explorando alternativas?",
      reason: "Distingue si corresponde educar, comparar alternativas o avanzar hacia una visita concreta.",
      priority: selectedProject ? 89 : 97,
    });
  }

  if (input.plazo_compra === "0_3_meses" || input.plazo_compra === "3_6_meses") {
    addQuestion(questions, {
      id: "short_term_readiness",
      category: "Próximo paso",
      question: "¿Qué tan avanzado estás con banco, documentación o preaprobación?",
      reason: "El plazo declarado es corto y puede requerir ordenar antecedentes antes de derivar o agendar visita.",
      priority: 108,
    });
  }

  const ahorro = toNumber(input.ahorro_disponible);
  const ingreso = toNumber(input.ingreso_mensual);
  if (ahorro != null && ingreso != null && ingreso > 0 && ahorro >= ingreso * 6) {
    addQuestion(questions, {
      id: "savings_availability",
      category: "Ahorro disponible",
      question: "¿Ese ahorro está completamente disponible para el pie o hay otros usos comprometidos?",
      reason: "El monto de ahorro puede verse alto, pero su disponibilidad real no se puede inferir desde el dato financiero.",
      priority: selectedProject ? 96 : 91,
    });
  }

  const deuda = toNumber(input.deuda_mensual);
  if (deuda != null && deuda > 0) {
    addQuestion(questions, {
      id: "debt_context",
      category: "Deuda",
      question: "¿Esa deuda mensual es temporal, renegociable o permanente?",
      reason: "Puede cambiar la lectura comercial de capacidad futura y timing de compra.",
      priority: 93,
    });
  }

  if (onboarding.comuna_alternativa) {
    addQuestion(questions, {
      id: "commune_flexibility",
      category: "Flexibilidad",
      question: "¿Qué tan flexible eres entre tu comuna principal y la alternativa?",
      reason: "Ayuda a decidir si conviene presentar opciones cercanas o mantener el foco en una zona específica.",
      priority: selectedProject ? 87 : 95,
    });
  }

  if (selectedProject && !projectGoalMatchesSelected(input.project_goal, selectedProject)) {
    addQuestion(questions, {
      id: "selected_project_openness",
      category: "Proyecto seleccionado",
      question: `¿Estarías dispuesto a evaluar ${selectedProject.nombre} si mejora tu compatibilidad financiera o calza con tus prioridades?`,
      reason: "El proyecto revisado por el ejecutivo no coincide necesariamente con la meta declarada por el lead.",
      priority: 94,
    });
  }

  if (selectedMatch?.motivo_exclusion === "capacidad_requiere_antecedentes" || indicators.capacidad_status === "requires_info") {
    addQuestion(questions, {
      id: "missing_income_context",
      category: "Antecedentes",
      question: "¿Tienes ingresos adicionales, variables o complementarios que no hayan quedado registrados?",
      reason: "Faltan antecedentes para estimar capacidad y esta información puede desbloquear una evaluación más útil.",
      priority: 110,
    });
  }

  if (input.tipo_contrato && input.tipo_contrato !== "indefinido") {
    addQuestion(questions, {
      id: "work_stability",
      category: "Situación laboral",
      question: "¿Hay algún cambio laboral esperado que pueda mejorar o afectar tu evaluación en los próximos meses?",
      reason: "La estabilidad o evolución laboral puede influir en timing, documentación y estrategia de seguimiento.",
      priority: 92,
    });
  }

  return questions
    .sort((a, b) => b.priority - a.priority)
    .map(({ priority, ...question }) => question);
}
