import { describe, expect, it } from "vitest";

import rankingCases from "../../../../../docs/algorithms/ALG-19-ranking-cases.json";
import { compareCommercialPriority, rankLeadsForProject } from "../leadRanking";

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

function lead(id, capacidad, extra = {}) {
  return {
    id,
    created_at: "2026-08-20T10:00:00.000Z",
    full_name: `Lead ${id}`,
    input: { ahorro_disponible: 25000000, comuna_objetivo: "Macul" },
    onboarding: { tipo_propiedad: "departamento" },
    result: {
      classification: extra.classification || "Medio",
      blockers: extra.blockers || [],
      project_fit: { status: "compatible" },
      financial_indicators: {
        ingreso_total: 2500000,
        capacidad_compra_estimada_uf: capacidad,
        capacidad_asistida_uf: null,
        restriccion_vinculante: capacidad === null ? null : "pie",
        capacidad_status: extra.status || (capacidad === null ? "requires_info" : "ok"),
        capacidad_supuestos: supuestos,
      },
    },
  };
}

const proyecto = {
  id: "p-macul",
  nombre: "Altos de Macul",
  comuna: "Macul",
  tipo: "departamento",
  precio_min_uf: 2400,
  precio_max_uf: 3200,
  estado: "disponible",
};

describe("panel del ejecutivo — sin proyecto seleccionado", () => {
  // HU 21 / ALG-19 R9 reemplaza el pin de HU 2 ("mismas filas, mismo orden"): sin proyecto la
  // bandeja también se ordena por acción comercial. Las filas siguen sin evidencia ni grupos.
  it("devuelve las mismas filas, sin evidencia ni grupos, ordenadas por R9", () => {
    const detalle = (action) => ({ commercial_priority_detail: { action } });
    const leads = [
      { ...lead("c", 3000), result: { ...lead("c", 3000).result, ...detalle("Nutrir con plan de mejora") } },
      { ...lead("a", 1000), result: { ...lead("a", 1000).result, ...detalle("Contactar ahora") } },
      lead("b", null),
    ];
    const { ranked, descartados, requiereAntecedentes } = rankLeadsForProject(leads, null);

    expect(ranked.map((f) => f.lead.id)).toEqual(["a", "c", "b"]);
    expect(ranked.every((f) => f.match === null)).toBe(true);
    expect(descartados).toEqual([]);
    expect(requiereAntecedentes).toEqual([]);
  });

  it("prefiere la prioridad configurada del tenant sobre la guardada por el motor", () => {
    const leads = [
      { ...lead("motor"), result: { ...lead("motor").result, commercial_priority_detail: { action: "Contactar ahora" } } },
      {
        ...lead("tenant"),
        result: { ...lead("tenant").result, commercial_priority_detail: { action: "Nutrir con plan de mejora" } },
        commercial_priority_configured: { action_key: "contact_now", action: "Contactar ahora" },
        created_at: "2026-08-21T10:00:00.000Z",
      },
    ];
    expect(rankLeadsForProject(leads, null).ranked.map((f) => f.lead.id)).toEqual(["tenant", "motor"]);
  });

  it("sube dentro de su nivel al lead compatible con un proyecto prioritario", () => {
    // "holgado" tiene mejor afinidad (con Macul) pero con el proyecto premium solo es Cercano;
    // "premium" es Compatible con él. Marcarlo prioritario invierte el orden dentro del nivel (A7).
    const premium = { ...proyecto, id: "p-premium", nombre: "Premium", precio_min_uf: 3600, precio_max_uf: 4400 };
    const leads = [lead("holgado", 3840), lead("premium", 4600)];
    const opciones = (prioritarios) => ({ proyectos: [proyecto, premium], commercialConfig: { proyectos_prioritarios: prioritarios } });

    const sinPrioritarios = rankLeadsForProject(leads, null, "afinidad", opciones([])).ranked;
    expect(sinPrioritarios.map((f) => f.lead.id)).toEqual(["holgado", "premium"]);

    const conPremium = rankLeadsForProject(leads, null, "afinidad", opciones(["p-premium"])).ranked;
    expect(conPremium.map((f) => [f.lead.id, f.prioridad.prioritario_compatible])).toEqual([["premium", true], ["holgado", false]]);
  });

  it("ignora proyectos prioritarios agotados o que ya no existen", () => {
    const agotado = { ...proyecto, id: "p-agotado", estado: "agotado" };
    const { ranked } = rankLeadsForProject([lead("a", 3000)], null, "afinidad", {
      proyectos: [agotado], commercialConfig: { proyectos_prioritarios: ["p-agotado", "p-borrado"] },
    });
    expect(ranked[0].prioridad).toMatchObject({ prioritario_compatible: false, afinidad: null });
  });
});

describe("ALG-19 R9 — casos de ALG-19-ranking-cases.json", () => {
  it.each(rankingCases.cases.map((caso) => [caso.name, caso]))("%s", (_name, caso) => {
    const ordered = [...caso.rows].sort(compareCommercialPriority(caso.sortBy));
    expect(ordered.map((row) => row.id)).toEqual(caso.expect_order);
  });

  it("es un orden total: ninguna fila distinta compara igual (invariante 6)", () => {
    const rows = rankingCases.cases.flatMap((caso) => caso.rows.map((row) => ({ ...row, id: `${caso.name}-${row.id}` })));
    const compare = compareCommercialPriority("afinidad");
    for (const a of rows) {
      for (const b of rows) {
        if (a.id !== b.id) expect(compare(a, b)).not.toBe(0);
      }
    }
  });
});

describe("panel del ejecutivo — con proyecto seleccionado", () => {
  it("separa alcanzables, descartados y requieren antecedentes", () => {
    const leads = [lead("alcanza", 3800), lead("lejos", 800), lead("sin-datos", null)];
    const { ranked, descartados, requiereAntecedentes } = rankLeadsForProject(leads, proyecto);

    expect(ranked.map((f) => f.lead.id)).toEqual(["alcanza"]);
    expect(descartados.map((f) => f.match.motivo_exclusion)).toEqual(["capacidad_insuficiente"]);
    expect(requiereAntecedentes.map((f) => f.lead.id)).toEqual(["sin-datos"]);
  });

  it("ordena por afinidad y, en el orden alternativo, por capacidad", () => {
    const leads = [lead("holgado", 3840), lead("justo", 2500), lead("sobrecalzado", 9600)];

    // El sobrecalzado (-20) sigue por delante del que apenas pasa precio_min:
    // ese ancla mide alcance de inventario, no solvencia (ALG-10 R2.1).
    const porAfinidad = rankLeadsForProject(leads, proyecto, "afinidad").ranked;
    expect(porAfinidad.map((f) => f.lead.id)).toEqual(["holgado", "sobrecalzado", "justo"]);

    const porCapacidad = rankLeadsForProject(leads, proyecto, "capacidad").ranked;
    expect(porCapacidad.map((f) => f.lead.id)).toEqual(["sobrecalzado", "holgado", "justo"]);
  });

  it("no descarta leads por su clasificacion: E2 en el panel", () => {
    // El panel ya no filtra por "Alto" cuando hay proyecto seleccionado, porque
    // la afinidad pondera la clasificacion (ALG-10 R2). Estos tres alcanzan el
    // proyecto y los tres tienen que llegar a la lista.
    const leads = [
      lead("alto", 3000, { classification: "Alto" }),
      lead("medio", 3000, { classification: "Medio" }),
      lead("bajo", 3000, { classification: "Bajo" }),
    ];
    const { ranked } = rankLeadsForProject(leads, proyecto);

    expect(ranked.map((f) => f.lead.id).sort()).toEqual(["alto", "bajo", "medio"]);
    expect(ranked.map((f) => f.lead.id)).toEqual(["alto", "medio", "bajo"]);
  });

  it("es determinista ante empates", () => {
    const leads = [lead("b", 3000), lead("a", 3000)];
    expect(rankLeadsForProject(leads, proyecto).ranked.map((f) => f.lead.id)).toEqual(["a", "b"]);
  });
});
