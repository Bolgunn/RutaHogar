-- Run only in a disposable database. No TRUNCATE is executed by this test.
begin;
insert into public.inmobiliarias(id,nombre) values
 ('ca300000-0000-0000-0000-000000000001','HU30 privacy A'),
 ('ca300000-0000-0000-0000-000000000002','HU30 privacy B');
insert into public.proyectos(id,inmobiliaria_id,nombre,comuna,tipo,precio_min_uf,precio_max_uf) values
 ('ca300000-0000-0000-0000-000000000003','ca300000-0000-0000-0000-000000000001','Privacy A','Privacy A','casa',1000,2000);
insert into auth.users(id,email) select ('ca300000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'privacy-'||n||'@test.invalid' from generate_series(11,16) n;
insert into public.profiles(id,role,inmobiliaria_id,onboarding_data) values
 ('ca300000-0000-0000-0000-000000000011','usuario',null,'{"comuna_interes":"Privacy A"}'),
 ('ca300000-0000-0000-0000-000000000012','admin_inmobiliario','ca300000-0000-0000-0000-000000000001',null),
 ('ca300000-0000-0000-0000-000000000013','admin_inmobiliario','ca300000-0000-0000-0000-000000000002',null),
 ('ca300000-0000-0000-0000-000000000014','admin',null,null),
 ('ca300000-0000-0000-0000-000000000015','usuario',null,'{"comuna_interes":"Privacy A"}'),
 ('ca300000-0000-0000-0000-000000000016','usuario',null,null);
insert into public.evaluations(user_id,score,classification,financial_data) values
 ('ca300000-0000-0000-0000-000000000011',75,'Alto','{"input":{"complemento_renta":true,"ingreso_mensual_complementario":987654321},"result":{"score":75,"classification":"Alto","algorithm_version":"1.1.0","financial_indicators":{"ingreso_total":999999999},"ai_explanation":"PRIVATE_SENTINEL"}}'),
 ('ca300000-0000-0000-0000-000000000015',80,'Alto','{"input":{"complemento_renta":false,"ingreso_mensual":1000000},"result":{"score":80,"classification":"Alto"}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','ca300000-0000-0000-0000-000000000012',true);
do $$ declare result jsonb; row jsonb; count_redacted integer := 0; count_individual integer := 0; tab text; actor text; begin
  result := public.commercial_funnel_facts();
  assert jsonb_array_length(result->'facts')=2,'same-tenant funnel must retain lead facts';
  assert result::text not like '%987654321%' and result::text not like '%PRIVATE_SENTINEL%' and result::text not like '%999999999%', 'funnel leaked raw or derived complement';
  for row in select value->'evaluacion_actual' from jsonb_array_elements(result->'facts') loop
    if row->>'co_debtor_visibility'='hidden' then
      count_redacted := count_redacted+1;
      assert row->'input'='{}'::jsonb and row->'onboarding'='{}'::jsonb;
      assert row->'result'='{"score":75,"classification":"Alto","algorithm_version":"1.1.0"}'::jsonb;
    else
      count_individual := count_individual+1;
      assert row->'input'->>'ingreso_mensual'='1000000','individual facts changed';
    end if;
  end loop;
  assert count_redacted=1 and count_individual=1;
  assert current_setting('response.headers') like '%private, no-store%';
  assert not has_function_privilege('authenticated','public.hu30_commercial_funnel_facts_raw()','execute');
  assert not has_function_privilege('anon','public.commercial_funnel_facts()','execute');
  assert has_function_privilege('service_role','public.list_lead_contacts(uuid[])','execute');
  foreach actor in array array['anon','authenticated'] loop
    foreach tab in array array['profiles','evaluations','scoring_history','evaluation_events','tracking_plans','tracking_events','improvement_goals','improvement_goal_events','mortgage_scenarios'] loop
      assert not has_table_privilege(actor,'public.'||tab,'TRUNCATE'),actor||' retains TRUNCATE on '||tab;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub','ca300000-0000-0000-0000-000000000013',true);
  assert public.commercial_funnel_facts()->'facts'='[]'::jsonb,'cross-tenant funnel';
  perform set_config('request.jwt.claim.sub','ca300000-0000-0000-0000-000000000011',true);
  begin
    perform public.commercial_funnel_facts();
    raise exception 'non-staff funnel allowed';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;

do $$ declare source jsonb; begin
  assert not has_function_privilege('authenticated','public.hu30_commercial_funnel_source(uuid)','execute');
  assert not has_function_privilege('anon','public.hu30_commercial_funnel_source(uuid)','execute');
  assert not has_function_privilege('authenticated','public.hu30_funnel_can_view_snapshot(uuid,jsonb,timestamptz)','execute');
  assert has_function_privilege('service_role','public.hu30_commercial_funnel_source(uuid)','execute');
  perform set_config('request.jwt.claim.sub','previous-context',true);
  source:=public.hu30_commercial_funnel_source('ca300000-0000-0000-0000-000000000012');
  assert current_setting('request.jwt.claim.sub')='previous-context','actor context not restored';
  assert jsonb_array_length(source->'facts')=2;
  assert source#>>'{facts,0,evaluacion_actual,co_debtor_visibility}'='hidden','unverifiable complement was exposed';
  assert source#>>'{facts,1,evaluacion_actual,input,ingreso_mensual}'='1000000','individual source changed';
  assert public.hu30_commercial_funnel_source('ca300000-0000-0000-0000-000000000013')->'facts'='[]'::jsonb;
  begin
    perform public.hu30_commercial_funnel_source('ca300000-0000-0000-0000-000000000011');
    raise exception 'non-staff private source allowed';
  exception when insufficient_privilege then null; end;
  assert current_setting('request.jwt.claim.sub')='previous-context','failed-call actor context leaked';
  perform set_config('request.jwt.claim.sub','',true);
end; $$;

-- Real account/relation/revision provenance, then exact first-closure cutoff.
update auth.users set email_confirmed_at=clock_timestamp() where id='ca300000-0000-0000-0000-000000000016';
update public.profiles set rut='12345678-5' where id='ca300000-0000-0000-0000-000000000016';
do $$ declare created record; relation uuid; confirmation jsonb; snapshot jsonb; source jsonb; closed_at timestamptz;
  values jsonb:='{"ingreso_mensual_complementario":1500000,"deuda_mensual_complementario":0,"tipo_contrato_complementario":"indefinido","continuidad_laboral_complementario":"mas_3_anios","morosidad_complementario":"no"}';
begin
  select * into created from public.hu30_create_invitation(
    'ca300000-0000-0000-0000-000000000011','privacy-16@test.invalid','12345678-5',
    'metrics-proof',clock_timestamp()+interval '7 days',values,'conyuge');
  perform public.hu30_authorize_invitation('metrics-proof','ca300000-0000-0000-0000-000000000016');
  select id into relation from public.co_debtor_consent_events where invitation_id=created.invitation_id and relation_revision=1;
  confirmation:=public.hu30_confirm_participation(created.invitation_id,'ca300000-0000-0000-0000-000000000016',
    gen_random_uuid(),0,relation,true,values,true);
  snapshot:=jsonb_build_object('input',values||'{"complemento_renta":true,"relacion_complementario":"conyuge"}'::jsonb,
    'result','{"score":90,"classification":"Alto","commercial_priority_detail":{"action_key":"contact_now"},"financial_indicators":{"capacidad_compra_estimada_uf":2800}}'::jsonb,
    'provenance',jsonb_build_object('co_debtor_confirmation_id',confirmation->>'confirmation_id','co_debtor_consent',jsonb_build_object(
      'complement_source','co_debtor_confirmed','revision_number',1,'relation_declaration_event_id',relation)));
  insert into public.evaluations(user_id,score,classification,financial_data,created_at)
    values('ca300000-0000-0000-0000-000000000011',90,'Alto',snapshot,clock_timestamp());
  source:=public.hu30_commercial_funnel_source('ca300000-0000-0000-0000-000000000012');
  assert source#>>'{facts,0,evaluacion_actual,result,financial_indicators,capacidad_compra_estimada_uf}'='2800','active verified source lost capacity';
  assert source#>>'{facts,0,evaluacion_actual,result,commercial_priority_detail,action_key}'='contact_now';
  assert public.hu30_funnel_can_view_snapshot('ca300000-0000-0000-0000-000000000011',snapshot,clock_timestamp());
  assert not public.hu30_funnel_can_view_snapshot('ca300000-0000-0000-0000-000000000015',snapshot,clock_timestamp()),'foreign provenance accepted';
  perform public.hu30_participant_decision(created.invitation_id,'ca300000-0000-0000-0000-000000000016','revoke');
  closed_at:=public.hu30_closure_at(created.invitation_id);
  assert public.hu30_funnel_can_view_snapshot('ca300000-0000-0000-0000-000000000011',snapshot,closed_at+interval '30 days'-interval '1 microsecond');
  assert not public.hu30_funnel_can_view_snapshot('ca300000-0000-0000-0000-000000000011',snapshot,closed_at+interval '30 days'),'exact cutoff not protected';
end; $$;

rollback;
