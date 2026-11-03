import React, { useEffect, useRef, useState } from 'react';
import { formatFormValue } from '../../constants';
import { cancelDocumentSession, getDocumentSession } from '../../services/documentUpload';
import { buildDocumentConfirmation, confirmDocumentSession, isActionable, reviewErrorMessage } from '../../services/documentReview';

const fieldLabels = { ingreso_mensual: 'Renta líquida mensual', ahorro_disponible: 'Ahorro disponible',
  tipo_contrato: 'Tipo de contrato', continuidad_laboral: 'Continuidad laboral' };
const statusLabels = { respaldado: 'Respaldado', con_diferencia: 'Con diferencia', sin_respaldo: 'Sin respaldo' };

function valueLabel(field, value) {
  if (value === null || value === undefined) return 'No declarado';
  if (['ingreso_mensual', 'ahorro_disponible'].includes(field) && typeof value === 'number') {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 20 }).format(value);
  }
  return formatFormValue(value);
}

export default function DocumentReview({ session, onSession, onConfirmed = () => {} }) {
  const [choices, setChoices] = useState({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [pending, setPending] = useState(false);
  const commandRef = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const candidates = session.candidates || [];
  const missing = candidates.some((row) => isActionable(row) && row.comparison === 'difference' && !choices[row.field]);
  const actionable = candidates.filter(isActionable);
  const submit = async (event) => {
    event.preventDefault();
    if (inFlight.current || needsRefresh || (!commandRef.current && (!acknowledged || missing))) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      commandRef.current ??= buildDocumentConfirmation(session, choices, acknowledged);
      setPending(true);
      const confirmed = await confirmDocumentSession(session.id, commandRef.current);
      if (!mounted.current) return;
      commandRef.current = null; setPending(false); setChoices({}); setAcknowledged(false);
      onSession(confirmed);
      try { await onConfirmed(confirmed); }
      catch { setError('La revisión se guardó, pero no pudimos refrescar la vista. Vuelve a abrir tu perfil.'); }
    } catch (cause) {
      if (!mounted.current) return;
      setError(reviewErrorMessage(cause));
      // Unknown/5xx outcome: retain the EXACT request id, revision and decisions.
      if (cause?.code && !['persistence_unavailable', 'storage_unavailable', 'confirmation_disabled'].includes(cause.code)) {
        commandRef.current = null; setPending(false); setNeedsRefresh(true);
      }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const refresh = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const current = await getDocumentSession(session.id);
      if (!mounted.current) return;
      onSession(current);
      if (current.state === 'confirmed') {
        try { await onConfirmed(current); }
        catch { if (mounted.current) setError('La revisión se guardó, pero no pudimos refrescar la vista.'); }
        return;
      }
      if (current.state !== 'awaiting_review') return;
      // A conflicting financial revision requires a new process, never a silent rebase.
      setError('Consulta el estado actualizado. Si hay antecedentes más recientes, cancela este intento y vuelve a cargar.');
    } catch (cause) { setError(reviewErrorMessage(cause)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const cancel = async () => {
    if (inFlight.current || commandRef.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const current = await getDocumentSession(session.id);
      if (!mounted.current) return;
      const closed = ['confirmed', 'cancelled', 'expired', 'processing_failed'].includes(current.state);
      onSession(closed ? current : await cancelDocumentSession(current));
      setChoices({}); setAcknowledged(false);
    } catch { if (mounted.current) setError('No pudimos verificar la cancelación. Reintenta para consultar el estado vigente.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  if (session.state === 'confirmed') return <section aria-label="Revisión documental confirmada">
    <p role="status">Revisión confirmada. La confirmación documental no recalcula tu score.</p>
    {session.evidence.length > 0 ? <ul>{session.evidence.map((row) => <li key={row.field}>
      {fieldLabels[row.field]}: {statusLabels[row.current_backing]}
      {row.comparison === 'difference' && ' (se detectó una diferencia en la revisión)'}
    </li>)}</ul> : <p>No se creó un respaldo documental válido.</p>}
    <p>{session.deletion_state === 'deleted' ? 'El archivo original fue eliminado.' : 'La eliminación del archivo original está pendiente; el cierre quedó registrado.'}</p>
    {error && <p role="alert">{error}</p>}
  </section>;
  if (session.state !== 'awaiting_review') return <p role="status">Este intento terminó. No se confirmaron nuevos cambios desde esta revisión.</p>;
  return <section className="document-review" aria-label="Revisión de antecedentes documentales">
    <h3>Revisa los antecedentes detectados</h3>
    <p>Confirma sólo después de revisar cada campo. Esta acción no recalcula tu score.</p>
    <form onSubmit={submit}>
      <div className="document-review-table" role="region" aria-label="Comparación de antecedentes" tabIndex={0}>
      <table><thead><tr><th>Antecedente</th><th>Declarado</th><th>Detectado</th><th>Comparación y decisión</th></tr></thead>
        <tbody>{candidates.map((row) => <tr key={row.field}>
          <th scope="row">{fieldLabels[row.field]}</th>
          <td>{valueLabel(row.field, row.declared_value)}</td>
          <td>{row.detection === 'detected' ? valueLabel(row.field, row.detected_value) : '—'}</td>
          <td>{!isActionable(row)
            ? <p>{row.detection === 'ambiguous' ? 'Resultado ambiguo: no podemos elegir un valor.'
              : row.detection === 'not_detected' ? 'No se detectó este dato.' : 'No hay un valor declarado comparable.'} Este campo no se modificará ni quedará respaldado por este intento.</p>
            : row.comparison === 'match'
              ? <p>Coincide. Al confirmar, quedará respaldado sin cambiar el valor.</p>
              : <fieldset className="document-decision" disabled={busy || pending || needsRefresh}>
                <legend><span className="document-difference-badge">Se detectó una diferencia</span><span className="sr-only"> en {fieldLabels[row.field]}</span></legend>
                {[
                  ['accept_detected', 'Usar valor del documento', row.detected_value, 'Incorporar este valor a tus antecedentes al confirmar.'],
                  ['keep_declared', 'Mantener valor declarado', row.declared_value, 'Conservar el dato actual y dejar registrada la diferencia.'],
                ].map(([decision, title, value, explanation]) => <label key={decision}
                  className={`document-decision-card${choices[row.field] === decision ? ' is-selected' : ''}`}>
                  <input type="radio" name={row.field} value={decision} checked={choices[row.field] === decision}
                    onChange={() => { if (!commandRef.current) { setChoices((old) => ({ ...old, [row.field]: decision })); setAcknowledged(false); } }} />
                  <span><strong>{title}</strong><span className="document-decision-card__value">{valueLabel(row.field, value)}</span>
                    <small>{explanation}</small></span>
                </label>)}
              </fieldset>}</td>
        </tr>)}</tbody></table></div>
      {actionable.length === 0 && <p>No hay datos que se puedan respaldar. Puedes finalizar la revisión sin cambios o cancelarla.</p>}
      <label className="document-consent"><input type="checkbox" checked={acknowledged} disabled={busy || pending || needsRefresh}
        onChange={(event) => setAcknowledged(event.target.checked)} /><span>He revisado la comparación y confirmo las decisiones indicadas.</span></label>
      <button type="submit" disabled={busy || needsRefresh || (!pending && (!acknowledged || missing))}>
        {pending ? 'Reintentar confirmación' : actionable.length ? 'Confirmar antecedentes' : 'Finalizar revisión sin cambios'}
      </button>
      <button type="button" className="document-cancel-button" onClick={cancel} disabled={busy || pending}>Cancelar revisión</button>
      {needsRefresh && <button type="button" onClick={refresh} disabled={busy}>Consultar estado actualizado</button>}
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
