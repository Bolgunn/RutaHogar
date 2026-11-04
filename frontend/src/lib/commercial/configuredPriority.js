// ALG-19 R0–R8 for the HU 15 aggregate, which runs in the commercial-funnel-metrics Edge Function.
// Mirror of backend/app/scoring_engine/commercial_priority.py and commercial_criteria.py: both are
// checked against docs/algorithms/ALG-19-cases.json, so a rule change must update both or a test breaks.
import { PRIORITY_ACTIONS } from "./priorityActions.js";

export const COMMERCIAL_PRIORITY_ALG_VERSION = "hu21-commercial-priority-v1";

const DEFAULTS_BY_ALG_VERSION = {
  [COMMERCIAL_PRIORITY_ALG_VERSION]: {
    contactar_ahora: { clasificaciones: ["Alto"], compatibilidades: ["Compatible"] },
    contactar_con_revision: { clasificaciones: ["Medio"], compatibilidades: ["Cercano", "Compatible"] },
    senales: { plazos: ["3_a_6_meses", "inmediato"], propiedad_vista: true },
    subir_con_senales: 0,
    umbral_reorientar: 70,
    proyectos_prioritarios: [],
    orden_desempate: "afinidad",
  },
};

const GROUPS = ["contactar_ahora", "contactar_con_revision", "senales"];
const PURCHASE_TERM_ALIASES = { "0_3_meses": "inmediato", "3_6_meses": "3_a_6_meses", "6_12_meses": "6_a_12_meses" };

export function normalizeCriterios(raw, algVersion = COMMERCIAL_PRIORITY_ALG_VERSION) {
  const merged = structuredClone(DEFAULTS_BY_ALG_VERSION[algVersion] ?? DEFAULTS_BY_ALG_VERSION[COMMERCIAL_PRIORITY_ALG_VERSION]);
  for (const [key, value] of Object.entries(raw || {})) {
    merged[key] = GROUPS.includes(key) && value && typeof value === "object" && !Array.isArray(value)
      ? { ...merged[key], ...structuredClone(value) }
      : structuredClone(value);
  }
  for (const group of ["contactar_ahora", "contactar_con_revision"]) {
    merged[group].clasificaciones = [...new Set(merged[group].clasificaciones)].sort();
    merged[group].compatibilidades = [...new Set(merged[group].compatibilidades)].sort();
  }
  merged.senales.plazos = [...new Set(merged.senales.plazos)].sort();
  merged.proyectos_prioritarios = [...new Set(merged.proyectos_prioritarios)].sort();
  return merged;
}

function priority(actionKey, reason, sendToCrm, { promoted = false, fixedRule = false } = {}) {
  const action = PRIORITY_ACTIONS[actionKey];
  return { level: action, action, reason, send_to_crm: sendToCrm, action_key: actionKey,
    promoted, fixed_rule: fixedRule, alg_version: COMMERCIAL_PRIORITY_ALG_VERSION };
}

function signalCount(data, senales) {
  const plazo = data.plazo_compra;
  const senalPlazo = senales.plazos.includes(PURCHASE_TERM_ALIASES[plazo] ?? plazo);
  const senalPropiedad = senales.propiedad_vista && data.tiene_propiedad_vista === true;
  return Number(senalPlazo) + Number(senalPropiedad);
}

export function explainCommercialPriority(classification, projectFit, blockers, score, data = null, criterios = null) {
  const rules = normalizeCriterios(criterios);
  const fit = projectFit || {};
  const codes = new Set((blockers || []).filter((blocker) => blocker && typeof blocker === "object").map((blocker) => blocker.code));
  const nSenales = signalCount(data || {}, rules.senales);

  if (codes.has("complemento_incompleto")) {
    return priority("request_info", "Faltan antecedentes del complemento de renta antes de priorizar comercialmente.", false, { fixedRule: true });
  }
  if (codes.has("morosidad_vigente") || codes.has("carga_total_alta")) {
    return priority("do_not_route", "El lead presenta bloqueadores financieros críticos y no debe derivarse todavía.", false, { fixedRule: true });
  }
  if (fit.status === "requires_info" || fit.classification === "Requiere antecedentes") {
    return priority("request_info", "Faltan antecedentes para evaluar la compatibilidad con el objetivo inmobiliario.", false, { fixedRule: true });
  }
  const ahora = rules.contactar_ahora;
  if (ahora.clasificaciones.includes(classification) && ahora.compatibilidades.includes(fit.classification)) {
    return nSenales === 2
      ? priority("contact_now", "Lead con alta preparación financiera, objetivo compatible, compra pronta y propiedad o proyecto visto.", true)
      : priority("contact_now", "Lead con alta preparación financiera y compatible con el objetivo inmobiliario.", true);
  }
  const revision = rules.contactar_con_revision;
  if (revision.clasificaciones.includes(classification) && revision.compatibilidades.includes(fit.classification)) {
    // R5b promotes one level, only from contact_with_review (A3).
    if (rules.subir_con_senales > 0 && nSenales >= rules.subir_con_senales) {
      return priority("contact_now", "Lead con potencial comercial y señales de intención de compra; tu inmobiliaria prioriza contactarlo ahora.", true, { promoted: true });
    }
    return nSenales >= 1
      ? priority("contact_with_review", "Lead con potencial comercial y señales de intención de compra; requiere revisión antes de avanzar.", true)
      : priority("contact_with_review", "Lead con potencial comercial, pero requiere revisión antes de avanzar.", true);
  }
  if (score != null && score >= rules.umbral_reorientar && fit.classification === "Fuera de alcance") {
    return priority("reorient", "Lead financieramente interesante, pero el objetivo inmobiliario declarado está fuera de alcance.", false);
  }
  if (classification === "Bajo") {
    return priority("nurture", "Lead con baja preparación financiera actual; conviene nutrirlo con un plan de mejora.", false);
  }
  return priority("request_info", "Se requieren más antecedentes antes de definir una prioridad comercial.", false);
}

// evaluacion_actual of a funnel fact: { input, onboarding, result }. Purchase signals fall back to
// the onboarding answers, as normalizeEvaluation does for evaluations saved before the snapshot.
export function configuredPriorityForFact(evaluacion, config) {
  const result = evaluacion?.result || {};
  const input = evaluacion?.input || {};
  const onboarding = evaluacion?.onboarding || {};
  const data = {
    plazo_compra: input.plazo_compra ?? onboarding.plazo_compra,
    tiene_propiedad_vista: input.tiene_propiedad_vista ?? onboarding.tiene_propiedad_vista,
  };
  const configured = explainCommercialPriority(result.classification, result.project_fit, result.blockers,
    result.adjusted_score ?? result.score, data, normalizeCriterios(config.criterios, config.alg_version));
  return { ...configured, config_version: config.version };
}

// Without a saved configuration the defaults reproduce the engine (ALG-19 invariant 1), so the stored
// priority is kept. Hidden or empty snapshots stay without priority, exactly as before.
export function withConfiguredPriority(facts, config) {
  if (!config) return facts;
  return facts.map((fact) => {
    const evaluacion = fact.evaluacion_actual;
    if (!evaluacion?.result?.classification || evaluacion.co_debtor_visibility === "hidden") return fact;
    return { ...fact, evaluacion_actual: { ...evaluacion, commercial_priority_configured: configuredPriorityForFact(evaluacion, config) } };
  });
}
