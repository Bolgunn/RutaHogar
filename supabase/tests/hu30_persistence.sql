-- Run against a disposable core schema + HU30 migrations, with ON_ERROR_STOP.
-- No remote fixtures; every test rolls back its data.
begin;
do $$ begin
 assert (select revision_number=1 and participant_user_id is null and accepted_relation_event_id is null
   and request_id is null and confirmed_at='2026-10-01T12:00:00Z'::timestamptz
   from public.co_debtor_confirmations where id='b3000000-0000-0000-0000-000000000003');
 assert (select financial_data->'input'->>'ingreso_mensual_complementario'='900000'
   from public.evaluations where id='b3000000-0000-0000-0000-000000000004');
end; $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('a3000000-0000-0000-0000-000000000001','owner@hu30.invalid',clock_timestamp()),
 ('a3000000-0000-0000-0000-000000000002','participant@hu30.invalid',clock_timestamp()),
 ('a3000000-0000-0000-0000-000000000003','other@hu30.invalid',clock_timestamp()),
 ('a3000000-0000-0000-0000-000000000004','executive@hu30.invalid',clock_timestamp()),
 ('a3000000-0000-0000-0000-000000000005','global@hu30.invalid',clock_timestamp()),
 ('a3000000-0000-0000-0000-000000000006','tenantadmin@hu30.invalid',clock_timestamp());
insert into public.profiles(id,role,rut) values
 ('a3000000-0000-0000-0000-000000000001','usuario','11111111-1'),
 ('a3000000-0000-0000-0000-000000000002','usuario','12345678-5'),
 ('a3000000-0000-0000-0000-000000000003','usuario','11111111-1'),
 ('a3000000-0000-0000-0000-000000000004','ejecutivo',null),
 ('a3000000-0000-0000-0000-000000000005','admin',null),
 ('a3000000-0000-0000-0000-000000000006','admin_inmobiliario',null);

insert into public.inmobiliarias(id,nombre) values
 ('c3000000-0000-0000-0000-000000000001','HU30 tenant A'),
 ('c3000000-0000-0000-0000-000000000002','HU30 tenant B');
insert into public.proyectos(inmobiliaria_id,nombre,comuna,tipo,precio_min_uf,precio_max_uf) values
 ('c3000000-0000-0000-0000-000000000001','HU30 A','HU30 comuna A','casa',2000,3000),
 ('c3000000-0000-0000-0000-000000000002','HU30 B','HU30 comuna B','casa',2000,3000);
update public.profiles set onboarding_data='{"comuna_interes":"HU30 comuna A"}'
 where id='a3000000-0000-0000-0000-000000000001';
update public.profiles set inmobiliaria_id='c3000000-0000-0000-0000-000000000001'
 where id in ('a3000000-0000-0000-0000-000000000004','a3000000-0000-0000-0000-000000000006');
insert into auth.users(id,email,email_confirmed_at) values
 ('a3000000-0000-0000-0000-000000000007','otherexec@hu30.invalid',clock_timestamp());
insert into public.profiles(id,role,inmobiliaria_id) values
 ('a3000000-0000-0000-0000-000000000007','ejecutivo','c3000000-0000-0000-0000-000000000002');
do $$ begin
 assert public.lead_belongs_to_inmobiliaria('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001');
 assert not public.lead_belongs_to_inmobiliaria('a3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002');
end; $$;

create temporary table hu30_results(label text primary key, value uuid);
do $$
declare owner_id uuid := 'a3000000-0000-0000-0000-000000000001';
 actor uuid := 'a3000000-0000-0000-0000-000000000002'; item uuid; relation_id uuid;
 v1 public.co_debtor_confirmations; v2 public.co_debtor_confirmations; again public.co_debtor_confirmations;
 payload jsonb := '{"ingreso_mensual_complementario":1500000,"deuda_mensual_complementario":100000,"tipo_contrato_complementario":"indefinido","continuidad_laboral_complementario":"mas_3_anios","morosidad_complementario":"no"}';
 request1 uuid := gen_random_uuid(); other_item uuid; other_relation uuid; replacement uuid; close_time timestamptz; data jsonb;
begin
 assert public.hu30_normalize_rut('12.345.678-5')='12345678-5';
 assert public.hu30_normalize_rut('12345678-4') is null;
 select invitation_id into item from public.hu18_create_invitation(owner_id,'participant@hu30.invalid',
   '12345678-5','hu30-test-token',clock_timestamp()+interval '7 days');
 relation_id := public.hu30_declare_relation(item,owner_id,'pareja_conviviente',0);
 begin
   perform public.hu30_append_confirmation(item,owner_id,gen_random_uuid(),0,relation_id,payload,'hu30-test');
   raise exception 'expected wrong participant rejection';
 exception when check_violation then assert sqlerrm='owner_mismatch'; end;
 update auth.users set email_confirmed_at=null where id=actor;
 begin
   perform public.hu30_append_confirmation(item,actor,gen_random_uuid(),0,relation_id,payload,'hu30-test');
   raise exception 'expected unverified email rejection';
 exception when check_violation then assert sqlerrm='owner_mismatch'; end;
 update auth.users set email_confirmed_at=clock_timestamp() where id=actor;
 select invitation_id into other_item from public.hu18_create_invitation(
   'a3000000-0000-0000-0000-000000000003','participant@hu30.invalid','12345678-5',
   'hu30-other',clock_timestamp()+interval '7 days');
 other_relation := public.hu30_declare_relation(other_item,'a3000000-0000-0000-0000-000000000003','padre_madre',0);
 begin
   perform public.hu30_append_confirmation(item,actor,gen_random_uuid(),0,other_relation,payload,'hu30-test');
   raise exception 'expected relation from another participation rejection';
 exception when check_violation then assert sqlerrm='co_debtor_relation_conflict'; end;
 v1 := public.hu30_append_confirmation(item,actor,request1,0,relation_id,payload,'hu30-test');
 assert v1.revision_number=1 and v1.participant_user_id=actor;
 again := public.hu30_append_confirmation(item,actor,request1,0,relation_id,payload,'hu30-test');
 assert again.id=v1.id, 'request must be idempotent';
 begin
   perform public.hu30_append_confirmation(item,actor,request1,0,relation_id,payload,'changed');
   raise exception 'expected idempotency rejection';
 exception when others then assert sqlerrm='idempotency_conflict'; end;
 v2 := public.hu30_append_confirmation(item,actor,gen_random_uuid(),1,null,
   payload || '{"ingreso_mensual_complementario":1600000}', 'hu30-test');
 assert v2.revision_number=2 and v2.id<>v1.id;
 assert (select ingreso_mensual_complementario=1500000 from public.co_debtor_confirmations where id=v1.id);
 assert (select id=v2.id from public.co_debtor_confirmations where invitation_id=item order by revision_number desc limit 1);
 begin
   perform public.hu30_append_confirmation(item,actor,gen_random_uuid(),1,null,payload,'hu30-test');
   raise exception 'expected stale revision rejection';
 exception when others then assert sqlerrm='co_debtor_revision_conflict'; end;
 begin
   update public.co_debtor_confirmations set ingreso_mensual_complementario=0 where id=v1.id;
   raise exception 'expected immutable revision';
 exception when check_violation then null; end;
 begin
   update public.co_debtor_invitations set participant_user_id=owner_id where id=item;
   raise exception 'expected immutable identity';
 exception when check_violation then null; end;
 data := jsonb_build_object('input',payload || '{"ingreso_mensual_complementario":1600000,"complemento_renta":true,"relacion_complementario":"pareja_conviviente"}',
   'result','{"score":75,"classification":"Alto"}'::jsonb,
   'provenance',jsonb_build_object('co_debtor_confirmation_id',v2.id,
     'co_debtor_consent',jsonb_build_object('complement_source','co_debtor_confirmed','revision_number',2,'relation_declaration_event_id',relation_id)));
 insert into public.evaluations(id,user_id,score,classification,financial_data)
 values('e3000000-0000-0000-0000-000000000001',owner_id,75,'Alto',data);
 begin
   insert into public.evaluations(user_id,score,classification,financial_data)
   values('a3000000-0000-0000-0000-000000000003',75,'Alto',data);
   raise exception 'expected wrong owner rejection';
 exception when check_violation then null; end;
 begin
   insert into public.evaluations(user_id,score,classification,financial_data)
   values(owner_id,75,'Alto',jsonb_set(data,'{provenance,co_debtor_confirmation_id}',to_jsonb(v1.id)));
   raise exception 'expected stale evaluation rejection';
 exception when check_violation then null; end;
 select invitation_id into replacement from public.hu18_create_invitation(owner_id,'new@hu30.invalid',
   '12345678-5','hu30-test-token-2',clock_timestamp()+interval '7 days');
 assert (select status='replaced' from public.co_debtor_invitations where id=item);
 close_time := public.hu30_closure_at(item);
 assert close_time is not null;
 assert (select replaced_at=close_time from public.co_debtor_invitations where id=item);
 assert (select replacement_of_invitation_id=item from public.co_debtor_invitations where id=replacement);
 perform public.hu18_revert_invitation_after_delivery_failure(replacement,item);
 assert (select status='replaced' from public.co_debtor_invitations where id=item), 'delivery failure must not revive a confirmed participation';
 perform public.hu18_revoke_consent(item);
 assert public.hu30_closure_at(item)=close_time, 'revocation must not restart the 30 day window';
 assert not public.hu18_revoke_consent(item), 'repeat revocation is idempotent';
 assert (select count(*)=2 from public.co_debtor_confirmations where invitation_id=item);
 perform public.hu18_decline_invitation(other_item);
 assert (select status='declined' from public.co_debtor_invitations where id=other_item);
 select invitation_id into other_item from public.hu18_create_invitation(
   owner_id,'expired@hu30.invalid','12345678-5','hu30-expire',clock_timestamp()+interval '7 days');
 update public.co_debtor_invitations set created_at=clock_timestamp()-interval '2 days',
   expires_at=clock_timestamp()-interval '1 day' where id=other_item;
 perform 1 from public.hu18_expire_invitations();
 assert (select status='expired' from public.co_debtor_invitations where id=other_item);

 begin
   insert into public.evaluations(user_id,score,classification,financial_data) values(owner_id,75,'Alto',data);
   raise exception 'expected closed participation rejection';
 exception when check_violation then null; end;
 insert into hu30_results values('participation',item),('revision1',v1.id),('revision2',v2.id);
end;
$$;

-- An ordinary individual evaluation remains directly readable by its owner.
insert into public.evaluations(id,user_id,score,classification,financial_data)
 values('e3000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000001',
  50,'Medio','{"input":{"complemento_renta":false}}');
-- A failed delivery can restore an unconfirmed pending invitation. If it is
-- later confirmed, its earlier pending replacement is not a consent closure.
do $$ declare first_id uuid; failed_id uuid; relation_id uuid;
begin
 select invitation_id into first_id from public.hu18_create_invitation(
  'a3000000-0000-0000-0000-000000000003','participant@hu30.invalid','12345678-5','restore-pending-1',clock_timestamp()+interval '7 days');
 relation_id := public.hu30_declare_relation(first_id,'a3000000-0000-0000-0000-000000000003','conyuge',0);
 select invitation_id into failed_id from public.hu18_create_invitation(
  'a3000000-0000-0000-0000-000000000003','participant@hu30.invalid','12345678-5','restore-pending-2',clock_timestamp()+interval '7 days');
 perform public.hu18_revert_invitation_after_delivery_failure(failed_id,first_id);
 perform public.hu30_append_confirmation(first_id,'a3000000-0000-0000-0000-000000000002',gen_random_uuid(),0,relation_id,
  '{"ingreso_mensual_complementario":1,"deuda_mensual_complementario":0,"tipo_contrato_complementario":"indefinido","continuidad_laboral_complementario":"mas_3_anios","morosidad_complementario":"no"}','hu30-test');
 assert public.hu30_closure_at(first_id) is null;
end; $$;

grant select,insert,update on public.profiles to authenticated;
grant select on public.evaluations,public.scoring_history to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000001',true);
do $$ begin
 assert not exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000001'), 'owner must use redacted projection for co-debtor snapshots';
 assert public.hu30_owner_can_view_evaluation('e3000000-0000-0000-0000-000000000001'), 'owner historical reference is accessible during grace';
 assert exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000002');
 assert not has_function_privilege('authenticated',
  'public.hu30_append_confirmation(uuid,uuid,uuid,integer,uuid,jsonb,text)','EXECUTE');
 update public.profiles set full_name='Legitimate edit' where id=auth.uid();
 begin
   update public.profiles set inmobiliaria_id=(select id from public.inmobiliarias order by id limit 1) where id=auth.uid();
   raise exception 'expected self tenant rejection';
 exception when insufficient_privilege then null; end;
 begin
   insert into public.profiles(id,role) values(auth.uid(),'admin');
   raise exception 'expected privileged insert rejection';
 exception when insufficient_privilege then null; end;
 begin
   update public.profiles set role='admin' where id=auth.uid();
   raise exception 'expected privilege rejection';
 exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true);
do $$ begin assert not exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000001');
 assert not public.hu30_owner_can_view_evaluation('e3000000-0000-0000-0000-000000000001'); end; $$;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000004',true);
do $$ begin assert not exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000001');
 assert not public.hu30_owner_can_view_evaluation('e3000000-0000-0000-0000-000000000001'); end; $$;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000007',true);
do $$ begin
 assert not exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000001');
 assert not public.hu30_owner_can_view_evaluation('e3000000-0000-0000-0000-000000000001');
end; $$;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000005',true);
do $$ begin assert not exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000001');
 assert not public.hu30_owner_can_view_evaluation('e3000000-0000-0000-0000-000000000001'); end; $$;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000006',true);
do $$ begin assert not exists(select 1 from public.evaluations where id='e3000000-0000-0000-0000-000000000001');
 assert not public.hu30_owner_can_view_evaluation('e3000000-0000-0000-0000-000000000001'); end; $$;
reset role;
-- Trigger-level check under a tenant administrator, without assuming obsolete
-- schema.sql policy definitions for admin_inmobiliario.
set local role authenticated;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000005',true);
do $$ begin
 update public.profiles set phone='allowed admin edit' where id='a3000000-0000-0000-0000-000000000004';
end; $$;
reset role;
select 'HU30 persistence and direct-access assertions passed' as result;
rollback;
