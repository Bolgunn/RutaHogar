import React from 'react';

export default function DocumentLeadBadges({ projection }) {
  if (!projection) return null;
  const backed = projection.fields.filter(row => row.status === 'respaldado').length;
  const difference = projection.fields.some(row => row.status === 'con_diferencia');
  if (!backed && !difference) return null;
  return <span className="document-lead-badges" aria-label="Respaldo documental vigente">
    {backed > 0 && <span className="status-pill document-backing-state is-respaldado"
      title="Dato contrastado con un documento y confirmado en RutaHogar; no acredita autenticidad ante el emisor.">
      {backed === 1 ? 'Dato validado' : 'Datos validados'}
    </span>}
    {difference && <span className="status-pill document-backing-state is-con_diferencia"
      title="La revisión documental fue confirmada conservando al menos un dato declarado con diferencia.">Datos con diferencia</span>}
  </span>;
}
