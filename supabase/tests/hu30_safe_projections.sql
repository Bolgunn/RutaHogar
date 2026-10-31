begin;
do $$ begin
 assert public.hu30_has_complement('{"input":{"complemento_renta":false,"complemento_ingreso_mensual":1500000}}');
 assert public.hu30_has_complement('{"result":{"bipersonal_summary":{"evaluation_type":"bipersonal_confirmed"}}}');
 assert public.hu30_has_complement('{"provenance":{"co_debtor_consent":{"complement_source":"co_debtor_confirmed"}}}');
 assert public.hu30_has_complement('{"input_snapshot":{"complemento_deuda_mensual":123456}}');
 assert not public.hu30_has_complement('{"input":{"complemento_renta":false,"ingreso_mensual":1000000,"ingreso_mensual_complementario":null}}');
 assert not public.hu30_has_complement('null');
end; $$;
insert into public.evaluations(id,user_id,score,classification,financial_data) values
 ('e6000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001',50,'Medio','{"input":{"complemento_renta":false,"complemento_ingreso_mensual":1500000}}'),
 ('e6000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000001',50,'Medio','{"input":{"complemento_renta":false,"ingreso_mensual":1000000}}');
insert into public.scoring_history(id,evaluation_id,user_id,score,classification,snapshot,component_scores,algorithm_version,channel) values
 ('f6000000-0000-0000-0000-000000000001','e6000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001',50,'Medio','{"input_snapshot":{"complemento_deuda_mensual":123456}}','{}','test','web');
set local role authenticated;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000001',true);
do $$ begin
 assert not exists(select 1 from public.evaluations where id='e6000000-0000-0000-0000-000000000001');
 assert exists(select 1 from public.evaluations where id='e6000000-0000-0000-0000-000000000002');
 assert not exists(select 1 from public.scoring_history where id='f6000000-0000-0000-0000-000000000001');
 assert not has_function_privilege('authenticated','public.hu13_read(uuid)','execute');
 assert not has_function_privilege('authenticated','public.staff_evaluations_for_inmobiliaria(uuid)','execute');
end; $$;
reset role;
rollback;
