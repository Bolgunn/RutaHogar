import { matchLeadToProjects } from "../matching/leadProjectMatching";

// ALG-19 — métricas de interés por proyecto (HU 26). Especificación:
// docs/algorithms/ALG-19-project-interest-metrics.md; casos en ALG-19-cases.json.
// La compatibilidad y los motivos son de ALG-10: aquí solo se cuentan.

export const ALG19_VERSION = "hu26-project-interest-v1";

const CAPACITY_CODES = new Set(["pie_insuficiente_para_proyecto", "renta_insuficiente_para_proyecto"]);

function isInterested(entry) {
  return entry.visualizaciones > 0 || entry.favorito === true || entry.simulaciones > 0;
}

// R4 M1–M4.
function motivoOf(row) {
  const codigo = row.bloqueador_principal?.codigo ?? null;
  if (row.motivo_exclusion === "bloqueador_critico") return codigo ?? "bloqueador_critico";
  return CAPACITY_CODES.has(codigo) ? codigo : "capacidad_insuficiente";
}

// R3 C2–C4.
function verdictOf(row, excluded) {
  if (!excluded) return { bucket: "compatibles" };
  if (row.motivo_exclusion === "capacidad_requiere_antecedentes") return { bucket: "sin_datos" };
  return { bucket: "incompatibles", motivo: motivoOf(row) };
}

function emptyRow(proyectoId) {
  return {
    proyecto_id: proyectoId,
    interesados: 0,
    visualizaciones: 0,
    favoritos: 0,
    simulaciones: 0,
    compatibles: 0,
    incompatibles: 0,
    sin_datos: 0,
    motivos: new Map(),
  };
}

function byTraction(order) {
  return (a, b) =>
    b.interesados - a.interesados ||
    b.favoritos - a.favoritos ||
    b.simulaciones - a.simulaciones ||
    b.visualizaciones - a.visualizaciones ||
    order.get(a.proyecto_id) - order.get(b.proyecto_id);
}

function finishRow(row, index) {
  const evaluables = row.compatibles + row.incompatibles;
  const motivos = [...row.motivos.entries()]
    .map(([motivo, n]) => ({ motivo, n, proporcion: n / row.incompatibles }))
    .sort((a, b) => b.n - a.n || (a.motivo < b.motivo ? -1 : a.motivo > b.motivo ? 1 : 0));
  return {
    proyecto_id: row.proyecto_id,
    posicion: index + 1,
    interesados: row.interesados,
    visualizaciones: row.visualizaciones,
    favoritos: row.favoritos,
    simulaciones: row.simulaciones,
    compatibilidad: {
      compatibles: row.compatibles,
      incompatibles: row.incompatibles,
      sin_datos: row.sin_datos,
      evaluables,
      tasa_incompatibles: evaluables > 0 ? row.incompatibles / evaluables : null,
    },
    motivos,
  };
}

export function computeProjectInterestMetrics({ proyectos, leads }, { match = matchLeadToProjects } = {}) {
  const order = new Map(proyectos.map((proyecto, index) => [proyecto.id, index]));
  const rows = new Map(proyectos.map((proyecto) => [proyecto.id, emptyRow(proyecto.id)]));
  let nLeads = 0;

  for (const lead of leads) {
    const entries = lead.interacciones.filter((entry) => rows.has(entry.proyecto_id) && isInterested(entry));
    if (!entries.length) continue;
    nLeads += 1;

    for (const entry of entries) {
      const row = rows.get(entry.proyecto_id);
      row.interesados += 1;
      row.visualizaciones += entry.visualizaciones;
      row.simulaciones += entry.simulaciones;
      if (entry.favorito) row.favoritos += 1;
    }

    if (!lead.evaluacion_actual) {
      for (const entry of entries) rows.get(entry.proyecto_id).sin_datos += 1;
      continue;
    }

    const ids = new Set(entries.map((entry) => entry.proyecto_id));
    const { matches, excluidos } = match(lead.evaluacion_actual, proyectos.filter((proyecto) => ids.has(proyecto.id)));
    const verdicts = [
      ...matches.map((matchRow) => [matchRow, false]),
      ...excluidos.map((excludedRow) => [excludedRow, true]),
    ];
    for (const [pair, excluded] of verdicts) {
      const row = rows.get(pair.proyecto_id);
      const { bucket, motivo } = verdictOf(pair, excluded);
      row[bucket] += 1;
      if (motivo) row.motivos.set(motivo, (row.motivos.get(motivo) || 0) + 1);
    }
  }

  const ranking = [...rows.values()].sort(byTraction(order)).map(finishRow);
  const sum = (key) => ranking.reduce((total, row) => total + row[key], 0);

  return {
    version: ALG19_VERSION,
    n_leads: nLeads,
    totales: { visualizaciones: sum("visualizaciones"), favoritos: sum("favoritos"), simulaciones: sum("simulaciones") },
    ranking,
  };
}
