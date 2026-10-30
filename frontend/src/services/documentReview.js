import { trackingRequest } from './trackingService';
import { RequestTimeoutError } from './httpRequest';

export const IDENTITY_INCONSISTENT_MESSAGE = 'Se detectaron inconsistencias entre los datos de tu perfil y los del documento cargado.';

export const isActionable = (row) => row.detection === 'detected'
  && ['match', 'difference'].includes(row.comparison) && row.detected_value !== null;
const sessionPath = (id) => `/documents/sessions/${encodeURIComponent(id)}`;

export function buildDocumentConfirmation(session, choices, confirmed, requestId = crypto.randomUUID()) {
  if (session.state !== 'awaiting_review' || confirmed !== true) {
    throw new Error('Revisa los antecedentes y confirma explícitamente antes de continuar.');
  }
  const decisions = session.candidates.filter(isActionable).map((row) => {
    const decision = row.comparison === 'match' ? 'keep_declared' : choices[row.field];
    if (!['accept_detected', 'keep_declared'].includes(decision)) {
      throw new Error('Debes elegir qué hacer con cada diferencia.');
    }
    return { field: row.field, decision };
  }).sort((a, b) => a.field.localeCompare(b.field));
  return { request_id: requestId, expected_revision: session.revision, confirmed: true, decisions };
}

export const confirmDocumentSession = (id, command, request = trackingRequest) =>
  request(`${sessionPath(id)}/confirm`, command);

export const reviewErrorMessage = (error) => ({
  stale_review: 'La revisión cambió. Vuelve a consultarla antes de confirmar.',
  lineage_conflict: 'Hay antecedentes más recientes. Cancela este intento y carga nuevamente el documento.',
  idempotency_conflict: 'Este intento ya fue confirmado con otra decisión. Consulta su estado.',
  invalid_decision: 'Las decisiones no corresponden a esta revisión. Consulta su estado.',
  invalid_transition: 'Este intento ya no admite confirmación. Consulta su estado.',
  expired: 'La revisión venció. Cancela el intento e inicia una nueva carga.',
  confirmation_disabled: 'La confirmación no está disponible temporalmente.',
  not_found: 'No encontramos este intento documental.',
  unauthenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
}[error?.code] || 'No pudimos verificar la confirmación. Reintenta el mismo envío para comprobar su resultado.');

export function waitForDocument(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('Proceso cancelado.')); return; }
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new Error('Proceso cancelado.')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, delayMs);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

export async function processDocument(session, { consent = false, provider = 'azure', signal, onSession = () => {},
  onSlow = () => {}, startIfReady = true, request = trackingRequest, wait = waitForDocument, now = Date.now } = {}) {
  if (consent !== true) throw new Error('Debes autorizar el procesamiento temporal del documento.');
  const active = () => { if (signal?.aborted) throw new Error('Proceso cancelado.'); };
  const startedAt = now();
  let slow = false;
  const markSlow = () => { if (!slow) { slow = true; onSlow(); } };
  let current = await request(sessionPath(session.id));
  active(); onSession(current);
  let nextAttempt = null;
  let awaitingStart = current.state === 'ready' && !startIfReady;
  if (current.state === 'ready' && startIfReady) {
    try {
      const started = await request(`${sessionPath(current.id)}/ocr/start`, { consent_external_processing: true, ...(provider === 'local' ? { expected_provider: 'local' } : {}) });
      active();
      current = { ...current, state: started.state, revision: started.revision,
        failure_code: started.message === 'Datos inconsistentes' ? 'identity_inconsistent' : current.failure_code };
      nextAttempt = started.next_attempt_at;
      onSession(current);
    } catch (error) {
      if (!(error instanceof RequestTimeoutError)) throw error;
      // The server may have accepted the request even though its response timed out.
      // Read the persisted state; never send a second start automatically.
      active(); awaitingStart = true; markSlow();
    }
  }
  while (awaitingStart || ['processing', 'ocr_ready'].includes(current.state)) {
    if (now() - startedAt >= 15000) markSlow();
    const timestamp = Date.parse(nextAttempt || '');
    await wait(Math.max(2000, Number.isFinite(timestamp) ? timestamp - now() : 2000), signal);
    active();
    try {
      if (awaitingStart) {
        current = await request(sessionPath(current.id));
        active(); onSession(current);
        awaitingStart = current.state === 'ready';
        if (awaitingStart || !['processing', 'ocr_ready'].includes(current.state)) continue;
      }
      // Local OCR persists the review itself; /parse would claim another job.
      if (current.state === 'ocr_ready' && provider !== 'local') {
        current = await request(`${sessionPath(current.id)}/parse`, {});
        active(); onSession(current);
        if (current.state !== 'ocr_ready') break;
      }
      const progress = await request(`${sessionPath(current.id)}/ocr/poll`, {});
      active();
      current = { ...current, state: progress.state, revision: progress.revision,
        failure_code: progress.message === 'Datos inconsistentes' ? 'identity_inconsistent' : current.failure_code };
      nextAttempt = progress.next_attempt_at;
      onSession(current);
      if (progress.provider === 'local' && progress.status === 'retry_wait') {
        throw new Error('No pudimos procesar el documento. Cierra este intento y vuelve a cargarlo.');
      }
    } catch (error) {
      if (!(error instanceof RequestTimeoutError)) throw error;
      active(); markSlow(); awaitingStart = true; nextAttempt = null;
    }
  }
  active();
  if (current.failure_code === 'identity_inconsistent') throw new Error(IDENTITY_INCONSISTENT_MESSAGE);
  if (current.state !== 'awaiting_review') {
    throw new Error('No pudimos completar este intento. Ciérralo e intenta con otro documento.');
  }
  // OcrView intentionally contains no values; fetch the owner's safe review contract.
  const review = await request(sessionPath(current.id));
  active(); onSession(review);
  return review;
}
