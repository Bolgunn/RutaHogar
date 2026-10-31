import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ slots: [], cursor: 0, queued: [] }));
vi.mock("react", () => ({
  useState(initial) {
    const index = hooks.cursor++;
    hooks.slots[index] ??= { value: initial };
    return [hooks.slots[index].value, (value) => { hooks.slots[index].value = value; }];
  },
  useRef(initial) {
    const index = hooks.cursor++;
    hooks.slots[index] ??= { current: initial };
    return hooks.slots[index];
  },
  useEffect(callback, deps) {
    const index = hooks.cursor++;
    const prior = hooks.slots[index];
    if (!prior || deps.some((value, i) => value !== prior.deps[i])) {
      hooks.queued.push(() => { prior?.cleanup?.(); hooks.slots[index] = { deps, cleanup: callback() }; });
    }
  },
}));
vi.mock("../services/trackingService", () => ({ getTracking: vi.fn(), updateScoreWithConfirmedCoDebtor: vi.fn() }));
vi.mock("../services/evaluationService", () => ({ getEvaluations: vi.fn() }));
import useOwnerResult from "./useOwnerResult";
import { updateScoreWithConfirmedCoDebtor } from "../services/trackingService";

let events;
const deadline = "2026-10-22T12:00:01Z";
function row(projection = {}) { return { id: "e1", user_id: "owner", co_debtor: { version: "hu30-projection-v1", visibility: "visible", historical_visible_until: deadline, ...projection } }; }
function bundle(evaluation = row()) { return { tracking: { status: "active", current_evaluation_id: evaluation.id }, evaluations: [evaluation] }; }
function render(props) {
  hooks.cursor = 0;
  const result = useOwnerResult(props);
  while (hooks.queued.length) hooks.queued.shift()();
  return result;
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function cleanup() { hooks.slots.forEach((slot) => slot?.cleanup?.()); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  hooks.slots = []; hooks.queued = []; events = new Map();
  vi.stubGlobal("window", { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name), setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("HU30 open result authority refresh", () => {
  it("re-reads at the server deadline, immediately removes old data and consumes redaction", async () => {
    let resolve;
    const read = vi.fn().mockResolvedValueOnce(bundle()).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const props = { ownerId: "owner", evaluation: row(), onRefreshEvaluation: read };
    render(props); await flush();
    expect(render(props).evaluation.co_debtor.visibility).toBe("visible");
    await vi.advanceTimersByTimeAsync(1000);
    expect(render(props)).toMatchObject({ loading: true, evaluation: null });
    resolve(bundle(row({ visibility: "hidden", capacity: null })));
    await flush(); expect(render(props).evaluation.co_debtor.visibility).toBe("hidden");
    expect(read).toHaveBeenCalledTimes(2);
    expect(updateScoreWithConfirmedCoDebtor).not.toHaveBeenCalled();
  });
  it("keeps the deadline timer during a slow focus read and forces a post-cutoff read", async () => {
    let resolve;
    const read = vi.fn().mockResolvedValueOnce(bundle()).mockImplementationOnce(() => new Promise((done) => { resolve = done; })).mockResolvedValueOnce(bundle(row({ visibility: "hidden" })));
    const props = { ownerId: "owner", evaluation: row(), onRefreshEvaluation: read };
    render(props); await flush(); render(props);
    events.get("focus")(); await flush(); render(props);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(read).toHaveBeenCalledTimes(3);
    expect(render(props).evaluation.co_debtor.visibility).toBe("hidden");
    resolve(bundle()); await flush();
    expect(render(props).evaluation.co_debtor.visibility).toBe("hidden");
  });
  it("keeps stale data absent when the cutoff refresh fails", async () => {
    const read = vi.fn().mockResolvedValueOnce(bundle()).mockRejectedValueOnce(new Error("offline"));
    const props = { ownerId: "owner", evaluation: row(), onRefreshEvaluation: read };
    render(props); await flush(); render(props);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(render(props)).toMatchObject({ evaluation: null, loading: false });
    expect(render(props).error).toContain("Reintenta");
  });
  it("revalidates on focus without recalculating", async () => {
    const read = vi.fn().mockResolvedValue(bundle(row({ historical_visible_until: null })));
    const props = { ownerId: "owner", evaluation: row(), onRefreshEvaluation: read };
    render(props); await flush(); render(props);
    events.get("focus")(); await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(updateScoreWithConfirmedCoDebtor).not.toHaveBeenCalled();
  });
  it("refreshes periodically and removes all timers and listeners on unmount", async () => {
    const read = vi.fn().mockResolvedValue(bundle(row({ historical_visible_until: null })));
    const props = { ownerId: "owner", evaluation: row(), onRefreshEvaluation: read };
    render(props); await flush(); render(props);
    await vi.advanceTimersByTimeAsync(60000);
    expect(read).toHaveBeenCalledTimes(2);
    cleanup(); expect(events.has("focus")).toBe(false);
    expect(events.has("visibilitychange")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reads current participation when returning to a visible tab without incorporating", async () => {
    const read = vi.fn().mockResolvedValue(bundle(row({ historical_visible_until: null })));
    const props = { ownerId: "owner", evaluation: row(), onRefreshEvaluation: read };
    render(props); await flush(); render(props);
    document.visibilityState = "hidden"; events.get("visibilitychange")(); await flush();
    expect(read).toHaveBeenCalledTimes(1);
    document.visibilityState = "visible"; events.get("visibilitychange")(); await flush();
    expect(read).toHaveBeenCalledTimes(2);
    expect(updateScoreWithConfirmedCoDebtor).not.toHaveBeenCalled();
  });
  it("does not call tracking for an unsaved/local preview", async () => {
    const read = vi.fn(); expect(render({ evaluation: { result: { score: 50 } }, onRefreshEvaluation: read }).enabled).toBe(false);
    await flush(); expect(read).not.toHaveBeenCalled();
  });
  it("never renders the prior account's result or score comparison while switching owners", async () => {
    const read = vi.fn().mockResolvedValue(bundle(row({ historical_visible_until: null })));
    render({ ownerId: "owner", evaluation: row(), onRefreshEvaluation: read }); await flush();
    expect(render({ ownerId: "owner", evaluation: row(), onRefreshEvaluation: read }).evaluation.id).toBe("e1");
    const next = render({ ownerId: "other", evaluation: { id: "other-eval" }, onRefreshEvaluation: () => new Promise(() => {}) });
    expect(next.evaluation).toBeUndefined();
    expect(next.scoreChange).toBeUndefined();
    expect(next.loading).toBe(true);
  });
});
