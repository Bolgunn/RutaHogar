import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import PendingScoreNotice, { focusScoreUpdateTarget } from './PendingScoreNotice';

it('permanece visible mientras exista pendiente y se oculta al consumirlo', () => {
  const notice = () => renderToStaticMarkup(<PendingScoreNotice pending onUpdate={() => {}} />);
  expect(notice()).toContain('Tu información cambió');
  expect(notice()).toContain('Puedes actualizar tu score con los nuevos antecedentes.');
  expect(notice()).toContain('pending-score-notice');
  expect(notice()).not.toContain('Cerrar');
  expect(renderToStaticMarkup(<PendingScoreNotice pending={false} />)).toBe('');
});

it('el CTA sólo llama a la navegación suministrada por el flujo', () => {
  const onUpdate = vi.fn();
  const element = PendingScoreNotice({ pending: true, onUpdate });
  element.props.children.find(child => child.type === 'button').props.onClick();
  expect(onUpdate).toHaveBeenCalledOnce();
});

it('desplaza y enfoca el botón real, sin perder navegación por teclado', () => {
  const target = { scrollIntoView: vi.fn(), focus: vi.fn() };
  expect(focusScoreUpdateTarget(null)).toBe(false);
  expect(focusScoreUpdateTarget(target)).toBe(true);
  expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
});
