import { trackingRequest } from './trackingService';

export const DOCUMENT_BACKING_FIELDS = ['ingreso_mensual', 'ahorro_disponible', 'tipo_contrato', 'continuidad_laboral'];
export function documentBackingProjection(value) {
  if (!Array.isArray(value?.fields) || value.fields.length !== DOCUMENT_BACKING_FIELDS.length) throw new Error('invalid_backing');
  const seen = new Set();
  const fields = value.fields.map((row) => {
    if (!DOCUMENT_BACKING_FIELDS.includes(row.field) || seen.has(row.field)
      || !['respaldado', 'con_diferencia', 'sin_respaldo'].includes(row.status)
      || (row.status === 'sin_respaldo' ? row.confirmed_on !== null
        : typeof row.confirmed_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.confirmed_on))) throw new Error('invalid_backing');
    seen.add(row.field);
    return { field: row.field, status: row.status, confirmed_on: row.confirmed_on };
  });
  return { fields };
}
export async function getOwnDocumentBacking() {
  return documentBackingProjection(await trackingRequest('/documents/backing'));
}
export async function getStaffDocumentBacking(leadId) {
  if (!leadId) throw new Error('missing_lead');
  return documentBackingProjection(await trackingRequest(`/documents/staff/leads/${encodeURIComponent(leadId)}/backing`));
}
