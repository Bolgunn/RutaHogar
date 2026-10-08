-- HU18: allow a co-debtor to explicitly decline an invitation without granting consent.
begin;

alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_status_check;
alter table public.co_debtor_invitations
  add constraint co_debtor_invitations_status_check
  check (status in ('pending', 'expired', 'confirmed', 'revoked', 'declined', 'replaced'));

alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_event_type_check;
alter table public.co_debtor_consent_events
  add constraint co_debtor_consent_events_event_type_check
  check (event_type in ('invited', 'replaced', 'expired', 'consent_granted', 'confirmed', 'revoked', 'declined'));

alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_invitation_status_check;
alter table public.co_debtor_consent_events
  add constraint co_debtor_consent_events_invitation_status_check
  check (invitation_status in ('pending', 'expired', 'confirmed', 'revoked', 'declined', 'replaced'));

create or replace function public.hu18_decline_invitation(p_invitation_id uuid)
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

revoke all on function public.hu18_decline_invitation(uuid) from public, anon, authenticated;
grant execute on function public.hu18_decline_invitation(uuid) to service_role;

commit;
