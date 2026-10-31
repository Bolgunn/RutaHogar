-- Keep closure evidence and revocation available. Never resurrect replaced participants.
begin;
create or replace function public.hu18_create_invitation(
  p_lead_id uuid,p_recipient_email text,p_token_digest text,p_expires_at timestamptz)
returns table(invitation_id uuid,previous_invitation_id uuid)
language plpgsql security definer set search_path=public as $$
begin raise exception 'hu30_rollback_read_only'; end;
$$;
commit;
