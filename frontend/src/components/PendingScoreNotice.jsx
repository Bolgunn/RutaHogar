import React from 'react';

export function focusScoreUpdateTarget(element) {
  if (!element) return false;
  element.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  element.focus?.({ preventScroll: true });
  return true;
}

// Presentation only: each flow supplies its authoritative pending state and destination.
export default function PendingScoreNotice({ pending, onUpdate }) {
  if (!pending) return null;
  return <aside className="pending-score-notice" role="status" aria-label="Actualización de score pendiente">
    <span className="pending-score-notice__icon" aria-hidden="true">✓</span>
    <div><strong>Tu información cambió</strong><p>Puedes actualizar tu score con los nuevos antecedentes.</p></div>
    <button type="button" className="secondary-button" onClick={onUpdate}>Actualizar score</button>
  </aside>;
}
