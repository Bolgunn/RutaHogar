// ALG-16 - Comparacion de leads para un proyecto.
// Normativa: docs/algorithms/ALG-16-lead-project-comparison.md.
import { matchLeadToProjects } from "./leadProjectMatching";

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreOf(lead) {
  return numberOrNull(lead?.result?.adjusted_score ?? lead?.result?.score);
}

function itemText(item) {
  if (!item) return "";
  if (typeof item === "string") return item;
  return item.title || item.description || item.code || item.label || "";
}

function projectMatchForLead(lead, project) {
  if (!lead || !project) return null;
  const { matches, excluidos } = matchLeadToProjects(lead, [project]);
  return matches[0] || excluidos[0] || null;
}

function typeMatches(lead, project) {
  const expected = lead?.onboarding?.tipo_propiedad;
  if (!expected || !project?.tipo) return null;
  return expected === project.tipo;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function declaredCommunes(lead) {
  const input = lead?.input || {};
  const onboarding = lead?.onboarding || {};
  const context = lead?.context || input.context || input.simulation_context || {};
  const preferences = lead?.preferences || input.preferences || input.preferencias || context.preferences || {};
  return [
    preferences.comuna_interes,
    preferences.comuna_objetivo,
    preferences.comuna_preferida,
    preferences.comuna_alternativa,
    context.comuna_interes,
    context.comuna_objetivo,
    context.comuna_preferida,
    context.comuna_alternativa,
    input.comuna_objetivo,
    input.comuna_interes,
    input.comuna,
    input.project_goal?.comuna,
    onboarding.comuna_interes,
    onboarding.comuna_objetivo,
    onboarding.comuna_alternativa,
  ].filter(Boolean);
}

function communeDeclared(lead, project, match = null) {
  const projectCommune = project?.comuna || match?.comuna;
  if (!projectCommune) return null;
  const declared = declaredCommunes(lead);
  if (!declared.length) return null;
  return declared.some((commune) => normalize(commune) === normalize(projectCommune));
}

function buildFactors(lead, match, project) {
  const result = lead?.result || {};
  const positive = [];
  const difficult = [];
  const score = scoreOf(lead);
  const declaredCommune = communeDeclared(lead, project, match);
  const sameType = typeMatches(lead, project);

  if (score != null && score >= 80) positive.push("Score alto para priorizar contacto.");
  if (score != null && score < 50) difficult.push("Score bajo: requiere preparar mejor el abordaje.");
  if (match?.evidencia?.alcanza_precio_min) positive.push("Alcanza el precio mínimo del proyecto.");
  if (match?.evidencia?.desbloqueable_con_fogaes) positive.push("Podría desbloquearse con FOGAES.");
  if (declaredCommune === true) positive.push("La comuna del proyecto está dentro de sus opciones.");
  if (declaredCommune === false) difficult.push("La comuna del proyecto no está dentro de sus opciones declaradas.");
  if (sameType === true) positive.push("El tipo de vivienda coincide con su preferencia.");
  if (sameType === false) difficult.push("El tipo de vivienda no coincide con su preferencia declarada.");
  if (match?.bloqueador_principal?.titulo) difficult.push(match.bloqueador_principal.titulo);
  if (match?.motivo_exclusion === "capacidad_requiere_antecedentes") difficult.push("Faltan antecedentes para calcular capacidad.");
  if (match?.motivo_exclusion === "capacidad_insuficiente") difficult.push("Capacidad insuficiente para el precio del proyecto.");

  for (const item of result.positive_indicators || []) {
    const text = itemText(item);
    if (text) positive.push(text);
  }

  for (const item of result.risks || []) {
    const text = itemText(item);
    if (text) difficult.push(text);
  }

  return {
    positive: [...new Set(positive)].slice(0, 4),
    difficult: [...new Set(difficult)].slice(0, 4),
  };
}

export function buildLeadProjectComparison(leads = [], project = null) {
  if (!project) return [];

  return leads.filter(Boolean).slice(0, 2).map((lead) => {
    const match = projectMatchForLead(lead, project);
    const factors = buildFactors(lead, match, project);
    return {
      lead,
      match,
      name: lead.full_name || lead.email || "Lead sin nombre",
      score: scoreOf(lead),
      classification: lead.result?.classification || "Sin clasificación",
      capacity: {
        valueUf: numberOrNull(match?.evidencia?.capacidad_uf),
        reachesMin: match?.evidencia?.alcanza_precio_min === true,
        blocker: match?.bloqueador_principal?.titulo || null,
        exclusion: match?.motivo_exclusion || null,
      },
      affinity: {
        value: numberOrNull(match?.afinidad),
        classification: match?.clasificacion || null,
        communeDeclared: communeDeclared(lead, project, match),
        typeMatches: typeMatches(lead, project),
      },
      factors,
    };
  });
}
