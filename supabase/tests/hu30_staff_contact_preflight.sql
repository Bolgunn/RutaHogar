-- Run BEFORE T9B in the disposable DB to demonstrate the old paths.
begin;
insert into public.inmobiliarias(id,nombre) values ('d9000000-0000-0000-0000-000000000001','Preflight A');
insert into auth.users(id,email) values
 ('d9000000-0000-0000-0000-000000000011','foreign-lead@test.invalid'),
 ('d9000000-0000-0000-0000-000000000013','staff@test.invalid'),
 ('d9000000-0000-0000-0000-000000000016','scoped-admin@test.invalid');
insert into public.profiles(id,role,inmobiliaria_id,reliability_status) values
 ('d9000000-0000-0000-0000-000000000011','usuario',null,'en_revision'),
 ('d9000000-0000-0000-0000-000000000013','ejecutivo','d9000000-0000-0000-0000-000000000001','normal'),
 ('d9000000-0000-0000-0000-000000000016','admin','d9000000-0000-0000-0000-000000000001','normal');
insert into public.evaluations(user_id,score,classification,financial_data,fraud_score_probability,shap_top_factors)
 values('d9000000-0000-0000-0000-000000000011',75,'Alto','{"input":{"complemento_renta":true}}',0.8,'[{"private_value":1234567}]');
insert into public.lead_status_history(profile_id,changed_by,old_status,new_status,reason)
 values('d9000000-0000-0000-0000-000000000011',null,'normal','en_revision','foreign automatic');
-- Existing deployment migration 20261003120000 grants this table read.
grant select on public.lead_status_history to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','d9000000-0000-0000-0000-000000000013',true);
do $$ begin
 assert exists(select 1 from public.list_lead_contacts(array['d9000000-0000-0000-0000-000000000011']::uuid[]));
 assert exists(select 1 from public.lead_status_history where profile_id='d9000000-0000-0000-0000-000000000011');
end; $$;
select set_config('request.jwt.claim.sub','d9000000-0000-0000-0000-000000000016',true);
do $$ begin
 assert exists(select 1 from public.get_reported_leads_for_admin() where id='d9000000-0000-0000-0000-000000000011' and shap_top_factors is not null);
 assert exists(select 1 from public.get_lead_status_history_for_admin() where profile_id='d9000000-0000-0000-0000-000000000011');
end; $$;
reset role;
rollback;
