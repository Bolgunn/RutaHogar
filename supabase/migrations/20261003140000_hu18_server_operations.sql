-- HU18 Step 3: atomic server-side invitation, confirmation and revocation operations.
-- Requires the previously applied HU18 persistence and scope-correction migrations.
begin;

alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_event_type_check;
alter table public.co_debtor_consent_events
  add constraint co_debtor_consent_events_event_type_check
  check (event_type in ('invited', 'replaced', 'expired', 'consent_granted', 'confirmed', 'revoked'));

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
  where lead_id = p_lead_id and status = 'pending'
  for update;

  if found and existing_invitation.expires_at <= clock_timestamp() then
    update public.co_debtor_invitations
      set status = 'expired'
      where id = existing_invitation.id;
    insert into public.co_debtor_consent_events
      (invitation_id, event_type, actor_type, invitation_status)
      values (existing_invitation.id, 'expired', 'system', 'expired');
    existing_invitation := null;
  elsif found then
    update public.co_debtor_invitations
      set status = 'replaced', replaced_at = clock_timestamp()
      where id = existing_invitation.id;
    insert into public.co_debtor_consent_events
      (invitation_id, event_type, actor_type, invitation_status)
      values (existing_invitation.id, 'replaced', 'lead', 'replaced');
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
    (invitation_id, event_type, actor_type, invitation_status)
    values (created_id, 'invited', 'lead', 'pending');

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
begin
  select status into current_status
  from public.co_debtor_invitations
  where id = p_invitation_id
  for update;

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
      where id = p_previous_invitation_id and status = 'replaced';
  end if;

  return true;
end;
$$;

create or replace function public.hu18_expire_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation public.co_debtor_invitations%rowtype;
begin
  select * into invitation
  from public.co_debtor_invitations
  where id = p_invitation_id
  for update;

  if not found or invitation.status <> 'pending' or invitation.expires_at > clock_timestamp() then
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
    for update skip locked
  loop
    update public.co_debtor_invitations set status = 'expired' where id = invitation.id;
    insert into public.co_debtor_consent_events
      (invitation_id, event_type, actor_type, invitation_status)
      values (invitation.id, 'expired', 'system', 'expired');
    invitation_id := invitation.id;
    recipient_email := invitation.recipient_email;
    lead_id := invitation.lead_id;
    return next;
  end loop;
end;
$$;

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
declare
  invitation public.co_debtor_invitations%rowtype;
begin
  select * into invitation
  from public.co_debtor_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'hu18_invitation_not_found' using errcode = 'P0001';
  end if;
  if invitation.status = 'pending' and invitation.expires_at <= clock_timestamp() then
    update public.co_debtor_invitations set status = 'expired' where id = invitation.id;
    insert into public.co_debtor_consent_events
      (invitation_id, event_type, actor_type, invitation_status)
      values (invitation.id, 'expired', 'system', 'expired');
    return;
  end if;
  if invitation.status <> 'pending' then
    raise exception 'hu18_invitation_not_pending' using errcode = 'P0001';
  end if;
  if length(trim(p_management_token_digest)) = 0 then
    raise exception 'hu18_management_token_missing' using errcode = 'P0001';
  end if;

  insert into public.co_debtor_confirmations (
    invitation_id,
    ingreso_mensual_complementario,
    deuda_mensual_complementario,
    tipo_contrato_complementario,
    continuidad_laboral_complementario,
    morosidad_complementario,
    treatment_consent_version,
    treatment_consented_at
  ) values (
    invitation.id,
    p_ingreso_mensual_complementario,
    p_deuda_mensual_complementario,
    p_tipo_contrato_complementario,
    p_continuidad_laboral_complementario,
    p_morosidad_complementario,
    p_treatment_consent_version,
    clock_timestamp()
  );

  update public.co_debtor_invitations
    set status = 'confirmed',
        consumed_at = clock_timestamp(),
        management_token_digest = p_management_token_digest
    where id = invitation.id;
  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status)
    values
      (invitation.id, 'consent_granted', 'co_debtor', 'confirmed'),
      (invitation.id, 'confirmed', 'co_debtor', 'confirmed');

  return query select invitation.recipient_email, invitation.lead_id;
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
  select status into current_status
  from public.co_debtor_invitations
  where id = p_invitation_id
  for update;
  if not found then
    raise exception 'hu18_invitation_not_found' using errcode = 'P0001';
  end if;
  if current_status = 'revoked' then
    return false;
  end if;
  if current_status <> 'confirmed' then
    raise exception 'hu18_consent_not_confirmed' using errcode = 'P0001';
  end if;

  update public.co_debtor_invitations set status = 'revoked' where id = p_invitation_id;
  insert into public.co_debtor_consent_events
    (invitation_id, event_type, actor_type, invitation_status)
    values (p_invitation_id, 'revoked', 'co_debtor', 'revoked');
  return true;
end;
$$;

revoke all on function public.hu18_create_invitation(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.hu18_revert_invitation_after_delivery_failure(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hu18_expire_invitation(uuid) from public, anon, authenticated;
revoke all on function public.hu18_expire_invitations() from public, anon, authenticated;
revoke all on function public.hu18_confirm_invitation(uuid, numeric, numeric, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.hu18_revoke_consent(uuid) from public, anon, authenticated;
grant execute on function public.hu18_create_invitation(uuid, text, text, timestamptz),
  public.hu18_revert_invitation_after_delivery_failure(uuid, uuid),
  public.hu18_expire_invitation(uuid),
  public.hu18_expire_invitations(),
  public.hu18_confirm_invitation(uuid, numeric, numeric, text, text, text, text, text),
  public.hu18_revoke_consent(uuid)
  to service_role;

commit;
