import { describe, expect, it, vi } from "vitest";

import { scrollToScoreSummary } from "./Recommendations";

describe("HU18 refreshed score presentation", () => {
  it("moves the user to the refreshed score summary smoothly", () => {
    const summary = { scrollIntoView: vi.fn() };

    scrollToScoreSummary(summary);

    expect(summary.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});
