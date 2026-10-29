import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const hooks=vi.hoisted(()=>({states:[],refs:[],effects:[],si:0,ri:0}));
vi.mock('react',async(original)=>({...await original(),
  useState:initial=>{const i=hooks.si++;if(!(i in hooks.states))hooks.states[i]=initial;
    return [hooks.states[i],value=>{hooks.states[i]=typeof value==='function'?value(hooks.states[i]):value;}];},
  useRef:initial=>{const i=hooks.ri++;return hooks.refs[i]??={current:initial};},
  useEffect:effect=>hooks.effects.push(effect),
}));
vi.mock('../../services/documentUpload',()=>({getDocumentConfiguration:vi.fn(),getDocumentSession:vi.fn(),
  cancelDocumentSession:vi.fn(),uploadDocument:vi.fn()}));
vi.mock('../../services/documentReview',()=>({processDocument:vi.fn()}));
import DocumentUpload from './DocumentUpload';
import { getDocumentConfiguration,getDocumentSession,cancelDocumentSession,uploadDocument } from '../../services/documentUpload';
import { processDocument } from '../../services/documentReview';
const config={document_types:['liquidacion_sueldo'],restrictions:{max_bytes:4000000,max_pdf_pages:2,files:{'application/pdf':['pdf']}}};
const ready={id:'attempt',revision:1,state:'ready'};
function all(node,predicate){
  if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));
  if(!React.isValidElement(node))return [];
  return [...(predicate(node)?[node]:[]),...all(node.props.children,predicate)];
}
function text(node){return Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):String(node??'');}
const render=()=>{hooks.si=0;hooks.ri=0;hooks.effects=[];return DocumentUpload({});};
const button=name=>all(render(),n=>n.type==='button'&&text(n)===name)[0];
async function select(){
  getDocumentConfiguration.mockResolvedValue(config);
  render();hooks.effects[0]();await Promise.resolve();
  all(render(),n=>n.type==='input'&&n.props.type==='file')[0].props.onChange({target:{files:[{name:'liquidacion-sintetica.pdf'}]}});
}
const send=()=>all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault:vi.fn()});
afterEach(()=>{hooks.states=[];hooks.refs=[];hooks.effects=[];vi.resetAllMocks();vi.unstubAllGlobals();});

it('conserva nombre y estado tras upload, oculta el input y exige consentimiento para procesar',async()=>{
  await select();
  uploadDocument.mockImplementation(async(file,type,options)=>{options.onSession(ready);options.onState('ready');return ready;});
  await send();
  expect(text(render())).toContain('liquidacion-sintetica.pdf');
  expect(text(render())).toContain('Archivo cargado correctamente');
  expect(all(render(),n=>n.type==='input'&&n.props.type==='file')).toHaveLength(0);
  expect(button('Reintentar carga')).toBeUndefined();
  expect(button('Procesar y revisar documento').props.disabled).toBe(true);
  all(render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
  expect(button('Procesar y revisar documento').props.disabled).toBe(false);
});

it.each([true,false])('muestra retry sólo para un error de upload recuperable (%s)',async(recoverable)=>{
  await select();
  uploadDocument.mockImplementation(async(file,type,options)=>{
    options.onSession({...ready,state:'awaiting_upload'});
    throw Object.assign(new Error('Error de prueba'),{recoverable});
  });
  await send();
  expect(Boolean(button('Reintentar carga'))).toBe(recoverable);
  expect(button('Procesar y revisar documento')).toBeUndefined();
  expect(button('Cerrar intento / nueva carga')).toBeDefined();
});

it('un error de configuración OCR conserva el archivo listo sin ofrecer otra carga',async()=>{
  await select();
  uploadDocument.mockImplementation(async(file,type,options)=>{options.onSession(ready);options.onState('ready');return ready;});
  await send();
  all(render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
  processDocument.mockRejectedValue(new Error('Configura la URL pública local.'));
  await button('Procesar y revisar documento').props.onClick();
  expect(text(render())).toContain('Configura la URL pública local');
  expect(text(render())).not.toContain('Procesando documento.');
  expect(button('Reintentar carga')).toBeUndefined();
  expect(button('Procesar y revisar documento').props.disabled).toBe(false);
});

it('cerrar intento limpia nombre y consentimiento para el siguiente archivo',async()=>{
  await select();
  uploadDocument.mockImplementation(async(file,type,options)=>{options.onSession(ready);return ready;});
  await send();
  getDocumentSession.mockResolvedValue(ready);cancelDocumentSession.mockResolvedValue({...ready,state:'cancelled'});
  await button('Cerrar intento / nueva carga').props.onClick();
  expect(text(render())).not.toContain('liquidacion-sintetica.pdf');
  expect(all(render(),n=>n.type==='input'&&n.props.type==='checkbox')).toHaveLength(0);
  expect(all(render(),n=>n.type==='input'&&n.props.type==='file')).toHaveLength(1);
});


it('al recargar retoma el seguimiento sin reiniciar el OCR',async()=>{
  const data=new Map([['rutahogar.hu23.pending-document',JSON.stringify({id:'attempt',tracking:true})]]);
  vi.stubGlobal('window',{sessionStorage:{getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}});
  getDocumentConfiguration.mockResolvedValue({...config,ocr_provider:'local'});
  getDocumentSession.mockResolvedValue({...ready,state:'processing'});
  processDocument.mockImplementation(async(value,options)=>{
    options.onSlow();
    options.onSession({...ready,state:'awaiting_review',candidates:[],evidence:[]});
  });
  render();hooks.effects[0]();
  for(let i=0;i<8;i++) await Promise.resolve();
  expect(processDocument).toHaveBeenCalledTimes(1);
  expect(processDocument.mock.calls[0][1]).toEqual(expect.objectContaining({startIfReady:false,provider:'local',consent:true}));
  expect(all(render(),node=>node.type.name==='DocumentReview')).toHaveLength(1);
});

it('muestra un aviso no destructivo cuando el seguimiento se demora',async()=>{
  await select();
  uploadDocument.mockImplementation(async(file,type,options)=>{options.onSession(ready);return ready;});
  await send();
  all(render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
  processDocument.mockImplementation(async(value,options)=>{options.onSlow();await new Promise(()=>{});});
  button('Procesar y revisar documento').props.onClick();
  expect(text(render())).toContain('El procesamiento esta tomando mas de lo esperado.'.replace('esta','est\u00e1').replace('mas','m\u00e1s'));
  expect(all(render(),n=>n.props.role==='alert')).toHaveLength(0);
  expect(button('Procesar y revisar documento').props.disabled).toBe(true);
});


it('muestra solamente el mensaje generico ante identidad inconsistente',async()=>{
  await select();
  uploadDocument.mockImplementation(async(file,type,options)=>{options.onSession(ready);return ready;});
  await send();
  all(render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
  processDocument.mockImplementation(async(value,options)=>{
    options.onSession({...ready,state:'processing_failed',failure_code:'identity_inconsistent'});
    throw new Error('Datos inconsistentes');
  });
  await button('Procesar y revisar documento').props.onClick();
  expect(text(render())).toBe('Datos inconsistentes');
});
