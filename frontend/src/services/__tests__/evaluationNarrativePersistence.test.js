import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), ensure: vi.fn(), tracking: vi.fn(), command: vi.fn(),
  append: vi.fn(), annotate: vi.fn(), read: vi.fn(),
  explain: vi.fn(),
}));
vi.mock("axios", () => ({ default: { post: mocks.explain } }));
vi.mock("../../utils/supabase", () => ({ supabase: {} }));
vi.mock("../profileService", () => ({ getAuthenticatedUser: mocks.user, ensureUserProfile: mocks.ensure, logSupabaseError: vi.fn() }));
vi.mock("../trackingService", () => ({
  getTracking: mocks.tracking, newTrackingCommand: mocks.command, appendTrackingEvent: mocks.append,
  annotateEvaluation: mocks.annotate, trackingRequest: mocks.read, getStaffEvaluations: vi.fn(),
}));
import { createEvaluation, getEvaluations } from "../evaluationService";

const saved = { id: "saved-evaluation", snapshot: { ingreso_mensual: 1500000 }, result: { score: 61, classification: "Medio" } };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.tracking.mockResolvedValue({ latest_event_id: null });
  mocks.command.mockReturnValue({ effective_at: "2026-11-05T12:00:00Z" });
  mocks.append.mockResolvedValue({ evaluation: saved });
  mocks.annotate.mockResolvedValue({});
  mocks.explain.mockResolvedValue({ data: { ...saved.result, ai_explanation: "Explicación automática del resultado guardado." } });
});

describe("new evaluation narrative persistence", () => {
  it("saves already generated AI text as an annotation and retains it on the next owner read", async () => {
    const narrative = { ai_explanation: "Tu ahorro fortalece tu perfil.", executive_summary: "Perfil intermedio.", commercial_guidance: "Revisar el objetivo." };
    const evaluation = await createEvaluation("owner", { input: saved.snapshot, result: { ...saved.result, ...narrative } });
    expect(mocks.annotate).toHaveBeenCalledWith(saved.id, "narrative", narrative);
    expect(evaluation.result).toMatchObject(narrative);
    expect(mocks.append).toHaveBeenCalledTimes(1);
    expect(mocks.explain).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({ items: [{ id: saved.id, user_id: "owner", financial_data: { input: saved.snapshot, result: saved.result }, annotations: [{ event_id: "annotation", recorded_at: "2026-11-05T12:00:01Z", kind: "narrative", payload: narrative }] }] });
    expect((await getEvaluations("owner", "usuario"))[0].result.ai_explanation).toBe(narrative.ai_explanation);
    expect(mocks.append).toHaveBeenCalledTimes(1);
  });
  it("automatically generates for the saved snapshot when its score differs from the preview", async () => {
    const evaluation = await createEvaluation("owner", { input: {}, result: { score: 999, classification: "Alto", ai_explanation: "Explicación generada." } });
    expect(evaluation.result.score).toBe(61);
    expect(evaluation.result.classification).toBe("Medio");
    expect(evaluation.result.ai_explanation).toBe("Explicación automática del resultado guardado.");
    expect(mocks.explain).toHaveBeenCalledWith(expect.stringContaining("/score/explain"), { ...saved.snapshot, scope: "all" }, { timeout: 45000 });
    expect(mocks.annotate).toHaveBeenCalledWith(saved.id, "narrative", { ai_explanation: "Explicación automática del resultado guardado." });
  });
  it("generates and persists the explanation automatically when score returns no AI text", async () => {
    const evaluation = await createEvaluation("owner", { input: saved.snapshot, result: saved.result });
    expect(evaluation.id).toBe(saved.id);
    expect(mocks.explain).toHaveBeenCalledTimes(1);
    expect(mocks.annotate).toHaveBeenCalledTimes(1);
    expect(evaluation.result.ai_explanation).toBe("Explicación automática del resultado guardado.");
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("keeps the saved score and stops after one automatic attempt if the provider fails", async () => {
    mocks.explain.mockRejectedValue(new Error("provider unavailable"));
    const evaluation = await createEvaluation("owner", { input: saved.snapshot, result: saved.result });
    expect(evaluation).toMatchObject({ id: saved.id, narrative_save_failed: true, result: saved.result });
    expect(mocks.explain).toHaveBeenCalledTimes(1);
    expect(mocks.annotate).not.toHaveBeenCalled();
    mocks.read.mockResolvedValue({ items: [{ id: saved.id, user_id: "owner", financial_data: { input: saved.snapshot, result: saved.result } }] });
    await getEvaluations("owner", "usuario");
    expect(mocks.explain).toHaveBeenCalledTimes(1);
  });
  it("does not store text generated for another score", async () => {
    mocks.explain.mockResolvedValue({ data: { score: 99, ai_explanation: "Texto de otra evaluación." } });
    const evaluation = await createEvaluation("owner", { input: {}, result: saved.result });
    expect(evaluation.narrative_save_failed).toBe(true);
    expect(mocks.annotate).not.toHaveBeenCalled();
  });
  it("reports a narrative failure without losing the committed evaluation or repeating its financial write", async () => {
    mocks.annotate.mockRejectedValue(new Error("offline"));
    const evaluation = await createEvaluation("owner", { input: {}, result: { ai_explanation: "Explicación generada." } });
    expect(evaluation).toMatchObject({ id: saved.id, narrative_save_failed: true, result: saved.result });
    expect(mocks.append).toHaveBeenCalledTimes(1);
  });
});
