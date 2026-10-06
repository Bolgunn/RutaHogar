-- HU18 UX: retain the lead-declared co-debtor RUT with its invitation.
-- Historical invitations predate this field, so it intentionally remains nullable.
begin;

alter table public.co_debtor_invitations
  add column if not exists recipient_rut text;
alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_recipient_rut_format_check;
alter table public.co_debtor_invitations
  add constraint co_debtor_invitations_recipient_rut_format_check
  check (recipient_rut is null or recipient_rut ~ '^[0-9]{7,8}-[0-9K]$');

-- Keep the hosted four-argument operation intact for existing rows and add a
-- distinct, service-only signature for the validated RUT-aware Edge Function.
create or replace function public.hu18_create_invitation(
  p_lead_id uuid,
  p_recipient_email text,
  p_recipient_rut text,
  p_token_digest text,
  p_expires_at timestamptz
)
returns table (invitation_id uuid, previous_invitation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare created_invitation record;
begin
  if p_recipient_rut !~ '^[0-9]{7,8}-[0-9K]$' then
    raise exception 'hu18_invalid_recipient_rut' using errcode = 'P0001';
  end if;

  select * into created_invitation
  from public.hu18_create_invitation(
    p_lead_id,
    p_recipient_email,
    p_token_digest,
    p_expires_at
  );

  update public.co_debtor_invitations
    set recipient_rut = p_recipient_rut
    where id = created_invitation.invitation_id;

  return query select created_invitation.invitation_id, created_invitation.previous_invitation_id;
end;
$$;

revoke all on function public.hu18_create_invitation(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.hu18_create_invitation(uuid, text, text, text, timestamptz)
  to service_role;

commit;
