-- Rollback HU18 decline invitation.
-- Safe only before production decline use: existing declined invitations or
-- consent events intentionally prevent restoration of the prior constraints.
begin;

revoke all on function public.hu18_decline_invitation(uuid) from public, anon, authenticated, service_role;
drop function if exists public.hu18_decline_invitation(uuid);

alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_status_check;
alter table public.co_debtor_invitations
  add constraint co_debtor_invitations_status_check
  check (status in ('pending', 'expired', 'confirmed', 'revoked', 'replaced'));

alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_event_type_check;
alter table public.co_debtor_consent_events
  add constraint co_debtor_consent_events_event_type_check
  check (event_type in ('invited', 'replaced', 'expired', 'consent_granted', 'confirmed', 'revoked'));

alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_invitation_status_check;
alter table public.co_debtor_consent_events
  add constraint co_debtor_consent_events_invitation_status_check
  check (invitation_status in ('pending', 'expired', 'confirmed', 'revoked', 'replaced'));

commit;
