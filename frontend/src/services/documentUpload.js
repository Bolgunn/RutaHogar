import { supabase } from '../utils/supabase';
import { trackingRequest } from './trackingService';
import { withTimeout } from './httpRequest';

export class DocumentUploadError extends Error {}

export const getDocumentConfiguration = () => trackingRequest('/documents/config');
export const getDocumentSession = (id) => trackingRequest(`/documents/sessions/${encodeURIComponent(id)}`);
export const cancelDocumentSession = (session) => trackingRequest(`/documents/sessions/${encodeURIComponent(session.id)}/cancel`, {
  expected_revision: session.revision,
});

export async function countPdfPages(file) {
  try {
    // Browser-only parsing, loaded on demand. No rendering, worker, OCR or backend binary.
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
    return pdf.getPageCount();
  } catch {
    throw new DocumentUploadError('No pudimos leer este PDF. Sube una versión sin contraseña o intenta con otro archivo.');
  }
}

export async function validateDocumentFile(file, restrictions, countPages = countPdfPages) {
  if (!file || file.size <= 0) throw new DocumentUploadError('Selecciona un archivo que no esté vacío.');
  if (!restrictions?.max_bytes || !restrictions?.files || !restrictions?.max_pdf_pages) {
    throw new DocumentUploadError('No pudimos obtener las restricciones de carga. Intenta nuevamente.');
  }
  if (file.size > restrictions.max_bytes) {
    throw new DocumentUploadError(`El documento supera el máximo de ${restrictions.max_bytes / 1_000_000} MB.`);
  }
  const extension = file.name?.split('.').pop()?.toLowerCase();
  const contentType = Object.keys(restrictions.files).find((mime) => restrictions.files[mime].includes(extension));
  if (!contentType || (file.type && file.type !== contentType)) {
    throw new DocumentUploadError('Formato no permitido. Selecciona un PDF, JPG, JPEG o PNG con tipo válido.');
  }
  const pages = extension === 'pdf' ? await countPages(file) : 1;
  if (!Number.isInteger(pages) || pages < 1 || pages > restrictions.max_pdf_pages) {
    throw new DocumentUploadError(`El PDF debe tener como máximo ${restrictions.max_pdf_pages} páginas.`);
  }
  return { extension, content_type: contentType, client_pages: pages };
}

const closed = new Set(['confirmed', 'cancelled', 'processing_failed', 'expired']);
const messages = {
  expired: 'El intento venció. Inicia una nueva carga.',
  invalid_transition: 'Este intento ya no permite cargar archivos. Inicia una nueva carga.',
  upload_object_missing: 'No encontramos el archivo subido. Inicia una nueva carga.',
  upload_invalid_metadata: 'El archivo no cumple las restricciones. Se inició su eliminación. Sube otro archivo.',
  upload_authorization_expired: 'La autorización venció. Se cerró el intento para eliminar el archivo.',
  upload_format_locked: 'El intento está asociado a otro formato. Cancélalo antes de cambiar de archivo.',
};

export async function uploadDocument(file, documentType, {
  restrictions, session = null, onState = () => {}, onSession = () => {}, signal,
  request = trackingRequest, storage = supabase?.storage, countPages = countPdfPages,
} = {}) {
  const checkActive = () => { if (signal?.aborted) throw new DocumentUploadError('Carga cancelada.'); };
  try {
    onState('validating');
    const admission = await validateDocumentFile(file, restrictions, countPages);
    checkActive();
    if (!storage) throw new DocumentUploadError('La carga privada no está disponible.');
    if (session) {
      session = await request(`/documents/sessions/${encodeURIComponent(session.id)}`);
      checkActive();
      if (session.state === 'ready') { onSession(session); onState('ready'); return session; }
      if (closed.has(session.state)) throw new DocumentUploadError('Este intento terminó. Inicia una nueva carga.');
    } else {
      session = await request('/documents/sessions', { document_type: documentType });
      // Expose the id even if cancellation arrived while creation was in flight.
      onSession(session);
      checkActive();
    }
    onSession(session);
    onState('authorizing');
    let authorization;
    try {
      authorization = await request(`/documents/sessions/${encodeURIComponent(session.id)}/upload`, {
        expected_revision: session.revision, ...admission,
      });
    } catch (error) {
      // A prior upload may have succeeded while its network response was lost.
      if (error.code !== 'upload_already_exists') throw error;
    }
    checkActive();
    if (authorization) {
      if (authorization.authorization !== 'authenticated') throw new DocumentUploadError('Autorización de carga no compatible.');
      onState('uploading');
      // Strip the user's filename: only the server-generated path is authoritative.
      const blob = file.slice(0, file.size, authorization.content_type);
      const result = await withTimeout(storage.from(authorization.bucket).upload(authorization.path, blob, {
        contentType: authorization.content_type, upsert: false, cacheControl: '0',
      }));
      if (result.error) throw new DocumentUploadError('No pudimos subir el archivo. Puedes reintentar sin sobrescribirlo.');
    }
    checkActive();
    onState('verifying');
    const ready = await request(`/documents/sessions/${encodeURIComponent(session.id)}/upload/complete`, {
      expected_revision: session.revision,
    });
    checkActive();
    onSession(ready);
    onState('ready');
    return ready;
  } catch (error) {
    if (error instanceof DocumentUploadError) throw error;
    throw new DocumentUploadError(messages[error.code] || 'No pudimos completar la carga. Reintenta o cancela el intento.');
  }
}
