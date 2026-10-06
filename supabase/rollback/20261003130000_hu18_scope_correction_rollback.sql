-- Rollback HU18 scope correction.
-- Recreating the former non-null phone column is safe only before any invitation exists.
begin;

do $$
begin
  if exists (select 1 from public.co_debtor_invitations) then
    raise exception
      'cannot rollback HU18 scope correction while co-debtor invitations exist';
  end if;
end;
$$;

drop index if exists public.co_debtor_invitations_management_token_digest_idx;
alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_management_token_digest_check,
  drop column if exists management_token_digest,
  add column if not exists recipient_phone text not null
    check (length(trim(recipient_phone)) > 0),
  add column if not exists phone_verified_at timestamptz,
  add column if not exists whatsapp_contact_opt_in boolean not null default false,
  add column if not exists whatsapp_contact_opted_in_at timestamptz;

commit;
