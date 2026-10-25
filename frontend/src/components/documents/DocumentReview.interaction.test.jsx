import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const hooks=vi.hoisted(()=>({states:[],refs:[],stateIndex:0,refIndex:0}));
vi.mock('react',async(importOriginal)=>({
  ...await importOriginal(),useEffect:()=>{},
  useState:(initial)=>{const i=hooks.stateIndex++;if(!(i in hooks.states))hooks.states[i]=initial;
    return [hooks.states[i],(next)=>{hooks.states[i]=typeof next==='function'?next(hooks.states[i]):next;}];},
  useRef:(initial)=>{const i=hooks.refIndex++;return hooks.refs[i]??={current:initial};},
}));
vi.mock('../../services/documentUpload',()=>({getDocumentSession:vi.fn(),cancelDocumentSession:vi.fn()}));
vi.mock('../../services/documentReview',async(importOriginal)=>({
  ...await importOriginal(),confirmDocumentSession:vi.fn(),
}));
import DocumentReview from './DocumentReview';
import { confirmDocumentSession } from '../../services/documentReview';
import { cancelDocumentSession, getDocumentSession } from '../../services/documentUpload';

function all(node,predicate){
  if(Array.isArray(node))return node.flatMap((child)=>all(child,predicate));
  if(!React.isValidElement(node))return [];
  return [...(predicate(node)?[node]:[]),...all(node.props.children,predicate)];
}
afterEach(()=>{hooks.states=[];hooks.refs=[];vi.clearAllMocks();});

const base={id:'11111111-1111-4111-8111-111111111111',revision:4,state:'awaiting_review',evidence:[],candidates:[
  {field:'ingreso_mensual',detection:'detected',comparison:'difference',declared_value:1000000,detected_value:1200000},
]};
function form(initial=base){
  let session=structuredClone(initial);
  const onSession=vi.fn((value)=>{session=value;});
  const onConfirmed=vi.fn().mockResolvedValue();
  const render=()=>{hooks.stateIndex=0;hooks.refIndex=0;return DocumentReview({session,onSession,onConfirmed});};
  const choose=(field,decision)=>all(render(),n=>n.type==='input'&&n.props.name===field&&n.props.value===decision)[0].props.onChange();
  const ack=()=>all(render(),n=>n.type==='input'&&n.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
  const submit=()=>all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault:vi.fn()});
  const button=()=>all(render(),n=>n.type==='button'&&n.props.type==='submit')[0];
  return {render,choose,ack,submit,button,onSession,onConfirmed};
}
it('no confirma por Enter ni por click si falta una decisión o el consentimiento',async()=>{
  const view=form();
  expect(view.button().props.disabled).toBe(true);await view.submit();
  view.ack();await view.submit();expect(confirmDocumentSession).not.toHaveBeenCalled();
  view.choose('ingreso_mensual','accept_detected');
  expect(view.button().props.disabled).toBe(true); // Editing invalidates previous acknowledgement.
  view.ack();expect(view.button().props.disabled).toBe(false);
  confirmDocumentSession.mockResolvedValue({...base,state:'confirmed',candidates:[],deletion_state:'deleted'});
  await view.submit();
  expect(confirmDocumentSession).toHaveBeenCalledOnce();
  expect(confirmDocumentSession.mock.calls[0][1].decisions).toEqual([{field:'ingreso_mensual',decision:'accept_detected'}]);
  expect(view.onConfirmed).toHaveBeenCalledOnce();
});
it('mantener declarado es una elección explícita y ambos campos laborales son obligatorios',async()=>{
  const view=form({...base,candidates:['tipo_contrato','continuidad_laboral'].map(field=>({...base.candidates[0],field}))});
  view.choose('tipo_contrato','keep_declared');view.ack();
  expect(view.button().props.disabled).toBe(true);await view.submit();
  expect(confirmDocumentSession).not.toHaveBeenCalled();
  view.choose('continuidad_laboral','accept_detected');view.ack();
  confirmDocumentSession.mockResolvedValue({...base,state:'confirmed',candidates:[],deletion_state:'deleted'});
  await view.submit();
  expect(confirmDocumentSession.mock.calls[0][1].decisions).toHaveLength(2);
});
it('un timeout mantiene exactamente el mismo request_id/revisión/decisiones para reintentar',async()=>{
  const view=form();view.choose('ingreso_mensual','accept_detected');view.ack();
  confirmDocumentSession.mockRejectedValueOnce(new Error('timeout'));
  await view.submit();
  const first=confirmDocumentSession.mock.calls[0][1];
  expect(view.button().props.children).toBe('Reintentar confirmación');
  expect(all(view.render(),n=>n.type==='fieldset')[0].props.disabled).toBe(true);
  confirmDocumentSession.mockResolvedValue({...base,state:'confirmed',candidates:[],deletion_state:'deleted'});
  await view.submit();
  expect(confirmDocumentSession.mock.calls[1][1]).toBe(first);
  expect(view.onConfirmed).toHaveBeenCalledOnce();
});
it('cancelar usa revisión vigente y no envía ninguna confirmación',async()=>{
  const view=form();getDocumentSession.mockResolvedValue({...base,revision:5});
  cancelDocumentSession.mockResolvedValue({...base,state:'cancelled',candidates:[]});
  await all(view.render(),n=>n.type==='button'&&n.props.children==='Cancelar revisión')[0].props.onClick();
  expect(cancelDocumentSession).toHaveBeenCalledWith({...base,revision:5});
  expect(confirmDocumentSession).not.toHaveBeenCalled();
  expect(view.onSession.mock.calls[0][0].state).toBe('cancelled');
});
it('ambiguo/no detectado se finaliza sin fabricar elecciones',async()=>{
  const view=form({...base,candidates:[{...base.candidates[0],detection:'ambiguous',comparison:'insufficient',detected_value:null}]});
  view.ack();confirmDocumentSession.mockResolvedValue({...base,state:'confirmed',candidates:[],deletion_state:'deleted'});
  await view.submit();
  expect(confirmDocumentSession.mock.calls[0][1].decisions).toEqual([]);
});
it('un conflicto incompatible no se reenvía con otro identificador automáticamente',async()=>{
  const view=form();view.choose('ingreso_mensual','keep_declared');view.ack();
  confirmDocumentSession.mockRejectedValueOnce(Object.assign(new Error('conflict'),{code:'idempotency_conflict'}));
  await view.submit();
  expect(view.button().props.disabled).toBe(true);
  await view.submit();expect(confirmDocumentSession).toHaveBeenCalledOnce();
});

it('dos envíos simultáneos del formulario producen una sola request',async()=>{
  const view=form();view.choose('ingreso_mensual','accept_detected');view.ack();
  let complete;
  confirmDocumentSession.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const first=view.submit();
  await view.submit();
  expect(confirmDocumentSession).toHaveBeenCalledOnce();
  complete({...base,state:'confirmed',candidates:[],deletion_state:'deleted'});
  await first;
  expect(view.onConfirmed).toHaveBeenCalledOnce();
});
