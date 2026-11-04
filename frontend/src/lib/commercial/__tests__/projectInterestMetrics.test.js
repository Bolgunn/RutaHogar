import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALG20_VERSION, computeProjectInterestMetrics } from "../projectInterestMetrics";

const casesUrl = new URL("../../../../../docs/algorithms/ALG-20-cases.json", import.meta.url);
const alg10CasesUrl = new URL("../../../../../docs/algorithms/ALG-10-cases.json", import.meta.url);
const sourceUrl = new URL("../projectInterestMetrics.js", import.meta.url);
const spec = JSON.parse(readFileSync(fileURLToPath(casesUrl), "utf-8"));

// --- Shorthand expansion (see `nota` in ALG-20-cases.json) ---

function expandProyecto(id) {
  return { id, nombre: id, comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: 3000, precio_max_uf: 4000, estado: "en_venta" };
}

function expandCase(testCase) {
  const alg10ByEvaluation = new Map();
  const interestByEvaluation = new Map();
  const leads = testCase.leads.map((lead) => {
    const interacciones = lead.interacciones.map((entry) => ({ visualizaciones: 0, favorito: false, simulaciones: 0, ...entry }));
    const evaluacion_actual = lead.sin_evaluacion ? null : { input: {}, onboarding: {}, result: {} };
    if (evaluacion_actual) {
      alg10ByEvaluation.set(evaluacion_actual, lead.alg10 || {});
      interestByEvaluation.set(evaluacion_actual, new Set(
        interacciones
          .filter((e) => e.en_alcance !== false && (e.visualizaciones > 0 || e.favorito || e.simulaciones > 0))
          .map((e) => e.proyecto_id),
      ));
    }
    return { lead_id: lead.lead_id, evaluacion_actual, interacciones };
  });
  return { input: { proyectos: testCase.proyectos.map(expandProyecto), leads }, alg10ByEvaluation, interestByEvaluation };
}

// Stands in for matchLeadToProjects: returns the case's verdicts, and fails if it is asked about a
// project the lead is not interested in, a pair outside the lead's scope, or a lead without an
// evaluation (R3).
function fakeMatch(alg10ByEvaluation, interestByEvaluation) {
  return (evaluacion, catalogo) => {
    if (!evaluacion) throw new Error("match called for a lead without an evaluation");
    const alg10 = alg10ByEvaluation.get(evaluacion);
    const interest = interestByEvaluation.get(evaluacion);
    const matches = [];
    const excluidos = [];
    for (const proyecto of catalogo) {
      if (!interest.has(proyecto.id)) throw new Error(`match asked about ${proyecto.id}, not of interest or out of scope`);
      const verdict = alg10[proyecto.id];
      if (!verdict) throw new Error(`case gives no alg10 verdict for ${proyecto.id}`);
      const row = {
        proyecto_id: proyecto.id,
        motivo_exclusion: verdict.motivo_exclusion,
        clasificacion: verdict.motivo_exclusion ? null : verdict.clasificacion ?? "Compatible",
        bloqueador_principal: verdict.codigo ? { codigo: verdict.codigo } : null,
        evidencia: { alcanza_precio_min: verdict.alcanza_precio_min ?? !verdict.motivo_exclusion },
      };
      (verdict.motivo_exclusion ? excluidos : matches).push(row);
    }
    return { matches, excluidos };
  };
}

function run(testCase) {
  const { input, alg10ByEvaluation, interestByEvaluation } = expandCase(testCase);
  return { input, output: computeProjectInterestMetrics(input, { match: fakeMatch(alg10ByEvaluation, interestByEvaluation) }) };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

// --- Invariants 1–7 (ALG-20), asserted on every case ---

function assertInvariants(input, output) {
  expect(output.version).toBe(ALG20_VERSION);
  const ids = output.ranking.map((row) => row.proyecto_id);
  expect([...ids].sort()).toEqual(input.proyectos.map((p) => p.id).sort());
  expect(output.ranking.map((row) => row.posicion)).toEqual(ids.map((_, index) => index + 1));

  for (const row of output.ranking) {
    const c = row.compatibilidad;
    expect(c.compatibles + c.incompatibles + c.sin_datos).toBe(row.interesados);
    expect(c.evaluables).toBe(c.compatibles + c.incompatibles);
    expect(row.motivos.reduce((total, m) => total + m.n, 0)).toBe(c.incompatibles);
    for (const m of row.motivos) {
      expect(m.proporcion).toBeGreaterThan(0);
      expect(m.proporcion).toBeLessThanOrEqual(1);
    }
    if (c.evaluables === 0) expect(c.tasa_incompatibles).toBeNull();
    else {
      expect(c.tasa_incompatibles).toBeGreaterThanOrEqual(0);
      expect(c.tasa_incompatibles).toBeLessThanOrEqual(1);
    }
    expect(row.interesados).toBeLessThanOrEqual(output.n_leads);
    expect(row.favoritos).toBeLessThanOrEqual(row.interesados);
  }

  for (const key of ["visualizaciones", "favoritos", "simulaciones"]) {
    expect(output.totales[key]).toBe(output.ranking.reduce((total, row) => total + row[key], 0));
  }
  for (let index = 1; index < output.ranking.length; index += 1) {
    expect(output.ranking[index].interesados).toBeLessThanOrEqual(output.ranking[index - 1].interesados);
  }
}

describe("ALG-20 cases", () => {
  it("covers the spec version", () => {
    expect(spec.version).toBe(ALG20_VERSION);
  });

  for (const testCase of spec.cases) {
    it(testCase.name, () => {
      const { input, output } = run(testCase);
      const { ranking, ...rest } = testCase.expect;
      expect(output).toMatchObject(rest);
      if (ranking) {
        expect(output.ranking).toHaveLength(ranking.length);
        ranking.forEach((expected, index) => expect(output.ranking[index]).toMatchObject(expected));
      }
      assertInvariants(input, output);
    });
  }
});

describe("ALG-20 invariants 8–9", () => {
  it("is deterministic and does not mutate its (frozen) inputs", () => {
    for (const testCase of spec.cases) {
      const { input, alg10ByEvaluation, interestByEvaluation } = expandCase(testCase);
      const match = fakeMatch(alg10ByEvaluation, interestByEvaluation);
      const snapshot = JSON.stringify(input);
      deepFreeze(input);
      const first = computeProjectInterestMetrics(input, { match });
      expect(computeProjectInterestMetrics(input, { match })).toEqual(first);
      expect(JSON.stringify(input)).toBe(snapshot);
    }
  });

  it("reads no clock and no randomness", () => {
    const source = readFileSync(fileURLToPath(sourceUrl), "utf-8");
    expect(source).not.toMatch(/Date\.now|new Date|Math\.random/);
  });
});

// Pins the wiring to ALG-10's real row shape: exclusion reasons and pair-scoped blockers.
describe("ALG-20 through the real ALG-10", () => {
  const alg10 = JSON.parse(readFileSync(fileURLToPath(alg10CasesUrl), "utf-8"));
  const base = alg10.cases.find((c) => c.name === "comuna_alternativa_es_declaracion_no_preferencia").evaluacion;
  const capacidad = base.result.financial_indicators.capacidad_compra_estimada_uf;
  const proyectos = [
    { id: "alcanzable", nombre: "Alcanzable", comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: Math.floor(capacidad * 0.8), precio_max_uf: Math.floor(capacidad * 0.9), estado: "en_venta" },
    { id: "caro", nombre: "Caro", comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: Math.ceil(capacidad * 2), precio_max_uf: Math.ceil(capacidad * 2.5), estado: "en_venta" },
  ];
  const moroso = {
    ...base,
    result: { ...base.result, blockers: [...base.result.blockers, { code: "morosidad_vigente", severity: "critical", title: "Morosidad vigente" }] },
  };
  const both = [{ proyecto_id: "alcanzable", visualizaciones: 1, favorito: false, simulaciones: 0 }, { proyecto_id: "caro", visualizaciones: 1, favorito: false, simulaciones: 0 }];

  it("splits compatible, capacity-bound and critically blocked pairs with ALG-10's codes", () => {
    const output = computeProjectInterestMetrics({
      proyectos,
      leads: [
        { lead_id: "1", evaluacion_actual: base, interacciones: both },
        { lead_id: "2", evaluacion_actual: moroso, interacciones: both },
      ],
    });
    const row = (id) => output.ranking.find((r) => r.proyecto_id === id);
    expect(row("alcanzable").compatibilidad).toMatchObject({ compatibles: 1, incompatibles: 1 });
    expect(row("alcanzable").motivos).toEqual([{ motivo: "morosidad_vigente", n: 1, proporcion: 1 }]);
    expect(row("caro").compatibilidad).toMatchObject({ compatibles: 0, incompatibles: 2, tasa_incompatibles: 1 });
    expect(row("caro").motivos.map((m) => m.motivo)).toEqual(["morosidad_vigente", "pie_insuficiente_para_proyecto"]);
    assertInvariants({ proyectos }, output);
  });
});
