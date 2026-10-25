-- T4A: link an authenticated recipient without granting financial consent.
-- Actor comes only from Auth.getUser in the service-only Edge adapter.
begin;
create or replace function public.hu30_authorize_invitation(p_token_digest text, p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.co_debtor_invitations; account public.profiles; auth_account auth.users;
begin
 select * into item from public.co_debtor_invitations where token_digest=p_token_digest;
 if not found then raise exception 'invitation_unavailable'; end if;
 item := public.hu30_lock_participation(item.id);
 -- Revalidate under the same locks used by replacement, revocation and confirmation.
 if item.token_digest is distinct from p_token_digest or item.status <> 'pending'
   or item.expires_at <= clock_timestamp() or item.consumed_at is not null
   or public.hu30_closure_at(item.id) is not null then
   raise exception 'invitation_unavailable';
 end if;
 select * into account from public.profiles where id=p_actor;
 select * into auth_account from auth.users where id=p_actor;
 if p_actor is null or account.role is distinct from 'usuario'
   or auth_account.email is null
   or lower(trim(auth_account.email)) is distinct from lower(trim(item.recipient_email))
   or public.hu30_normalize_rut(account.rut) is null
   or public.hu30_normalize_rut(account.rut) is distinct from public.hu30_normalize_rut(item.recipient_rut)
   or (item.participant_user_id is not null and item.participant_user_id <> p_actor) then
   raise exception 'participant_identity_mismatch';
 end if;
 if auth_account.email_confirmed_at is null then raise exception 'email_confirmation_required'; end if;
 if item.participant_user_id is null then
   update public.co_debtor_invitations set participant_user_id=p_actor where id=item.id;
 end if;
 return jsonb_build_object('status','pending','authorized',true,'participation_id',item.id,'expires_at',item.expires_at);
end;
$$;
revoke all on function public.hu30_authorize_invitation(text,uuid) from public,anon,authenticated;
grant execute on function public.hu30_authorize_invitation(text,uuid) to service_role;
commit;
