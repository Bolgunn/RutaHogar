// Orden del panel del ejecutivo. HU 10 agrupa filas que ALG-10 ya puntuó; HU 21 (ALG-19 R9) las
// ordena por niveles: acción comercial, proyecto prioritario compatible, desempate elegido,
// recencia e id. Vive en lib/ para poder pinearse en vitest sin montar el componente.

import { priorityKeyFromDetail, resolvedPriorityDetail } from "../commercial/priorityActions";
import { matchLeadToProjects } from "./leadProjectMatching";

export const SIN_PROYECTO = null;

// A6 — espejo de COMMERCIAL_ACTION_TIERS en backend/app/scoring_engine/constants.py.
export const ACTION_TIERS = {
  contact_now: 0,
  contact_with_review: 1,
  reorient: 2,
  request_info: 3,
  nurture: 4,
  do_not_route: 5,
  sin_prioridad: 6,
};

const capacidadDe = (fila) => fila.match?.evidencia?.capacidad_uf ?? -1;
const orNegative = (value) => (typeof value === "number" ? value : -1);
const instant = (value) => {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? -Infinity : ms;
};

export function actionKeyOf(lead) {
  return priorityKeyFromDetail(resolvedPriorityDetail(lead)).key;
}

// R9 sobre filas ya resueltas: { id, action_key, prioritario_compatible, afinidad, capacidad_uf, created_at }.
export function compareCommercialPriority(sortBy = "afinidad") {
  const desempate = sortBy === "capacidad" ? "capacidad_uf" : "afinidad";
  return (a, b) => {
    const tier = (ACTION_TIERS[a.action_key] ?? ACTION_TIERS.sin_prioridad) - (ACTION_TIERS[b.action_key] ?? ACTION_TIERS.sin_prioridad);
    if (tier !== 0) return tier;
    if (a.prioritario_compatible !== b.prioritario_compatible) return a.prioritario_compatible ? -1 : 1;
    const tie = orNegative(b[desempate]) - orNegative(a[desempate]);
    if (tie !== 0) return tie;
    const recency = instant(b.created_at) - instant(a.created_at);
    if (recency !== 0) return recency;
    return String(a.id).localeCompare(String(b.id));
  };
}

// Sin proyecto: mejor afinidad ALG-10 contra los proyectos no agotados visibles para el usuario,
// y si el lead es Compatible con alguno de los proyectos prioritarios del tenant.
export function annotateCommercialPriority(leads, proyectos, commercialConfig) {
  const catalogo = (proyectos || []).filter((proyecto) => proyecto.estado !== "agotado");
  const prioritarios = new Set((commercialConfig?.proyectos_prioritarios || []).map(String));
  return (leads || []).map((lead) => {
    const { matches } = catalogo.length ? matchLeadToProjects(lead, catalogo) : { matches: [] };
    const capacidad = lead.result?.financial_indicators?.capacidad_compra_estimada_uf;
    return {
      id: lead.id,
      created_at: lead.created_at,
      action_key: actionKeyOf(lead),
      prioritario_compatible: matches.some(
        (match) => match.clasificacion === "Compatible" && prioritarios.has(String(match.proyecto_id)),
      ),
      afinidad: matches[0]?.afinidad ?? null,
      capacidad_uf: typeof capacidad === "number" ? capacidad : null,
    };
  });
}

function rowForProject(lead, match, proyecto, prioritarios) {
  return {
    id: lead.id,
    created_at: lead.created_at,
    action_key: actionKeyOf(lead),
    prioritario_compatible: prioritarios.has(String(proyecto.id)) && match.clasificacion === "Compatible",
    afinidad: match.afinidad,
    capacidad_uf: match.evidencia?.capacidad_uf ?? null,
  };
}

// Sin proyecto, R9 reemplaza el orden pineado de HU 2 ("mismas filas, mismo orden"): ver ALG-19.
export function rankLeadsForProject(leads, proyecto, sortBy = "afinidad", { proyectos = [], commercialConfig = null } = {}) {
  const filas = leads || [];
  const compare = compareCommercialPriority(sortBy);
  if (!proyecto) {
    const prioridades = annotateCommercialPriority(filas, proyectos, commercialConfig);
    const ranked = filas
      .map((lead, index) => ({ lead, match: null, prioridad: prioridades[index] }))
      .sort((a, b) => compare(a.prioridad, b.prioridad));
    return { ranked, descartados: [], requiereAntecedentes: [] };
  }

  const prioritarios = new Set((commercialConfig?.proyectos_prioritarios || []).map(String));
  const ranked = [];
  const descartados = [];
  const requiereAntecedentes = [];

  for (const lead of filas) {
    const { matches, excluidos } = matchLeadToProjects(lead, [proyecto]);
    const match = matches[0] || excluidos[0] || null;
    if (!match) continue;
    if (match.motivo_exclusion === "capacidad_requiere_antecedentes") {
      requiereAntecedentes.push({ lead, match });
    } else if (match.motivo_exclusion) {
      descartados.push({ lead, match });
    } else {
      ranked.push({ lead, match, prioridad: rowForProject(lead, match, proyecto, prioritarios) });
    }
  }

  ranked.sort((a, b) => compare(a.prioridad, b.prioridad));
  descartados.sort((a, b) => {
    if (capacidadDe(b) !== capacidadDe(a)) return capacidadDe(b) - capacidadDe(a);
    return String(a.lead.id).localeCompare(String(b.lead.id));
  });

  return { ranked, descartados, requiereAntecedentes };
}
