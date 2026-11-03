-- Disposable SQL only. Exercise real policies/RPCs as authenticated callers.
begin;
insert into public.inmobiliarias(id,nombre) values
 ('c9000000-0000-0000-0000-000000000001','T9B A'),('c9000000-0000-0000-0000-000000000002','T9B B');
insert into public.proyectos(inmobiliaria_id,nombre,comuna,tipo,precio_min_uf,precio_max_uf) values
 ('c9000000-0000-0000-0000-000000000001','T9B A','T9B A','casa',1000,2000),
 ('c9000000-0000-0000-0000-000000000002','T9B B','T9B B','casa',1000,2000);
insert into auth.users(id,email) select ('c9000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'t9b-'||n||'@test.invalid' from generate_series(11,19) n;
insert into public.profiles(id,role,inmobiliaria_id,onboarding_data,reliability_status) values
 ('c9000000-0000-0000-0000-000000000011','usuario',null,'{"comuna_interes":"T9B A"}','en_revision'),
 ('c9000000-0000-0000-0000-000000000012','usuario',null,'{"comuna_interes":"T9B B"}','en_revision'),
 ('c9000000-0000-0000-0000-000000000013','ejecutivo','c9000000-0000-0000-0000-000000000001',null,'normal'),
 ('c9000000-0000-0000-0000-000000000014','ejecutivo','c9000000-0000-0000-0000-000000000002',null,'normal'),
 ('c9000000-0000-0000-0000-000000000015','admin_inmobiliario','c9000000-0000-0000-0000-000000000001',null,'normal'),
 ('c9000000-0000-0000-0000-000000000016','admin','c9000000-0000-0000-0000-000000000001',null,'normal'),
 ('c9000000-0000-0000-0000-000000000017','admin',null,null,'normal'),
 ('c9000000-0000-0000-0000-000000000018','ejecutivo',null,null,'normal'),
 ('c9000000-0000-0000-0000-000000000019','admin_inmobiliario',null,null,'normal');
insert into public.evaluations(user_id,score,classification,financial_data,fraud_score_probability,shap_top_factors) values
 ('c9000000-0000-0000-0000-000000000011',75,'Alto','{"input":{"complemento_renta":true}}',0.8,'[{"private_financial_value":1234567}]'),
 ('c9000000-0000-0000-0000-000000000012',75,'Alto','{"input":{"complemento_renta":false}}',0.1,'[]');
insert into public.lead_status_history(profile_id,changed_by,old_status,new_status,reason) values
 ('c9000000-0000-0000-0000-000000000011','c9000000-0000-0000-0000-000000000014','normal','en_revision','A subject, B actor'),
 ('c9000000-0000-0000-0000-000000000012',null,'normal','en_revision','B subject, automatic');
set local role authenticated;
do $$ declare actor uuid; ids uuid[] := array['c9000000-0000-0000-0000-000000000011','c9000000-0000-0000-0000-000000000012','c9000000-0000-0000-0000-999999999999']::uuid[]; begin
 foreach actor in array array['c9000000-0000-0000-0000-000000000013','c9000000-0000-0000-0000-000000000015','c9000000-0000-0000-0000-000000000016']::uuid[] loop
  perform set_config('request.jwt.claim.sub',actor::text,true);
  assert (select array_agg(id) from public.list_lead_contacts(ids))=ids[1:1], 'same tenant only';
  assert not exists(select 1 from public.lead_status_history where profile_id=ids[2]), 'automatic history must not bypass subject scope';
  assert exists(select 1 from public.lead_status_history where profile_id=ids[1]), 'foreign actor must not hide own subject';
  if public.get_my_role() <> 'ejecutivo' then
   assert not exists(select 1 from public.get_reported_leads_for_admin() where id=ids[2]);
   assert not exists(select 1 from public.get_lead_status_history_for_admin() where profile_id=ids[2]);
   assert exists(select 1 from public.get_reported_leads_for_admin() where id=ids[1] and fraud_score_probability is null and shap_top_factors is null), 'raw admin report must not bypass financial redaction';
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000014',true);
 assert (select array_agg(id) from public.list_lead_contacts(ids))=ids[2:2];
 foreach actor in array array['c9000000-0000-0000-0000-000000000011','c9000000-0000-0000-0000-000000000018','c9000000-0000-0000-0000-000000000019']::uuid[] loop
  perform set_config('request.jwt.claim.sub',actor::text,true);
  assert not exists(select 1 from public.list_lead_contacts(ids));
  assert not exists(select 1 from public.get_reported_leads_for_admin());
  assert not exists(select 1 from public.get_lead_status_history_for_admin());
  assert not exists(select 1 from public.lead_status_history);
 end loop;
 perform set_config('request.jwt.claim.sub','c9000000-0000-0000-0000-000000000017',true);
 assert (select count(*) from public.list_lead_contacts(ids))=2, 'global admin retains both';
 assert not exists(select 1 from public.list_lead_contacts(array[ids[3]]));
 assert not exists(select 1 from public.list_lead_contacts(null));
 assert not has_function_privilege('anon','public.list_lead_contacts(uuid[])','execute');
 assert not has_function_privilege('anon','public.get_lead_status_history_for_admin()','execute');
end; $$;
reset role;
rollback;
