-- Rollback HU18 Step 3 server-side operations.
begin;

revoke all on function public.hu18_create_invitation(uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.hu18_revert_invitation_after_delivery_failure(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.hu18_expire_invitation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hu18_expire_invitations() from public, anon, authenticated, service_role;
revoke all on function public.hu18_confirm_invitation(uuid, numeric, numeric, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.hu18_revoke_consent(uuid) from public, anon, authenticated, service_role;

drop function if exists public.hu18_revoke_consent(uuid);
drop function if exists public.hu18_confirm_invitation(uuid, numeric, numeric, text, text, text, text, text);
drop function if exists public.hu18_expire_invitations();
drop function if exists public.hu18_expire_invitation(uuid);
drop function if exists public.hu18_revert_invitation_after_delivery_failure(uuid, uuid);
drop function if exists public.hu18_create_invitation(uuid, text, text, timestamptz);

alter table public.co_debtor_consent_events
  drop constraint if exists co_debtor_consent_events_event_type_check;
alter table public.co_debtor_consent_events
  add constraint co_debtor_consent_events_event_type_check
  check (event_type in ('invited', 'consent_granted', 'confirmed', 'revoked'));

commit;
