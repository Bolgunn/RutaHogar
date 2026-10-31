import { describe, expect, it, vi } from "vitest";
import { createOwnerResultSession } from "../ownerResultSession";
import { normalizeEvaluation } from "../evaluationService";
import { currentTrackingEvaluation } from "../../lib/tracking/currentEvaluation";

const row = (changes = {}) => ({ id: "e1", user_id: "owner", result: { score: 60 }, co_debtor: { version: "hu30-projection-v1", update_required: true }, ...changes });
const bundle = (evaluation = row()) => ({ tracking: { status: "active", current_evaluation_id: evaluation.id }, evaluations: [evaluation] });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function setup(options = {}) {
  const read = vi.fn().mockResolvedValue(bundle());
  const incorporate = vi.fn().mockResolvedValue({ evaluation: { result: { score: 70 } } });
  const onChange = vi.fn();
  return { read, incorporate, onChange, session: createOwnerResultSession({ ownerId: "owner", read, incorporate, onChange, ...options }) };
}

describe("HU30 normalized projection", () => {
  it("copies only the server projection, never reconstructs it from a raw summary", () => {
    const server = { version: "hu30-projection-v1", visibility: "hidden", evaluation_type: "bipersonal_confirmed", capacity: null };
    const normalized = normalizeEvaluation({ co_debtor: server, financial_data: { result: { bipersonal_summary: { secret: 123 } } } });
    expect(normalized.co_debtor).toEqual(server);
    expect(normalized.co_debtor).not.toBe(server);
    expect(normalizeEvaluation({ financial_data: { result: { bipersonal_summary: server } } }).co_debtor).toBeNull();
  });
  it("preserves the projection in the tracking fallback", () => {
    const projection = { version: "hu30-projection-v1", update_required: true };
    expect(currentTrackingEvaluation({ status: "active", current_evaluation_id: "e1", current_evaluation: { score: 60 }, co_debtor: projection }, [], "owner").co_debtor).toBe(projection);
  });
  it("rejects rows or tracking explicitly belonging to another owner", () => {
    expect(currentTrackingEvaluation(null, [row({ user_id: "other" })], "owner")).toBeNull();
    expect(currentTrackingEvaluation({ status: "active", baseline: { user_id: "other" }, current_evaluation: {} }, [], "owner")).toBeNull();
  });
});

describe("HU30 explicit incorporation and privacy lifecycle", () => {
  it("reads current authority without triggering a financial update", async () => {
    const { session, incorporate } = setup(); await session.refresh();
    expect(session.getState().evaluation).toEqual(row());
    expect(incorporate).not.toHaveBeenCalled();
  });
  it.each([70, 55, 60])("compares real persisted evaluations after incorporation with score %s", async (score) => {
    const { session, read, incorporate } = setup(); await session.refresh();
    incorporate.mockResolvedValue({ evaluation: { result: { score: 999 } } });
    const after = row({ id: "e2", result: { score }, co_debtor: { update_required: false, evaluation_type: "bipersonal_confirmed" } });
    read.mockResolvedValue({ ...bundle(after), evaluations: [after, row()] });
    await session.update();
    expect(session.getState()).toMatchObject({ updating: false, evaluation: { id: "e2" } });
    expect(session.getState().scoreChange).toEqual({ previousId: "e1", evaluationId: "e2", previousScore: 60, score });
    await session.refresh();
    expect(session.getState().scoreChange?.score).toBe(score);
    expect(incorporate).toHaveBeenCalledTimes(1);
  });
  it("does not infer comparison scores from a write response or a tracking fallback", async () => {
    const { session, read } = setup(); await session.refresh();
    read.mockResolvedValue({ tracking: { status: "active", current_evaluation_id: "e2", current_evaluation: { score: 99 } }, evaluations: [] });
    await session.update();
    expect(session.getState().scoreChange).toBeNull();
  });
  it("does not attribute an unrelated concurrent evaluation to the incorporation", async () => {
    const { session, read, incorporate } = setup(); await session.refresh();
    incorporate.mockResolvedValue({ evaluation_ids: ["incorporated"] });
    const other = row({ id: "other", result: { score: 75 }, co_debtor: { evaluation_type: "bipersonal_confirmed" } });
    read.mockResolvedValue({ ...bundle(other), evaluations: [other, row()] });
    await session.update();
    expect(session.getState().scoreChange).toBeNull();
  });
  it("locks double clicks and retry while a write is pending", async () => {
    const pending = deferred(); const incorporate = vi.fn(() => pending.promise); const { session } = setup({ incorporate });
    await session.refresh(); const first = session.update(); const second = session.update();
    expect(first).toBe(second);
    pending.resolve({ evaluation: { result: { score: 60 } } }); await first;
    expect(session.getState().updating).toBe(false);
    expect(incorporate).toHaveBeenCalledTimes(1);
  });
  it.each([{ update_required: false }, { update_required: true, matching_confirmed_later: true }])("does not update when no financial changes are pending", async (flags) => {
    const { session, incorporate } = setup({ read: vi.fn().mockResolvedValue(bundle(row({ co_debtor: flags }))) });
    await session.refresh(); await session.update(); expect(incorporate).not.toHaveBeenCalled();
  });
  it("refreshes state after an error and never automatically retries the write", async () => {
    const { session, read, incorporate } = setup(); await session.refresh();
    incorporate.mockRejectedValue(new Error("El consentimiento fue revocado."));
    read.mockResolvedValue(bundle(row({ co_debtor: { visibility: "hidden", update_required: false } })));
    await session.update();
    expect(session.getState()).toMatchObject({ error: "El consentimiento fue revocado.", evaluation: { co_debtor: { visibility: "hidden" } }, updating: false });
    expect(incorporate).toHaveBeenCalledTimes(1);
  });
  it("removes previous financial data during refresh and keeps it absent after read failure", async () => {
    const { session, read } = setup(); await session.refresh();
    read.mockRejectedValue(new Error("offline"));
    const pending = session.refresh();
    expect(session.getState()).toMatchObject({ evaluation: null, loading: true });
    await pending;
    expect(session.getState()).toMatchObject({ evaluation: null, loading: false });
    expect(session.getState().error).toContain("Reintenta");
    expect(session.getState().scoreChange).toBeNull();
  });
  it("acknowledges a committed evaluation even if refreshing fails", async () => {
    const { session, read } = setup(); await session.refresh(); read.mockRejectedValue(new Error("offline"));
    await session.update();
    expect(session.getState().message).toContain("incorporados");
    expect(session.getState().evaluation).toBeNull();
    expect(session.getState().error).toContain("Reintenta");
  });
  it("supersedes a pre-cutoff read so late visible data cannot replace redaction", async () => {
    const pending = deferred(); const { session, read } = setup(); await session.refresh();
    read.mockImplementationOnce(() => pending.promise).mockResolvedValueOnce(bundle(row({ co_debtor: { visibility: "hidden" } })));
    const oldRead = session.refresh(); await Promise.resolve();
    await session.refresh({ force: true });
    pending.resolve(bundle(row({ co_debtor: { visibility: "visible", income: 9999999 } }))); await oldRead;
    expect(session.getState().evaluation.co_debtor).toEqual({ visibility: "hidden" });
  });
  it("ignores a late read after changing account/unmounting", async () => {
    const pending = deferred(); const { session, onChange } = setup({ read: () => pending.promise });
    const read = session.refresh(); session.dispose(); onChange.mockClear(); pending.resolve(bundle()); await read;
    expect(onChange).not.toHaveBeenCalled();
    expect(session.getState().evaluation).toBeNull();
  });
  it("does not dispatch a queued write after immediate unmount/account change", async () => {
    const { session, incorporate } = setup(); await session.refresh();
    const update = session.update(); session.dispose(); await update;
    expect(incorporate).not.toHaveBeenCalled();
  });
  it("does not refresh the new account after an old account's write completes", async () => {
    const pending = deferred(); const read = vi.fn().mockResolvedValue(bundle());
    const { session } = setup({ read, incorporate: () => pending.promise });
    await session.refresh(); const update = session.update(); await Promise.resolve(); session.dispose();
    pending.resolve({}); await update; expect(read).toHaveBeenCalledTimes(1);
  });
});
