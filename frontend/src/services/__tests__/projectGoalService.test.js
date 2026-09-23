import { describe, expect, it, vi } from "vitest";
import {
  projectGoalUserMessage,
  setProjectGoal,
} from "../projectGoalService";

const historicalInput = {
  ingreso_mensual: 2_500_000,
  deuda_mensual: 200_000,
  edad: 35,
  ahorro_disponible: 30_000_000,
  plazo_credito_hipotecario: 25,
  tipo_contrato: "indefinido",
  continuidad_laboral: "mas_3_anios",
  morosidad_actual: "no",
  dividendo_estimado: 500_000,
  dividendo_esperado: 500_000,
  dividendo_estimado_origen: "manual",
  dividendo_estimado_manual: 500_000,
  property_value_uf: 2000,
  property_value_clp: 81_390_000,
  uf_value_clp: 40_695,
  dividendo_tasa_anual_referencial: 0.049,
};

const project = {
  id: "project-1",
  nombre: "Parque Central",
  precio_min_uf: 5000,
  precio_max_uf: 6200,
  estado: "en_construccion",
};

const marketSnapshot = {
  uf_value_clp: 40_999.93,
  tasa_anual_uf: 0.0404,
  ltv_referencial: 0.7952,
  plazo_referencial_anios: 25.4475,
  effective_date: "2026-09-23",
  fetched_at: "2026-09-23T16:29:11Z",
};

const scoreResult = {
  score: 74,
  classification: "Medio",
  financial_indicators: {
    capacidad_supuestos: { market_snapshot: marketSnapshot },
  },
};

describe("setProjectGoal with SCORING-BCCH", () => {
  it("repone consentimiento vigente, usa objetivo UF y persiste el snapshot del backend", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      const payload = JSON.parse(options.body);
      expect(payload.consentimiento).toBe(true);
      expect(payload.property_value_uf).toBe(5000);
      expect(payload).not.toHaveProperty("property_value_clp");
      expect(payload).not.toHaveProperty("uf_value_clp");
      expect(payload).not.toHaveProperty("dividendo_tasa_anual_referencial");
      return { ok: true, status: 200, json: async () => scoreResult };
    });
    const createEvaluationImpl = vi.fn(async (_userId, evaluation) => ({
      id: "evaluation-1",
      ...evaluation,
    }));

    const saved = await setProjectGoal({
      apiBase: "http://127.0.0.1:8000/",
      consentGranted: true,
      currentEvaluation: { input: historicalInput },
      onboarding: { comuna_interes: "Santiago" },
      profile: { id: "user-1", email: "test@example.com" },
      project,
      fetchImpl,
      createEvaluationImpl,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(createEvaluationImpl).toHaveBeenCalledOnce();
    const persisted = createEvaluationImpl.mock.calls[0][1];
    expect(persisted.channel).toBe("web");
    expect(persisted.input.project_goal.id).toBe("project-1");
    expect(persisted.result.financial_indicators.capacidad_supuestos.market_snapshot)
      .toEqual(marketSnapshot);
    expect(saved.id).toBe("evaluation-1");
  });

  it("no inventa consentimiento cuando ni la evaluación ni el perfil lo tienen", async () => {
    const fetchImpl = vi.fn();

    await expect(setProjectGoal({
      apiBase: "http://127.0.0.1:8000",
      consentGranted: false,
      currentEvaluation: { input: historicalInput },
      profile: { id: "user-1" },
      project,
      fetchImpl,
    })).rejects.toMatchObject({ stage: "payload" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("expone en desarrollo la causa 422 sin mostrarla al usuario", async () => {
    const createEvaluationImpl = vi.fn();
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ loc: ["body", "consentimiento"], msg: "Field required", type: "missing" }],
      }),
    }));

    let error;
    try {
      await setProjectGoal({
        apiBase: "http://127.0.0.1:8000",
        consentGranted: true,
        currentEvaluation: { input: historicalInput },
        profile: { id: "user-1" },
        project,
        fetchImpl,
        createEvaluationImpl,
      });
    } catch (cause) {
      error = cause;
    }

    expect(error).toMatchObject({
      stage: "score_request",
      status: 422,
      detail: "body.consentimiento: Field required",
    });
    expect(projectGoalUserMessage(error)).toBe(
      "No pudimos recalcular tu plan para este proyecto. Revisa tu precalificación e intenta nuevamente.",
    );
    expect(projectGoalUserMessage(error)).not.toContain("Field required");
    expect(createEvaluationImpl).not.toHaveBeenCalled();
  });

  it("distingue un fallo posterior de persistencia", async () => {
    const persistenceCause = new Error("database rejected row");

    await expect(setProjectGoal({
      apiBase: "http://127.0.0.1:8000",
      consentGranted: true,
      currentEvaluation: { input: historicalInput },
      profile: { id: "user-1" },
      project,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => scoreResult }),
      createEvaluationImpl: async () => { throw persistenceCause; },
    })).rejects.toMatchObject({ stage: "persistence", cause: persistenceCause });
  });
});
