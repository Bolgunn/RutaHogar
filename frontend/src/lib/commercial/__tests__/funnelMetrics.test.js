import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALG18_VERSION, computeFunnelMetrics } from "../funnelMetrics";

const casesUrl = new URL("../../../../../docs/algorithms/ALG-18-cases.json", import.meta.url);
const sourceUrl = new URL("../funnelMetrics.js", import.meta.url);
const spec = JSON.parse(readFileSync(fileURLToPath(casesUrl), "utf-8"));

const DEFAULT_NOW = "2026-10-04T15:00:00Z";
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 86_400_000;

// --- Shorthand expansion (see `nota` in ALG-18-cases.json) ---

function priorityDetail({ prioridad_label, prioridad_key }) {
  if (prioridad_label == null && prioridad_key == null) return null;
  return {
    ...(prioridad_label != null ? { level: prioridad_label, action: prioridad_label } : {}),
    ...(prioridad_key != null ? { action_key: prioridad_key } : {}),
  };
}

function expandLead(lead, alg10ByEvaluation) {
  const detail = priorityDetail(lead);
  const evaluacion_actual = { input: {}, onboarding: {}, result: detail ? { commercial_priority_detail: detail } : {} };
  if (lead.alg10) alg10ByEvaluation.set(evaluacion_actual, lead.alg10);
  return {
    lead_id: lead.lead_id,
    first_evaluation_at: lead.first_evaluation_at,
    evaluaciones: lead.evaluaciones ?? [{ at: lead.first_evaluation_at, project_goal_id: null }],
    evaluacion_actual,
    proyectos: lead.proyectos ?? [],
    postulaciones: lead.postulaciones ?? [],
    stage_events: (lead.stage_events ?? []).map((event) => ({ por_sistema: false, por_mi: false, ...event })),
    plan: lead.plan ?? null,
    favoritos: lead.favoritos ?? [],
    progress_update_ats: lead.progress_update_ats ?? [],
    confirmed_goal_ats: lead.confirmed_goal_ats ?? [],
  };
}

// Stands in for matchLeadToProjects: the case's `alg10` rows for the projects passed, or ALG-10
// G0 for every project when the lead has no `alg10`.
function fakeMatch(alg10ByEvaluation) {
  return (evaluacion, catalogo) => {
    const alg10 = alg10ByEvaluation.get(evaluacion);
    const matches = [];
    const excluidos = [];
    for (const proyecto of catalogo) {
      const row = alg10
        ? alg10[proyecto.id]
        : { clasificacion: null, motivo_exclusion: "capacidad_requiere_antecedentes", alcanza_precio_min: false };
      if (!row) throw new Error(`case gives no alg10 row for project ${proyecto.id}`);
      const out = {
        proyecto_id: proyecto.id,
        clasificacion: row.clasificacion,
        motivo_exclusion: row.motivo_exclusion,
        evidencia: { alcanza_precio_min: row.alcanza_precio_min },
      };
      (row.motivo_exclusion == null ? matches : excluidos).push(out);
    }
    return { matches, excluidos };
  };
}

function expandCase(testCase) {
  const alg10ByEvaluation = new Map();
  const input = testCase.input;
  return {
    args: {
      facts: input.facts.map((lead) => expandLead(lead, alg10ByEvaluation)),
      proyectos: input.proyectos.map((id) => ({ ...spec.proyectos_comunes[id] })),
      filtros: { proyecto_id: null, afinidad: [], capacidad: [], prioridad: [], ...input.filtros },
      now: input.now ?? DEFAULT_NOW,
      granularidad: input.granularidad ?? "mes",
    },
    match: fakeMatch(alg10ByEvaluation),
  };
}

// --- Deep-partial matching ---

function expectPartial(actual, expected, path) {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} is an array`).toBe(true);
    expect(actual.length, `${path}.length`).toBe(expected.length);
    expected.forEach((item, index) => expectPartial(actual[index], item, `${path}[${index}]`));
  } else if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object", `${path} is an object`).toBe(true);
    for (const [key, value] of Object.entries(expected)) expectPartial(actual[key], value, `${path}.${key}`);
  } else if (typeof expected === "string" && ISO_INSTANT.test(expected)) {
    expect(Date.parse(actual), path).toBe(Date.parse(expected));
  } else {
    expect(actual, path).toBe(expected);
  }
}

function expectCase(output, expected) {
  const { serie_claves, serie_por_clave, ...rest } = expected;
  expectPartial(output, rest, "out");
  const claves = output.serie.periodos.map((periodo) => periodo.clave);
  if (serie_claves) expect(claves, "serie claves").toEqual(serie_claves);
  for (const [clave, periodo] of Object.entries(serie_por_clave ?? {})) {
    expect(claves, `serie has ${clave}`).toContain(clave);
    expectPartial(output.serie.periodos.find((p) => p.clave === clave), periodo, `serie[${clave}]`);
  }
}

// --- Invariants 1–16 (ALG-18, "Invariants and edge cases") ---

const sum = (values) => values.reduce((total, value) => total + value, 0);
const alcanzaron = (embudo, etapa) => embudo.etapas.find((e) => e.etapa === etapa).alcanzaron;

function expectRate(value, denominator, path) {
  if (denominator === 0) {
    expect(value, `${path} null when its denominator is 0`).toBeNull();
  } else {
    expect(value, `${path} not null`).not.toBeNull();
    expect(value >= 0 && value <= 1, `${path} in [0, 1]`).toBe(true);
  }
}

function expectFunnel(embudo, n, path) {
  expect(embudo.n, `${path}.n`).toBe(n);
  expect(embudo.etapas.map((e) => e.etapa), `${path} ladder`)
    .toEqual(["nuevo", "contactado", "en_plan_mejora", "en_negociacion", "reserva", "venta_cerrada"]);
  expect(embudo.etapas[0].alcanzaron, `${path} alcanzaron(nuevo) = n`).toBe(n);
  expect(embudo.etapas[0].conversion, `${path} conversion(nuevo)`).toBeNull();
  for (let k = 1; k < embudo.etapas.length; k += 1) {
    expect(embudo.etapas[k].alcanzaron, `${path} monotone at ${k}`).toBeLessThanOrEqual(embudo.etapas[k - 1].alcanzaron);
    expectRate(embudo.etapas[k].conversion, embudo.etapas[k - 1].alcanzaron, `${path}.etapas[${k}].conversion`);
  }
  const { total, por_agotamiento, por_gestion } = embudo.perdido_actual;
  expect(embudo.abiertos + alcanzaron(embudo, "venta_cerrada") + total, `${path} current stages partition n`).toBe(n);
  expect(por_agotamiento + por_gestion, `${path} perdido split`).toBe(total);
}

function expectEngagement(engagement, path) {
  expectRate(engagement.tasa, engagement.n, `${path}.tasa`);
  expect(engagement.activos, `${path} activos <= n`).toBeLessThanOrEqual(engagement.n);
  const leads = Object.values(engagement.por_accion).map((row) => row.leads);
  expect(Object.keys(engagement.por_accion), `${path} actions`)
    .toEqual(["favorito", "reprecalificacion", "postulacion", "plan_aceptado", "actualizacion_progreso", "meta_confirmada"]);
  for (const [accion, row] of Object.entries(engagement.por_accion)) {
    expect(row.leads, `${path}.${accion} leads <= activos`).toBeLessThanOrEqual(engagement.activos);
    expect(row.leads, `${path}.${accion} leads <= eventos`).toBeLessThanOrEqual(row.eventos);
  }
  expect(engagement.activos, `${path} activos <= Σ leads`).toBeLessThanOrEqual(sum(leads));
}

function expectStats(node, path) {
  if (node === null || typeof node !== "object") return;
  if ("promedio" in node && "mediana" in node) {
    expect(Number.isInteger(node.n) && node.n >= 0, `${path}.n`).toBe(true);
    expect(node.promedio === null, `${path}.promedio null iff n = 0`).toBe(node.n === 0);
    expect(node.mediana === null, `${path}.mediana null iff n = 0`).toBe(node.n === 0);
    if (node.n > 0) expect(node.promedio >= 0 && node.mediana >= 0, `${path} durations >= 0`).toBe(true);
  }
  if ("en_curso" in node && typeof node.en_curso === "number") {
    expect(Number.isInteger(node.en_curso) && node.en_curso >= 0, `${path}.en_curso`).toBe(true);
  }
  for (const [key, value] of Object.entries(node)) expectStats(value, `${path}.${key}`);
}

function expectInvariants(out) {
  const { n } = out;
  expect(out.version).toBe(ALG18_VERSION);

  // 1
  expect(out.bandas.n).toBe(n);
  if (out.bandas.sin_catalogo) {
    expect(out.bandas.afinidad).toBeNull();
    expect(out.bandas.capacidad).toBeNull();
  } else {
    expect(sum(Object.values(out.bandas.afinidad)), "Σ afinidad = n").toBe(n);
    expect(sum(Object.values(out.bandas.capacidad)), "Σ capacidad = n").toBe(n);
  }

  // 2, 3, 4, 5
  expect(out.captura.n).toBe(n);
  expect(out.captura.postulan).toBeLessThanOrEqual(n);
  expectRate(out.captura.tasa, out.captura.n, "captura.tasa");
  expectFunnel(out.embudo, n, "embudo");
  expect(out.plan_a_venta.con_plan_y_venta).toBeLessThanOrEqual(out.plan_a_venta.con_plan);
  expectRate(out.plan_a_venta.tasa, out.plan_a_venta.con_plan, "plan_a_venta.tasa");
  expect(out.engagement.n).toBe(n);
  expectEngagement(out.engagement, "engagement");
  expectRate(out.engagement.mes_actual.tasa, out.engagement.mes_actual.n, "engagement.mes_actual.tasa");
  expect(out.engagement.mes_actual.activos).toBeLessThanOrEqual(out.engagement.mes_actual.n);
  expect(Object.keys(out.tiempos.en_etapa)).toEqual(
    ["nuevo", "contactado", "en_plan_mejora", "en_negociacion", "reserva", "venta_cerrada", "perdido"]);

  // 6
  expectStats(out, "out");
  const { antiguedad_mediana, antiguedad_maxima } = out.contacto.sin_contactar;
  expect(antiguedad_mediana === null).toBe(out.contacto.sin_contactar.n === 0);
  expect(antiguedad_maxima === null).toBe(out.contacto.sin_contactar.n === 0);
  if (antiguedad_maxima !== null) expect(antiguedad_maxima).toBeGreaterThanOrEqual(antiguedad_mediana);
  if (antiguedad_mediana !== null) expect(antiguedad_mediana).toBeGreaterThanOrEqual(0);

  // 4 per cohort, 10
  const periodos = out.serie.periodos;
  if (n === 0) expect(periodos).toEqual([]);
  periodos.forEach((periodo, i) => {
    const path = `serie[${periodo.clave}]`;
    expect(periodo.captura.n, `${path} captura.n = cohort`).toBe(periodo.embudo.n);
    expectRate(periodo.captura.tasa, periodo.captura.n, `${path}.captura.tasa`);
    expectFunnel(periodo.embudo, periodo.embudo.n, `${path}.embudo`);
    expectRate(periodo.plan_a_venta.tasa, periodo.plan_a_venta.con_plan, `${path}.plan_a_venta.tasa`);
    expectEngagement(periodo.engagement, `${path}.engagement`);
    if (i > 0) {
      expect(periodo.desde, `${path} contiguous`).toBe(periodos[i - 1].hasta);
      expect(periodo.engagement.n, `${path} denominators non-decreasing`).toBeGreaterThanOrEqual(periodos[i - 1].engagement.n);
    }
    expect(periodo.en_curso, `${path}.en_curso`).toBe(i === periodos.length - 1);
  });
  expect(sum(periodos.map((p) => p.embudo.n)), "Σ cohort n = n").toBe(n);
  expect(sum(periodos.map((p) => p.captura.postulan)), "Σ cohort postulan").toBe(out.captura.postulan);
  if (periodos.length) expect(periodos[periodos.length - 1].engagement.n, "last denominator = n").toBe(n);

  // 13
  const contactado = alcanzaron(out.embudo, "contactado");
  const { contacto } = out;
  expect(contacto.sin_contactar.n).toBeLessThanOrEqual(out.embudo.abiertos);
  expect(contacto.sin_contactar.n + contactado).toBeLessThanOrEqual(n);
  expect(contacto.contactados_por_mi.mes_actual).toBeLessThanOrEqual(contacto.contactados_por_mi.total);
  expect(contacto.contactados_por_mi.total).toBeLessThanOrEqual(contactado);
  expect(contacto.contactados_mes_actual).toBeLessThanOrEqual(contactado);

  // 14, 16
  if (out.bandas.sin_catalogo) {
    expect(contacto.tiempo_primer_contacto).toBeNull();
    expect(out.mejores).toBeNull();
  } else {
    const tpc = contacto.tiempo_primer_contacto;
    expect(out.mejores).not.toBeNull();
    expect(tpc.n + tpc.en_curso, "tiempo_primer_contacto within best leads").toBeLessThanOrEqual(out.mejores.n);
    expect(tpc.n + tpc.en_curso).toBeLessThanOrEqual(Math.min(out.bandas.afinidad.Compatible, out.bandas.capacidad.alcanza));
    expect(out.mejores.n).toBeLessThanOrEqual(n);
    expectFunnel(out.mejores.embudo, out.mejores.n, "mejores.embudo");
    out.mejores.embudo.etapas.forEach((etapa, k) => {
      expect(etapa.alcanzaron, `mejores <= embudo at ${etapa.etapa}`).toBeLessThanOrEqual(out.embudo.etapas[k].alcanzaron);
    });
  }

  // 15
  for (const row of out.por_proyecto) {
    expect(row.postulan).toBeLessThanOrEqual(row.leads);
    expect(row.ventas).toBeLessThanOrEqual(row.leads);
    expect(row.sin_contactar).toBeLessThanOrEqual(row.leads);
    expect(row.leads).toBeLessThanOrEqual(n);
  }
}

// Invariant 8: the same case with every kind of fact also dated after `now`.
function withFutureNoise(args) {
  const later = new Date(Date.parse(args.now) + DAY_MS).toISOString();
  const ids = args.proyectos.map((proyecto) => proyecto.id);
  return {
    ...args,
    facts: args.facts.map((lead) => ({
      ...lead,
      evaluaciones: [...lead.evaluaciones, ...ids.map((id) => ({ at: later, project_goal_id: id }))],
      postulaciones: [...lead.postulaciones, ...ids.map((id) => ({ proyecto_id: id, first_at: later }))],
      stage_events: [
        ...lead.stage_events,
        { proyecto_id: null, stage_after: "contactado", occurred_at: later, por_sistema: false, por_mi: true },
        ...ids.map((id) => ({ proyecto_id: id, stage_after: "venta_cerrada", occurred_at: later, por_sistema: false, por_mi: true })),
      ],
      favoritos: [...lead.favoritos, ...ids.map((id) => ({ proyecto_id: id, created_at: later }))],
      progress_update_ats: [...lead.progress_update_ats, later],
      confirmed_goal_ats: [...lead.confirmed_goal_ats, later],
    })),
  };
}

const FILTER_VALUES = {
  afinidad: ["Compatible", "Cercano", "Marginal", "fuera_de_alcance", "requiere_antecedentes"],
  capacidad: ["alcanza", "cercano_por_capacidad", "insuficiente", "requiere_antecedentes"],
  prioridad: ["contact_now", "contact_with_review", "nurture", "reorient", "request_info", "do_not_route", "sin_prioridad"],
};

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe("ALG-18 cases", () => {
  it("covers every case of the file", () => {
    expect(spec.version).toBe(ALG18_VERSION);
    expect(spec.cases).toHaveLength(33);
  });

  for (const testCase of spec.cases) {
    describe(testCase.name, () => {
      const { args, match } = expandCase(testCase);
      const run = (input) => computeFunnelMetrics(input, { match });

      it("matches its expectation", () => {
        expectCase(run(args), testCase.expect);
      });

      it("holds invariants 1–6, 10, 13–16", () => {
        expectInvariants(run(args));
      });

      it("is deterministic and does not mutate its frozen input (invariants 7, 12)", () => {
        const before = structuredClone(args);
        const first = run(deepFreeze(args));
        expect(run(args)).toEqual(first);
        expect(args).toEqual(before);
      });

      it("ignores everything dated after now (invariant 8)", () => {
        expect(run(withFutureNoise(args))).toEqual(run(args));
      });

      it("filters only remove leads (invariant 11)", () => {
        const { n } = run(args);
        for (const [dimension, values] of Object.entries(FILTER_VALUES)) {
          const current = args.filtros[dimension];
          const variant = (list) => run({ ...args, filtros: { ...args.filtros, [dimension]: list } }).n;
          if (current.length) {
            expect(variant([]), `${dimension} cleared`).toBeGreaterThanOrEqual(n);
            expect(variant([...new Set([...current, ...values])]), `${dimension} widened`).toBeGreaterThanOrEqual(n);
          } else {
            for (const value of values) expect(variant([value]), `${dimension} = ${value}`).toBeLessThanOrEqual(n);
          }
        }
      });
    });
  }
});

describe("ALG-18 module", () => {
  it("declares no band threshold and reads no clock or randomness (invariants 7, 9)", () => {
    const source = readFileSync(fileURLToPath(sourceUrl), "utf-8");
    expect(source).not.toMatch(/Date\.now|new Date\(\)|Math\.random/);
    expect(source).not.toMatch(/UMBRAL|BANDA_|PENALIDAD|precio_min_uf|capacidad_compra/);
  });
});
