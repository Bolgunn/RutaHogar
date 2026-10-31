-- HU30 T3. Deploy with the authenticated participant adapter (T4), not alone.
-- Existing rows retain identity/consent facts; only the ordinal is backfilled.
begin;

alter table public.co_debtor_invitations
  add column if not exists participant_user_id uuid references public.profiles(id) on delete restrict;
create unique index if not exists hu30_invitation_account_key
  on public.co_debtor_invitations(id, participant_user_id);
create index if not exists hu30_participant_status_idx
  on public.co_debtor_invitations(participant_user_id, status);

alter table public.co_debtor_confirmations
  add column if not exists revision_number integer,
  add column if not exists participant_user_id uuid,
  add column if not exists accepted_relation_event_id uuid,
  add column if not exists request_id uuid;
update public.co_debtor_confirmations set revision_number = 1 where revision_number is null;
alter table public.co_debtor_confirmations alter column revision_number set not null;
create unique index if not exists hu30_confirmation_revision_key
  on public.co_debtor_confirmations(invitation_id, revision_number);
create unique index if not exists hu30_confirmation_request_key
  on public.co_debtor_confirmations(invitation_id, request_id);
create unique index if not exists hu30_confirmation_invitation_key
  on public.co_debtor_confirmations(id, invitation_id);
alter table public.co_debtor_confirmations
  drop constraint if exists co_debtor_confirmations_invitation_id_key,
  drop constraint if exists hu30_revision_positive,
  add constraint hu30_revision_positive check (revision_number > 0),
  drop constraint if exists hu30_confirmation_account_fk,
  add constraint hu30_confirmation_account_fk foreign key (invitation_id, participant_user_id)
    references public.co_debtor_invitations(id, participant_user_id) on delete restrict;

alter table public.co_debtor_consent_events
  add column if not exists actor_user_id uuid references public.profiles(id) on delete restrict,
  add column if not exists confirmation_id uuid,
  add column if not exists relation_value text,
  add column if not exists relation_revision integer;
create unique index if not exists hu30_event_invitation_key
  on public.co_debtor_consent_events(id, invitation_id);
create unique index if not exists hu30_relation_revision_key
  on public.co_debtor_consent_events(invitation_id, relation_revision)
  where relation_revision is not null;
alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_event_type_check,
  add constraint co_debtor_consent_events_event_type_check check (event_type in (
    'invited','replaced','expired','consent_granted','confirmed','revoked','declined',
    'relation_declared','relation_changed')),
  drop constraint if exists hu30_event_confirmation_fk,
  add constraint hu30_event_confirmation_fk foreign key (confirmation_id, invitation_id)
    references public.co_debtor_confirmations(id, invitation_id) on delete restrict,
  drop constraint if exists hu30_relation_event_check,
  add constraint hu30_relation_event_check check (
    (event_type in ('relation_declared','relation_changed') and relation_revision > 0
      and relation_revision is not null and actor_type = 'lead' and actor_user_id is not null
      and confirmation_id is null and relation_value is not null and relation_value in (
        'conyuge','pareja_conviviente','pareja_hijos_comun','padre_madre','hijo_hija',
        'hermano_hermana','otro_familiar','amigo','otro'))
    or (event_type not in ('relation_declared','relation_changed')
      and relation_value is null and relation_revision is null));
alter table public.co_debtor_confirmations
  drop constraint if exists hu30_accepted_relation_fk,
  add constraint hu30_accepted_relation_fk foreign key (accepted_relation_event_id, invitation_id)
    references public.co_debtor_consent_events(id, invitation_id) on delete restrict;

create or replace function public.hu30_normalize_rut(value text)
returns text language plpgsql immutable set search_path = public as $$
declare compact text := regexp_replace(upper(coalesce(value,'')), '[^0-9K]', '', 'g');
  digits text; total integer := 0; multiplier integer := 2; i integer; remainder integer; dv text;
begin
  if compact !~ '^[0-9]{7,8}[0-9K]$' then return null; end if;
  digits := left(compact,length(compact)-1);
  for i in reverse length(digits)..1 loop
    total := total + substring(digits,i,1)::integer * multiplier;
    multiplier := case when multiplier = 7 then 2 else multiplier + 1 end;
  end loop;
  remainder := 11 - total % 11;
  dv := case remainder when 11 then '0' when 10 then 'K' else remainder::text end;
  if right(compact,1) <> dv then return null; end if;
  return digits || '-' || dv;
end;
$$;

create or replace function public.hu30_lock_participation(p_id uuid)
returns public.co_debtor_invitations language plpgsql security definer set search_path = public as $$
declare item public.co_debtor_invitations;
begin
  select * into item from public.co_debtor_invitations where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform 1 from public.profiles where id = item.lead_id for update;
  select * into item from public.co_debtor_invitations where id = p_id for update;
  return item;
end;
$$;

create or replace function public.hu30_guard_participation()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.participant_user_id is not null and (
      new.participant_user_id is distinct from old.participant_user_id
      or new.lead_id is distinct from old.lead_id
      or new.recipient_email is distinct from old.recipient_email
      or new.recipient_rut is distinct from old.recipient_rut) then
    raise exception 'immutable_participant_identity' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists hu30_participation_identity on public.co_debtor_invitations;
create trigger hu30_participation_identity before update on public.co_debtor_invitations
  for each row execute function public.hu30_guard_participation();

create or replace function public.hu30_guard_confirmation()
returns trigger language plpgsql security definer set search_path = public as $$
declare item public.co_debtor_invitations; profile_row public.profiles;
  auth_row auth.users; previous integer; relation_id uuid;
begin
  if tg_op <> 'INSERT' then raise exception 'immutable_confirmation' using errcode = '23514'; end if;
  item := public.hu30_lock_participation(new.invitation_id);
  select coalesce(max(revision_number),0) into previous
    from public.co_debtor_confirmations where invitation_id = item.id;
  if new.participant_user_id is null or new.request_id is null
      or new.revision_number <> previous + 1
      or new.ingreso_mensual_complementario >= 'Infinity'::numeric
      or new.deuda_mensual_complementario >= 'Infinity'::numeric then
    raise exception 'co_debtor_revision_conflict' using errcode = '23514';
  end if;
  if item.status not in ('pending','confirmed')
      or (item.status = 'pending' and item.expires_at <= clock_timestamp())
      or public.hu30_closure_at(item.id) is not null then
    raise exception 'co_debtor_participation_closed' using errcode = '23514';
  end if;
  select * into profile_row from public.profiles where id = new.participant_user_id;
  select * into auth_row from auth.users where id = new.participant_user_id;
  if item.participant_user_id is distinct from new.participant_user_id
      or profile_row.role is distinct from 'usuario'
      or auth_row.email_confirmed_at is null
      or lower(trim(auth_row.email)) is distinct from lower(trim(item.recipient_email))
      or public.hu30_normalize_rut(profile_row.rut) is null
      or public.hu30_normalize_rut(profile_row.rut) is distinct from public.hu30_normalize_rut(item.recipient_rut) then
    raise exception 'owner_mismatch' using errcode = '23514';
  end if;
  select id into relation_id from public.co_debtor_consent_events
    where invitation_id = item.id and relation_revision is not null
    order by relation_revision desc limit 1;
  if relation_id is null or (new.accepted_relation_event_id is not null
      and new.accepted_relation_event_id <> relation_id)
      or (not exists (select 1 from public.co_debtor_confirmations
          where invitation_id = item.id and participant_user_id is not null)
        and new.accepted_relation_event_id is distinct from relation_id) then
    raise exception 'co_debtor_relation_conflict' using errcode = '23514';
  end if;
  new.confirmed_at := clock_timestamp();
  new.treatment_consented_at := new.confirmed_at;
  return new;
end;
$$;
drop trigger if exists hu30_confirmation_integrity on public.co_debtor_confirmations;
create trigger hu30_confirmation_integrity before insert or update or delete on public.co_debtor_confirmations
  for each row execute function public.hu30_guard_confirmation();

create or replace function public.hu30_guard_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare item public.co_debtor_invitations; previous integer;
begin
  item := public.hu30_lock_participation(new.invitation_id);
  if new.relation_revision is not null then
    select coalesce(max(relation_revision),0) into previous
      from public.co_debtor_consent_events where invitation_id = item.id;
    if new.actor_user_id is distinct from item.lead_id or new.relation_revision <> previous + 1
      or item.status not in ('pending','confirmed')
      or new.event_type is distinct from (case when previous=0 then 'relation_declared' else 'relation_changed' end) then
      raise exception 'co_debtor_relation_conflict' using errcode = '23514';
    end if;
  end if;
  if new.confirmation_id is not null and not exists (
    select 1 from public.co_debtor_confirmations c where c.id = new.confirmation_id
      and c.invitation_id = item.id and c.participant_user_id = new.actor_user_id
      and new.actor_type = 'co_debtor' and new.event_type in ('confirmed','consent_granted')) then
    raise exception 'owner_mismatch' using errcode = '23514';
  end if;
  if new.event_type in ('confirmed','consent_granted') and new.confirmation_id is null then
    raise exception 'confirmation_reference_required' using errcode = '23514';
  end if;
  new.occurred_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists hu30_event_integrity on public.co_debtor_consent_events;
create trigger hu30_event_integrity before insert on public.co_debtor_consent_events
  for each row execute function public.hu30_guard_event();

-- Service-only persistence contracts. Actor IDs come from a validated Auth session.
-- T4 owns their HTTP/auth flow, not this migration.
create or replace function public.hu30_declare_relation(p_invitation_id uuid, p_actor uuid,
  p_value text, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare item public.co_debtor_invitations; previous integer; current_value text; result uuid;
begin
  item := public.hu30_lock_participation(p_invitation_id);
  if item.lead_id is distinct from p_actor then raise exception 'owner_mismatch'; end if;
  select relation_revision, relation_value, id into previous, current_value, result
    from public.co_debtor_consent_events where invitation_id = item.id
      and relation_revision is not null order by relation_revision desc limit 1;
  if coalesce(previous,0) is distinct from p_expected_revision then raise exception 'lineage_conflict'; end if;
  if current_value = p_value then return result; end if;
  insert into public.co_debtor_consent_events(invitation_id,event_type,actor_type,
    invitation_status,actor_user_id,relation_value,relation_revision)
    values(item.id,case when previous is null then 'relation_declared' else 'relation_changed' end,
      'lead',item.status,p_actor,p_value,coalesce(previous,0)+1) returning id into result;
  return result;
end;
$$;

create or replace function public.hu30_append_confirmation(p_invitation_id uuid, p_actor uuid,
  p_request_id uuid, p_expected_revision integer, p_accepted_relation_event_id uuid,
  p_values jsonb, p_consent_version text)
returns public.co_debtor_confirmations language plpgsql security definer set search_path = public as $$
declare item public.co_debtor_invitations; result public.co_debtor_confirmations; previous integer;
begin
  item := public.hu30_lock_participation(p_invitation_id);
  if p_actor is null or p_request_id is null then raise exception 'unauthenticated'; end if;
  select * into result from public.co_debtor_confirmations
    where invitation_id = item.id and request_id = p_request_id;
  if found then
    if result.participant_user_id is distinct from p_actor then raise exception 'owner_mismatch'; end if;
    if jsonb_build_object(
      'ingreso_mensual_complementario',result.ingreso_mensual_complementario,
      'deuda_mensual_complementario',result.deuda_mensual_complementario,
      'tipo_contrato_complementario',result.tipo_contrato_complementario,
      'continuidad_laboral_complementario',result.continuidad_laboral_complementario,
      'morosidad_complementario',result.morosidad_complementario) <> p_values
      or result.treatment_consent_version is distinct from p_consent_version
      or result.accepted_relation_event_id is distinct from p_accepted_relation_event_id then
      raise exception 'idempotency_conflict';
    end if;
    return result;
  end if;
  select coalesce(max(revision_number),0) into previous from public.co_debtor_confirmations where invitation_id = item.id;
  if previous is distinct from p_expected_revision then raise exception 'co_debtor_revision_conflict'; end if;
  if item.participant_user_id is null then
    update public.co_debtor_invitations set participant_user_id = p_actor where id = item.id;
  elsif item.participant_user_id <> p_actor then raise exception 'owner_mismatch'; end if;
  insert into public.co_debtor_confirmations(invitation_id,revision_number,participant_user_id,
    request_id,accepted_relation_event_id,ingreso_mensual_complementario,deuda_mensual_complementario,
    tipo_contrato_complementario,continuidad_laboral_complementario,morosidad_complementario,
    treatment_consent_version,treatment_consented_at)
    values(item.id,previous+1,p_actor,p_request_id,p_accepted_relation_event_id,
      (p_values->>'ingreso_mensual_complementario')::numeric,
      (p_values->>'deuda_mensual_complementario')::numeric,
      p_values->>'tipo_contrato_complementario',p_values->>'continuidad_laboral_complementario',
      p_values->>'morosidad_complementario',p_consent_version,clock_timestamp()) returning * into result;
  update public.co_debtor_invitations set status = 'confirmed', consumed_at = coalesce(consumed_at,result.confirmed_at)
    where id = item.id;
  insert into public.co_debtor_consent_events(invitation_id,event_type,actor_type,invitation_status,actor_user_id,confirmation_id)
    values(item.id,'consent_granted','co_debtor','confirmed',p_actor,result.id),
          (item.id,'confirmed','co_debtor','confirmed',p_actor,result.id);
  return result;
end;
$$;

create or replace function public.hu30_closure_at(p_invitation_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(occurred_at) from public.co_debtor_consent_events
    where invitation_id = p_invitation_id and (event_type = 'revoked'
      or (event_type = 'replaced' and exists (select 1 from public.co_debtor_confirmations c
        where c.invitation_id=p_invitation_id and c.confirmed_at <= occurred_at)));
$$;

create or replace function public.hu30_guard_evaluation()
returns trigger language plpgsql security definer set search_path = public as $$
declare ref text := new.financial_data->'provenance'->>'co_debtor_confirmation_id';
  source text := new.financial_data->'provenance'->'co_debtor_consent'->>'complement_source';
  item public.co_debtor_invitations; confirmation public.co_debtor_confirmations;
  latest integer; relation_row public.co_debtor_consent_events;
begin
  if source is distinct from 'co_debtor_confirmed' and ref is null then return new; end if;
  if ref is null or source is distinct from 'co_debtor_confirmed' then raise exception 'confirmation_reference_required' using errcode='23514'; end if;
  select * into confirmation from public.co_debtor_confirmations where id = ref::uuid;
  if not found then raise exception 'invalid_confirmation_reference' using errcode='23514'; end if;
  item := public.hu30_lock_participation(confirmation.invitation_id);
  select max(revision_number) into latest from public.co_debtor_confirmations where invitation_id = item.id;
  select * into relation_row from public.co_debtor_consent_events where invitation_id = item.id
    and relation_revision is not null order by relation_revision desc limit 1;
  if item.lead_id is distinct from new.user_id or item.status <> 'confirmed'
      or public.hu30_closure_at(item.id) is not null
      or confirmation.participant_user_id is null
      or confirmation.participant_user_id is distinct from item.participant_user_id
      or confirmation.revision_number <> latest
      or (new.financial_data->'provenance'->'co_debtor_consent'->>'revision_number')::integer
        is distinct from confirmation.revision_number
      or new.financial_data->'provenance'->'co_debtor_consent'->>'relation_declaration_event_id'
        is distinct from relation_row.id::text
      or relation_row.id is null then
    raise exception 'co_debtor_revision_conflict' using errcode='23514';
  end if;
  if new.financial_data->'input'->>'relacion_complementario' is distinct from relation_row.relation_value
      or new.financial_data->'input'->'ingreso_mensual_complementario' is distinct from to_jsonb(confirmation.ingreso_mensual_complementario)
      or new.financial_data->'input'->'deuda_mensual_complementario' is distinct from to_jsonb(confirmation.deuda_mensual_complementario)
      or new.financial_data->'input'->>'tipo_contrato_complementario' is distinct from confirmation.tipo_contrato_complementario
      or new.financial_data->'input'->>'continuidad_laboral_complementario' is distinct from confirmation.continuidad_laboral_complementario
      or new.financial_data->'input'->>'morosidad_complementario' is distinct from confirmation.morosidad_complementario then
    raise exception 'confirmation_snapshot_mismatch' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists hu30_evaluation_reference on public.evaluations;
create trigger hu30_evaluation_reference before insert on public.evaluations
  for each row execute function public.hu30_guard_evaluation();

-- No anonymous caller can create modern confirmations through an old overload.
-- These guards deliberately require coordinated deployment with T4.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'hu30_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;
commit;
