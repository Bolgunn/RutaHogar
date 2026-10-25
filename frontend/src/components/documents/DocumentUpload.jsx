import React, { useEffect, useRef, useState } from 'react';
import DocumentReview from './DocumentReview';
import { processDocument } from '../../services/documentReview';
import { cancelDocumentSession, getDocumentConfiguration, getDocumentSession, uploadDocument } from '../../services/documentUpload';

const labels = { validating: 'Revisando archivo…', authorizing: 'Autorizando carga privada…',
  uploading: 'Subiendo a almacenamiento privado…', verifying: 'Verificando admisión…', ready: 'Documento listo para procesamiento.' };
const types = { liquidacion_sueldo: 'Liquidación de sueldo', certificado_ahorro: 'Certificado o cartola de ahorro', documento_laboral: 'Contrato o certificado laboral' };

// Minimal T2–T5 owner flow; final presentation remains outside this component.
export default function DocumentUpload({ onReady = () => {}, onConfirmed = () => {} }) {
  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState(null);
  const [type, setType] = useState('liquidacion_sueldo');
  const [file, setFile] = useState(null);
  const [fileNonce, setFileNonce] = useState(0);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const controller = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    getDocumentConfiguration().then((value) => { if (mounted.current) setConfig(value); })
      .catch(() => { if (mounted.current) setError('No pudimos cargar las restricciones. Vuelve a abrir esta sección.'); });
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const remember = (value) => { sessionRef.current = value; if (mounted.current) setSession(value); };
  const send = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    const active = new AbortController(); controller.current = active;
    try {
      const ready = await uploadDocument(file, type, { restrictions: config.restrictions, session: sessionRef.current,
        signal: active.signal, onSession: remember, onState: (value) => { if (mounted.current && !active.signal.aborted) setPhase(value); } });
      if (mounted.current && !active.signal.aborted) {
        setFile(null); setFileNonce((value) => value + 1); onReady(ready);
      }
    } catch (cause) { if (mounted.current && !active.signal.aborted) { setError(cause.message); setPhase('failed'); } }
    finally { if (mounted.current && controller.current === active) setBusy(false); }
  };
  const process = async () => {
    if (busy || !consent || !sessionRef.current) return;
    const active = new AbortController(); controller.current = active;
    setBusy(true); setError(''); setPhase('processing');
    try {
      await processDocument(sessionRef.current, { consent, signal: active.signal,
        onSession: (value) => { if (mounted.current && !active.signal.aborted) remember(value); } });
      if (mounted.current && !active.signal.aborted) setPhase('review');
    } catch (cause) { if (mounted.current && !active.signal.aborted) setError(cause.message); }
    finally { if (mounted.current && controller.current === active) setBusy(false); }
  };
  const cancel = async () => {
    controller.current?.abort(); controller.current = null;
    setBusy(true); setError('');
    try {
      const value = sessionRef.current && await getDocumentSession(sessionRef.current.id);
      if (value && !['confirmed', 'cancelled', 'processing_failed', 'expired'].includes(value.state)) await cancelDocumentSession(value);
      remember(null); setConsent(false); setFile(null); setFileNonce((value) => value + 1); setPhase('');
    } catch { setError('No pudimos cerrar el intento. Reintenta la cancelación.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const accept = config && Object.values(config.restrictions.files).flat().map((ext) => `.${ext}`).join(',');
  return <section aria-label="Carga privada de documentos">
    <h2>Respaldar mis datos</h2>
    <p>El archivo es temporal y privado. Los ejecutivos no pueden verlo. Esta carga no cambia tus antecedentes ni tu score.</p>
    <form onSubmit={send}>
      <label>Tipo de documento<select value={type} disabled={busy || Boolean(session)} onChange={(event) => setType(event.target.value)}>
        {(config?.document_types || []).map((key) => <option key={key} value={key}>{types[key]}</option>)}
      </select></label>
      <label>Archivo<input key={fileNonce} type="file" accept={accept} disabled={!config || busy || Boolean(session)}
        onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
      {config && <p>Máximo {config.restrictions.max_bytes / 1_000_000} MB; PDF de hasta {config.restrictions.max_pdf_pages} páginas. Cada imagen cuenta como una página.</p>}
      <button type="submit" disabled={!config || !file || busy || phase === 'ready'}>{session ? 'Reintentar carga' : 'Subir documento'}</button>
      {session && session.state !== 'awaiting_review' && <button type="button" onClick={cancel}>Cerrar intento / nueva carga</button>}
    </form>
    {session && ['ready', 'processing', 'ocr_ready'].includes(session.state) && <div>
      <label><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
        Autorizo enviar temporalmente este documento a Microsoft Azure para reconocer su texto. RutaHogar sólo cambiará mis datos si luego confirmo.
      </label>
      <button type="button" onClick={process} disabled={busy || !consent}>Procesar y revisar documento</button>
    </div>}
    <p role="status">{phase === 'processing' ? 'Procesando documento. Puedes cancelar este intento.' : labels[phase] || ''}</p>
    {session && ['awaiting_review', 'confirmed', 'cancelled'].includes(session.state) &&
      <DocumentReview key={session.id} session={session} onSession={remember} onConfirmed={onConfirmed} />}
    {error && <p role="alert">{error}</p>}
  </section>;
}
