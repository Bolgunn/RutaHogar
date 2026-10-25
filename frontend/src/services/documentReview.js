import { trackingRequest } from './trackingService';

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

export async function processDocument(session, { consent = false, signal, onSession = () => {},
  request = trackingRequest, wait = waitForDocument, now = Date.now } = {}) {
  if (consent !== true) throw new Error('Debes autorizar el procesamiento temporal del documento en Microsoft Azure.');
  const active = () => { if (signal?.aborted) throw new Error('Proceso cancelado.'); };
  let current = await request(sessionPath(session.id));
  active(); onSession(current);
  let nextAttempt = null;
  if (current.state === 'ready') {
    const started = await request(`${sessionPath(current.id)}/ocr/start`, { consent_external_processing: true });
    active();
    current = { ...current, state: started.state, revision: started.revision };
    nextAttempt = started.next_attempt_at;
    onSession(current);
  }
  while (['processing', 'ocr_ready'].includes(current.state)) {
    const timestamp = Date.parse(nextAttempt || '');
    await wait(Math.max(2000, Number.isFinite(timestamp) ? timestamp - now() : 2000), signal);
    active();
    if (current.state === 'ocr_ready') {
      current = await request(`${sessionPath(current.id)}/parse`, {});
      active(); onSession(current);
      if (current.state !== 'ocr_ready') break;
    }
    const progress = await request(`${sessionPath(current.id)}/ocr/poll`, {});
    active();
    current = { ...current, state: progress.state, revision: progress.revision };
    nextAttempt = progress.next_attempt_at;
    onSession(current);
  }
  active();
  if (current.state !== 'awaiting_review') {
    throw new Error('No pudimos completar este intento. Ciérralo e intenta con otro documento.');
  }
  // OcrView intentionally contains no values; fetch the owner's safe review contract.
  const review = await request(sessionPath(current.id));
  active(); onSession(review);
  return review;
}
