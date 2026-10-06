const chartSources = Object.freeze({
  score: "score",
  income: "ingreso_mensual",
  debt: "deuda_mensual",
  savings: "ahorro_disponible",
});

const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);

function delta(current, previous) {
  return finiteNumber(current) && finiteNumber(previous) ? current - previous : null;
}

function capacityOf(evaluation) {
  const value = evaluation?.financial_indicators?.capacidad_compra_estimada_uf;
  return finiteNumber(value) ? value : null;
}

function frozenProjectId(project) {
  const id = project?.id;
  return typeof id === "string" && id.trim() ? id : null;
}

function historicalCompatibility(evaluation, snapshot, frozenTarget) {
  const targetId = frozenProjectId(frozenTarget);
  const snapshotId = frozenProjectId(snapshot?.project_goal);
  const classification = evaluation?.project_fit?.classification;
  return targetId && snapshotId === targetId && typeof classification === "string" && classification.trim()
    ? classification
    : null;
}

// The active line has already resolved corrections. This intentionally reads only
// each row's recorded evaluation and snapshot, never the current evaluation.
export function evolutionSeries(activeLine, frozenTarget = null) {
  const rows = Array.isArray(activeLine) ? activeLine : [];
  const result = [];

  for (const row of rows) {
    const snapshot = row?.snapshot || {};
    const evaluation = row?.evaluation || {};
    const point = {
      id: row?.event_id,
      at: row?.effective_at,
      score: finiteNumber(evaluation.score) ? evaluation.score : null,
      classification: evaluation.classification || null,
      capacity: capacityOf(evaluation),
      compatibility: historicalCompatibility(evaluation, snapshot, frozenTarget),
      income: finiteNumber(snapshot.ingreso_mensual) ? snapshot.ingreso_mensual : null,
      debt: finiteNumber(snapshot.deuda_mensual) ? snapshot.deuda_mensual : null,
      savings: finiteNumber(snapshot.ahorro_disponible) ? snapshot.ahorro_disponible : null,
    };
    const previous = result.at(-1);
    point.deltas = {
      score: delta(point.score, previous?.score),
      capacity: delta(point.capacity, previous?.capacity),
      income: delta(point.income, previous?.income),
      debt: delta(point.debt, previous?.debt),
      savings: delta(point.savings, previous?.savings),
    };
    point.classificationChange = previous?.classification && point.classification
      && previous.classification !== point.classification
      ? { from: previous.classification, to: point.classification }
      : null;
    point.compatibilityChange = previous?.compatibility && point.compatibility
      && previous.compatibility !== point.compatibility
      ? { from: previous.compatibility, to: point.compatibility }
      : null;
    result.push(point);
  }

  return result;
}

export function sourceForChartField(field) {
  return chartSources[field] || null;
}

function validDate(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

// This is a visual reference to the frozen plan, not a financial projection.
// Multiple goals for the same source would be ambiguous, so no line is shown.
export function expectedProgressLine(goals, source, baselineAt) {
  const baseline = validDate(baselineAt);
  if (!source || !baseline) return [];
  const candidates = (Array.isArray(goals) ? goals : []).filter((goal) => {
    const definition = goal?.definition || goal;
    return definition?.source === source
      && finiteNumber(definition.initial_value)
      && finiteNumber(definition.target_value)
      && validDate(definition.target_at)?.getTime() > baseline.getTime();
  });
  if (candidates.length !== 1) return [];

  const definition = candidates[0].definition || candidates[0];
  return [
    { at: baseline.toISOString(), value: definition.initial_value },
    { at: new Date(definition.target_at).toISOString(), value: definition.target_value },
  ];
}

export function expectedProgressAt(line, at) {
  if (!Array.isArray(line) || line.length !== 2 || !finiteNumber(line[0]?.value) || !finiteNumber(line[1]?.value)) {
    return null;
  }
  const start = validDate(line[0].at), end = validDate(line[1].at), target = validDate(at);
  if (!start || !end || !target || end <= start || target < start || target > end) return null;
  const ratio = (target - start) / (end - start);
  return line[0].value + (line[1].value - line[0].value) * ratio;
}
