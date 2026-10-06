-- Rollback HU18 UX RUT persistence.
begin;

revoke all on function public.hu18_create_invitation(uuid, text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
drop function if exists public.hu18_create_invitation(uuid, text, text, text, timestamptz);

alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_recipient_rut_format_check,
  drop column if exists recipient_rut;

commit;
