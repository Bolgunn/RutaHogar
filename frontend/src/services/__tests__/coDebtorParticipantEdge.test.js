import { beforeEach, expect, it, vi } from "vitest";
import { participantAction, parseParticipantCommand } from "../../../../supabase/functions/co-debtor-consent/participation.ts";
const id="a5000000-0000-0000-0000-000000000001", relation="a5000000-0000-0000-0000-000000000002";
const values={ ingreso_mensual_complementario:1000000,deuda_mensual_complementario:0,tipo_contrato_complementario:"indefinido",continuidad_laboral_complementario:"mas_3_anios",morosidad_complementario:"no" };
const command=()=>({ action:"confirm_participation",participation_id:id,request_id:crypto.randomUUID(),expected_revision:0,
  relation_event_id:relation,accept_relation:true,participation_consent:true,values:{...values} });
const req=()=>new Request('https://edge.test',{headers:{Authorization:'Bearer real-session'}});
let admin;
beforeEach(()=>{admin={auth:{getUser:vi.fn(async()=>({data:{user:{id:'actor-from-auth'}}}))},rpc:vi.fn(async()=>({data:{status:'confirmed',replayed:false}}))};});
it.each(["review_participation","confirm_participation","decline_participation","revoke_participation","list_participations"])("authenticates every %s command and uses only the server actor",async action=>{
  const body=action==='confirm_participation'?command():{action,...(action==='list_participations'?{}:{participation_id:id})};
  expect((await participantAction(req(),body,admin)).status).toBe(200);
  expect(admin.rpc.mock.calls[0][1].p_actor).toBe('actor-from-auth');
});
it.each(['actor','user_id','invitation_id','lead_id','participant_user_id','treatment_consented_at','treatment_consent_version'])('rejects payload manipulation %s',async field=>{
  const response=await participantAction(req(),{...command(),[field]:'forged'},admin);
  expect(response.status).toBe(422); expect(admin.rpc).not.toHaveBeenCalled();
});
it.each(['ingreso_mensual_complementario','deuda_mensual_complementario','tipo_contrato_complementario','continuidad_laboral_complementario','morosidad_complementario'])('rejects missing %s',field=>{
 const body=command();delete body.values[field];expect(()=>parseParticipantCommand(body)).toThrow();
});
it.each([null,undefined,-1,Infinity,NaN,true,"100",Number.MAX_SAFE_INTEGER+1])('rejects invalid numeric value %s',value=>{
 const body=command();body.values.ingreso_mensual_complementario=value;expect(()=>parseParticipantCommand(body)).toThrow();
});
it("requires a valid session even if the participant ID is known",async()=>{
 admin.auth.getUser.mockResolvedValue({error:{}});
 expect((await participantAction(req(),command(),admin)).status).toBe(401);expect(admin.rpc).not.toHaveBeenCalled();
});
it.each(['participant_identity_mismatch','not_found','invitation_unavailable','co_debtor_relation_conflict','co_debtor_revision_conflict','idempotency_conflict'])('sanitizes server refusal %s',async message=>{
 admin.rpc.mockResolvedValue({error:{message}});
 const response=await participantAction(req(),command(),admin);
 expect(response.status).not.toBe(200);expect(JSON.stringify(response)).not.toContain('real-session');
});
it("notifies only a newly created revision, never an idempotent retry",async()=>{
 const notify=vi.fn();const body=command();
 await participantAction(req(),body,admin,notify);
 admin.rpc.mockResolvedValue({data:{status:'confirmed',replayed:true}});
 await participantAction(req(),body,admin,notify);
 expect(notify).toHaveBeenCalledTimes(1);
});

it('notifies matching data without offering an unnecessary recalculation', async () => {
 const { leadConfirmationEmail } = await import('../../../../supabase/functions/co-debtor-consent/email.ts');
 const message=leadConfirmationEmail('https://rutahogar.invalid/recomendaciones',true);
 expect(message.html).toContain('No hay cambios financieros que incorporar');
 expect(message.html).not.toContain('Actualizar score con datos confirmados');
});
