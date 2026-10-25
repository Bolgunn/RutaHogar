import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../../services/documentUpload', () => ({ getDocumentConfiguration: vi.fn(), getDocumentSession: vi.fn(), cancelDocumentSession: vi.fn(), uploadDocument: vi.fn() }));
import DocumentUpload from './DocumentUpload';
it('presenta el flujo mínimo sin descarga, visor ni actualización de score', () => {
  const html = renderToStaticMarkup(<DocumentUpload />);
  expect(html).toContain('type="file"');
  expect(html).toContain('Tipo de documento'); expect(html).toContain('Los ejecutivos no pueden verlo');
  expect(html).not.toContain('Actualizar score'); expect(html).not.toContain('iframe'); expect(html).not.toContain('Descargar');
});

import ProfilePage from '../ProfilePage';
it.each([
  ['usuario', [{ id: 'existing-evaluation', score: 50 }], true],
  ['usuario', [], false],
  ['ejecutivo', [{ id: 'existing-evaluation', score: 50 }], false],
])('habilita el acceso mínimo sólo al usuario precalificado (%s)', (role, evaluations, visible) => {
  const html = renderToStaticMarkup(<ProfilePage profile={{ role }} onboarding={{}} evaluations={evaluations} />);
  expect(html.includes('Cargar documento respaldatorio')).toBe(visible);
});
