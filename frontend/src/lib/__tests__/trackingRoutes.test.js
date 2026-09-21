import { describe, expect, it } from "vitest";

import { resolveTrackingRoute, trackingPathForPage, trackingRoutePaths } from "../trackingRoutes";

describe("HU13 tracking routes", () => {
  it("recognizes direct navigation and reload of the progress URL", () => {
    expect(trackingRoutePaths).toContain("/plan-mejora/progreso");
    expect(resolveTrackingRoute("/plan-mejora/progreso")).toBe("progress");
    expect(resolveTrackingRoute("/plan-mejora/progreso/")).toBe("progress");
  });

  it("supports direct navigation and reverse navigation for the dedicated history", () => {
    expect(trackingRoutePaths).toContain("/plan-mejora/progreso/historial");
    expect(resolveTrackingRoute("/plan-mejora/progreso/historial")).toBe("progress-history");
    expect(resolveTrackingRoute("/plan-mejora/progreso/historial/")).toBe("progress-history");
    expect(trackingPathForPage("progress-history")).toBe("/plan-mejora/progreso/historial");
  });
});
