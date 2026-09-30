// ALG-14 - Deteccion de oportunidades de contacto.
// Normativa: docs/algorithms/ALG-14-contact-opportunities.md.
import { matchLeadToProjects } from "./leadProjectMatching";
import { rankLeadsForProject } from "./leadRanking";

const DEFAULT_TOP_LIMIT = 10;

function leadKey(lead) {
  return lead?.user_id || lead?.email || lead?.id || null;
}

function scoreOf(lead) {
  const value = Number(lead?.result?.adjusted_score ?? lead?.result?.score);
  return Number.isFinite(value) ? value : null;
}

function dateValue(lead) {
  const value = new Date(lead?.created_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function latestAndPreviousByLead(evaluations = []) {
  const grouped = new Map();
  for (const evaluation of evaluations) {
    const key = leadKey(evaluation);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(evaluation);
  }

  return [...grouped.entries()].map(([key, items]) => {
    const ordered = [...items].sort((a, b) => dateValue(b) - dateValue(a));
    return { key, latest: ordered[0], previous: ordered[1] || null };
  });
}

function matchForProject(lead, project) {
  if (!lead || !project) return null;
  const { matches, excluidos } = matchLeadToProjects(lead, [project]);
  return matches[0] || excluidos[0] || null;
}

function rankedPositions(leads, project, sortBy) {
  const { ranked } = rankLeadsForProject(leads, project, sortBy);
  return new Map(ranked.map((item, index) => [leadKey(item.lead), { position: index + 1, match: item.match }]));
}

function projectOpportunities({ latest, previous, project, latestPosition, previousPosition, topLimit }) {
  const latestMatch = matchForProject(latest, project);
  const previousMatch = matchForProject(previous, project);
  if (!latestMatch || latestMatch.motivo_exclusion) return [];

  const latestCompatible = latestMatch.clasificacion === "Compatible";
  const previousCompatible = previousMatch?.clasificacion === "Compatible" && !previousMatch?.motivo_exclusion;
  const latestReachesPrice = latestMatch.evidencia?.alcanza_precio_min === true;
  const previousReachesPrice = previousMatch?.evidencia?.alcanza_precio_min === true;
  const enteredTop = latestPosition && latestPosition <= topLimit && (!previousPosition || previousPosition > topLimit);

  const triggers = [];

  if (latestReachesPrice && !previousReachesPrice) {
    triggers.push({
      type: "capacity",
      label: "Capacidad de compra",
      detail: `Ahora alcanza el precio mínimo de ${project.nombre}.`,
      project,
      match: latestMatch,
      previousMatch,
      rank: latestPosition || null,
    });
  }

  if (latestCompatible && !previousCompatible) {
    triggers.push({
      type: "compatibility",
      label: "Compatible con proyecto",
      detail: `Pasó a estado Compatible con ${project.nombre}.`,
      project,
      match: latestMatch,
      previousMatch,
      rank: latestPosition || null,
    });
  }

  if (enteredTop) {
    triggers.push({
      type: "affinity_top",
      label: "Afinidad destacada",
      detail: `Entró al top ${topLimit} de compatibilidad para ${project.nombre}.`,
      project,
      match: latestMatch,
      previousMatch,
      rank: latestPosition,
    });
  }

  return triggers;
}

function scoreOpportunity(latest, previous) {
  const latestScore = scoreOf(latest);
  const previousScore = scoreOf(previous);
  const latestClassification = latest?.result?.classification;
  const previousClassification = previous?.result?.classification;

  if (latestClassification === "Alto" && previousClassification !== "Alto") {
    return {
      type: "score_high",
      label: "Prioridad general Alta",
      detail: previousScore == null || latestScore == null
        ? "El lead pasó a prioridad general Alta."
        : `El score subió de ${previousScore} a ${latestScore} y pasó a prioridad Alta.`,
      project: null,
      match: null,
      previousMatch: null,
      rank: null,
    };
  }

  return null;
}

export function detectContactOpportunities(evaluations = [], projects = [], options = {}) {
  const topLimit = options.topLimit || DEFAULT_TOP_LIMIT;
  const pairs = latestAndPreviousByLead(evaluations).filter((item) => item.latest && item.previous);
  const latestLeads = pairs.map((item) => item.latest);
  const previousLeads = pairs.map((item) => item.previous);
  const positionsByProject = new Map();

  for (const project of projects || []) {
    positionsByProject.set(project.id, {
      affinityLatest: rankedPositions(latestLeads, project, "afinidad"),
      affinityPrevious: rankedPositions(previousLeads, project, "afinidad"),
      capacityLatest: rankedPositions(latestLeads, project, "capacidad"),
      capacityPrevious: rankedPositions(previousLeads, project, "capacidad"),
    });
  }

  const opportunities = [];
  for (const pair of pairs) {
    const triggers = [];
    const scoreTrigger = scoreOpportunity(pair.latest, pair.previous);
    if (scoreTrigger) triggers.push(scoreTrigger);

    for (const project of projects || []) {
      const positions = positionsByProject.get(project.id);
      const latestAffinityPosition = positions?.affinityLatest.get(pair.key)?.position || null;
      const previousAffinityPosition = positions?.affinityPrevious.get(pair.key)?.position || null;
      const latestCapacityPosition = positions?.capacityLatest.get(pair.key)?.position || null;
      const previousCapacityPosition = positions?.capacityPrevious.get(pair.key)?.position || null;
      const bestLatestPosition = [latestAffinityPosition, latestCapacityPosition].filter(Boolean).sort((a, b) => a - b)[0] || null;
      const bestPreviousPosition = [previousAffinityPosition, previousCapacityPosition].filter(Boolean).sort((a, b) => a - b)[0] || null;

      const projectTriggers = projectOpportunities({
        latest: pair.latest,
        previous: pair.previous,
        project,
        latestPosition: bestLatestPosition && bestLatestPosition <= topLimit ? bestLatestPosition : latestAffinityPosition,
        previousPosition: bestPreviousPosition,
        topLimit,
      });
      triggers.push(...projectTriggers);
    }

    if (!triggers.length) continue;

    const latestScore = scoreOf(pair.latest);
    const previousScore = scoreOf(pair.previous);
    const primary = triggers.find((item) => item.type === "score_high") || triggers[0];

    opportunities.push({
      id: `${pair.key}-${pair.latest.id}`,
      lead: pair.latest,
      previous: pair.previous,
      primary,
      triggers,
      score_delta: latestScore != null && previousScore != null ? Math.round((latestScore - previousScore) * 10) / 10 : null,
      latest_score: latestScore,
      previous_score: previousScore,
      created_at: pair.latest.created_at,
    });
  }

  return opportunities.sort((a, b) => {
    const rankA = a.primary.rank || 99;
    const rankB = b.primary.rank || 99;
    if (rankA !== rankB) return rankA - rankB;
    if ((b.score_delta || 0) !== (a.score_delta || 0)) return (b.score_delta || 0) - (a.score_delta || 0);
    return dateValue(b.lead) - dateValue(a.lead);
  });
}
