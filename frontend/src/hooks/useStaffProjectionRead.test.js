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
import useStaffProjectionRead from "./useStaffProjectionRead";
let events;
const deadline = "2026-10-22T12:00:01Z";
function row(extra = {}) { return { version: "hu30-projection-v1", visibility: "visible", historical_visible_until: deadline, ...extra }; }
function params(load, scopeKey = "staff:lead-a") { return { scopeKey, load, projections: (data) => [data.co_debtor] }; }
function render(props) {
  hooks.cursor = 0;
  const result = useStaffProjectionRead(props);
  while (hooks.queued.length) hooks.queued.shift()();
  return result;
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function cleanup() { hooks.slots.forEach((slot) => slot?.cleanup?.()); }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
  hooks.slots = []; hooks.queued = []; events = new Map();
  vi.stubGlobal("window", { addEventListener: (name, fn) => events.set(name, fn), removeEventListener: (name) => events.delete(name), setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("HU30 staff authorized read lifecycle", () => {
  it("loads the authorized response and keeps the timer active during a background read", async () => {
    let finish;
    const load = vi.fn().mockResolvedValueOnce({ co_debtor: row(), name: "A" })
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce({ co_debtor: row({ visibility: "hidden" }), name: "A" });
    const props = params(load); render(props); await flush(); render(props);
    events.get("focus")(); await flush();
    expect(render(props).data.co_debtor.visibility).toBe("visible");
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(load).toHaveBeenCalledTimes(3);
    expect(render(props).data.co_debtor.visibility).toBe("hidden");
    finish({ co_debtor: row(), name: "A stale" }); await flush();
    expect(render(props).data.name).toBe("A");
    expect(render(props).data.co_debtor.visibility).toBe("hidden");
  });
  it("conceals at cutoff, including while the replacement read is still pending", async () => {
    let finish;
    const load = vi.fn().mockResolvedValueOnce({ co_debtor: row() }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const props = params(load); render(props); await flush(); render(props);
    await vi.advanceTimersByTimeAsync(1000);
    expect(render(props)).toMatchObject({ data: null, loading: true });
    finish({ co_debtor: row({ visibility: "hidden" }) }); await flush();
    expect(render(props).data.co_debtor.visibility).toBe("hidden");
  });
  it("never preserves old data on a failed cutoff refresh", async () => {
    const load = vi.fn().mockResolvedValueOnce({ co_debtor: row() }).mockRejectedValueOnce(new Error("offline"));
    const props = params(load); render(props); await flush(); render(props);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(render(props)).toMatchObject({ data: null, loading: false });
    expect(render(props).error).toContain("Reintenta");
  });
  it("switches lead/account scope without rendering previous data and ignores late responses", async () => {
    let finish;
    const old = params(() => new Promise((resolve) => { finish = resolve; }));
    render(old); await flush();
    const next = params(vi.fn().mockResolvedValue({ co_debtor: row({ historical_visible_until: null }), name: "B" }), "other-staff:lead-b");
    expect(render(next).data).toBeNull(); await flush();
    expect(render(next).data.name).toBe("B");
    finish({ name: "A secret", co_debtor: row() }); await flush();
    expect(render(next).data.name).toBe("B");
  });
  it("revalidates every 30 seconds and cleans listeners/timers on close", async () => {
    const load = vi.fn().mockResolvedValue({ co_debtor: row({ historical_visible_until: null }) });
    const props = params(load); render(props); await flush(); render(props);
    await vi.advanceTimersByTimeAsync(30000); expect(load).toHaveBeenCalledTimes(2);
    cleanup(); expect(events.has("focus")).toBe(false); expect(vi.getTimerCount()).toBe(0);
  });
});
