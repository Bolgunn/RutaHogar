import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../trackingService',()=>({trackingRequest:vi.fn()}));
import { trackingRequest } from '../trackingService';
import { getDocumentScoreStatus, scoreUpdateCommand, updateDocumentScore } from '../documentScore';

beforeEach(()=>vi.clearAllMocks());
const status={pending:true,revision:'11111111-1111-4111-8111-111111111111',validation_token:'22222222-2222-4222-8222-222222222222'};
it('no construye un comando si no hay pendientes',()=>{
  expect(()=>scoreUpdateCommand({...status,pending:false},'request')).toThrow('No hay datos');
});
it('consulta el estado sin calcular ni confirmar nada',async()=>{
  trackingRequest.mockResolvedValue(status);
  expect(await getDocumentScoreStatus()).toEqual(status);
  expect(trackingRequest).toHaveBeenCalledWith('/documents/score/status');
});
it('la acción envía sólo nonce/revisión/token, sin datos editables ni snapshot',async()=>{
  const command=scoreUpdateCommand(status,'33333333-3333-4333-8333-333333333333');
  expect(Object.keys(command).sort()).toEqual(['expected_revision','request_id','validation_token']);
  trackingRequest.mockResolvedValue({evaluation_id:'new'});
  await updateDocumentScore(command);
  expect(trackingRequest).toHaveBeenCalledWith('/documents/score/update',command);
});
