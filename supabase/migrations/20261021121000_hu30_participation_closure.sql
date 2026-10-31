-- HU30: replacement closes confirmed participation at creation, with no resurrection.
begin;

create or replace function public.hu18_create_invitation(
  p_lead_id uuid,
  p_recipient_email text,
  p_token_digest text,
  p_expires_at timestamptz
)
returns table (invitation_id uuid, previous_invitation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_invitation public.co_debtor_invitations%rowtype;
  created_id uuid;
begin
  perform 1 from public.profiles where id = p_lead_id for update;
  if not found then
    raise exception 'hu18_lead_not_found' using errcode = 'P0001';
  end if;

  select * into existing_invitation
  from public.co_debtor_invitations
  where lead_id = p_lead_id
  order by (status = 'pending') desc, created_at desc, id desc limit 1
  for update;

  if found and existing_invitation.status = 'pending' and existing_invitation.expires_at <= clock_timestamp() then
    update public.co_debtor_invitations
      set status = 'expired'
      where id = existing_invitation.id;
    insert into public.co_debtor_consent_events
      (invitation_id, event_type, actor_type, invitation_status)
      values (existing_invitation.id, 'expired', 'system', 'expired');
    existing_invitation := null;
  elsif found and existing_invitation.status in ('pending','confirmed') then
    update public.co_debtor_invitations
      set status = 'replaced', replaced_at = clock_timestamp()
      where id = existing_invitation.id;
    insert into public.co_debtor_consent_events
      (invitation_id, event_type, actor_type, invitation_status, actor_user_id)
      values (existing_invitation.id, 'replaced', 'lead', 'replaced', p_lead_id);
    update public.co_debtor_invitations set replaced_at = coalesce(public.hu30_closure_at(existing_invitation.id),
      (select min(occurred_at) from public.co_debtor_consent_events ev where ev.invitation_id=existing_invitation.id and ev.event_type='replaced'))
      where id = existing_invitation.id;
  end if;

  insert into public.co_debtor_invitations
    (lead_id, recipient_email, token_digest, expires_at, replacement_of_invitation_id)
  values (
    p_lead_id,
    lower(trim(p_recipient_email)),
    p_token_digest,
    p_expires_at,
    case when existing_invitation.id is null then null else existing_invitation.id end
  )
  returning id into created_id;

  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status, actor_user_id)
    values (created_id, 'invited', 'lead', 'pending', p_lead_id);

  return query select created_id, existing_invitation.id;
end;
$$;

create or replace function public.hu18_revert_invitation_after_delivery_failure(
  p_invitation_id uuid,
  p_previous_invitation_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  item public.co_debtor_invitations;
begin
  item := public.hu30_lock_participation(p_invitation_id);
  current_status := item.status;
  if p_previous_invitation_id is not null and p_previous_invitation_id is distinct from item.replacement_of_invitation_id then
    raise exception 'owner_mismatch';
  end if;

  if current_status is distinct from 'pending' then
    return false;
  end if;

  update public.co_debtor_invitations
    set status = 'replaced', replaced_at = clock_timestamp()
    where id = p_invitation_id;
  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'replaced', 'system', 'replaced');

  if p_previous_invitation_id is not null then
    update public.co_debtor_invitations
      set status = 'pending', replaced_at = null
      where id = p_previous_invitation_id and lead_id=item.lead_id and status = 'replaced'
        and not exists (select 1 from public.co_debtor_confirmations where invitation_id = p_previous_invitation_id);
  end if;

  return true;
end;
$$;

create or replace function public.hu18_revoke_consent(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  current_status := (public.hu30_lock_participation(p_invitation_id)).status;
  if current_status = 'revoked' then
    return false;
  end if;
  if current_status not in ('confirmed','replaced') or not exists (
    select 1 from public.co_debtor_confirmations where invitation_id = p_invitation_id) then
    raise exception 'hu18_consent_not_confirmed' using errcode = 'P0001';
  end if;

  update public.co_debtor_invitations set status = 'revoked' where id = p_invitation_id;
  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'revoked', 'co_debtor', 'revoked');
  return true;
end;
$$;

-- All legacy state transitions follow profile -> participation lock order.
create or replace function public.hu18_expire_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.co_debtor_invitations%rowtype;
begin
  invitation := public.hu30_lock_participation(p_invitation_id);

  if invitation.status <> 'pending' or invitation.expires_at > clock_timestamp() then
    return false;
  end if;

  update public.co_debtor_invitations set status = 'expired' where id = invitation.id;
  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status)
    values (invitation.id, 'expired', 'system', 'expired');
  return true;
end;
$$;

create or replace function public.hu18_expire_invitations()
returns table (invitation_id uuid, recipient_email text, lead_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.co_debtor_invitations%rowtype;
begin
  for invitation in
    select * from public.co_debtor_invitations
    where status = 'pending' and expires_at <= clock_timestamp()
    order by co_debtor_invitations.lead_id, id
  loop
    if not public.hu18_expire_invitation(invitation.id) then continue; end if;
    invitation_id := invitation.id;
    recipient_email := invitation.recipient_email;
    lead_id := invitation.lead_id;
    return next;
  end loop;
end;
$$;

create or replace function public.hu18_decline_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  current_status := (public.hu30_lock_participation(p_invitation_id)).status;
  if current_status <> 'pending' then
    raise exception 'hu18_invitation_not_pending' using errcode = 'P0001';
  end if;

  update public.co_debtor_invitations
    set status = 'declined', consumed_at = clock_timestamp()
    where id = p_invitation_id;
  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'declined', 'co_debtor', 'declined');
  return true;
end;
$$;

-- Activation requires T4; never accept an anonymous confirmation via this overload.
create or replace function public.hu18_confirm_invitation(
  p_invitation_id uuid,
  p_ingreso_mensual_complementario numeric,
  p_deuda_mensual_complementario numeric,
  p_tipo_contrato_complementario text,
  p_continuidad_laboral_complementario text,
  p_morosidad_complementario text,
  p_treatment_consent_version text,
  p_management_token_digest text
)
returns table (recipient_email text, lead_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'authenticated_confirmation_required' using errcode = 'P0001';
end;
$$;

commit;
