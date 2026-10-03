-- HU18 scope correction: remove non-story contact fields from applied Step 1.
-- This is incremental because 20261003120000 was already applied to hosted Supabase.
begin;

alter table public.co_debtor_invitations
  drop column if exists recipient_phone,
  drop column if exists phone_verified_at,
  drop column if exists whatsapp_contact_opt_in,
  drop column if exists whatsapp_contact_opted_in_at,
  add column if not exists management_token_digest text;

alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_management_token_digest_check;
alter table public.co_debtor_invitations
  add constraint co_debtor_invitations_management_token_digest_check
  check (
    management_token_digest is null
    or length(trim(management_token_digest)) > 0
  );

create unique index if not exists co_debtor_invitations_management_token_digest_idx
  on public.co_debtor_invitations (management_token_digest)
  where management_token_digest is not null;

commit;
