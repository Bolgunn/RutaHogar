import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../trackingService',()=>({trackingRequest:vi.fn()}));
import { trackingRequest } from '../trackingService';
import { DOCUMENT_BACKING_FIELDS, documentBackingProjection, getOwnDocumentBacking, getStaffDocumentBacking } from '../documentBacking';

const legacy=()=>({fields:DOCUMENT_BACKING_FIELDS.map(field=>({field,status:'sin_respaldo',confirmed_on:null}))});
beforeEach(()=>vi.clearAllMocks());
it('consulta evidencia propia sin aceptar un usuario desde frontend',async()=>{
  trackingRequest.mockResolvedValue(legacy());
  expect(await getOwnDocumentBacking()).toEqual(legacy());
  expect(trackingRequest).toHaveBeenCalledWith('/documents/backing');
});
it('la consulta comercial usa únicamente el lead; el backend decide autorización',async()=>{
  trackingRequest.mockResolvedValue(legacy());
  await getStaffDocumentBacking('lead/with path');
  expect(trackingRequest).toHaveBeenCalledWith('/documents/staff/leads/lead%2Fwith%20path/backing');
});
it('legacy sin evidencia conserva cuatro sin respaldo y no inventa fechas',()=>{
  expect(documentBackingProjection(legacy())).toEqual(legacy());
});
it('rechaza estados malformados y no transforma error de infraestructura en sin respaldo',()=>{
  expect(()=>documentBackingProjection({fields:[]})).toThrow('invalid_backing');
  const wrong=legacy();wrong.fields[0].status='validated_by_ai';
  expect(()=>documentBackingProjection(wrong)).toThrow('invalid_backing');
  const duplicate=legacy();duplicate.fields[1]=duplicate.fields[0];
  expect(()=>documentBackingProjection(duplicate)).toThrow('invalid_backing');
});
it('acepta sólo campo/estado/fecha en el modelo de presentación',()=>{
  const value=legacy();value.fields[0]={field:'ingreso_mensual',status:'respaldado',confirmed_on:'2026-10-25',
    storage_path:'DO_NOT_RENDER',ocr:'DO_NOT_RENDER',detected_value:99999};
  const parsed=documentBackingProjection(value);
  expect(parsed.fields[0]).toEqual({field:'ingreso_mensual',status:'respaldado',confirmed_on:'2026-10-25'});
  expect(JSON.stringify(parsed)).not.toContain('DO_NOT_RENDER');
});
