import React, { useEffect, useRef, useState } from 'react';
import { getDocumentScoreStatus, scoreUpdateCommand, updateDocumentScore, scoreUpdateMessage } from '../../services/documentScore';
import { focusScoreUpdateTarget } from '../PendingScoreNotice';

export default function DocumentScoreUpdate({ refreshKey = 0, onUpdated = () => {}, onPendingChange,
  focusRequested = false, onFocused }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const command = useRef(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const updateButton = useRef(null);
  const load = async () => {
    const version = ++generation.current;
    try {
      const next = await getDocumentScoreStatus();
      if (mounted.current && version === generation.current) { setStatus(next); onPendingChange?.(next); setError(command.current && !next.pending ? 'Hay un envío sin verificar. Reintenta el mismo envío para comprobar su resultado.' : ''); }
    } catch {
      if (mounted.current && version === generation.current) setError('No pudimos consultar si hay datos validados pendientes. Vuelve a consultar.');
    }
  };
  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; generation.current++; };
  }, [refreshKey]);
  useEffect(() => {
    if (focusRequested && (status?.pending || command.current) && focusScoreUpdateTarget(updateButton.current)) onFocused?.();
  }, [focusRequested, status?.pending, onFocused]);
  const update = async () => {
    if (inFlight.current || (!status?.pending && !command.current)) return;
    inFlight.current = true; setBusy(true); setError('');
    generation.current++; // An older GET must not overwrite the result of this explicit action.
    try {
      command.current ??= scoreUpdateCommand(status);
      const next = await updateDocumentScore(command.current);
      if (!mounted.current) return;
      generation.current++;
      command.current = null; setResult(next);
      setStatus((old) => ({ ...old, pending: false }));
      onPendingChange?.({ pending: false });
      try { await onUpdated(next); }
      catch { if (mounted.current) setError('El score se guardó, pero no pudimos abrir Resultados. Vuelve a consultar tu historial.'); }
      // New validations from another tab can be pending after this exact evaluation.
      try {
        const version = generation.current;
        const fresh = await getDocumentScoreStatus();
        if (mounted.current && version === generation.current) { setStatus(fresh); onPendingChange?.(fresh); }
      } catch { /* The successful evaluation remains persisted; do not resubmit automatically. */ }
    } catch (cause) {
      if (!mounted.current) return;
      setError(scoreUpdateMessage(cause));
      if (['stale_score_state', 'no_score_pending', 'idempotency_conflict'].includes(cause?.code)) {
        command.current = null;
        try { const fresh = await getDocumentScoreStatus(); if (mounted.current) { setStatus(fresh); onPendingChange?.(fresh); } } catch { /* Keep a manual refresh. */ }
      }
      // Unknown/scorer/market/DB failures keep the exact command for a safe retry.
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <section aria-label="Score con datos validados">
    {result && <p role="status">Actualizado con tus nuevos antecedentes validados.</p>}
    {status?.pending && <p>Tus antecedentes fueron actualizados. Tu score aún no ha cambiado.</p>}
    {status?.pending && <p>Datos validados pendientes de incorporar al score.
      {status.cleanup_required && ' Primero se reintentará eliminar el archivo original.'}</p>}
    {status && !status.pending && !result && !command.current && <p role="status">Sin cambios pendientes: no hay datos validados pendientes de incorporar al score.</p>}
    {!status && !error && <p role="status">Consultando datos validados pendientes…</p>}
    {busy && <p role="status">Actualizando score…</p>}
    {(status?.pending || command.current) && <button ref={updateButton} type="button" onClick={update} disabled={busy}>
      Actualizar score con datos validados
    </button>}
    {error && <p role="alert">{error}</p>}
    {error && <button type="button" onClick={load} disabled={busy}>Consultar estado</button>}
  </section>;
}
