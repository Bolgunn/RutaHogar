import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RecommendationsView, scrollToScoreSummary } from "./Recommendations";

describe("HU18 refreshed score presentation", () => {
  it("moves the user to the refreshed score summary smoothly", () => {
    const summary = { scrollIntoView: vi.fn() };

    scrollToScoreSummary(summary);

    expect(summary.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });
});


describe("HU30 active owner result integration", () => {
  it("renders the projection without a permanent incorporation success block", () => {
    const html = renderToStaticMarkup(<RecommendationsView evaluation={{ id: "e1", result: { score: 60 }, co_debtor: {
      version: "hu30-projection-v1", evaluation_type: "bipersonal_confirmed", status: "confirmed", visibility: "visible", holder: { income: 1234567 }, update_required: true,
    } }} ownerResult={{ message: "Los antecedentes fueron incorporados; tu score se mantuvo sin cambios.", update: vi.fn() }} />);
    expect(html).toContain("Capacidad Bipersonal");
    expect(html).toContain("1.234.567");
    expect(html.match(/Actualizar score con datos confirmados/g)).toHaveLength(1);
    expect(html).not.toContain("score se mantuvo sin cambios");
    expect(html).not.toContain("success-message");
  });
  it("keeps historical score and warning while omitting the legacy invitation panel", () => {
    const html = renderToStaticMarkup(<RecommendationsView evaluation={{ id: "e1", result: { score: 60 }, co_debtor: {
      version: "hu30-projection-v1", evaluation_type: "bipersonal_confirmed", status: "revoked", visibility: "hidden", warnings: ["historical_details_hidden"],
    } }} />);
    expect(html).toContain("ocultos por privacidad");
    expect(html).toContain("Score orientativo");
    expect(html).not.toContain("Cargando el estado del co-deudor");
    expect(html).not.toContain("Deuda mensual del co-deudor");
  });
});

describe("compact score comparison on the main result", () => {
  it.each([
    [93.4, 94.1, "+0.7"],
    [94.1, 93.4, "−0.7"],
    [94.1, 94.1, null],
    [undefined, 94.1, null],
  ])("renders previous %s and current %s beside the main score", (previousScore, score, label) => {
    const html = renderToStaticMarkup(<RecommendationsView evaluation={{ id: "persisted", result: { score } }}
      ownerResult={{ scoreChange: previousScore === undefined ? null : { previousScore, score },
        message: "Los antecedentes fueron incorporados a una nueva evaluación." }} />);
    expect(html).toContain(`<div class="recommendation-score-value"><strong>${score}</strong>`);
    if (label) expect(html).toMatch(new RegExp(`recommendation-score-value[\\s\\S]*>${label.replace("+", "\\+")}</span></div>`));
    else expect(html).not.toContain("data-score-change");
    expect(html).not.toContain("Score anterior");
    expect(html).not.toContain("Score actualizado");
    expect(html).not.toContain("Los antecedentes fueron incorporados a una nueva evaluación.");
    expect(html).not.toContain("success-message");
    expect(html).not.toContain(">+0</");
  });
});
