import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import DocumentLeadBadges from './DocumentLeadBadges';
import { documentBackingProjection } from '../../services/documentBacking';

const fields = ['ingreso_mensual', 'ahorro_disponible', 'tipo_contrato', 'continuidad_laboral'];
function projection(statuses) {
  return documentBackingProjection({ fields: fields.map((field, index) => ({ field,
    status: statuses[index] || 'sin_respaldo', confirmed_on: statuses[index] && statuses[index] !== 'sin_respaldo' ? '2026-10-27' : null,
    detected_value: 'SECRET_DETECTED_VALUE', signed_url: 'SECRET_SIGNED_URL',
  })), ocr_text: 'SECRET_OCR' });
}
it.each([1, 2, 3, 4])('muestra el singular/plural exacto para %i antecedentes respaldados', count => {
  const html = renderToStaticMarkup(<DocumentLeadBadges projection={projection(Array(count).fill('respaldado'))} />);
  expect(html).toContain(count === 1 ? '>Dato validado<' : '>Datos validados<');
  expect(html).toContain('is-respaldado');
  expect(html).toContain('no acredita autenticidad ante el emisor');
  expect(html).not.toContain('Datos con diferencia');
  expect(html).not.toContain('SECRET_');
});
it('muestra ámbar cuando hay diferencias y permite coexistir con datos respaldados', () => {
  const html = renderToStaticMarkup(<DocumentLeadBadges projection={projection(['respaldado', 'con_diferencia'])} />);
  expect(html).toContain('Dato validado'); expect(html).toContain('Datos con diferencia');
  expect(html).toContain('is-con_diferencia');
  expect((html.match(/class="status-pill/g) || []).length).toBe(2);
  const onlyDifference = renderToStaticMarkup(<DocumentLeadBadges projection={projection(['con_diferencia'])} />);
  expect(onlyDifference).not.toContain('Dato validado');
});
it('no inventa un badge para ausencia de respaldo o una consulta no disponible', () => {
  expect(renderToStaticMarkup(<DocumentLeadBadges projection={projection([])} />)).toBe('');
  expect(renderToStaticMarkup(<DocumentLeadBadges />)).toBe('');
});
