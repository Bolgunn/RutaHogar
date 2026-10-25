import { describe, expect, it, vi } from 'vitest';
vi.mock('../../utils/supabase', () => ({ supabase: null }));
import { buildDocumentConfirmation, confirmDocumentSession, processDocument, waitForDocument } from '../documentReview';

const id='11111111-1111-4111-8111-111111111111';
const base={id,revision:4,state:'awaiting_review',candidates:[
  {field:'ingreso_mensual',detection:'detected',comparison:'difference',declared_value:1000000,detected_value:1200000},
]};

describe('confirmación explícita HU23', () => {
  it('no genera decisiones sin confirmación ni para diferencias pendientes', () => {
    expect(() => buildDocumentConfirmation(base,{},false,id)).toThrow('explícitamente');
    expect(() => buildDocumentConfirmation(base,{},true,id)).toThrow('cada diferencia');
  });
  it.each(['accept_detected','keep_declared'])('envía sólo ids/decisiones: %s', async (decision) => {
    const command=buildDocumentConfirmation(base,{ingreso_mensual:decision},true,id);
    expect(command).toEqual({request_id:id,expected_revision:4,confirmed:true,decisions:[{field:'ingreso_mensual',decision}]});
    const request=vi.fn().mockResolvedValue({state:'confirmed'});
    await confirmDocumentSession(id,command,request);
    expect(request).toHaveBeenCalledWith(`/documents/sessions/${id}/confirm`,command);
    expect(JSON.stringify(command)).not.toContain('1200000');
    expect(JSON.stringify(command)).not.toContain('evaluation');
  });
  it('coincidencia confirmada conserva el valor, sin elección ficticia para no detectados', () => {
    const session={...base,candidates:[
      {...base.candidates[0],comparison:'match'},
      {field:'ahorro_disponible',detection:'not_detected',comparison:'insufficient',detected_value:null},
    ]};
    expect(buildDocumentConfirmation(session,{},true,id).decisions).toEqual([{field:'ingreso_mensual',decision:'keep_declared'}]);
  });
  it('ambiguo/no detectado/insuficiente se cierran sin decisiones financieras', () => {
    const session={...base,candidates:[
      {...base.candidates[0],detection:'ambiguous',comparison:'insufficient',detected_value:null},
      {field:'tipo_contrato',detection:'detected',comparison:'insufficient',detected_value:'indefinido'},
    ]};
    expect(buildDocumentConfirmation(session,{},true,id).decisions).toEqual([]);
  });
  it('exige todas las decisiones laborales', () => {
    const session={...base,candidates:['tipo_contrato','continuidad_laboral'].map((field)=>({...base.candidates[0],field}))};
    expect(()=>buildDocumentConfirmation(session,{tipo_contrato:'accept_detected'},true,id)).toThrow();
    expect(buildDocumentConfirmation(session,{tipo_contrato:'accept_detected',continuidad_laboral:'keep_declared'},true,id).decisions).toHaveLength(2);
  });
});

describe('conexión navegador upload → OCR → parser → revisión', () => {
  it('respeta next_attempt_at y nunca confirma ni calcula score automáticamente', async () => {
    let phase='ready',polls=0;
    const request=vi.fn(async (path,body) => {
      if(path.endsWith('/ocr/start')) {
        expect(body).toEqual({consent_external_processing:true});phase='processing';
        return {state:phase,revision:2,next_attempt_at:new Date(6000).toISOString()};
      }
      if(path.endsWith('/ocr/poll')) {
        polls++;phase=polls===1?'processing':'ocr_ready';
        return {state:phase,revision:3,next_attempt_at:new Date(polls===1?9000:11000).toISOString()};
      }
      if(path.endsWith('/parse')) {phase='awaiting_review';return {...base};}
      return {...base,state:phase};
    });
    const wait=vi.fn().mockResolvedValue();
    const result=await processDocument({...base,state:'ready'},{consent:true,request,wait,now:()=>0});
    expect(result.state).toBe('awaiting_review');
    expect(wait.mock.calls.map(([delay])=>delay)).toEqual([6000,9000,11000]);
    expect(request.mock.calls.filter(([path])=>path.endsWith('/ocr/start'))).toHaveLength(1);
    expect(request.mock.calls.some(([path])=>/score|confirm/.test(path))).toBe(false);
  });
  it('requiere consentimiento antes de requests de procesamiento', async () => {
    const request=vi.fn();
    await expect(processDocument(base,{request})).rejects.toThrow('Microsoft Azure');
    expect(request).not.toHaveBeenCalled();
  });
  it('abortar detiene el polling del navegador', async () => {
    const controller=new AbortController();
    const request=vi.fn().mockResolvedValue({...base,state:'processing'});
    await expect(processDocument(base,{consent:true,signal:controller.signal,request,
      wait:async()=>controller.abort()})).rejects.toThrow('cancelado');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('el temporizador pendiente se libera al cancelar', async () => {
    vi.useFakeTimers();
    try {
      const controller=new AbortController();
      const waiting=waitForDocument(30000,controller.signal);
      const rejected=expect(waiting).rejects.toThrow('cancelado');
      controller.abort();await rejected;
      expect(vi.getTimerCount()).toBe(0);
    } finally {vi.useRealTimers();}
  });
});
