import { describe, expect, it } from "vitest";
import { subsidyCompatibility } from "../subsidyCompatibility";
import { SUBSIDY_DASHBOARD_ITEMS } from "../subsidyDashboardData";

const ds1TramoOne = { id: "ds1-tramo-1", benefitIdentifier: "DS1", tramo: "I" };
const ds1TramoTwo = { id: "ds1-tramo-2", benefitIdentifier: "DS1", tramo: "II" };

describe("subsidyCompatibility", () => {
  const evaluation = {
    result: {
      housing_benefits: {
        applicable_benefits: [{ type: "DS1", notes: "Tramo I", eligible: true, conditions_not_met: [] }],
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
    const ineligibleEvaluation = {
      result: {
        housing_benefits: {
          applicable_benefits: [{ type: "DS1", notes: "Tramo I", eligible: false, conditions_not_met: ["No cumple el tramo de vulnerabilidad."] }],
        },
      },
    };

    expect(subsidyCompatibility(ds1TramoOne, ineligibleEvaluation))
      .toEqual({ compatible: false, reasons: ["No cumple el tramo de vulnerabilidad."] });
  });

  it("uses the primary subsidy assessment for informational benefits", () => {
    const fogaes = { benefitIdentifier: "FOGAES" };
    const mainAssessment = {
      result: {
        housing_benefits: {
          applicable_benefits: [{ type: "FOGAES", eligible: true, conditions_not_met: [] }],
        },
      },
    };

    expect(subsidyCompatibility(fogaes, mainAssessment)).toEqual({ compatible: true, reasons: [] });
  });

  it("shows exactly the six benefits assessed on the primary subsidies page", () => {
    expect(SUBSIDY_DASHBOARD_ITEMS.map((item) => item.benefitIdentifier)).toEqual([
      "DS49", "LEY_21748", "FOGAES", "PADHI", "LEASING", "DS1",
    ]);
    expect(SUBSIDY_DASHBOARD_ITEMS.find((item) => item.benefitIdentifier === "LEY_21748")?.title)
      .toBe("Subsidio al Dividendo — Ley N.º 21.748");
  });
});
