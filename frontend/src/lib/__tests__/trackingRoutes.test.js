import { describe, expect, it } from "vitest";

import { resolveTrackingRoute, trackingRoutePaths } from "../trackingRoutes";

describe("HU13 tracking routes", () => {
  it("recognizes direct navigation and reload of the progress URL", () => {
    expect(trackingRoutePaths).toContain("/plan-mejora/progreso");
    expect(resolveTrackingRoute("/plan-mejora/progreso")).toBe("progress");
    expect(resolveTrackingRoute("/plan-mejora/progreso/")).toBe("progress");
  });
});
