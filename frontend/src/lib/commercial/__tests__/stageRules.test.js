import { describe, expect, it } from "vitest";
import { allowedTargets, isTransitionAllowed, PROJECT_ONLY_STAGES, reasonRequired, stageLabel } from "../stageRules";

describe("commercial stage rules", () => {
  it("rejects moving to the same stage or to an unknown one", () => {
    expect(isTransitionAllowed("contactado", "contactado", "ejecutivo")).toBe(false);
    expect(isTransitionAllowed("contactado", "firmado", "ejecutivo")).toBe(false);
  });

  it("lets forward moves skip stages without a reason", () => {
    expect(isTransitionAllowed("nuevo", "reserva", "ejecutivo")).toBe(true);
    expect(reasonRequired("nuevo", "reserva")).toBe(false);
    expect(reasonRequired("reserva", "venta_cerrada")).toBe(false);
  });

  it("requires a reason to move backwards", () => {
    expect(isTransitionAllowed("reserva", "contactado", "ejecutivo")).toBe(true);
    expect(reasonRequired("reserva", "contactado")).toBe(true);
  });

  it("requires a reason to mark a lead as lost", () => {
    expect(isTransitionAllowed("en_negociacion", "perdido", "ejecutivo")).toBe(true);
    expect(reasonRequired("en_negociacion", "perdido")).toBe(true);
  });

  it("reopens a lost lead with a reason, but never straight to a closed sale", () => {
    expect(isTransitionAllowed("perdido", "contactado", "ejecutivo")).toBe(true);
    expect(reasonRequired("perdido", "contactado")).toBe(true);
    expect(isTransitionAllowed("perdido", "venta_cerrada", "admin")).toBe(false);
  });

  it("lets only an admin undo a closed sale, and only to lost with a reason", () => {
    expect(isTransitionAllowed("venta_cerrada", "perdido", "ejecutivo")).toBe(false);
    expect(isTransitionAllowed("venta_cerrada", "perdido", "admin")).toBe(true);
    expect(isTransitionAllowed("venta_cerrada", "perdido", "admin_inmobiliario")).toBe(true);
    expect(isTransitionAllowed("venta_cerrada", "reserva", "admin")).toBe(false);
    expect(reasonRequired("venta_cerrada", "perdido")).toBe(true);
  });

  it("lists targets for the selector", () => {
    expect(allowedTargets("venta_cerrada", "ejecutivo")).toEqual([]);
    expect(allowedTargets("venta_cerrada", "admin").map((item) => item.value)).toEqual(["perdido"]);
    expect(allowedTargets("nuevo", "ejecutivo").map((item) => item.value)).not.toContain("nuevo");
  });

  it("keeps today's targets for a project record by default", () => {
    expect(allowedTargets("nuevo", "ejecutivo")).toEqual(allowedTargets("nuevo", "ejecutivo", { level: "proyecto" }));
    expect(allowedTargets("nuevo", "ejecutivo").map((item) => item.value)).toContain("reserva");
  });

  it("never offers negotiation, reservation or sale on the lead-level record", () => {
    const values = allowedTargets("contactado", "admin", { level: "lead" }).map((item) => item.value);
    for (const stage of PROJECT_ONLY_STAGES) expect(values).not.toContain(stage);
    expect(values).toEqual(["nuevo", "en_plan_mejora", "perdido"]);
  });

  it("drops lead-level lost once the lead has a project record", () => {
    const values = allowedTargets("contactado", "ejecutivo", { level: "lead", hasProjectRecords: true }).map((item) => item.value);
    expect(values).not.toContain("perdido");
    expect(values).toEqual(["nuevo", "en_plan_mejora"]);
  });

  it("offers revival while every project record is lost, never from lost", () => {
    const scope = { level: "lead", hasProjectRecords: true, allProjectRecordsPerdido: true };
    expect(allowedTargets("contactado", "ejecutivo", scope).map((item) => item.value)).toEqual(["contactado", "nuevo", "en_plan_mejora"]);
    expect(allowedTargets("perdido", "ejecutivo", scope).map((item) => item.value)).not.toContain("perdido");
  });

  it("requires a reason to revive (same stage)", () => {
    expect(reasonRequired("contactado", "contactado")).toBe(true);
  });

  it("labels a missing stage as new", () => {
    expect(stageLabel(undefined)).toBe("Nuevo");
    expect(stageLabel("en_plan_mejora")).toBe("En plan de mejora");
  });
});
