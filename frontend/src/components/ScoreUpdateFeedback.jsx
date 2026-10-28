import React from 'react';

export function scoreDelta(previousScore, score) {
  if ([previousScore, score].some(value => value == null || value === '' || !Number.isFinite(Number(value)))) return null;
  return Math.round((Number(score) - Number(previousScore)) * 10) / 10;
}

export default function ScoreUpdateFeedback({ previousScore, score }) {
  const delta = scoreDelta(previousScore, score);
  const label = delta == null ? null : new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero',
  }).format(delta);
  return <div className="score-update-feedback" role="status">
    {label && <strong className={`score-update-feedback__delta ${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : 'is-neutral'}`}
      aria-label={`Variación de score: ${label} puntos`}>{label}</strong>}
    <p>Actualizado con tus nuevos antecedentes validados</p>
  </div>;
}
