import React, { useEffect, useState } from 'react';
import { getOwnDocumentBacking, getStaffDocumentBacking } from '../../services/documentBacking';

const fields = { ingreso_mensual: 'Ingreso mensual (renta líquida)', ahorro_disponible: 'Ahorro disponible',
  tipo_contrato: 'Tipo de contrato', continuidad_laboral: 'Continuidad laboral' };
const labels = { respaldado: 'Respaldado', con_diferencia: 'Con diferencia', sin_respaldo: 'Sin respaldo' };
const explanations = {
  respaldado: 'Respaldo documental confirmado aplicable al dato vigente.',
  con_diferencia: 'Se confirmó la revisión conservando el dato declarado pese a una diferencia.',
  sin_respaldo: 'No hay evidencia confirmada aplicable al dato vigente.',
};

export function DocumentBackingView({ projection }) {
  return <dl className="profile-details">{projection.fields.map((row) => <div key={row.field}>
    <dt>{fields[row.field]}</dt>
    <dd><span className="status-pill" title={explanations[row.status]}>{labels[row.status]}</span>
      {row.confirmed_on && <> · Confirmado el <time dateTime={row.confirmed_on}>{
        new Date(row.confirmed_on + 'T12:00:00').toLocaleDateString('es-CL')
      }</time></>}
    </dd>
  </div>)}</dl>;
}

export default function DocumentBacking({ leadId = null, refreshKey = 0, mode = leadId ? 'staff' : 'owner' }) {
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(null);
  const identity = JSON.stringify([mode,leadId,refreshKey,revision]);
  useEffect(() => {
    let active = true;
    const request = mode === 'staff' ? getStaffDocumentBacking(leadId) : getOwnDocumentBacking();
    request.then((projection) => { if (active) setLoaded({ identity, projection }); })
      .catch(() => { if (active) setLoaded({ identity, error: true }); });
    return () => { active = false; };
  }, [identity]);
  const current = loaded?.identity === identity ? loaded : null;
  return <section aria-label="Respaldo documental vigente">
    <h3>Respaldo de antecedentes vigentes</h3>
    <p>Estos estados corresponden a los datos vigentes; no cambian las evaluaciones históricas.</p>
    {current?.projection ? <DocumentBackingView projection={current.projection} />
      : current?.error ? <p role="alert">No pudimos consultar el respaldo documental. Vuelve a consultar.</p>
        : <p role="status">Consultando respaldo documental…</p>}
    <button type="button" className="secondary-button" onClick={() => setRevision((value) => value + 1)}>Consultar estados documentales</button>
  </section>;
}
