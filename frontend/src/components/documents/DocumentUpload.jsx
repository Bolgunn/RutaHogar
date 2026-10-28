import React, { useEffect, useRef, useState } from 'react';
import DocumentReview from './DocumentReview';
import { processDocument } from '../../services/documentReview';
import { cancelDocumentSession, getDocumentConfiguration, getDocumentSession, uploadDocument } from '../../services/documentUpload';

const labels = { validating: 'Revisando archivo…', authorizing: 'Autorizando carga privada…',
  uploading: 'Subiendo a almacenamiento privado…', verifying: 'Verificando admisión…', ready: 'Archivo cargado correctamente.' };
const types = { liquidacion_sueldo: 'Liquidación de sueldo', certificado_ahorro: 'Certificado o cartola de ahorro', documento_laboral: 'Contrato o certificado laboral' };

// Minimal T2–T5 owner flow; final presentation remains outside this component.
export default function DocumentUpload({ onReady = () => {}, onConfirmed = () => {} }) {
  const [consent, setConsent] = useState(false);
  const [config, setConfig] = useState(null);
  const [type, setType] = useState('liquidacion_sueldo');
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [retryUpload, setRetryUpload] = useState(false);
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
    if (busy || !file || !config || (sessionRef.current && !retryUpload)) return;
    setBusy(true); setError(''); setRetryUpload(false);
    const active = new AbortController(); controller.current = active;
    try {
      const ready = await uploadDocument(file, type, { restrictions: config.restrictions, session: sessionRef.current,
        signal: active.signal, onSession: remember, onState: (value) => { if (mounted.current && !active.signal.aborted) setPhase(value); } });
      if (mounted.current && !active.signal.aborted) {
        setFileName(file.name); setFile(null); setFileNonce((value) => value + 1); onReady(ready);
      }
    } catch (cause) { if (mounted.current && !active.signal.aborted) {
      setError(cause.message); setPhase('failed'); setRetryUpload(cause.recoverable === true);
    } }
    finally { if (mounted.current && controller.current === active) setBusy(false); }
  };
  const process = async () => {
    if (busy || !consent || !['ready', 'processing', 'ocr_ready'].includes(sessionRef.current?.state)) return;
    const active = new AbortController(); controller.current = active;
    setBusy(true); setError(''); setPhase('processing');
    try {
      await processDocument(sessionRef.current, { provider: config?.ocr_provider || 'azure', consent, signal: active.signal,
        onSession: (value) => { if (mounted.current && !active.signal.aborted) remember(value); } });
      if (mounted.current && !active.signal.aborted) setPhase('review');
    } catch (cause) { if (mounted.current && !active.signal.aborted) {
      setError(cause.message); setPhase(sessionRef.current?.state === 'ready' ? 'ready' : 'failed');
    } }
    finally { if (mounted.current && controller.current === active) setBusy(false); }
  };
  const cancel = async () => {
    controller.current?.abort(); controller.current = null;
    setBusy(true); setError('');
    try {
      const value = sessionRef.current && await getDocumentSession(sessionRef.current.id);
      if (value && !['confirmed', 'cancelled', 'processing_failed', 'expired'].includes(value.state)) await cancelDocumentSession(value);
      remember(null); setConsent(false); setFile(null); setFileName(''); setRetryUpload(false);
      setFileNonce((value) => value + 1); setPhase('');
    } catch { setError('No pudimos cerrar el intento. Reintenta la cancelación.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const accept = config && Object.values(config.restrictions.files).flat().map((ext) => `.${ext}`).join(',');
  const admitted = session && ['ready', 'processing', 'ocr_ready', 'awaiting_review', 'confirmed'].includes(session.state);
  return <section className="document-upload" aria-label="Carga privada de documentos">
    <h2>Respaldar mis datos</h2>
    <p>El archivo es temporal y privado. Los ejecutivos no pueden verlo. Esta carga no cambia tus antecedentes ni tu score.</p>
    <form onSubmit={send}>
      <label>Tipo de documento<select value={type} disabled={busy || Boolean(session)} onChange={(event) => setType(event.target.value)}>
        {(config?.document_types || []).map((key) => <option key={key} value={key}>{types[key]}</option>)}
      </select></label>
      {!session && <label>Archivo<input key={fileNonce} type="file" accept={accept} disabled={!config || busy}
        onChange={(event) => { const selected = event.target.files?.[0] || null;
          setFile(selected); setFileName(selected?.name || ''); setError(''); setRetryUpload(false); }} /></label>}
      {fileName && <p className="document-file-name">{session ? 'Archivo asociado a este intento' : 'Archivo seleccionado'}: <strong>{fileName}</strong></p>}
      {admitted && <p role="status" className="document-upload-success">Archivo cargado correctamente.</p>}
      {config && <p>Máximo {config.restrictions.max_bytes / 1_000_000} MB; PDF de hasta {config.restrictions.max_pdf_pages} páginas. Cada imagen cuenta como una página.</p>}
      <div className="document-actions">
        {!session && <button type="submit" disabled={!config || !file || busy}>Subir documento</button>}
        {session && retryUpload && !admitted && <button type="submit" disabled={!config || !file || busy}>Reintentar carga</button>}
        {session && session.state !== 'awaiting_review' && <button type="button" className="secondary-button" onClick={cancel}>Cerrar intento / nueva carga</button>}
      </div>
    </form>
    {session && ['ready', 'processing', 'ocr_ready'].includes(session.state) && <div className="document-processing">
      <label className="document-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />
        <span>{config?.ocr_provider === 'local' ? 'Autorizo procesar temporalmente este documento en el servicio OCR propio de RutaHogar.' : 'Autorizo enviar temporalmente este documento a Microsoft Azure para reconocer su texto.'} RutaHogar sólo cambiará mis datos si luego confirmo.</span>
      </label>
      <button type="button" onClick={process} disabled={busy || !consent || !admitted}>Procesar y revisar documento</button>
    </div>}
    {phase !== 'ready' && <p role="status">{phase === 'processing' ? 'Procesando documento. Puedes cancelar este intento.' : labels[phase] || ''}</p>}
    {session && ['awaiting_review', 'confirmed', 'cancelled'].includes(session.state) &&
      <DocumentReview key={session.id} session={session} onSession={remember} onConfirmed={onConfirmed} />}
    {error && <p role="alert">{error}</p>}
  </section>;
}
