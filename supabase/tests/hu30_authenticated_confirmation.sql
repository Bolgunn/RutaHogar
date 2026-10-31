begin;
do $$
declare owner_id uuid:='a3000000-0000-0000-0000-000000000001'; actor uuid:='a3000000-0000-0000-0000-000000000002';
 item uuid; other_item uuid; replacement uuid; relation_id uuid; changed_relation uuid; other_relation uuid;
 payload jsonb:='{"ingreso_mensual_complementario":2000000,"deuda_mensual_complementario":100000,"tipo_contrato_complementario":"indefinido","continuidad_laboral_complementario":"mas_3_anios","morosidad_complementario":"no"}';
 invalid jsonb; result jsonb; v1 jsonb; view_data jsonb; request_id uuid:=gen_random_uuid();
 first_id uuid; stamp timestamptz; closed timestamptz; before_evaluations integer; field text; listed jsonb;
begin
 select invitation_id into item from public.hu30_create_invitation(owner_id,'participant@hu30.invalid','12345678-5',
  't4b-first',clock_timestamp()+interval '7 days',payload,'conyuge');
 select id into relation_id from public.co_debtor_consent_events where invitation_id=item and relation_revision=1;
 assert relation_id is not null;
 perform public.hu30_authorize_invitation('t4b-first',actor);
 insert into public.evaluations(id,user_id,score,classification,created_at,financial_data) values
 ('e4000000-0000-0000-0000-000000000001',actor,50,'Medio',clock_timestamp(),
 '{"input":{"ingreso_mensual":1700000,"deuda_mensual":0,"tipo_contrato":"indefinido","continuidad_laboral":"mas_3_anios","morosidad_actual":"no","private_unrelated":"must-not-leak"}}');
 view_data:=public.hu30_review_participation(item,actor);
 assert view_data->'values'->>'ingreso_mensual_complementario'='1700000';
 assert view_data->'values'->>'deuda_mensual_complementario'='0';
 assert view_data->>'requires_relation_acceptance'='true';
 assert position('private_unrelated' in view_data::text)=0 and position('lead_id' in view_data::text)=0;
 begin
  perform public.hu30_review_participation(item,owner_id);
  raise exception 'missing read isolation';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
  perform public.hu30_confirm_participation(item,owner_id,gen_random_uuid(),0,relation_id,true,payload,true);
  raise exception 'missing write isolation';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
  perform public.hu30_confirm_participation(item,actor,request_id,0,relation_id,false,payload,true);
  raise exception 'missing relation consent';
 exception when others then assert sqlerrm='relation_acceptance_required'; end;
 begin
  perform public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload,false);
  raise exception 'missing participation consent';
 exception when others then assert sqlerrm='participation_consent_required'; end;
 foreach field in array array['ingreso_mensual_complementario','deuda_mensual_complementario','tipo_contrato_complementario','continuidad_laboral_complementario','morosidad_complementario'] loop
  begin
   perform public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload-field,true);
   raise exception 'missing field accepted';
  exception when others then assert sqlerrm='invalid_confirmation'; end;
 end loop;
 for invalid in select value from jsonb_array_elements('[
  {"ingreso_mensual_complementario":-1},{"deuda_mensual_complementario":-1},
  {"ingreso_mensual_complementario":null},{"ingreso_mensual_complementario":"1"},
  {"deuda_mensual_complementario":true},{"deuda_mensual_complementario":"Infinity"},
  {"ingreso_mensual_complementario":9007199254740992},{"tipo_contrato_complementario":"arbitrary"},
  {"continuidad_laboral_complementario":"arbitrary"},{"morosidad_complementario":"arbitrary"},
  {"account_id":"forged"}]') loop
  begin
   perform public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload||invalid,true);
   raise exception 'invalid value accepted';
  exception when others then assert sqlerrm='invalid_confirmation'; end;
 end loop;
 select count(*) into before_evaluations from public.evaluations;
 stamp:=clock_timestamp();
 v1:=public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload,true);
 first_id:=(v1->>'confirmation_id')::uuid;
 assert v1->>'revision_number'='1' and v1->>'replayed'='false';
 assert (select participant_user_id=actor and accepted_relation_event_id=relation_id and treatment_consent_version='hu30-participation-v1'
  and treatment_consented_at>=stamp and confirmed_at=treatment_consented_at from public.co_debtor_confirmations where id=first_id);
 assert (select count(*)=2 from public.co_debtor_consent_events where invitation_id=item and confirmation_id=first_id and actor_user_id=actor);
 result:=public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload,true);
 assert result->>'confirmation_id'=first_id::text and result->>'replayed'='true';
 begin
  perform public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload||'{"deuda_mensual_complementario":1}',true);
  raise exception 'changed retry accepted';
 exception when others then assert sqlerrm='idempotency_conflict'; end;
 -- Persist a test evaluation that explicitly used v1, without invoking an engine.
 insert into public.evaluations(id,user_id,score,classification,created_at,financial_data) values
 ('e4000000-0000-0000-0000-000000000002',owner_id,50,'Medio',clock_timestamp(),jsonb_build_object(
  'input',payload||'{"complemento_renta":true,"relacion_complementario":"conyuge"}',
  'provenance',jsonb_build_object('co_debtor_confirmation_id',first_id,'co_debtor_consent',jsonb_build_object(
   'complement_source','co_debtor_confirmed','revision_number',1,'relation_declaration_event_id',relation_id))));
 select count(*) into before_evaluations from public.evaluations;
 result:=public.hu30_confirm_participation(item,actor,gen_random_uuid(),1,relation_id,false,payload,true);
 assert result->>'revision_number'='2' and result->>'matches_previous'='true' and result->>'matches_evaluated'='true';
 result:=public.hu30_confirm_participation(item,actor,gen_random_uuid(),2,relation_id,false,payload||'{"ingreso_mensual_complementario":2100000}',true);
 assert result->>'revision_number'='3' and result->>'matches_previous'='false' and result->>'matches_evaluated'='false';
 assert (select count(*)=before_evaluations from public.evaluations), 'confirmation must never create an evaluation';
 assert (select financial_data->'provenance'->>'co_debtor_confirmation_id'=first_id::text from public.evaluations where id='e4000000-0000-0000-0000-000000000002');
 changed_relation:=public.hu30_declare_relation(item,owner_id,'amigo',1);
 begin
  perform public.hu30_confirm_participation(item,actor,gen_random_uuid(),3,relation_id,false,payload,true);
  raise exception 'stale relation accepted';
 exception when others then assert sqlerrm='co_debtor_relation_conflict'; end;
 result:=public.hu30_confirm_participation(item,actor,gen_random_uuid(),3,changed_relation,false,payload,true);
 assert result->>'revision_number'='4';
 view_data:=public.hu30_review_participation(item,actor);
 assert view_data->'relation'->>'initial_accepted_event_id'=relation_id::text;
 assert view_data->'relation'->>'event_id'=changed_relation::text and view_data->>'requires_relation_acceptance'='false';
 assert (select accepted_relation_event_id is null from public.co_debtor_confirmations where id=(result->>'confirmation_id')::uuid);
 -- A different participation of this same account never supplies this one's revisions.
 select invitation_id into other_item from public.hu30_create_invitation('a3000000-0000-0000-0000-000000000003',
  'participant@hu30.invalid','12345678-5','t4b-other',clock_timestamp()+interval '7 days',payload,'padre_madre');
 perform public.hu30_authorize_invitation('t4b-other',actor);
 select id into other_relation from public.co_debtor_consent_events where invitation_id=other_item and relation_revision=1;
 perform public.hu30_confirm_participation(other_item,actor,gen_random_uuid(),0,other_relation,true,payload||'{"ingreso_mensual_complementario":9900000}',true);
 assert public.hu30_review_participation(item,actor)->'values'->>'ingreso_mensual_complementario'='2000000';
 select invitation_id into replacement from public.hu30_create_invitation(owner_id,'participant@hu30.invalid','12345678-5',
  't4b-replaced',clock_timestamp()+interval '7 days',payload,'conyuge');
 closed:=public.hu30_closure_at(item);
 begin
  perform public.hu30_review_participation(item,actor);
  raise exception 'closed read accepted';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 begin
  perform public.hu30_confirm_participation(item,actor,gen_random_uuid(),4,changed_relation,false,payload,true);
  raise exception 'closed write accepted';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 perform public.hu30_participant_decision(item,actor,'revoke');
 perform public.hu30_participant_decision(item,actor,'revoke');
 assert public.hu30_closure_at(item)=closed;
 assert (select count(*)=1 from public.co_debtor_consent_events where invitation_id=item and event_type='revoked' and actor_user_id=actor);
 -- Revocation after GET and retries must still block reads/writes.
 begin
  perform public.hu30_confirm_participation(item,actor,request_id,0,relation_id,true,payload,true);
  raise exception 'revoked retry accepted';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 listed:=public.hu30_list_participations(actor);
 assert jsonb_array_length(listed->'items')>=2;
 assert not exists(select 1 from jsonb_array_elements(listed->'items') x
  where (x->>'participation_id')::uuid not in (select id from public.co_debtor_invitations where participant_user_id=actor));
 assert position('recipient_email' in listed::text)=0 and position('ingreso' in listed::text)=0;
 perform public.hu30_authorize_invitation('t4b-replaced',actor);
 -- Expiration during editing blocks GET and POST; rollback this fixture mutation.
 begin
  update public.co_debtor_invitations set created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' where id=replacement;
  begin
   perform public.hu30_review_participation(replacement,actor);
   raise exception 'expired read accepted';
  exception when others then assert sqlerrm='invitation_unavailable'; end;
  begin
   perform public.hu30_confirm_participation(replacement,actor,gen_random_uuid(),0,relation_id,true,payload,true);
   raise exception 'expired write accepted';
  exception when others then assert sqlerrm='invitation_unavailable'; end;
  raise exception 'reset_expiry_fixture';
 exception when others then assert sqlerrm='reset_expiry_fixture'; end;
 perform public.hu30_participant_decision(replacement,actor,'decline');
 assert (select status='declined' from public.co_debtor_invitations where id=replacement);
 assert (select count(*)=0 from public.co_debtor_confirmations where invitation_id=replacement);
 begin
  perform public.hu30_review_participation('b3000000-0000-0000-0000-000000000002',actor);
  raise exception 'legacy identity invented';
 exception when others then assert sqlerrm in ('not_found','participant_identity_mismatch'); end;
 assert not has_function_privilege('authenticated','public.hu30_confirm_participation(uuid,uuid,uuid,integer,uuid,boolean,jsonb,boolean)','EXECUTE');
end; $$;
rollback;
