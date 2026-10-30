import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ScoreUpdateFeedback, { scoreDelta } from './ScoreUpdateFeedback';

it('compara la nueva evaluación con la anterior y muestra el delta en español', () => {
  expect(scoreDelta(87.5, 95.5)).toBe(8);
  const html = renderToStaticMarkup(<ScoreUpdateFeedback previousScore={87.5} score={95.5} />);
  expect(html).toContain('+8,0');
  expect(html).toContain('is-positive');
  expect(html).toContain('Actualizado con tus nuevos antecedentes validados');
});

it('contempla un score menor o sin variación', () => {
  const html = renderToStaticMarkup(<ScoreUpdateFeedback previousScore={95.5} score={87.5} />);
  expect(html).toContain('-8,0');
  expect(html).toContain('is-negative');
  expect(renderToStaticMarkup(<ScoreUpdateFeedback previousScore={95.5} score={95.5} />)).toContain('0,0');
});

it('no inventa un delta si falta la evaluación anterior', () => {
  for (const previousScore of [null, undefined, '', 'invalid']) {
    expect(scoreDelta(previousScore, 95.5)).toBeNull();
    expect(renderToStaticMarkup(<ScoreUpdateFeedback previousScore={previousScore} score={95.5} />))
      .not.toContain('score-update-feedback__delta');
  }
});
