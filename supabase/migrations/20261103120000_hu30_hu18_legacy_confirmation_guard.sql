-- Corrective: preserve verified HU18 consent without manufacturing an identity.
begin;

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
  -- HU18 rows predate participant binding: immutable consent evidence, never identity inference.
  if item.lead_id = new.user_id and item.status = 'confirmed'
      and item.participant_user_id is null and confirmation.participant_user_id is null
      and confirmation.revision_number = 1 and confirmation.request_id is null
      and confirmation.accepted_relation_event_id is null
      and confirmation.treatment_consent_version is not null
      and length(trim(confirmation.treatment_consent_version)) > 0
      and confirmation.treatment_consented_at is not null and confirmation.confirmed_at is not null
      and public.hu30_closure_at(item.id) is null
      and (select count(*) from public.co_debtor_confirmations c where c.invitation_id=item.id) = 1
      and (select count(distinct e.event_type) from public.co_debtor_consent_events e
           where e.invitation_id=item.id and e.event_type in ('consent_granted','confirmed')
             and e.actor_type='co_debtor' and e.invitation_status='confirmed'
             and e.actor_user_id is null and e.confirmation_id is null) = 2
      and (new.financial_data->'provenance'->'co_debtor_consent'->>'revision_number')::integer = 1 then
    if new.financial_data->'input'->'ingreso_mensual_complementario' is distinct from to_jsonb(confirmation.ingreso_mensual_complementario)
       or new.financial_data->'input'->'deuda_mensual_complementario' is distinct from to_jsonb(confirmation.deuda_mensual_complementario)
       or new.financial_data->'input'->>'tipo_contrato_complementario' is distinct from confirmation.tipo_contrato_complementario
       or new.financial_data->'input'->>'continuidad_laboral_complementario' is distinct from confirmation.continuidad_laboral_complementario
       or new.financial_data->'input'->>'morosidad_complementario' is distinct from confirmation.morosidad_complementario then
      raise exception 'confirmation_snapshot_mismatch' using errcode='23514';
    end if;
    return new;
  end if;
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

commit;
