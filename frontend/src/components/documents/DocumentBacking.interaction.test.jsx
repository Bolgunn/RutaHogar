import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
const hooks=vi.hoisted(()=>({states:[],effects:[],si:0}));
vi.mock('react',async(importOriginal)=>({
  ...await importOriginal(),useEffect:(effect)=>hooks.effects.push(effect),
  useState:(initial)=>{const i=hooks.si++;if(!(i in hooks.states))hooks.states[i]=initial;
    return [hooks.states[i],next=>{hooks.states[i]=typeof next==='function'?next(hooks.states[i]):next;}];},
}));
vi.mock('../../services/documentBacking',()=>({getOwnDocumentBacking:vi.fn(),getStaffDocumentBacking:vi.fn()}));
import DocumentBacking from './DocumentBacking';
import { getOwnDocumentBacking,getStaffDocumentBacking } from '../../services/documentBacking';

const projection={fields:[
  {field:'ingreso_mensual',status:'respaldado',confirmed_on:'2026-10-25'},
  {field:'ahorro_disponible',status:'con_diferencia',confirmed_on:'2026-10-25'},
  {field:'tipo_contrato',status:'sin_respaldo',confirmed_on:null},
  {field:'continuidad_laboral',status:'sin_respaldo',confirmed_on:null},
]};
function all(node,predicate){
  if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));
  if(!React.isValidElement(node))return [];
  return [...(predicate(node)?[node]:[]),...all(node.props.children,predicate)];
}
function text(node){
  if(Array.isArray(node))return node.map(text).join('');
  return React.isValidElement(node)?text(node.props.children):String(node??'');
}
const render=(props={})=>{hooks.si=0;hooks.effects=[];return DocumentBacking(props);};
afterEach(()=>{hooks.states=[];hooks.effects=[];vi.resetAllMocks();});
it('consulta la proyección propia al montar sin upload ni scoring',async()=>{
  getOwnDocumentBacking.mockResolvedValue(projection);
  render();hooks.effects[0]();await Promise.resolve();
  const view=render();
  expect(getOwnDocumentBacking).toHaveBeenCalledOnce();
  expect(getStaffDocumentBacking).not.toHaveBeenCalled();
  expect(all(view,node=>node.props.projection===projection)).toHaveLength(1);
});
it('el detalle reutiliza la proyección autorizada de la tarjeta sin otra consulta',async()=>{
  const loadStaffProjection=vi.fn().mockResolvedValue(projection);
  const props={leadId:'lead-a',mode:'staff',loadStaffProjection};
  render(props);hooks.effects[0]();await Promise.resolve();
  expect(loadStaffProjection).toHaveBeenCalledWith('lead-a',{refresh:false});
  expect(getStaffDocumentBacking).not.toHaveBeenCalled();
  expect(all(render(props),node=>node.props.projection===projection)).toHaveLength(1);
});
it('un lead nuevo no muestra ni acepta respuesta tardía del anterior',async()=>{
  let first;
  getStaffDocumentBacking.mockImplementationOnce(()=>new Promise(resolve=>{first=resolve;}));
  render({leadId:'lead-a'});const cleanup=hooks.effects[0]();
  const switched=render({leadId:'lead-b'});
  expect(text(switched)).toContain('Consultando');
  expect(all(switched,node=>node.props.projection)).toHaveLength(0);
  cleanup();
  getStaffDocumentBacking.mockResolvedValue(projection);
  hooks.effects[0]();await Promise.resolve();
  first({fields:[]});await Promise.resolve();
  const loaded=render({leadId:'lead-b'});
  expect(all(loaded,node=>node.props.projection===projection)).toHaveLength(1);
});
it('denegación/error no se representa como sin respaldo ni usa fallback propio',async()=>{
  getStaffDocumentBacking.mockRejectedValue(new Error('forbidden'));
  render({leadId:'unauthorized'});hooks.effects[0]();
  await Promise.resolve();await Promise.resolve();
  const view=render({leadId:'unauthorized'});
  expect(text(view)).toContain('No pudimos consultar');
  expect(all(view,node=>node.props.projection)).toHaveLength(0);
  expect(getOwnDocumentBacking).not.toHaveBeenCalled();
});
it('permite volver a consultar después de nuevos respaldos',async()=>{
  getOwnDocumentBacking.mockResolvedValue(projection);
  render();hooks.effects[0]();await Promise.resolve();
  const view=render();
  expect(all(view,node=>node.type==='button')).toHaveLength(0);
  expect(text(view)).toContain('Estados documentales actualizados');
  const loading=render({refreshKey:1});
  expect(text(loading)).toContain('Consultando');
  hooks.effects[0]();await Promise.resolve();
  expect(getOwnDocumentBacking).toHaveBeenCalledTimes(2);
});

it('ofrece reintento sólo cuando la consulta falla',async()=>{
  getOwnDocumentBacking.mockRejectedValueOnce(new Error('network'));
  render();hooks.effects[0]();await Promise.resolve();await Promise.resolve();
  const view=render();
  const button=all(view,node=>node.type==='button')[0];
  expect(text(button)).toBe('Reintentar consulta');
  button.props.onClick();
  getOwnDocumentBacking.mockResolvedValue(projection);
  render();hooks.effects[0]();await Promise.resolve();
  expect(text(render())).toContain('Estados documentales actualizados');
});
