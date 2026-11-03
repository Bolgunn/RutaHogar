import { trackingRequest } from './trackingService';

export const getDocumentScoreStatus = () => trackingRequest('/documents/score/status');
export function scoreUpdateCommand(status, requestId = crypto.randomUUID()) {
  if (!status?.pending || !status.revision || !status.validation_token) {
    throw new Error('No hay datos validados pendientes de incorporar al score.');
  }
  return { request_id: requestId, expected_revision: status.revision, validation_token: status.validation_token };
}
export const updateDocumentScore = (command) => trackingRequest('/documents/score/update', command);
export const scoreUpdateMessage = (error) => ({
  stale_score_state: 'Tus antecedentes cambiaron. Consulta el estado y vuelve a pulsar actualizar.',
  no_score_pending: 'No hay datos validados pendientes de incorporar al score.',
  document_cleanup_pending: 'El archivo original sigue pendiente de eliminación. Reintenta para completar el borrado antes de actualizar.',
  score_update_disabled: 'La actualización del score no está disponible temporalmente.',
  market_data_unavailable: 'No pudimos obtener los datos de mercado necesarios. Tus datos validados siguen pendientes; puedes reintentar.',
  score_update_unavailable: 'No pudimos calcular tu score. Tus datos validados siguen pendientes; puedes reintentar.',
  idempotency_conflict: 'Este envío no corresponde al estado actual. Consulta el estado antes de continuar.',
  unauthenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
}[error?.code] || 'No pudimos verificar la actualización. Reintenta el mismo envío para comprobar su resultado.');
