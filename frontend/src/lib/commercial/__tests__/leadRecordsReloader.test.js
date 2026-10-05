import { describe, expect, it, vi } from "vitest";
import { createLeadRecordsReloader } from "../leadRecordsReloader";

const reserva = [{ proyecto_id: "p1", stage: "reserva", at: "2026-10-05T10:00:00Z", por_sistema: false }];
const venta = [{ proyecto_id: "p1", stage: "venta_cerrada", at: "2026-10-05T10:01:00Z", por_sistema: false }];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("createLeadRecordsReloader", () => {
  it("applies the reloaded records of the lead", async () => {
    const apply = vi.fn();
    await createLeadRecordsReloader(async () => ({ "lead-1": reserva }), apply)("lead-1");
    expect(apply).toHaveBeenCalledWith("lead-1", reserva);
  });

  it("keeps the current records when the reload fails (getCommercialRecords returns {})", async () => {
    const apply = vi.fn();
    await createLeadRecordsReloader(async () => ({}), apply)("lead-1");
    expect(apply).not.toHaveBeenCalled();
  });

  it("ignores an older reload that resolves after a newer one", async () => {
    const first = deferred();
    const second = deferred();
    const pending = [first, second];
    const apply = vi.fn();
    const reload = createLeadRecordsReloader(() => pending.shift().promise, apply);

    const older = reload("lead-1");
    const newer = reload("lead-1");
    second.resolve({ "lead-1": venta });
    await newer;
    first.resolve({ "lead-1": reserva });
    await older;

    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("lead-1", venta);
  });

  it("orders reloads per lead, not across leads", async () => {
    const apply = vi.fn();
    const reload = createLeadRecordsReloader(async (leadId) => ({ [leadId]: reserva }), apply);
    await Promise.all([reload("lead-1"), reload("lead-2")]);
    expect(apply).toHaveBeenCalledWith("lead-1", reserva);
    expect(apply).toHaveBeenCalledWith("lead-2", reserva);
  });
});
