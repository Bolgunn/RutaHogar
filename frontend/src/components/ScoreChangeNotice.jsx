import React from "react";

export default function ScoreChangeNotice({ change }) {
  if (!change || !Number.isFinite(change.previousScore) || !Number.isFinite(change.score)) return null;
  const delta = Number((change.score - change.previousScore).toFixed(10));
  if (delta === 0) return null;
  const label = `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
  const previous = `Respecto de tu evaluación anterior: ${change.previousScore}`;
  return <span className={`hu30-score-change hu30-score-change--${delta > 0 ? "positive" : "negative"}`}
    role="status" data-score-change="true" title={previous} aria-label={`Cambio de score: ${label}. ${previous}`}>
    {label}
  </span>;
}
