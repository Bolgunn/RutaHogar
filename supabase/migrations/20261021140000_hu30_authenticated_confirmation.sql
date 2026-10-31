-- T4B: scoped reads and consent commands. Reuses the T3 tables and append RPC.
begin;
create or replace function public.hu30_financial_values(value jsonb)
returns jsonb language sql immutable set search_path=public as $$
 select jsonb_strip_nulls(jsonb_build_object(
  'ingreso_mensual_complementario',value->'ingreso_mensual_complementario',
  'deuda_mensual_complementario',value->'deuda_mensual_complementario',
  'tipo_contrato_complementario',value->'tipo_contrato_complementario',
  'continuidad_laboral_complementario',value->'continuidad_laboral_complementario',
  'morosidad_complementario',value->'morosidad_complementario'));
$$;
create or replace function public.hu30_safe_amount(value jsonb)
returns boolean language sql immutable set search_path=public as $$
 select case when jsonb_typeof(value)='number' then
  (value#>>'{}')::numeric between 0 and 9007199254740991 else false end;
$$;
create or replace function public.hu30_valid_financial_values(value jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
begin
 if jsonb_typeof(value) is distinct from 'object' then return false; end if;
 return coalesce((select count(*)=5 from jsonb_object_keys(value))
  and value=public.hu30_financial_values(value)
  and public.hu30_safe_amount(value->'ingreso_mensual_complementario')
  and public.hu30_safe_amount(value->'deuda_mensual_complementario')
  and value->>'tipo_contrato_complementario' in ('indefinido','plazo_fijo','independiente','honorarios_variable')
  and value->>'continuidad_laboral_complementario' in ('menos_6_meses','entre_6_y_12_meses','entre_1_y_3_anios','mas_3_anios')
  and value->>'morosidad_complementario' in ('si','no'),false);
end; $$;

create or replace function public.hu30_participant_access(p_id uuid,p_actor uuid,p_revocation boolean default false)
returns public.co_debtor_invitations language plpgsql security definer set search_path=public as $$
declare item public.co_debtor_invitations; account public.profiles; identity auth.users;
begin
 item := public.hu30_lock_participation(p_id);
 select * into account from public.profiles where id=p_actor;
 select * into identity from auth.users where id=p_actor;
 if p_actor is null or item.participant_user_id is distinct from p_actor
  or account.role is distinct from 'usuario' or identity.email_confirmed_at is null
  or lower(trim(identity.email)) is distinct from lower(trim(item.recipient_email))
  or public.hu30_normalize_rut(account.rut) is null
  or public.hu30_normalize_rut(account.rut) is distinct from public.hu30_normalize_rut(item.recipient_rut) then
  raise exception 'participant_identity_mismatch';
 end if;
 if p_revocation then
  if item.status not in ('confirmed','replaced','revoked') or not exists (
    select 1 from public.co_debtor_confirmations where invitation_id=item.id) then
   raise exception 'invitation_unavailable';
  end if;
 elsif item.status not in ('pending','confirmed')
  or (item.status='pending' and (item.expires_at<=clock_timestamp() or item.consumed_at is not null))
  or public.hu30_closure_at(item.id) is not null then raise exception 'invitation_unavailable';
 end if;
 return item;
end; $$;

-- Equality of the five selected values only; never calculates score/capacity.
create or replace function public.hu30_matches_evaluated(p_id uuid,p_values jsonb)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare used jsonb;
begin
 select coalesce(e.financial_data->'input',e.financial_data->'input_snapshot') into used
 from public.evaluations e join public.co_debtor_invitations i on i.lead_id=e.user_id
 where i.id=p_id order by e.created_at desc,e.id desc limit 1;
 if used is null then return null; end if;
 if coalesce(used->>'complemento_renta','false')<>'true' then return false; end if;
 if not public.hu30_valid_financial_values(public.hu30_financial_values(used)) then return null; end if;
 return public.hu30_financial_values(used)=p_values;
end; $$;

create or replace function public.hu30_review_participation(p_id uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.co_debtor_invitations; current_row public.co_debtor_confirmations;
 relation_row public.co_debtor_consent_events; accepted public.co_debtor_consent_events;
 personal jsonb; own_values jsonb; values_to_review jsonb;
begin
 item := public.hu30_participant_access(p_id,p_actor);
 select * into current_row from public.co_debtor_confirmations where invitation_id=item.id order by revision_number desc limit 1;
 select * into relation_row from public.co_debtor_consent_events where invitation_id=item.id and relation_revision is not null order by relation_revision desc limit 1;
 select e.* into accepted from public.co_debtor_confirmations c join public.co_debtor_consent_events e on e.id=c.accepted_relation_event_id
 where c.invitation_id=item.id and c.participant_user_id=p_actor order by c.revision_number limit 1;
 -- Only this account's principal input fields; never another participation or totals.
 select coalesce(financial_data->'input',financial_data->'input_snapshot') into personal
 from public.evaluations where user_id=p_actor order by created_at desc,id desc limit 1;
 own_values := jsonb_strip_nulls(jsonb_build_object(
  'ingreso_mensual_complementario',case when public.hu30_safe_amount(personal->'ingreso_mensual') then personal->'ingreso_mensual' end,
  'deuda_mensual_complementario',case when public.hu30_safe_amount(personal->'deuda_mensual') then personal->'deuda_mensual' end,
  'tipo_contrato_complementario',case when personal->>'tipo_contrato' in ('indefinido','plazo_fijo','independiente','honorarios_variable') then personal->'tipo_contrato' end,
  'continuidad_laboral_complementario',case when personal->>'continuidad_laboral' in ('menos_6_meses','entre_6_y_12_meses','entre_1_y_3_anios','mas_3_anios') then personal->'continuidad_laboral' end,
  'morosidad_complementario',case when personal->>'morosidad_actual' in ('si','no') then personal->'morosidad_actual' end));
 values_to_review := case when current_row.id is not null then public.hu30_financial_values(to_jsonb(current_row))
  else public.hu30_financial_values(to_jsonb(item)) || own_values end;
 return jsonb_build_object('participation_id',item.id,'status',item.status,
  'expires_at',case when item.status='pending' then item.expires_at end,
  'revision_number',coalesce(current_row.revision_number,0),'values',values_to_review,
  'prefill_source',case when current_row.id is not null then 'participation' when own_values<>'{}'::jsonb then 'personal_and_declared' else 'declared' end,
  'personal_prefill',own_values,'relation',jsonb_build_object('event_id',relation_row.id,'value',relation_row.relation_value,
    'revision',relation_row.relation_revision,'initial_accepted_value',accepted.relation_value,'initial_accepted_event_id',accepted.id),
  'requires_relation_acceptance',accepted.id is null,
  'matches_evaluated',case when current_row.id is not null then public.hu30_matches_evaluated(item.id,values_to_review) end);
end; $$;

create or replace function public.hu30_confirm_participation(p_id uuid,p_actor uuid,p_request_id uuid,
 p_expected_revision integer,p_relation_event_id uuid,p_accept_relation boolean,p_values jsonb,p_consent boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.co_debtor_invitations; result public.co_debtor_confirmations;
 previous public.co_debtor_confirmations; relation_id uuid; accepted_id uuid; replayed boolean;
begin
 item := public.hu30_participant_access(p_id,p_actor);
 if p_consent is distinct from true then raise exception 'participation_consent_required'; end if;
 if not public.hu30_valid_financial_values(p_values) or p_request_id is null
  or p_expected_revision is null or p_expected_revision<0 or p_accept_relation is null then raise exception 'invalid_confirmation'; end if;
 accepted_id := case when p_accept_relation then p_relation_event_id end;
 select * into result from public.co_debtor_confirmations where invitation_id=item.id and request_id=p_request_id;
 replayed := found;
 if replayed and result.revision_number<>p_expected_revision+1 then raise exception 'idempotency_conflict'; end if;
 if not replayed then
  select id into relation_id from public.co_debtor_consent_events where invitation_id=item.id and relation_revision is not null order by relation_revision desc limit 1;
  if relation_id is null or p_relation_event_id is distinct from relation_id then raise exception 'co_debtor_relation_conflict'; end if;
  if not exists(select 1 from public.co_debtor_confirmations where invitation_id=item.id and participant_user_id=p_actor and accepted_relation_event_id is not null)
   and p_accept_relation is distinct from true then raise exception 'relation_acceptance_required'; end if;
 end if;
 select * into previous from public.co_debtor_confirmations where invitation_id=item.id
  and revision_number=case when replayed then result.revision_number-1 else p_expected_revision end;
 result := public.hu30_append_confirmation(item.id,p_actor,p_request_id,p_expected_revision,accepted_id,p_values,'hu30-participation-v1');
 return jsonb_build_object('status','confirmed','participation_id',item.id,'confirmation_id',result.id,
  'revision_number',result.revision_number,'confirmed_at',result.confirmed_at,'replayed',replayed,
  'matches_previous',case when previous.id is not null then public.hu30_financial_values(to_jsonb(previous))=p_values end,
  'matches_evaluated',public.hu30_matches_evaluated(item.id,p_values));
end; $$;

create or replace function public.hu30_participant_decision(p_id uuid,p_actor uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.co_debtor_invitations;
begin
 item := public.hu30_participant_access(p_id,p_actor,p_decision='revoke');
 if p_decision='decline' then
  if item.status<>'pending' then raise exception 'invitation_unavailable'; end if;
  update public.co_debtor_invitations set status='declined',consumed_at=clock_timestamp() where id=item.id;
  insert into public.co_debtor_consent_events(invitation_id,event_type,actor_type,invitation_status,actor_user_id)
   values(item.id,'declined','co_debtor','declined',p_actor);
  return jsonb_build_object('status','declined');
 elsif p_decision='revoke' then
  if item.status<>'revoked' then
   update public.co_debtor_invitations set status='revoked' where id=item.id;
   insert into public.co_debtor_consent_events(invitation_id,event_type,actor_type,invitation_status,actor_user_id)
    values(item.id,'revoked','co_debtor','revoked',p_actor);
  end if;
  return jsonb_build_object('status','revoked');
 end if;
 raise exception 'invalid_confirmation';
end; $$;

create or replace function public.hu30_list_participations(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_actor and p.role='usuario' and u.email_confirmed_at is not null) then
  raise exception 'participant_identity_mismatch'; end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('participation_id',i.id,'status',i.status,'created_at',i.created_at) order by i.created_at desc,i.id desc)
  from public.co_debtor_invitations i where i.participant_user_id=p_actor),'[]'::jsonb));
end; $$;

-- Explicit titular declaration, atomically with HU18 invitation creation; no inference/backfill.
create or replace function public.hu30_create_invitation(p_lead_id uuid,p_recipient_email text,p_recipient_rut text,
 p_token_digest text,p_expires_at timestamptz,p_values jsonb,p_relation text)
returns table(invitation_id uuid,previous_invitation_id uuid) language plpgsql security definer set search_path=public as $$
declare created record;
begin
 if not public.hu30_valid_financial_values(p_values) then raise exception 'invalid_confirmation'; end if;
 select * into created from public.hu18_create_invitation(p_lead_id,p_recipient_email,p_recipient_rut,p_token_digest,p_expires_at,
  (p_values->>'ingreso_mensual_complementario')::numeric,(p_values->>'deuda_mensual_complementario')::numeric,
  p_values->>'tipo_contrato_complementario',p_values->>'continuidad_laboral_complementario',p_values->>'morosidad_complementario');
 perform public.hu30_declare_relation(created.invitation_id,p_lead_id,p_relation,0);
 return query select created.invitation_id,created.previous_invitation_id;
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('hu30_financial_values','hu30_safe_amount','hu30_valid_financial_values',
   'hu30_participant_access','hu30_matches_evaluated','hu30_review_participation','hu30_confirm_participation',
   'hu30_participant_decision','hu30_list_participations','hu30_create_invitation') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
commit;
