import { describe, expect, it } from "vitest";
import cases from "../../../../../docs/algorithms/ALG-19-cases.json";
import { computeFunnelMetrics } from "../funnelMetrics";
import { PRIORITY_ACTIONS } from "../priorityActions";
import { explainCommercialPriority, normalizeCriterios, withConfiguredPriority } from "../configuredPriority";

describe("ALG-19 R0–R8 — los mismos casos que backend/tests/test_alg19_cases.py", () => {
  it.each(cases.cases.map((item) => [item.name, item]))("%s", (_name, item) => {
    const { classification, project_fit, blockers, score, data, criterios } = item.input;
    const result = explainCommercialPriority(classification, project_fit, blockers, score, data, criterios);
    for (const [key, expected] of Object.entries(item.expect)) expect(result[key], key).toEqual(expected);
    expect(result.action).toBe(PRIORITY_ACTIONS[result.action_key]);
  });

  it("completes a partial configuration with the defaults and sorts its sets", () => {
    const criterios = normalizeCriterios({ contactar_ahora: { clasificaciones: ["Medio", "Alto"] }, subir_con_senales: 1 });
    expect(criterios.contactar_ahora).toEqual({ clasificaciones: ["Alto", "Medio"], compatibilidades: ["Compatible"] });
    expect(criterios.senales.plazos).toEqual(["3_a_6_meses", "inmediato"]);
    expect(criterios.subir_con_senales).toBe(1);
  });
});

describe("HU 15 recibe la prioridad configurada del tenant", () => {
  const now = "2026-10-30T12:00:00Z";
  const project = { id: "p1", nombre: "A", comuna: "Macul", tipo: "casa", precio_min_uf: 1000, precio_max_uf: 2000, estado: "disponible" };
  const medio = { input: { plazo_compra: "inmediato" }, onboarding: {}, result: {
    score: 60, classification: "Medio", blockers: [], project_fit: { classification: "Compatible", status: "compatible" },
    commercial_priority_detail: { action_key: "contact_with_review" } } };
  const fact = { lead_id: "1", first_evaluation_at: now, evaluacion_actual: medio, evaluaciones: [], proyectos: [project.id],
    postulaciones: [], stage_events: [], plan: null, favoritos: [], progress_update_ats: [], confirmed_goal_ats: [] };
  const controls = { filtros: { proyecto_id: null, afinidad: [], capacidad: [], prioridad: [] }, granularidad: "mes" };
  const leadsWith = (facts, key) => computeFunnelMetrics({ now, proyectos: [project], facts, ...controls })
    .desglose.prioridad.find((row) => row.clave === key)?.leads ?? 0;

  it("uses the tenant's criteria instead of the stored engine priority", () => {
    const config = { version: 3, alg_version: "hu21-commercial-priority-v1", criterios: { subir_con_senales: 1 } };
    const facts = withConfiguredPriority([fact], config);
    expect(facts[0].evaluacion_actual.commercial_priority_configured).toMatchObject({ action_key: "contact_now", promoted: true, config_version: 3 });
    expect(leadsWith(facts, "contact_now")).toBe(1);
    expect(leadsWith([fact], "contact_with_review")).toBe(1);
  });

  it("keeps facts untouched without a saved configuration or with a hidden snapshot", () => {
    expect(withConfiguredPriority([fact], null)).toEqual([fact]);
    const hidden = { ...fact, evaluacion_actual: { input: {}, onboarding: {}, result: {}, co_debtor_visibility: "hidden" } };
    expect(withConfiguredPriority([hidden], { version: 1, criterios: {} })).toEqual([hidden]);
  });

  it("reads purchase signals from onboarding when the snapshot predates them", () => {
    const legacy = { ...fact, evaluacion_actual: { ...medio, input: {}, onboarding: { plazo_compra: "0_3_meses" } } };
    const [configured] = withConfiguredPriority([legacy], { version: 1, criterios: { subir_con_senales: 1 } });
    expect(configured.evaluacion_actual.commercial_priority_configured.action_key).toBe("contact_now");
  });
});
