import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const hooks=vi.hoisted(()=>({states:[],refs:[],effects:[],si:0,ri:0}));
vi.mock('react',async(importOriginal)=>({
  ...await importOriginal(),
  useEffect:(callback)=>{hooks.effects.push(callback);},
  useState:(initial)=>{const i=hooks.si++;if(!(i in hooks.states))hooks.states[i]=initial;
    return [hooks.states[i],next=>{hooks.states[i]=typeof next==='function'?next(hooks.states[i]):next;}];},
  useRef:(initial)=>{const i=hooks.ri++;return hooks.refs[i]??={current:initial};},
}));
vi.mock('../../services/documentScore',async(importOriginal)=>({
  ...await importOriginal(),getDocumentScoreStatus:vi.fn(),updateDocumentScore:vi.fn(),
}));
import DocumentScoreUpdate from './DocumentScoreUpdate';
import { getDocumentScoreStatus, updateDocumentScore } from '../../services/documentScore';
const pending={pending:true,revision:'11111111-1111-4111-8111-111111111111',
  validation_token:'22222222-2222-4222-8222-222222222222',fields:['ingreso_mensual'],cleanup_required:false};
const result={evaluation_id:'new-evaluation',score:67,classification:'Medio',algorithm_version:'1.1.0'};
function all(node,predicate){
  if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));
  if(!React.isValidElement(node))return [];
  return [...(predicate(node)?[node]:[]),...all(node.props.children,predicate)];
}
function content(node){
  if(Array.isArray(node))return node.map(content).join('');
  return React.isValidElement(node)?content(node.props.children):String(node??'');
}
function form(state=pending, extra={}){
  hooks.states[0]=state;
  const onUpdated=vi.fn().mockResolvedValue();
  const render=()=>{hooks.si=0;hooks.ri=0;hooks.effects=[];return DocumentScoreUpdate({onUpdated,...extra});};
  const button=()=>all(render(),n=>n.type==='button'&&content(n)==='Actualizar score con datos validados')[0];
  return {render,button,onUpdated};
}
afterEach(()=>{hooks.states=[];hooks.refs=[];hooks.effects=[];vi.resetAllMocks();});
it('montar sólo consulta el pendiente; nunca recalcula automáticamente',async()=>{
  getDocumentScoreStatus.mockResolvedValue(pending);
  const view=form(null);view.render();hooks.effects[0]();
  await Promise.resolve();
  expect(getDocumentScoreStatus).toHaveBeenCalledOnce();
  expect(updateDocumentScore).not.toHaveBeenCalled();
  expect(content(view.render())).toContain('Tus antecedentes fueron actualizados. Tu score aún no ha cambiado.');
  expect(view.button().props.disabled).toBe(false);
});
it('sin datos pendientes no muestra CTA ni calcula',()=>{
  const view=form({...pending,pending:false});
  expect(content(view.render())).toContain('Sin cambios pendientes');
  expect(view.button()).toBeUndefined();
  expect(updateDocumentScore).not.toHaveBeenCalled();
});
it('doble clic produce una sola request y éxito consume la vista pendiente',async()=>{
  const view=form();let finish;
  updateDocumentScore.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  const first=view.button().props.onClick();
  expect(content(view.render())).toContain('Actualizando score');
  expect(view.button().props.disabled).toBe(true);
  await view.button().props.onClick();
  expect(updateDocumentScore).toHaveBeenCalledOnce();
  finish(result);await first;
  expect(view.onUpdated).toHaveBeenCalledWith(result);
  expect(view.button()).toBeUndefined();
  expect(content(view.render())).toContain('Actualizado con tus nuevos antecedentes validados');
});
it('un fallo recuperable preserva pendiente y el mismo comando para reintentar',async()=>{
  const view=form();
  updateDocumentScore.mockRejectedValueOnce(Object.assign(new Error('failure'),{code:'score_update_unavailable'}));
  await view.button().props.onClick();
  const first=updateDocumentScore.mock.calls[0][0];
  expect(content(view.render())).toContain('siguen pendientes');
  expect(view.button().props.disabled).toBe(false);
  updateDocumentScore.mockResolvedValue(result);
  getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  await view.button().props.onClick();
  expect(updateDocumentScore.mock.calls[1][0]).toBe(first);
});
it('una respuesta incierta no fabrica otro request_id',async()=>{
  const view=form();updateDocumentScore.mockRejectedValueOnce(new Error('timeout'));
  await view.button().props.onClick();
  const first=updateDocumentScore.mock.calls[0][0];
  getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  await all(view.render(),n=>n.type==='button'&&content(n)==='Consultar estado')[0].props.onClick();
  expect(content(view.render())).toContain('envío sin verificar');
  updateDocumentScore.mockResolvedValue(result);
  await view.button().props.onClick();
  expect(updateDocumentScore.mock.calls[1][0]).toBe(first);
});
it('una revisión concurrente exige otro click después de consultar, sin recálculo automático',async()=>{
  const view=form();
  updateDocumentScore.mockRejectedValueOnce(Object.assign(new Error('conflict'),{code:'stale_score_state'}));
  getDocumentScoreStatus.mockResolvedValue({...pending,validation_token:'44444444-4444-4444-8444-444444444444'});
  await view.button().props.onClick();
  expect(updateDocumentScore).toHaveBeenCalledOnce();
  expect(content(view.render())).toContain('Tus antecedentes cambiaron');
  updateDocumentScore.mockResolvedValue(result);
  getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  await view.button().props.onClick();
  expect(updateDocumentScore.mock.calls[1][0].validation_token).toBe('44444444-4444-4444-8444-444444444444');
  expect(updateDocumentScore.mock.calls[1][0].request_id).not.toBe(updateDocumentScore.mock.calls[0][0].request_id);
});
it('si falla refrescar el historial mantiene el éxito ya persistido',async()=>{
  const view=form();view.onUpdated.mockRejectedValue(new Error('read failed'));
  updateDocumentScore.mockResolvedValue(result);getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  await view.button().props.onClick();
  expect(content(view.render())).toContain('El score se guardó');
  expect(content(view.render())).toContain('Actualizado con tus nuevos antecedentes validados');
  expect(view.button()).toBeUndefined();
});

it('una consulta antigua no vuelve a mostrar pendiente después del éxito',async()=>{
  const view=form();
  let oldStatus;
  getDocumentScoreStatus.mockImplementationOnce(()=>new Promise(resolve=>{oldStatus=resolve;}));
  view.render();hooks.effects[0]();
  updateDocumentScore.mockResolvedValue(result);
  getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  await view.button().props.onClick();
  oldStatus(pending);await Promise.resolve();
  expect(view.button()).toBeUndefined();
  expect(content(view.render())).toContain('Actualizado con tus nuevos antecedentes validados');
});

it('reporta el pendiente y lo consume sólo después de la actualización explícita',async()=>{
  const onPendingChange=vi.fn();
  getDocumentScoreStatus.mockResolvedValue(pending);
  const view=form(null,{onPendingChange});view.render();hooks.effects[0]();await Promise.resolve();
  expect(onPendingChange).toHaveBeenLastCalledWith(pending);
  expect(updateDocumentScore).not.toHaveBeenCalled();
  updateDocumentScore.mockResolvedValue(result);
  getDocumentScoreStatus.mockResolvedValue({...pending,pending:false});
  await view.button().props.onClick();
  expect(onPendingChange).toHaveBeenCalledWith({pending:false});
  expect(onPendingChange.mock.calls.at(-1)[0].pending).toBe(false);
});
it('el aviso enfoca el botón real sin recalcular',()=>{
  const onFocused=vi.fn();const view=form(pending,{focusRequested:true,onFocused});
  const button=view.button();
  const target={scrollIntoView:vi.fn(),focus:vi.fn()};button.ref.current=target;
  hooks.effects[1]();
  expect(target.focus).toHaveBeenCalledWith({preventScroll:true});
  expect(onFocused).toHaveBeenCalledOnce();
  expect(updateDocumentScore).not.toHaveBeenCalled();
});
