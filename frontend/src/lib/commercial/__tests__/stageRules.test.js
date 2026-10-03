import { describe, expect, it } from "vitest";
import { allowedTargets, isTransitionAllowed, reasonRequired, stageLabel } from "../stageRules";

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

  it("labels a missing stage as new", () => {
    expect(stageLabel(undefined)).toBe("Nuevo");
    expect(stageLabel("en_plan_mejora")).toBe("En plan de mejora");
  });
});
