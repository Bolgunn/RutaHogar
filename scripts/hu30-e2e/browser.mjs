// Real local GoTrue sessions + production handler/services + PostgREST/RLS/SQL.
// Real SPA routes; session bootstrap HTML, mail transport, market and clock are test adapters.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(path.join(root,'frontend/node_modules/playwright/index.mjs'));
const c=JSON.parse(fs.readFileSync(process.env.HU30_E2E_CONFIG,'utf8'));
const ui=`http://127.0.0.1:${c.vite_port}`,api=`http://127.0.0.1:${c.backend_port}`;
const password='Hu30-local-'+randomUUID()+'!';
const sql=query=>execFileSync('docker',['exec','-i',c.container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8'}).trim();
async function request(url,token,body,method=body===undefined?'GET':'POST'){
 const response=await fetch(url,{method,headers:{apikey:c.anon_key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}return{status:response.status,data,headers:Object.fromEntries(response.headers)};
}
async function ok(url,token,body,method){const r=await request(url,token,body,method);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}
const edge=(token,body)=>request(c.url+'/functions/v1/co-debtor-consent',token,body);
const signin=email=>ok(c.url+'/auth/v1/token?grant_type=password',null,{email,password});
async function user(email,role='usuario',tenant=null){
 const r=await request(c.url+'/auth/v1/admin/users',c.service_key,{email,password,email_confirm:true,user_metadata:{full_name:email.split('@')[0],rut:'11111111-1',birth_date:'1990-01-01'}});
 assert.equal(r.status,200,JSON.stringify(r.data));const id=r.data.id;
 sql(`insert into public.profiles(id,role,rut,full_name,inmobiliaria_id,onboarding_data) values('${id}','${role}','11111111-1','${email.split('@')[0]}',${tenant?"'"+tenant+"'":'null'},'{"comuna_interes":"HU30 A","tipo_propiedad":"casa","objetivo_principal":"comprar_ahora","plazo_compra":"6_12_meses"}');`);
 return{id,email,...await signin(email)};
}
const tenant=randomUUID(),outside=randomUUID();
sql(`insert into public.inmobiliarias(id,nombre) values('${tenant}','HU30 E2E A'),('${outside}','HU30 E2E B');insert into public.proyectos(inmobiliaria_id,nombre,comuna,tipo,precio_min_uf,precio_max_uf) values('${tenant}','HU30 E2E project','HU30 A','casa',2000,3000);`);
const owner=await user('owner@hu30.invalid'),other=await user('other@hu30.invalid');
const staff=await user('staff@hu30.invalid','ejecutivo',tenant),foreign=await user('foreign@hu30.invalid','ejecutivo',outside);
const snapshot={ingreso_mensual:1000000,deuda_mensual:200000,edad:30,ahorro_disponible:100000000,plazo_credito_hipotecario:20,tipo_contrato:'indefinido',continuidad_laboral:'mas_3_anios',morosidad_actual:'no',consentimiento:true,complemento_renta:false,property_value_clp:100000000,dividendo_estimado:300000,comuna_objetivo:'HU30 A'};
const baseline=await ok(api+'/tracking/events',owner.access_token,{event_id:randomUUID(),event_kind:'evaluation',effective_at:new Date().toISOString(),reason:'HU30 local integration baseline',patch:snapshot});
const baselineRows=sql(`select md5(financial_data::text) from public.evaluations where user_id='${owner.id}' order by created_at;`);
const initial=await ok(api+'/tracking/owner/evaluations',owner.access_token);assert.equal(initial.items[0].co_debtor.evaluation_type,'individual');
const declared={ingreso_mensual_complementario:800000,deuda_mensual_complementario:50000,tipo_contrato_complementario:'plazo_fijo',continuidad_laboral_complementario:'entre_6_y_12_meses',morosidad_complementario:'no'};
const invite=await edge(owner.access_token,{action:'create_invitation',recipient_email:'participant@hu30.invalid',recipient_rut:'12345678-5',relacion_complementario:'conyuge',...declared});assert.equal(invite.status,200,JSON.stringify(invite.data));
const mailbox=()=>fetch(c.mail).then(r=>r.json());
const mails=await mailbox();const invitationMail=mails.find(m=>m.to?.includes('participant@hu30.invalid')&&((m.text||'')+(m.html||'')).includes('/co-deudor/invitacion'));
if(!invitationMail)console.log('Mailbox metadata',mails.map(m=>({to:m.to,keys:Object.keys(m)})));
assert.ok(invitationMail,'Invitation delivered to isolated mailbox');const link=(invitationMail.html||invitationMail.text).match(/http[^\s]+\/co-deudor\/invitacion\?token=[A-Za-z0-9_-]+/)[0];
const invitation=sql(`select id from public.co_debtor_invitations where lead_id='${owner.id}' order by created_at desc limit 1;`);
assert.equal(invite.headers['cache-control'],'private, no-store');
for(const origin of ['https://evil.invalid','null']){
 const blocked=await fetch(c.url+'/functions/v1/co-debtor-consent',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({action:'list_participations'})});
 assert.equal(blocked.status,403);assert.equal(blocked.headers.get('cache-control'),'private, no-store');assert.equal(blocked.headers.has('access-control-allow-origin'),false);
}
const preflight=await fetch(c.url+'/functions/v1/co-debtor-consent',{method:'OPTIONS',headers:{Origin:ui,'Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),ui);
console.log('PASS T9B Edge real transport: private no-store; untrusted/null origins blocked; exact-origin preflight');
console.log('PASS real API: individual immutable baseline -> invitation delivered locally; no confirmation yet');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const errors=[],warnings=[];const counts={};let context;
try{
 context=await browser.newContext({viewport:{width:1280,height:960}});
 context.on('page',page=>{page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text().replace(/https?:\/\/[^\s]+/g,'[request]'))});page.on('response',async r=>{if(r.status()>=400){console.log('HTTP',r.status(),new URL(r.url()).pathname);if(new URL(r.url()).pathname==='/rest/v1/profiles'){const data=await r.json();console.log('Profile failure',data.code,data.message);}}});page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER ERROR',e.message)});page.on('console',m=>{if(m.type()==='error'&&/Warning:|React|unique.*key|unmounted/i.test(m.text()))warnings.push(m.text())});page.on('request',r=>{if(r.url().startsWith(api+'/tracking/')){const key=r.method()+' '+new URL(r.url()).pathname;counts[key]=(counts[key]||0)+1}})});
 fs.writeFileSync(path.join(path.dirname(process.env.HU30_E2E_CONFIG),'fixture.html'),`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">import {supabase} from '/src/utils/supabase.ts';import {signIn,signOut} from '/src/services/auth.js';window.sb=supabase;window.rhAuth={signIn,signOut};</script></body></html>`);
 await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.fulfill({status:200,contentType:route.request().resourceType()==='stylesheet'?'text/css':'application/javascript',body:''}));
 const page=await context.newPage();await page.goto(link);await page.locator('#auth-email').waitFor();
 const secondTab=await context.newPage();await secondTab.setViewportSize({width:390,height:844});await secondTab.goto(link);await secondTab.locator('#auth-email').waitFor();assert.equal(await secondTab.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.reload();await page.locator('#auth-email').waitFor();await secondTab.close();
 console.log('PASS real invitation UI: two independent return contexts survive reload; desktop/mobile no horizontal overflow');
 await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();
 await page.locator('#auth-nombre').fill('Participante');await page.locator('#auth-apellido-paterno').fill('Local');await page.locator('#auth-apellido-materno').fill('Prueba');
 await page.locator('[name="rut_number"]').fill('12345678');await page.locator('[name="rut_dv"]').fill('5');await page.locator('#auth-phone').fill('12345678');
 await page.getByLabel('Día de nacimiento',{exact:true}).fill('01');await page.getByLabel('Mes de nacimiento',{exact:true}).fill('01');await page.getByLabel('Año de nacimiento',{exact:true}).fill('1990');
 await page.locator('#auth-email').fill('participant@hu30.invalid');await page.locator('#auth-password').fill(password);await page.locator('button[type=submit]').click();
 await page.getByRole('status').filter({hasText:/correo/}).waitFor();
 const unverified=await request(c.url+'/auth/v1/token?grant_type=password',null,{email:'participant@hu30.invalid',password});assert.equal(unverified.status,400);assert.equal(unverified.data.error_code,'email_not_confirmed');
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'0');
 const authMail=(await mailbox()).find(m=>m.kind==='auth'&&m.to?.includes('participant@hu30.invalid'));
 assert.ok(authMail,'Real Auth verification email captured');const verify=authMail.text.match(/https?:\/\/[^\s"<>]+verify[^\s"<>]+/)[0].replaceAll('&amp;','&');
 const verified=await context.newPage();await verified.goto(verify);console.log("Verification return:",new URL(verified.url()).origin,new URL(verified.url()).pathname);await verified.getByRole('heading',{name:'Revisa tus antecedentes',exact:true}).waitFor();
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'0');
 console.log('PASS real Auth UI: registration, no session before email verification, confirmation link in another tab, account/RUT binding, authorized prefill');
 await verified.locator('[name="ingreso_mensual_complementario"]').fill('1500000');await verified.locator('[name="deuda_mensual_complementario"]').fill('300000');
 await verified.locator('[name="tipo_contrato_complementario"]').selectOption('indefinido');await verified.locator('[name="continuidad_laboral_complementario"]').selectOption('mas_3_anios');
 await verified.locator('[name="accept_relation"]').check();await verified.locator('[name="participation_consent"]').check();
 let loseConfirmationResponse=true;
 await context.route('**/functions/v1/co-debtor-consent',async route=>{
  if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='confirm_participation'&&loseConfirmationResponse){loseConfirmationResponse=false;const committed=await route.fetch();assert.equal(committed.status(),200);return route.abort('failed');}
  return route.fallback();
 });
 await verified.getByRole('button',{name:'Confirmar mis antecedentes',exact:true}).dblclick();await verified.getByRole('alert').filter({hasText:/Puedes reintentar/}).waitFor();
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'1');
 await verified.getByRole('button',{name:'Confirmar mis antecedentes',exact:true}).click();await verified.getByRole('heading',{name:'Antecedentes confirmados',exact:true}).waitFor();
 console.log('PASS real network retry: confirmation committed, response deliberately lost, UI retry returns the same revision');
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'1');assert.equal(sql(`select count(*) from public.evaluations where user_id='${owner.id}';`),'1');
 await page.close();
 const pending=await ok(api+'/tracking',owner.access_token);assert.equal(pending.co_debtor.update_required,true);
 await verified.goto(ui+'/__session');await verified.waitForFunction(()=>window.sb);
 await verified.evaluate(async({email,password})=>{await window.rhAuth.signOut();await window.rhAuth.signIn({email,password})},{email:owner.email,password});
 await verified.goto(ui+'/recomendaciones');await verified.getByRole('button',{name:'Actualizar score con datos confirmados',exact:true}).waitFor();
 await verified.getByRole('button',{name:'Actualizar score con datos confirmados',exact:true}).dblclick();await verified.getByRole('heading',{name:'Capacidad Bipersonal',exact:true}).waitFor();
 const evaluations=await ok(api+'/tracking/owner/evaluations',owner.access_token);const latest=evaluations.items[0];assert.equal(evaluations.items.length,2);assert.equal(latest.co_debtor.evaluation_type,'bipersonal_confirmed');
 assert.equal(sql(`select md5(financial_data::text) from public.evaluations where id='${baseline.evaluation_ids[0]}';`),baselineRows);
 const revision=sql(`select id from public.co_debtor_confirmations where invitation_id='${invitation}';`);assert.equal(latest.financial_data.provenance.co_debtor_confirmation_id,revision);assert.equal(latest.co_debtor.used_revision.id,revision);
 assert.ok(latest.co_debtor.capacity.delta.purchase_capacity_uf>0);assert.ok(Math.abs(latest.co_debtor.capacity.delta.purchase_capacity_clp-latest.co_debtor.capacity.delta.purchase_capacity_uf*latest.co_debtor.capacity.uf_value_clp)<.001);
 await verified.screenshot({path:'/tmp/hu30-t9a-owner-desktop.png',fullPage:true});await verified.setViewportSize({width:390,height:844});assert.equal(await verified.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS real vertical flow: authenticated financial review -> one immutable revision -> pending -> explicit update -> new evaluation -> exact revision/UF/CLP -> owner desktop/mobile');
 const reviser=await signin('participant@hu30.invalid');
 const review=await edge(reviser.access_token,{action:'review_participation',participation_id:invitation});assert.equal(review.status,200);
 const command={action:'confirm_participation',participation_id:invitation,request_id:randomUUID(),expected_revision:review.data.revision_number,relation_event_id:review.data.relation.event_id,accept_relation:false,participation_consent:true,values:review.data.values};
 const retries=await Promise.all([edge(reviser.access_token,command),edge(reviser.access_token,command)]);assert.deepEqual(retries.map(r=>r.status),[200,200]);
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'2');
 const matching=await ok(api+'/tracking/owner/evaluations',owner.access_token);assert.equal(matching.items[0].co_debtor.matching_confirmed_later,true);assert.equal(matching.items[0].co_debtor.update_required,false);
 assert.equal((await request(api+'/tracking/evaluations/co-debtor-confirmation',owner.access_token,{})).status,409);
 const changes={...command,expected_revision:2,values:{...command.values,deuda_mensual_complementario:350000}};
 const competing=await Promise.all([edge(reviser.access_token,{...changes,request_id:randomUUID()}),edge(reviser.access_token,{...changes,request_id:randomUUID()})]);assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'3');assert.equal(sql(`select count(*) from public.evaluations where user_id='${owner.id}';`),'2');
 assert.equal((await ok(api+'/tracking/owner/evaluations',owner.access_token)).items[0].co_debtor.update_required,true);
 console.log('PASS real Edge/SQL: same request concurrent retry creates one coincident revision; no unnecessary evaluation; two-tab changed revisions serialize with one conflict; history remains on revision 1');
 // Real REST/RLS and tenant negatives, never a client-only authorization test.
 assert.equal((await ok(api+'/tracking/owner/evaluations',other.access_token)).items.length,0);
 assert.equal((await edge(other.access_token,{action:'review_participation',participation_id:invitation})).status,403);
 assert.equal((await request(api+'/tracking/staff/leads/'+owner.id,foreign.access_token)).status,403);
 assert.equal((await request(api+'/tracking/staff/evaluations',owner.access_token)).status,403);
 assert.equal((await ok(c.url+'/rest/v1/evaluations?select=id',staff.access_token)).length,0);
 assert.equal((await request(c.url+'/rest/v1/profiles?id=eq.'+owner.id,owner.access_token,{role:'admin'},'PATCH')).status,403);
 assert.equal((await edge(null,{action:'submit_confirmation',token:new URL(link).searchParams.get('token'),...declared})).status,409);
 const contactLeak=await request(c.url+'/rest/v1/rpc/list_lead_contacts',foreign.access_token,{p_user_ids:[owner.id]});
 assert.equal(contactLeak.status,200);assert.equal(contactLeak.headers['cache-control'],'private, no-store');assert.deepEqual(contactLeak.data,[]);assert.equal((await ok(c.url+'/rest/v1/rpc/list_lead_contacts',staff.access_token,{p_user_ids:[owner.id]}))[0].id,owner.id);assert.deepEqual(await ok(c.url+'/rest/v1/rpc/list_lead_contacts',owner.access_token,{p_user_ids:[owner.id]}),[]);console.log('PASS T9B real contact RPC: tenant A allowed, tenant B and non-staff return empty uniformly');
 assert.equal((await edge(staff.access_token,{action:'review_participation',participation_id:invitation})).status,403);
 const actualParticipant=await signin('participant@hu30.invalid');sql(`update public.profiles set rut='11111111-1' where id='${actualParticipant.user.id}';`);assert.equal((await edge(actualParticipant.access_token,{action:'review_participation',participation_id:invitation})).status,403);
 sql(`update public.profiles set rut='12345678-5' where id='${actualParticipant.user.id}';`);assert.equal((await edge(actualParticipant.access_token,{action:'review_participation',participation_id:invitation})).status,200);
 console.log('PASS real Auth/RLS: other owner, wrong participant, foreign tenant, non-staff, direct snapshots, own role escalation and legacy anonymous write blocked');
 const expiring=await signin('participant@hu30.invalid');const revoked=await request(c.url+'/auth/v1/logout',expiring.access_token,{});assert.equal(revoked.status,204);
 assert.equal((await edge(expiring.access_token,{action:'review_participation',participation_id:invitation})).status,401);
 console.log('PASS real Auth: logged-out session cannot reuse its still-signed access token');
 const validForExpiry=await signin('participant@hu30.invalid');assert.equal((await edge(validForExpiry.access_token,{action:'review_participation',participation_id:invitation})).status,200);
 const pieces=validForExpiry.access_token.split('.');const claims=JSON.parse(Buffer.from(pieces[1],'base64url'));claims.exp=claims.iat-1;
 const expiredMessage=pieces[0]+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url');const expiredJwt=expiredMessage+'.'+createHmac('sha256',c.jwt_secret).update(expiredMessage).digest('base64url');
 assert.equal((await edge(expiredJwt,{action:'review_participation',participation_id:invitation})).status,401);
 console.log('PASS real Auth: correctly signed expired local access token rejected');
 // Return after login and wrong-account recovery use the actual AuthPanel.
 await verified.goto(ui+'/__session');await verified.waitForFunction(()=>window.sb);await verified.evaluate(()=>window.rhAuth.signOut());
 await verified.goto(ui+'/co-deudor/invitacion?participation='+invitation);await verified.locator('#auth-email').waitFor();
 await verified.locator('#auth-email').fill(other.email);await verified.locator('#auth-password').fill(password);await verified.locator('button[type=submit]').click();
 await verified.getByText('Esta cuenta no puede acceder a la invitación. Puedes cambiar de cuenta.').waitFor();
 await verified.getByRole('button',{name:'Cerrar sesión y cambiar de cuenta',exact:true}).click();await verified.locator('#auth-email').waitFor();
 await verified.locator('#auth-email').fill('participant@hu30.invalid');await verified.locator('#auth-password').fill(password);await verified.locator('button[type=submit]').click();
 await verified.getByRole('heading',{name:'Revisa tus antecedentes',exact:true}).waitFor();
 assert.equal(sql(`select count(*) from public.co_debtor_confirmations where invitation_id='${invitation}';`),'3');
 console.log('PASS real Auth UI: wrong account blocked without financial detail; switch account -> password login -> return to the same participation without creating a revision');
 // Staff UI, actual contact metadata and privacy after exact projection cutoff.
 await verified.goto(ui+'/__session');await verified.waitForFunction(()=>window.sb);
 await verified.evaluate(async({email,password})=>{await window.rhAuth.signOut();await window.rhAuth.signIn({email,password})},{email:staff.email,password});
 await verified.setViewportSize({width:1280,height:960});await verified.goto(ui+'/ejecutivo/leads');await verified.locator('.executive-leads-inbox .executive-lead-card').first().waitFor();
 assert.match(await verified.locator('.executive-leads-inbox').innerText(),/owner@hu30.invalid/,'Staff list must preserve the authenticated contact email');
 await verified.getByLabel('Participación financiera').selectOption('individual');assert.equal(await verified.locator('.executive-leads-inbox .executive-lead-card').count(),0);
 await verified.getByLabel('Participación financiera').selectOption('all');assert.equal(await verified.locator('.executive-leads-inbox .executive-lead-card').count(),1);
 await verified.screenshot({path:'/tmp/hu30-t9a-staff-desktop.png',fullPage:true});await verified.setViewportSize({width:390,height:844});
 await verified.getByLabel('Participación financiera').selectOption('bipersonal_confirmed');assert.equal(await verified.locator('.executive-leads-inbox .executive-lead-card').count(),1);
 for(let i=0;i<3&&await verified.locator('.notification-close').count();i++)await verified.locator('.notification-close').first().click();
 await verified.locator('.executive-leads-inbox .executive-lead-card').first().getByText('Ver detalle',{exact:true}).click();await verified.getByRole('heading',{name:'Participación financiera',exact:true}).waitFor();
 assert.match(await verified.locator('.staff-bipersonal').innerText(),/1\.500\.000/);assert.ok((await verified.locator('.staff-bipersonal').boundingBox()).width<=390);await verified.locator('.staff-bipersonal').scrollIntoViewIfNeeded();await verified.screenshot({path:'/tmp/hu30-t9a-staff-mobile.png',fullPage:true});
 const activeParticipant=await signin('participant@hu30.invalid');const close=await edge(activeParticipant.access_token,{action:'revoke_participation',participation_id:invitation});assert.equal(close.status,200);
 const liveOwner=await signin(owner.email);assert.equal((await request(api+'/tracking/evaluations/co-debtor-confirmation',liveOwner.access_token,{})).status,409);
 const cutoff=sql(`select (min(occurred_at)+interval '30 days')::text from public.co_debtor_consent_events where invitation_id='${invitation}' and event_type='revoked';`);const before=sql(`select ('${cutoff}'::timestamptz-interval '1 microsecond')::text;`);
 const evidence=sql(`select md5(financial_data::text) from public.evaluations where id='${latest.id}';`);
 await ok(c.url+'/__test/time',null,{time:before});assert.equal((await ok(api+'/tracking/staff/leads/'+owner.id,staff.access_token)).co_debtor.visibility,'visible');
 await ok(c.url+'/__test/time',null,{time:cutoff});assert.equal((await ok(api+'/tracking/staff/leads/'+owner.id,staff.access_token)).co_debtor.visibility,'hidden');
 await verified.evaluate(()=>window.dispatchEvent(new Event('focus')));await verified.getByText(/ocultos por privacidad/).waitFor();assert.doesNotMatch(await verified.locator('.staff-bipersonal').innerText(),/1\.500\.000|300\.000|Cónyuge/);
 assert.equal(sql(`select md5(financial_data::text) from public.evaluations where id='${latest.id}';`),evidence);
 console.log('PASS real API/UI: staff detail and filtering; revocation excludes future use; just-before/exact cutoff redaction; immutable financial snapshot');
 // Additional vertical financial cases use new synthetic owners, the same real
 // participant and unchanged scoring/configuration. No mocked projection rows.
 await ok(c.url+'/__test/time',null,{time:null});
 const financialCases=[];
 for(const [name,savings,debt,sign] of [['zero',1000000,0,0],['negative',100000000,1800000,-1]]){
  const account=await user(name+'@hu30.invalid');
  await ok(api+'/tracking/events',account.access_token,{event_id:randomUUID(),event_kind:'evaluation',effective_at:new Date().toISOString(),reason:'HU30 local '+name,patch:{...snapshot,ahorro_disponible:savings}});
  const invitationResult=await edge(account.access_token,{action:'create_invitation',recipient_email:'participant@hu30.invalid',recipient_rut:'12345678-5',relacion_complementario:'conyuge',...declared});assert.equal(invitationResult.status,200);
  const message=(await mailbox()).filter(m=>(m.html||'').includes('/co-deudor/invitacion')).at(-1);const freshLink=message.html.match(/http[^\s]+\/co-deudor\/invitacion\?token=[A-Za-z0-9_-]+/)[0];
  const access=await edge(activeParticipant.access_token,{action:'authorize_invitation',token:new URL(freshLink).searchParams.get('token')});assert.equal(access.status,200,JSON.stringify(access.data));
  const participation=sql(`select id from public.co_debtor_invitations where lead_id='${account.id}';`);
  const prepared=await edge(activeParticipant.access_token,{action:'review_participation',participation_id:participation});assert.equal(prepared.status,200);
  const confirmed=await edge(activeParticipant.access_token,{action:'confirm_participation',participation_id:participation,request_id:randomUUID(),expected_revision:prepared.data.revision_number,relation_event_id:prepared.data.relation.event_id,accept_relation:true,participation_consent:true,values:{...prepared.data.values,ingreso_mensual_complementario:1500000,deuda_mensual_complementario:debt}});assert.equal(confirmed.status,200,JSON.stringify(confirmed.data));
  await ok(api+'/tracking/evaluations/co-debtor-confirmation',account.access_token,{});
  const projected=(await ok(api+'/tracking/owner/evaluations',account.access_token)).items[0];const commercial=await ok(api+'/tracking/staff/leads/'+account.id,staff.access_token);
  assert.equal(projected.co_debtor.evaluation_type,'bipersonal_confirmed');assert.equal(Math.sign(projected.co_debtor.capacity.delta.purchase_capacity_uf),sign);assert.deepEqual(commercial.co_debtor.capacity,projected.co_debtor.capacity);
  assert.equal(sql(`select count(*) from public.evaluations where user_id='${account.id}';`),'2');
  assert.equal(commercial.co_debtor.has_other_active_participations,name==='negative');
  financialCases.push({account,participation});
 }
 const zeroAgain=await ok(api+'/tracking/staff/leads/'+financialCases[0].account.id,staff.access_token);assert.equal(zeroAgain.co_debtor.has_other_active_participations,true);assert.ok(!JSON.stringify(zeroAgain).includes(financialCases[1].participation));assert.ok(!JSON.stringify(zeroAgain).includes(financialCases[1].account.id));
 const declaration=await user('declared@hu30.invalid');
 await ok(api+'/tracking/events',declaration.access_token,{event_id:randomUUID(),event_kind:'evaluation',effective_at:new Date().toISOString(),reason:'HU30 declared complement',patch:{...snapshot,...declared,relacion_complementario:'conyuge',complemento_renta:true}});
 assert.equal((await ok(api+'/tracking/owner/evaluations',declaration.access_token)).items[0].co_debtor.evaluation_type,'declared_complement');
 // Explicitly seed an old snapshot without provenance to test compatibility;
 // this is not a backfill or a write to any historical production evaluation.
 const legacy=await user('legacy@hu30.invalid');const legacyId=randomUUID();
 sql(`insert into public.evaluations(id,user_id,score,classification,financial_data) select '${legacyId}','${legacy.id}',score,classification,jsonb_set(financial_data-'provenance','{result}',(financial_data->'result')-'bipersonal_summary') from public.evaluations where user_id='${declaration.id}' limit 1;`);
 const legacyBefore=sql(`select md5(financial_data::text) from public.evaluations where id='${legacyId}';`);
 assert.equal((await ok(api+'/tracking/owner/evaluations',legacy.access_token)).items[0].co_debtor.evaluation_type,'unverifiable_origin');assert.equal((await ok(api+'/tracking/staff/leads/'+legacy.id,staff.access_token)).co_debtor.evaluation_type,'unverifiable_origin');assert.equal(sql(`select md5(financial_data::text) from public.evaluations where id='${legacyId}';`),legacyBefore);
 console.log('PASS additional real vertical cases: zero/negative contribution, owner/staff exact metrics, boolean-only other participations, declared complement and unmodified unverifiable legacy');
 // Replace a confirmed participation through the real invitation operation.
 const replaced=financialCases[0];const replacement=await edge(replaced.account.access_token,{action:'create_invitation',recipient_email:'participant@hu30.invalid',recipient_rut:'12345678-5',relacion_complementario:'conyuge',...declared});assert.equal(replacement.status,200);
 assert.equal((await edge(activeParticipant.access_token,{action:'review_participation',participation_id:replaced.participation})).status,409);
 assert.equal((await request(api+'/tracking/evaluations/co-debtor-confirmation',replaced.account.access_token,{})).status,409);
 const closure=sql(`select public.hu30_closure_at('${replaced.participation}');`);
 const replacementCutoff=sql(`select ('${closure}'::timestamptz+interval '30 days')::text;`);
 await ok(c.url+'/__test/time',null,{time:sql(`select ('${replacementCutoff}'::timestamptz-interval '1 microsecond')::text;`)});
 assert.equal((await ok(api+'/tracking/staff/leads/'+replaced.account.id,staff.access_token)).co_debtor.visibility,'visible');
 sql(`select public.hu18_revoke_consent('${replaced.participation}');`);assert.equal(sql(`select public.hu30_closure_at('${replaced.participation}');`),closure);
 await ok(c.url+'/__test/time',null,{time:replacementCutoff});assert.equal((await ok(api+'/tracking/staff/leads/'+replaced.account.id,staff.access_token)).co_debtor.visibility,'hidden');await ok(c.url+'/__test/time',null,{time:null});
 const pendingId=sql(`select id from public.co_debtor_invitations where lead_id='${replaced.account.id}' and status='pending';`);
 const pendingMessage=(await mailbox()).filter(m=>(m.html||'').includes('/co-deudor/invitacion')).at(-1);const pendingLink=pendingMessage.html.match(/http[^\s]+\/co-deudor\/invitacion\?token=[A-Za-z0-9_-]+/)[0];
 assert.equal((await edge(activeParticipant.access_token,{action:'authorize_invitation',token:new URL(pendingLink).searchParams.get('token')})).status,200);
 assert.equal((await edge(activeParticipant.access_token,{action:'decline_participation',participation_id:pendingId})).status,200);
 assert.equal((await edge(activeParticipant.access_token,{action:'review_participation',participation_id:pendingId})).status,409);
 const expiringInvitation=await edge(replaced.account.access_token,{action:'create_invitation',recipient_email:'participant@hu30.invalid',recipient_rut:'12345678-5',relacion_complementario:'conyuge',...declared});assert.equal(expiringInvitation.status,200);
 const expiredId=sql(`select id from public.co_debtor_invitations where lead_id='${replaced.account.id}' and status='pending';`);
 sql(`update public.co_debtor_invitations set created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' where id='${expiredId}';select public.hu18_expire_invitations();`);
 assert.equal(sql(`select status from public.co_debtor_invitations where id='${expiredId}';`),'expired');
 const expiredMessageMail=(await mailbox()).filter(m=>(m.html||'').includes('/co-deudor/invitacion')).at(-1);const expiredLink=expiredMessageMail.html.match(/http[^\s]+\/co-deudor\/invitacion\?token=[A-Za-z0-9_-]+/)[0];
 assert.equal((await edge(activeParticipant.access_token,{action:'authorize_invitation',token:new URL(expiredLink).searchParams.get('token')})).status,409);
 console.log('PASS integrated states: pending/declined/expired, confirmed replacement immediately excluded; later revocation preserves first cutoff; historical projection visible before and hidden at exact cutoff');
 assert.deepEqual(errors,[]);assert.deepEqual(warnings,[]);console.log('Browser React warnings/errors: 0; tracking request counts:',JSON.stringify(counts));
}catch(error){for(const page of context?.pages()||[]){console.error('SCREEN',await page.locator('body').innerText().catch(()=>''));}throw error;}finally{await context?.close();await browser.close()}
