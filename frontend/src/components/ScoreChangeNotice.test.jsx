import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ScoreChangeNotice from "./ScoreChangeNotice";

it.each([
  [93.4, 94.1, "+0.7", "positive"],
  [94.1, 93.4, "−0.7", "negative"],
  [64, 67, "+3", "positive"],
])("shows a compact change from %s to %s", (previousScore, score, label, tone) => {
  const html = renderToStaticMarkup(<ScoreChangeNotice change={{ previousScore, score }} />);
  expect(html).toContain(`>${label}</span>`);
  expect(html).toContain(`hu30-score-change--${tone}`);
  expect(html).toContain(`title="Respecto de tu evaluación anterior: ${previousScore}"`);
  expect(html).toContain('role="status"');
  expect(html).toContain(`aria-label="Cambio de score: ${label}.`);
  expect(html).not.toMatch(/success-message|Score anterior|Score actualizado|<p>|puntos/);
});
it("omits an unchanged delta without +0", () => {
  const html = renderToStaticMarkup(<ScoreChangeNotice change={{ previousScore: 64, score: 64 }} />);
  expect(html).toBe("");
});
it("does not expose floating-point noise for persisted decimal scores", () => {
  const html = renderToStaticMarkup(<ScoreChangeNotice change={{ previousScore: 94.1, score: 94.3 }} />);
  expect(html).toContain(">+0.2</span>");
  expect(html).not.toContain("0000000");
});
it("does not show a delta without a verified comparison", () => {
  expect(renderToStaticMarkup(<ScoreChangeNotice />)).toBe("");
});
it.each([null, undefined, NaN, Infinity])("hides an invalid previous score %s", previousScore => {
  expect(renderToStaticMarkup(<ScoreChangeNotice change={{ previousScore, score: 94.3 }} />)).toBe("");
});
