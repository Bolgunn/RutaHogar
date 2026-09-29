import { describe, expect, it } from "vitest";
import { subsidyCompatibility } from "../subsidyCompatibility";

const ds1TramoOne = { id: "ds1-tramo-1", benefitIdentifier: "DS1", tramo: "I" };
const ds1TramoTwo = { id: "ds1-tramo-2", benefitIdentifier: "DS1", tramo: "II" };

describe("subsidyCompatibility", () => {
  const evaluation = {
    result: {
      housing_benefits: {
        applicable_benefits: [{ type: "DS1", notes: "Tramo I", conditions_not_met: [] }],
      },
    },
  };
  const states = { DS1: { eligible: true, reasons: [] } };

  it("marks only the DS1 tramo detected for the profile as compatible", () => {
    expect(subsidyCompatibility(ds1TramoOne, evaluation, states).compatible).toBe(true);
    expect(subsidyCompatibility(ds1TramoTwo, evaluation, states)).toMatchObject({
      compatible: false,
      reasons: [expect.stringContaining("Tramo I")],
    });
  });

  it("shows the evaluated reasons for a benefit that is not applicable", () => {
    expect(subsidyCompatibility(ds1TramoOne, evaluation, {
      DS1: { eligible: false, reasons: ["No cumple el tramo de vulnerabilidad."] },
    })).toEqual({ compatible: false, reasons: ["No cumple el tramo de vulnerabilidad."] });
  });
});
