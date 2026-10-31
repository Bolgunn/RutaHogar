import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ states: [], refs: [], si: 0, ri: 0, effect: null, effects: [] }));
const api = vi.hoisted(() => ({ read: vi.fn(), confirm: vi.fn(), decide: vi.fn() }));
vi.mock('react', async original => ({ ...await original(),
  useState: initial => { const i=hooks.si++; if (!(i in hooks.states)) hooks.states[i]=typeof initial==='function'?initial():initial;
    return [hooks.states[i], next => { hooks.states[i]=typeof next==='function'?next(hooks.states[i]):next; }]; },
  useRef: initial => hooks.refs[hooks.ri++] ??= { current: initial },
  useEffect: callback => { hooks.effect ??= callback; hooks.effects.push(callback); },
}));
vi.mock('../services/coDebtorService', () => ({ reviewCoDebtorParticipation: api.read, confirmCoDebtorParticipation: api.confirm,
  decideCoDebtorParticipation: api.decide, listCoDebtorParticipations: vi.fn(),
  runExclusive: async (ref, callback) => { if(ref.current) return; ref.current=true; try{return await callback();}finally{ref.current=null;} },
}));
import Review, { ParticipationFinancialForm } from './CoDebtorParticipationReview';
import FormattedAmountInput from './FormattedAmountInput';
const values={ ingreso_mensual_complementario:1000000,deuda_mensual_complementario:0,tipo_contrato_complementario:'indefinido',continuidad_laboral_complementario:'mas_3_anios',morosidad_complementario:'no' };
const snapshot={ participation_id:'part',status:'pending',revision_number:0,values,prefill_source:'declared',requires_relation_acceptance:true,
 relation:{event_id:'relation',value:'conyuge'},personal_prefill:{ingreso_mensual_complementario:1200000} };
const access=vi.fn(), confirmed=vi.fn();
const find=(node,predicate)=>Array.isArray(node)?node.map(item=>find(item,predicate)).find(Boolean):!React.isValidElement(node)?null:predicate(node)?node:find(node.props.children,predicate);
const render=()=>{hooks.si=0;hooks.ri=0;return Review({participationId:'part',onAccessError:access,onConfirmed:confirmed});};
const form=()=>find(render(),node=>node.type===ParticipationFinancialForm);
const start=async()=>{render();hooks.effect();await Promise.resolve();};
const consent=()=>{form().props.onAcceptRelation(true);form().props.onConsent(true);};
const confirmedSnapshot={...snapshot,status:'confirmed',revision_number:1,prefill_source:'participation',requires_relation_acceptance:false,
 relation:{...snapshot.relation,initial_accepted_event_id:'relation',initial_accepted_value:'conyuge'},matches_evaluated:true};
let focus;
const background=()=>{hooks.effects=[];render();return hooks.effects[1]();};
beforeEach(()=>{hooks.states=[];hooks.refs=[];hooks.effect=null;hooks.effects=[];vi.clearAllMocks();api.read.mockResolvedValue(structuredClone(snapshot));
 vi.stubGlobal('window',{addEventListener:(_,callback)=>{focus=callback;},removeEventListener:vi.fn(),setInterval:vi.fn(),clearInterval:vi.fn()});
 vi.stubGlobal('crypto',{randomUUID:vi.fn().mockReturnValue('request-uuid')});});
afterEach(()=>vi.unstubAllGlobals());
it('loads scoped prefill, edits five fields, requires separate unchecked acceptance and consent',async()=>{
 await start(); expect(api.read).toHaveBeenCalledWith('part');expect(form().props.form.deuda_mensual_complementario).toBe('0');
 expect(form().props.acceptRelation).toBe(false);expect(form().props.consent).toBe(false);
 await form().props.onSubmit({preventDefault(){}});expect(api.confirm).not.toHaveBeenCalled();
 form().props.onPersonal();expect(form().props.form.ingreso_mensual_complementario).toBe('1200000');
 form().props.onChange('ingreso_mensual_complementario','1300000');consent();
 api.confirm.mockResolvedValue({revision_number:1,matches_evaluated:false});await form().props.onSubmit({preventDefault(){}});
 expect(api.confirm).toHaveBeenCalledWith('part',expect.objectContaining({expected_revision:0,request_id:'request-uuid',participation_consent:true,accept_relation:true,
 values:expect.objectContaining({ingreso_mensual_complementario:1300000})}));expect(confirmed).toHaveBeenCalledWith('part');
 expect(form()).toBeFalsy();expect(find(render(),n=>n.type==='h1').props.children).toBe('Antecedentes confirmados');
});
it('prevents double submit and reuses the identical request after a transient error',async()=>{
 await start();consent();let reject;api.confirm.mockReturnValueOnce(new Promise((_,r)=>{reject=r;}));
 const submit=form().props.onSubmit;const first=submit({preventDefault(){}});submit({preventDefault(){}});expect(api.confirm).toHaveBeenCalledTimes(1);
 reject({status:503});await first;expect(form().props.form.ingreso_mensual_complementario).toBe('1000000');
 api.confirm.mockResolvedValue({revision_number:1,matches_evaluated:true});await form().props.onSubmit({preventDefault(){}});
 expect(api.confirm.mock.calls[0][1]).toEqual(api.confirm.mock.calls[1][1]);expect(crypto.randomUUID).toHaveBeenCalledOnce();
});
it('denies incorrect account and clears sensitive form values',async()=>{
 api.read.mockRejectedValue({status:403});await start();await Promise.resolve();expect(access).toHaveBeenCalledWith(403);expect(form()).toBeFalsy();
});
it('handles closure between reading and confirming without leaving financial data visible',async()=>{
 await start();consent();api.confirm.mockRejectedValue({status:409,payload:{code:'invitation_unavailable'}});
 await form().props.onSubmit({preventDefault(){}});expect(form()).toBeFalsy();expect(confirmed).not.toHaveBeenCalled();
});
it('preserves draft and blocks stale revisions until explicit reload',async()=>{
 await start();consent();api.confirm.mockRejectedValue({status:409,payload:{code:'co_debtor_revision_conflict'}});
 await form().props.onSubmit({preventDefault(){}});expect(form().props.busy).toBe(true);expect(form().props.form.ingreso_mensual_complementario).toBe('1000000');
});
it('uses authenticated decline when the relationship is rejected',async()=>{
 await start();api.decide.mockResolvedValue({status:'declined'});await form().props.onDecline();expect(api.decide).toHaveBeenCalledWith('part','decline');expect(form()).toBeFalsy();
});
it('renders declared relationship read-only and separate acceptance controls',()=>{
 const tree=ParticipationFinancialForm({review:snapshot,form:values,acceptRelation:false,consent:false});
 expect(find(tree,n=>n.props.name==='accept_relation').props.checked).toBe(false);
 expect(find(tree,n=>n.props.name==='participation_consent').props.checked).toBe(false);
 expect(find(tree,n=>n.type==='select'&&n.props.name==='relation')).toBeFalsy();
});
it('reuses formatted CLP inputs and native form controls while busy',()=>{
 const change=vi.fn();
 const tree=ParticipationFinancialForm({review:snapshot,form:values,acceptRelation:false,consent:false,busy:true,onChange:change});
 const income=find(tree,n=>n.type===FormattedAmountInput&&n.props.name==='ingreso_mensual_complementario');
 expect(income.props.allowEmpty).toBe(true);expect(income.props.disabled).toBe(true);
 income.props.onChange(1000000);expect(change).toHaveBeenCalledWith('ingreso_mensual_complementario','1000000');
 expect(find(tree,n=>n.type==='label'&&n.props.htmlFor==='hu30-ingreso_mensual_complementario')).toBeTruthy();
 const submit=find(tree,n=>n.type==='button'&&n.props.type==='submit');
 expect(submit.props.className).toBe('primary-button');expect(submit.props.disabled).toBe(true);
 expect(find(tree,n=>n.type==='button'&&n.props.children==='No acepto la relación: rechazar participación').props.className).toBe('secondary-button');
 expect(find(tree,n=>n.props.name==='participation_consent').props.disabled).toBe(true);
});
it('keeps the explicit revocation confirmation and prevents duplicate revocation while loading',async()=>{
 api.read.mockResolvedValue(confirmedSnapshot);await start();
 const begin=()=>find(render(),n=>n.type==='button'&&n.props.children==='Revocar mi participación');
 expect(begin().props.className).toBe('danger-button');begin().props.onClick();expect(api.decide).not.toHaveBeenCalled();
 find(render(),n=>n.type==='button'&&n.props.children==='Cancelar').props.onClick();expect(api.decide).not.toHaveBeenCalled();
 begin().props.onClick();let resolve;api.decide.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
 const confirm=find(render(),n=>n.type==='button'&&n.props.children==='Confirmar revocación');
 expect(confirm.props.className).toBe('danger-button');const request=confirm.props.onClick();
 expect(find(render(),n=>n.type==='button'&&n.props.children==='Revocando…').props.disabled).toBe(true);
 confirm.props.onClick();expect(api.decide).toHaveBeenCalledTimes(1);expect(api.decide).toHaveBeenCalledWith('part','revoke');
 resolve({status:'revoked'});await request;expect(form()).toBeFalsy();
 expect(find(render(),n=>n.type==='h1').props.children).toBe('Participación cerrada');
});
it('does not navigate or report a stale confirmation after logout/unmount',async()=>{
 render();const cleanup=hooks.effect();await Promise.resolve();consent();
 let resolve;api.confirm.mockReturnValue(new Promise(done=>{resolve=done;}));
 const write=form().props.onSubmit({preventDefault(){}});cleanup();
 resolve({revision_number:1,matches_evaluated:false});await write;
 expect(confirmed).not.toHaveBeenCalled();
});
it('restores success from the persisted confirmation on refresh or remount',async()=>{
 api.read.mockResolvedValue(confirmedSnapshot);await start();
 expect(form()).toBeFalsy();expect(find(render(),n=>n.type==='h1').props.children).toBe('Antecedentes confirmados');
 expect(api.confirm).not.toHaveBeenCalled();
});
it('keeps success on background re-fetch and render without asking for consent',async()=>{
 api.read.mockResolvedValue(confirmedSnapshot);await start();const cleanup=background();
 await focus();render();render();
 expect(form()).toBeFalsy();expect(find(render(),n=>n.type==='h1').props.children).toBe('Antecedentes confirmados');
 expect(api.confirm).not.toHaveBeenCalled();cleanup();
});
it('restores success if a pending read is followed by an authoritative confirmed re-fetch',async()=>{
 await start();background();api.read.mockResolvedValue(confirmedSnapshot);await focus();
 expect(form()).toBeFalsy();expect(find(render(),n=>n.type==='h1').props.children).toBe('Antecedentes confirmados');
 expect(api.confirm).not.toHaveBeenCalled();
});
it('opens revision two only explicitly, pre-fills current values and requires fresh consent without initial acceptance',async()=>{
 api.read.mockResolvedValue(confirmedSnapshot);await start();
 find(render(),n=>n.type==='button'&&n.props.children==='Revisar para una nueva confirmación').props.onClick();await Promise.resolve();
 expect(form().props.form).toEqual(Object.fromEntries(Object.entries(values).map(([key,value])=>[key,String(value)])));
 expect(form().props.review.requires_relation_acceptance).toBe(false);expect(form().props.consent).toBe(false);
 const tree=ParticipationFinancialForm(form().props);
 expect(find(tree,n=>n.props.name==='accept_relation')).toBeFalsy();
 await form().props.onSubmit({preventDefault(){}});expect(api.confirm).not.toHaveBeenCalled();
 form().props.onConsent(true);api.confirm.mockResolvedValue({revision_number:2,matches_previous:true,matches_evaluated:true});
 await form().props.onSubmit({preventDefault(){}});
 expect(api.confirm).toHaveBeenCalledOnce();expect(api.confirm.mock.calls[0][1]).toMatchObject({expected_revision:1,accept_relation:false,participation_consent:true});
 expect(form()).toBeFalsy();expect(find(render(),n=>n.type==='h1').props.children).toBe('Antecedentes confirmados');
});
it('ignores a background read started before confirmation and does not turn success into a revision conflict',async()=>{
 await start();background();let resolve;api.read.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
 const read=focus();consent();api.confirm.mockResolvedValue({revision_number:1});await form().props.onSubmit({preventDefault(){}});
 resolve(confirmedSnapshot);await read;
 expect(find(render(),n=>n.type==='p'&&String(n.props.children).includes('Cambió la revisión'))).toBeFalsy();
 expect(form()).toBeFalsy();expect(api.confirm).toHaveBeenCalledOnce();
});
it('does not roll the success revision back when background responses arrive out of order',async()=>{
 api.read.mockResolvedValue(confirmedSnapshot);await start();background();let resolve;
 api.read.mockReturnValueOnce(new Promise(done=>{resolve=done;})).mockResolvedValueOnce({...confirmedSnapshot,revision_number:2});
 const older=focus();await focus();resolve(confirmedSnapshot);await older;
 expect(find(render(),n=>n.type==='p'&&Array.isArray(n.props.children)&&n.props.children[0]==='Registramos la revisión ').props.children).toContain(2);
 expect(form()).toBeFalsy();expect(api.confirm).not.toHaveBeenCalled();
});
it('preserves an explicitly opened draft and detects concurrent revisions without overwriting it',async()=>{
 api.read.mockResolvedValue(confirmedSnapshot);await start();
 find(render(),n=>n.type==='button'&&n.props.children==='Revisar para una nueva confirmación').props.onClick();await Promise.resolve();
 form().props.onChange('ingreso_mensual_complementario','1300000');background();
 await focus();expect(form().props.form.ingreso_mensual_complementario).toBe('1300000');
 api.read.mockResolvedValue({...confirmedSnapshot,revision_number:2});await focus();
 expect(form().props.busy).toBe(true);expect(form().props.form.ingreso_mensual_complementario).toBe('1300000');
 expect(api.confirm).not.toHaveBeenCalled();
});
