import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { comunasDeclaradas, matchLeadToProjects } from "../leadProjectMatching";

const casesUrl = new URL("../../../../../docs/algorithms/ALG-10-cases.json", import.meta.url);
const { cases } = JSON.parse(readFileSync(fileURLToPath(casesUrl), "utf-8"));

const supuestos = {
  tasa_anual_uf: 0.04,
  plazo_anios: 30,
  plazo_origen: "declarado",
  pie_ratio: 0.2,
  ratio_dividendo_max: 0.3,
  ratio_dividendo_saludable: 0.25,
  fogaes_tope_uf: 6000,
  fogaes_tope_con_subsidio_uf: 3000,
  fogaes_pie_ratio: 0.1,
  uf_value_clp: 40695,
  uf_fecha: "2026-08-16",
  age_term_verified: true,
  version: "e4-matching-v1",
};

function evaluacion({ capacidad, clasificacion = "Medio", restriccion = "pie", ...extra }) {
  return {
    input: { ahorro_disponible: 25000000, comuna_objetivo: "Ñuñoa", ...(extra.input || {}) },
    onboarding: { tipo_propiedad: "departamento", ...(extra.onboarding || {}) },
    result: {
      classification: clasificacion,
      blockers: extra.blockers || [],
      project_fit: { status: "compatible" },
      financial_indicators: {
        ingreso_total: 2500000,
        capacidad_compra_estimada_uf: capacidad,
        capacidad_asistida_uf: null,
        restriccion_vinculante: restriccion,
        capacidad_status: "ok",
        capacidad_supuestos: supuestos,
      },
    },
  };
}

const proyecto = (extra = {}) => ({
  id: "p-1",
  nombre: "Proyecto 1",
  comuna: "Ñuñoa",
  tipo: "departamento",
  precio_min_uf: 2000,
  precio_max_uf: 3000,
  estado: "disponible",
  ...extra,
});

describe("ALG-10 — casos normativos", () => {
  it.each(cases.map((c) => [c.name, c]))("%s", (_name, caso) => {
    expect(matchLeadToProjects(caso.evaluacion, caso.proyectos)).toEqual(caso.expect);
  });
});

describe("ALG-10 — invariantes", () => {
  it.each(cases.map((c) => [c.name, c]))("%s particiona el catálogo", (_name, caso) => {
    const { matches, excluidos } = matchLeadToProjects(caso.evaluacion, caso.proyectos);
    const ids = [...matches, ...excluidos].map((row) => row.proyecto_id);
    expect(ids.sort()).toEqual(caso.proyectos.map((p) => p.id).sort());

    for (const row of matches) {
      expect(row.motivo_exclusion).toBeNull();
      expect(row.afinidad).toBeGreaterThanOrEqual(0);
      expect(row.afinidad).toBeLessThanOrEqual(100);
      expect(row.clasificacion).not.toBeNull();
    }
    for (const row of excluidos) {
      expect(row.motivo_exclusion).not.toBeNull();
      expect(row.afinidad).toBeNull();
      expect(row.reorientable).toBe(false);
    }
  });

  it.each(cases.map((c) => [c.name, c]))("%s es determinista", (_name, caso) => {
    expect(matchLeadToProjects(caso.evaluacion, caso.proyectos)).toEqual(
      matchLeadToProjects(caso.evaluacion, caso.proyectos),
    );
  });

  it("no muta sus argumentos", () => {
    const caso = cases[0];
    const antes = JSON.stringify([caso.evaluacion, caso.proyectos]);
    matchLeadToProjects(caso.evaluacion, caso.proyectos);
    expect(JSON.stringify([caso.evaluacion, caso.proyectos])).toBe(antes);
  });

  it("un catálogo vacío no es un error", () => {
    expect(matchLeadToProjects(evaluacion({ capacidad: 3000 }), [])).toEqual({
      matches: [],
      excluidos: [],
    });
  });
});

describe("ALG-10 — E2: la capacidad manda sobre la clasificación", () => {
  it("un lead Medio saturado supera a un lead Alto en precio_min", () => {
    const unico = [proyecto({ precio_min_uf: 2000, precio_max_uf: 2000 })];
    const [medio] = matchLeadToProjects(
      evaluacion({ capacidad: 6000, clasificacion: "Medio" }),
      unico,
    ).matches;
    const [alto] = matchLeadToProjects(
      evaluacion({ capacidad: 2000 * 0.85, clasificacion: "Alto" }),
      [proyecto({ precio_min_uf: 2000, precio_max_uf: 3000 })],
    ).matches;

    expect(medio.afinidad).toBeGreaterThan(alto.afinidad);
  });
});

describe("ALG-10 — bordes que corrompen la lista", () => {
  it("un proyecto de precio único no produce NaN", () => {
    const unico = [proyecto({ precio_min_uf: 2500, precio_max_uf: 2500 })];
    const { matches } = matchLeadToProjects(evaluacion({ capacidad: 2500 }), unico);
    expect(Number.isNaN(matches[0].afinidad)).toBe(false);
    // El ancla de precio_max manda: -12, nunca los -45 de precio_min.
    expect(matches[0].afinidad).toBe(80);
  });

  it("un lead que supera precio_ref no recibe un bloqueador fabricado", () => {
    const { matches } = matchLeadToProjects(evaluacion({ capacidad: 3600 }), [proyecto()]);
    expect(matches[0].bloqueador_principal).toBeNull();
  });
});

// El panel deriva de acá cuál de las dos ramas de R4 disparó, para no decirle
// al ejecutivo "puede comprar en Ñuñoa aunque declaró Ñuñoa".
describe("comunasDeclaradas — el conjunto que R4 usa para distinguir sus ramas", () => {
  it("junta la comuna principal y la alternativa", () => {
    const lead = {
      input: { comuna_objetivo: "Ñuñoa" },
      onboarding: { comuna_alternativa: "Macul" },
    };
    expect(comunasDeclaradas(lead)).toEqual({
      principal: "Ñuñoa",
      declaradas: ["Ñuñoa", "Macul"],
    });
  });

  it("cae a la comuna del onboarding cuando el input no trae objetivo", () => {
    const lead = { input: {}, onboarding: { comuna_interes: "Maipú" } };
    expect(comunasDeclaradas(lead).declaradas).toEqual(["Maipú"]);
  });

  it("sin nada declarado devuelve el conjunto vacío, no un null suelto", () => {
    expect(comunasDeclaradas({ input: {}, onboarding: {} })).toEqual({
      principal: null,
      declaradas: [],
    });
  });

  // La rama 3b: el lead es reorientable con el proyecto EN su comuna declarada,
  // porque lo que no le cierra es su objetivo, no su ubicación.
  it("un reorientable de rama 3b tiene el proyecto dentro de lo declarado", () => {
    const lead = evaluacion({
      capacidad: 3000,
      clasificacion: "Alto",
      input: { comuna_objetivo: "Ñuñoa" },
    });
    lead.result.project_fit = { status: "near" };
    const { matches } = matchLeadToProjects(lead, [proyecto({ comuna: "Ñuñoa" })]);

    expect(matches[0].reorientable).toBe(true);
    expect(comunasDeclaradas(lead).declaradas).toContain(matches[0].comuna);
  });
});
