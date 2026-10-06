import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  annotateEvaluation: vi.fn(),
  ensureUserProfile: vi.fn(),
  from: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  getStaffEvaluations: vi.fn(),
  logSupabaseError: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../../utils/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}));

vi.mock("../profileService", () => ({
  ensureUserProfile: mocks.ensureUserProfile,
  getAuthenticatedUser: mocks.getAuthenticatedUser,
  logSupabaseError: mocks.logSupabaseError,
}));

vi.mock("../trackingService", () => ({
  annotateEvaluation: mocks.annotateEvaluation,
  appendTrackingEvent: vi.fn(),
  getStaffEvaluations: mocks.getStaffEvaluations,
  getTracking: vi.fn(),
  newTrackingCommand: vi.fn(),
}));

import {
  acceptEvaluationPlan,
  applyAcceptedPlanEvent,
  getEvaluations,
} from "../evaluationService";

const evaluation = {
  id: "evaluation-1",
  user_id: "user-1",
  financial_data: { result: { score: 60, classification: "Medio" } },
  housing_plan: { progress: { saved: 1 } },
};

const acceptedEvent = {
  event_id: "event-1",
  evaluation_id: "evaluation-1",
  kind: "plan_accepted",
  effective_at: "2026-09-27T12:00:00Z",
  recorded_at: "2026-09-27T12:00:01Z",
  payload: { plan_type: "acelerado" },
};

function query(data, error = null) {
  const result = { data, error };
  for (const method of ["select", "order", "eq", "in"]) {
    result[method] = vi.fn(() => result);
  }
  return result;
}

function setReadResult({ rows = [evaluation], annotations = [acceptedEvent], error = null } = {}) {
  const evaluationsQuery = query(rows, error);
  const annotationsQuery = query(annotations);
  mocks.from.mockImplementation((table) => (
    table === "evaluations" ? evaluationsQuery : annotationsQuery
  ));
}

describe("HU13 — aceptación del plan", () => {
  beforeEach(() => {
    mocks.annotateEvaluation.mockReset();
    mocks.ensureUserProfile.mockReset();
    mocks.from.mockReset();
    mocks.getAuthenticatedUser.mockReset();
    mocks.getStaffEvaluations.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "user-1" });
    mocks.ensureUserProfile.mockResolvedValue();
  });

  it("confirma éxito cuando se escribe plan_accepted y la lectura posterior funciona", async () => {
    mocks.annotateEvaluation.mockResolvedValue(acceptedEvent);
    setReadResult();

    const acceptance = await acceptEvaluationPlan("evaluation-1", "user-1", { plan_type: "acelerado" });

    expect(mocks.annotateEvaluation).toHaveBeenCalledWith(
      "evaluation-1",
      "plan_accepted",
      { plan_type: "acelerado" },
    );
    expect(acceptance.refreshError).toBeNull();
    expect(acceptance.evaluation).toEqual(expect.objectContaining({
      plan_accepted_at: "2026-09-27T12:00:00Z",
      plan_type: "acelerado",
    }));
  });

  it("conserva el éxito persistido si falla la lectura posterior", async () => {
    const readError = new Error("lectura temporalmente no disponible");
    mocks.annotateEvaluation.mockResolvedValue(acceptedEvent);
    setReadResult({ error: readError });

    const acceptance = await acceptEvaluationPlan("evaluation-1", "user-1", { plan_type: "acelerado" });
    const projected = applyAcceptedPlanEvent(evaluation, acceptance.event);

    expect(acceptance.evaluation).toBeNull();
    expect(acceptance.refreshError).toBe(readError);
    expect(projected).toEqual(expect.objectContaining({
      plan_accepted_at: "2026-09-27T12:00:00Z",
      plan_type: "acelerado",
    }));
    expect(projected.housing_plan).toEqual({ progress: { saved: 1 }, plan_type: "acelerado" });
  });

  it("propaga el error real si la escritura principal falla", async () => {
    const writeError = new Error("no se pudo insertar plan_accepted");
    mocks.annotateEvaluation.mockRejectedValue(writeError);

    await expect(acceptEvaluationPlan("evaluation-1", "user-1", { plan_type: "acelerado" }))
      .rejects.toBe(writeError);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reconstruye el plan aceptado al volver a cargar las evaluaciones", async () => {
    setReadResult();

    const evaluations = await getEvaluations("user-1", "usuario");

    expect(evaluations).toHaveLength(1);
    expect(evaluations[0]).toEqual(expect.objectContaining({
      plan_accepted_at: "2026-09-27T12:00:00Z",
      plan_type: "acelerado",
    }));
  });

  it("uses the server-side staff projection instead of selecting raw evaluations", async () => {
    mocks.getStaffEvaluations.mockResolvedValue({
      items: [{ ...evaluation, full_name: "Lead en scope", phone: "+56912345678" }],
    });
    mocks.rpc.mockResolvedValue({
      data: [{ id: "user-1", full_name: "Lead en scope", phone: "+56912345678", reliability_status: "en_revision" }],
      error: null,
    });

    const evaluations = await getEvaluations("executive-1", "ejecutivo");

    expect(evaluations[0]).toEqual(expect.objectContaining({
      full_name: "Lead en scope",
      phone: "+56912345678",
      reliability_status: "en_revision",
    }));
    expect(mocks.getStaffEvaluations).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("list_lead_contacts", { p_user_ids: ["user-1"] });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
