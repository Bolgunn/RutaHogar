// Métricas del embudo comercial (HU 15). Implementa ALG-18 R0–R14 tal como están escritas en
// docs/algorithms/ALG-18-commercial-funnel-metrics.md; los casos de ALG-18-cases.json la fijan.
// Función pura: `now` es una entrada, nada fechado después de `now` cuenta. Las bandas son las de
// ALG-10 (matchLeadToProjects) y la etapa global la de overallStage(); aquí no se declara ningún
// umbral.
import { matchLeadToProjects } from "../matching/leadProjectMatching";
import { overallStage } from "./overallStage";
import { PRIORITY_ACTIONS, SIN_PRIORIDAD, priorityKeyFromDetail } from "./priorityActions";
import { periodOf, periodsBetween } from "./santiagoCalendar";
import { DEFAULT_STAGE, STAGES } from "./stageRules";

export const ALG18_VERSION = "hu15-commercial-funnel-v1";

const DAY_MS = 86_400_000;
const ALL_STAGES = STAGES.map((stage) => stage.value);
const LADDER = ALL_STAGES.filter((stage) => stage !== "perdido");
const ACCIONES = ["favorito", "reprecalificacion", "postulacion", "plan_aceptado", "actualizacion_progreso", "meta_confirmada"];
const AFINIDADES = ["Compatible", "Cercano", "Marginal", "fuera_de_alcance", "requiere_antecedentes"];
const CAPACIDADES = ["alcanza", "cercano_por_capacidad", "insuficiente", "requiere_antecedentes"];
const PRIORIDADES = [...Object.keys(PRIORITY_ACTIONS), SIN_PRIORIDAD];
const PAIRS = LADDER.slice(0, -1).map((desde, index) => [desde, LADDER[index + 1]]);

const instant = (value) => Date.parse(value);
const days = (from, to) => (to - from) / DAY_MS;
const rate = (numerator, denominator) => (denominator === 0 ? null : numerator / denominator);
const count = (items, predicate) => items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);

function rank(stage) {
  const index = LADDER.indexOf(stage);
  return index === -1 ? null : index + 1;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function stat(values) {
  return {
    n: values.length,
    promedio: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    mediana: median(values),
  };
}

function stageStat(values, enCurso) {
  return { ...stat(values), en_curso: enCurso };
}

function within(range, at) {
  return at >= range.desde && at < range.hasta;
}

// R1 — la mejor banda del lead en todo el catálogo, leída de la salida de ALG-10.
function bandsOf({ matches, excluidos }) {
  if (excluidos.some((row) => row.motivo_exclusion === "capacidad_requiere_antecedentes")) {
    return { afinidad: "requiere_antecedentes", capacidad: "requiere_antecedentes" };
  }
  const afinidad = ["Compatible", "Cercano", "Marginal"].find((clasificacion) =>
    matches.some((row) => row.clasificacion === clasificacion)) ?? "fuera_de_alcance";
  const capacidad = [...matches, ...excluidos].some((row) => row.evidencia.alcanza_precio_min === true)
    ? "alcanza"
    : matches.some((row) => row.evidencia.alcanza_precio_min === false)
      ? "cercano_por_capacidad"
      : "insuficiente";
  return { afinidad, capacidad };
}

// R0, R3, R9, R12 — repite los eventos considerados: registros, tramos de la etapa global, rango
// máximo alcanzado, venta vigente, primer contacto y primer en_plan_mejora registrado.
function replay(lead, S, nowMs) {
  const events = lead.stage_events.filter((event) =>
    (event.proyecto_id == null || S.has(event.proyecto_id)) && instant(event.occurred_at) <= nowMs);
  const t0 = Math.min(instant(lead.first_evaluation_at), ...events.map((event) => instant(event.occurred_at)));

  const records = new Map();
  const spells = [];
  let stage = DEFAULT_STAGE;
  let spellStart = t0;
  let maxRank = 1;
  let firstContact = null;
  let firstPlanStage = null;

  for (const event of events) {
    const at = instant(event.occurred_at);
    const key = event.proyecto_id ?? null;
    const previous = records.get(key);
    records.set(key, {
      proyecto_id: key,
      stage: event.stage_after,
      at: event.occurred_at,
      por_sistema: event.por_sistema === true,
      since: previous && previous.stage === event.stage_after ? previous.since : at,
    });

    const eventRank = rank(event.stage_after);
    if (eventRank !== null) maxRank = Math.max(maxRank, eventRank);
    if (!firstContact && eventRank !== null && eventRank > 1) firstContact = { at, por_mi: event.por_mi === true };
    if (firstPlanStage === null && event.stage_after === "en_plan_mejora") firstPlanStage = at;

    const next = overallStage([...records.values()]).stage;
    if (next !== stage) {
      spells.push({ stage, start: spellStart, end: at });
      stage = next;
      spellStart = at;
    }
  }

  const { causa } = overallStage([...records.values()]);
  const sales = [...records.values()]
    .filter((record) => record.proyecto_id != null && record.stage === "venta_cerrada")
    .map((record) => record.since);
  const saleAt = sales.length ? Math.min(...sales) : null;
  // R13 — entradas a cada etapa en la línea de tiempo global; a venta_cerrada solo la venta vigente.
  const entries = [...spells, { stage, start: spellStart }]
    .filter((spell) => spell.stage !== "venta_cerrada")
    .map((spell) => ({ stage: spell.stage, at: spell.start }));
  if (saleAt !== null) entries.push({ stage: "venta_cerrada", at: saleAt });
  return { stage, causa, spells, entries, maxRank, firstContact, firstPlanStage, saleAt };
}

function analyze(lead, S, nowMs) {
  const firstEval = instant(lead.first_evaluation_at);
  const counts = (at) => instant(at) <= nowMs;
  const applications = lead.postulaciones
    .filter((entry) => S.has(entry.proyecto_id) && counts(entry.first_at))
    .map((entry) => instant(entry.first_at));
  const planInScope = lead.plan != null && S.has(lead.plan.target_proyecto_id);

  const actions = [
    ...lead.favoritos.filter((fav) => S.has(fav.proyecto_id)).map((fav) => ["favorito", fav.created_at]),
    ...lead.evaluaciones.slice(1).filter((evaluation) => S.has(evaluation.project_goal_id))
      .map((evaluation) => ["reprecalificacion", evaluation.at]),
    ...lead.postulaciones.filter((entry) => S.has(entry.proyecto_id)).map((entry) => ["postulacion", entry.first_at]),
    ...(planInScope ? [["plan_aceptado", lead.plan.baseline_at]] : []),
    ...(planInScope ? lead.progress_update_ats.map((at) => ["actualizacion_progreso", at]) : []),
    ...(planInScope ? lead.confirmed_goal_ats.map((at) => ["meta_confirmada", at]) : []),
  ].filter(([, at]) => counts(at)).map(([accion, at]) => ({ accion, at: instant(at) }));

  return {
    firstEval,
    firstApplication: applications.length ? Math.min(...applications) : null,
    planBaseline: planInScope && counts(lead.plan.baseline_at) ? instant(lead.plan.baseline_at) : null,
    actions,
    ...replay(lead, S, nowMs),
  };
}

const isUncontacted = (a) => !a.firstContact && a.stage !== "perdido";

// R2
function captura(items) {
  const postulan = count(items, (item) => item.a.firstApplication !== null);
  return { n: items.length, postulan, tasa: rate(postulan, items.length) };
}

// R3, R13 (conversion_general, G29)
function embudo(items) {
  const reached = LADDER.map((etapa) => count(items, ({ a }) =>
    (etapa === "venta_cerrada" ? a.saleAt !== null : rank(etapa) <= a.maxRank)));
  const perdidos = items.filter(({ a }) => a.stage === "perdido");
  return {
    n: items.length,
    etapas: LADDER.map((etapa, k) => ({
      etapa,
      alcanzaron: reached[k],
      conversion: k === 0 ? null : rate(reached[k], reached[k - 1]),
    })),
    conversion_general: rate(reached[reached.length - 1], items.length),
    abiertos: count(items, ({ a }) => a.stage !== "venta_cerrada" && a.stage !== "perdido"),
    perdido_actual: {
      total: perdidos.length,
      por_agotamiento: count(perdidos, ({ a }) => a.causa === "por_agotamiento"),
      por_gestion: count(perdidos, ({ a }) => a.causa === "por_gestion"),
    },
  };
}

// R4
function planAVenta(items) {
  const conPlan = items.filter(({ a }) => a.planBaseline !== null);
  const conVenta = count(conPlan, ({ a }) => a.saleAt !== null && a.saleAt > a.planBaseline);
  return { con_plan: conPlan.length, con_plan_y_venta: conVenta, tasa: rate(conVenta, conPlan.length) };
}

// R12
function planMejoraAVenta(items) {
  const enPlan = items.filter(({ a }) => a.firstPlanStage !== null);
  const conVenta = count(enPlan, ({ a }) => a.saleAt !== null && a.saleAt > a.firstPlanStage);
  return { en_plan_mejora: enPlan.length, con_venta: conVenta, tasa: rate(conVenta, enPlan.length) };
}

// R13 — días desde la primera entrada a N hasta la primera entrada a M posterior. Quien llegó a M
// sin pasar antes por N cuenta en `saltaron`; quien sigue en N esperando M, en `en_curso`.
function entreEtapas(items, range = null, countsEnCurso = true) {
  return PAIRS.map(([desde, hasta]) => {
    const values = [];
    let saltaron = 0;
    let enCurso = 0;
    for (const { a } of items) {
      const from = a.entries.find((entry) => entry.stage === desde)?.at ?? null;
      const arrivals = a.entries.filter((entry) => entry.stage === hasta).map((entry) => entry.at);
      const arrival = from === null ? undefined : arrivals.find((at) => at > from);
      if (arrival !== undefined) {
        if (!range || within(range, arrival)) values.push(days(from, arrival));
      } else if (arrivals.length) {
        if (!range || within(range, arrivals[0])) saltaron += 1;
      } else if (from !== null && a.stage === desde && countsEnCurso) {
        enCurso += 1;
      }
    }
    return { desde, hasta, ...stat(values), saltaron, en_curso: enCurso };
  });
}

// R5 — sin `range`, toda la historia; con `range`, cada tiempo cae en el periodo de su fin y los
// leads aún en una etapa solo cuentan en en_curso del periodo que contiene now (R7, G26).
function enEtapa(items, range = null, countsEnCurso = true) {
  return Object.fromEntries(ALL_STAGES.map((etapa) => {
    const values = [];
    let enCurso = 0;
    for (const { a } of items) {
      if (a.stage === etapa) {
        if (countsEnCurso) enCurso += 1;
        continue;
      }
      const closed = a.spells.filter((spell) => spell.stage === etapa);
      if (!closed.length || (range && !within(range, closed[closed.length - 1].end))) continue;
      values.push(closed.reduce((sum, spell) => sum + days(spell.start, spell.end), 0));
    }
    return [etapa, stageStat(values, enCurso)];
  }));
}

function tiempos(items, range = null, countsEnCurso = true) {
  const ends = (at) => at !== null && (!range || within(range, at));
  return {
    ciclo_venta: stat(items.filter(({ a }) => ends(a.saleAt)).map(({ a }) => days(a.firstEval, a.saleAt))),
    dias_hasta_postular: stat(items.filter(({ a }) => ends(a.firstApplication))
      .map(({ a }) => days(a.firstEval, a.firstApplication))),
    en_etapa: enEtapa(items, range, countsEnCurso),
    entre_etapas: entreEtapas(items, range, countsEnCurso),
  };
}

// R6 — sin `range`, toda la historia hasta now con denominador n.
function engagement(items, range = null) {
  const denominator = range ? count(items, ({ a }) => a.firstEval < range.hasta) : items.length;
  const inRange = (action) => !range || within(range, action.at);
  const activos = count(items, ({ a }) => a.actions.some(inRange));
  const porAccion = Object.fromEntries(ACCIONES.map((accion) => {
    const of = (a) => a.actions.filter((action) => action.accion === accion && inRange(action));
    return [accion, {
      leads: count(items, ({ a }) => of(a).length > 0),
      eventos: items.reduce((total, { a }) => total + of(a).length, 0),
    }];
  }));
  return { n: denominator, activos, tasa: rate(activos, denominator), por_accion: porAccion };
}

function firstContactDays(items, range = null) {
  return items
    .filter(({ a }) => a.firstContact && (!range || within(range, a.firstContact.at)))
    .map(({ a }) => days(a.firstEval, a.firstContact.at));
}

// R9
function contacto(items, best, nowMs, month) {
  const sinContactar = items.filter(({ a }) => isUncontacted(a));
  const antiguedad = sinContactar.map(({ a }) => days(a.firstEval, nowMs));
  const contactados = items.filter(({ a }) => a.firstContact);
  const porMi = contactados.filter(({ a }) => a.firstContact.por_mi);
  const thisMonth = ({ a }) => within(month, a.firstContact.at);
  return {
    sin_contactar: {
      n: sinContactar.length,
      antiguedad_mediana: median(antiguedad),
      antiguedad_maxima: antiguedad.length ? Math.max(...antiguedad) : null,
    },
    contactados_mes_actual: count(contactados, thisMonth),
    contactados_por_mi: { total: porMi.length, mes_actual: count(porMi, thisMonth) },
    tiempo_primer_contacto: best
      ? stageStat(firstContactDays(best), count(best, ({ a }) => isUncontacted(a)))
      : null,
  };
}

// R14
function desgloseRow(clave, analyses, month) {
  const leads = analyses.length;
  const postulan = count(analyses, (a) => a.firstApplication !== null);
  const activos = count(analyses, (a) => a.actions.length > 0);
  const activosMes = count(analyses, (a) => a.actions.some((action) => within(month, action.at)));
  const ventas = count(analyses, (a) => a.saleAt !== null);
  return {
    clave,
    leads,
    postulan,
    tasa_postulacion: rate(postulan, leads),
    activos,
    tasa_activos: rate(activos, leads),
    activos_mes: activosMes,
    tasa_activos_mes: rate(activosMes, leads),
    ventas,
    tasa_venta: rate(ventas, leads),
  };
}

function bounds(period) {
  return { desde: instant(period.desde), hasta: instant(period.hasta) };
}

export function computeFunnelMetrics({ facts, proyectos, filtros, now, granularidad }, { match = matchLeadToProjects } = {}) {
  const nowMs = instant(now);
  const S = new Set(filtros.proyecto_id ? [filtros.proyecto_id] : proyectos.map((proyecto) => proyecto.id));

  // R1
  const catalogo = filtros.proyecto_id
    ? proyectos.filter((proyecto) => proyecto.id === filtros.proyecto_id)
    : proyectos.filter((proyecto) => proyecto.estado !== "agotado");
  const sinCatalogo = catalogo.length === 0;

  // R1b, R8 — con un proyecto elegido, el universo son sus leads (G33).
  const leads = facts
    .filter((lead) => !filtros.proyecto_id || lead.proyectos.includes(filtros.proyecto_id))
    .map((lead) => ({
      lead,
      bandas: sinCatalogo ? null : bandsOf(match(lead.evaluacion_actual, catalogo)),
      prioridad: priorityKeyFromDetail(lead.evaluacion_actual.result?.commercial_priority_detail),
    }))
    .filter(({ bandas, prioridad }) =>
      (sinCatalogo || !filtros.afinidad.length || filtros.afinidad.includes(bandas.afinidad))
      && (sinCatalogo || !filtros.capacidad.length || filtros.capacidad.includes(bandas.capacidad))
      && (!filtros.prioridad.length || filtros.prioridad.includes(prioridad.key)));
  const n = leads.length;
  const items = leads.map((item) => ({ ...item, a: analyze(item.lead, S, nowMs) }));

  // R9, R11
  const best = sinCatalogo
    ? null
    : items.filter(({ bandas }) => bandas.afinidad === "Compatible" && bandas.capacidad === "alcanza");
  const month = bounds(periodOf(now, "mes"));

  const bandas = sinCatalogo
    ? { n, sin_catalogo: true, afinidad: null, capacidad: null }
    : {
      n,
      sin_catalogo: false,
      afinidad: Object.fromEntries(AFINIDADES.map((band) => [band, count(items, ({ bandas: b }) => b.afinidad === band)])),
      capacidad: Object.fromEntries(CAPACIDADES.map((band) => [band, count(items, ({ bandas: b }) => b.capacidad === band)])),
    };

  // R10, R14 (filas por proyecto) — con un proyecto elegido, solo su fila (G33).
  const comparados = filtros.proyecto_id ? proyectos.filter((proyecto) => proyecto.id === filtros.proyecto_id) : proyectos;
  const ownByProject = comparados.map((proyecto) => {
    const Sp = new Set([proyecto.id]);
    return items
      .filter(({ lead }) => lead.proyectos.includes(proyecto.id))
      .map(({ lead }) => analyze(lead, Sp, nowMs));
  });
  const porProyecto = comparados.map((proyecto, index) => {
    const own = ownByProject[index];
    return {
      proyecto_id: proyecto.id,
      leads: own.length,
      postulan: count(own, (a) => a.firstApplication !== null),
      ventas: count(own, (a) => a.saleAt !== null),
      sin_contactar: count(own, isUncontacted),
    };
  });
  const byKey = (keys, keyOf) => keys.map((key) =>
    desgloseRow(key, items.filter((item) => keyOf(item) === key).map(({ a }) => a), month));
  const desglose = {
    proyecto: comparados.map((proyecto, index) => desgloseRow(proyecto.id, ownByProject[index], month)),
    afinidad: sinCatalogo ? null : byKey(AFINIDADES, ({ bandas: b }) => b.afinidad),
    capacidad: sinCatalogo ? null : byKey(CAPACIDADES, ({ bandas: b }) => b.capacidad),
    prioridad: byKey(PRIORIDADES, ({ prioridad }) => prioridad.key),
  };

  // R7
  const periodos = n === 0
    ? []
    : periodsBetween(new Date(Math.min(...items.map(({ a }) => a.firstEval))).toISOString(), now, granularidad)
      .map((period) => {
        const range = bounds(period);
        const cohort = items.filter(({ a }) => within(range, a.firstEval));
        const enCurso = within(range, nowMs);
        return {
          clave: period.clave,
          desde: period.desde,
          hasta: period.hasta,
          en_curso: enCurso,
          captura: captura(cohort),
          embudo: embudo(cohort),
          plan_a_venta: planAVenta(cohort),
          plan_mejora_a_venta: planMejoraAVenta(cohort),
          tiempos: tiempos(items, range, enCurso),
          engagement: engagement(items, range),
          contacto: {
            contactados: firstContactDays(items, range).length,
            tiempo_primer_contacto: best ? stageStat(firstContactDays(best, range), 0) : null,
          },
        };
      });

  const mesActual = engagement(items, month);

  return {
    version: ALG18_VERSION,
    n,
    prioridad_no_reconocida: count(items, ({ prioridad }) => !prioridad.reconocida),
    captura: captura(items),
    embudo: embudo(items),
    plan_a_venta: planAVenta(items),
    tiempos: tiempos(items),
    engagement: {
      ...engagement(items),
      mes_actual: { n: mesActual.n, activos: mesActual.activos, tasa: mesActual.tasa },
    },
    bandas,
    contacto: contacto(items, best, nowMs, month),
    por_proyecto: porProyecto,
    mejores: best ? { n: best.length, embudo: embudo(best), en_etapa: enEtapa(best), entre_etapas: entreEtapas(best) } : null,
    plan_mejora_a_venta: planMejoraAVenta(items),
    desglose,
    serie: { granularidad, periodos },
  };
}
