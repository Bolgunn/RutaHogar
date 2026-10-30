import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Recommendations, { scrollToScoreSummary } from "./Recommendations";

describe("HU18 refreshed score presentation", () => {
  it("moves the user to the refreshed score summary smoothly", () => {
    const summary = { scrollIntoView: vi.fn() };

    scrollToScoreSummary(summary);

    expect(summary.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});

describe("shared refreshed evaluation feedback", () => {
  const evaluation = { id: "new-evaluation", input: {}, result: { score: 95.5, classification: "Alto" } };
  it("presents the new score and delta for documents", () => {
    const source = "documents";
    const html = renderToStaticMarkup(<Recommendations evaluation={evaluation}
      scoreUpdate={{ evaluationId: evaluation.id, previousScore: 87.5, source }} />);
    expect(html).toContain("+8,0");
    expect(html).toContain("is-score-updated");
    expect(html).toContain("nuevos antecedentes validados");
  });
  it("does not attach an old success message or delta to another evaluation", () => {
    const html = renderToStaticMarkup(<Recommendations evaluation={evaluation}
      scoreUpdate={{ evaluationId: "older-evaluation", previousScore: 87.5, source: "documents" }} />);
    expect(html).not.toContain("score-update-feedback");
    expect(html).not.toContain("is-score-updated");
  });
});
