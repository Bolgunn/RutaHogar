-- Test after the T3 fixtures, exclusively in a disposable database.
begin;
do $$ declare item uuid; digest text := 't4a-digest'; linked jsonb; total integer;
 actor uuid := 'a3000000-0000-0000-0000-000000000002';
 owner_id uuid := 'a3000000-0000-0000-0000-000000000001'; value text;
begin
 select invitation_id into item from public.hu18_create_invitation(owner_id,'participant@hu30.invalid',
  '12345678-5',digest,clock_timestamp()+interval '7 days');
 update public.profiles set rut='12.345.678-5' where id=actor;
 select count(*) into total from public.co_debtor_confirmations;
 -- Caller identities or recipient values can never be invented by this RPC.
 begin
   perform public.hu30_authorize_invitation(digest,owner_id);
   raise exception 'missing denial';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
   update public.profiles set rut='11111111-1' where id=actor;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing denial';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
   update auth.users set email='wrong@hu30.invalid' where id=actor;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing denial';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
   update public.profiles set role='ejecutivo' where id=actor;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing denial';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
   update public.co_debtor_invitations set participant_user_id=owner_id where id=item;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing denial';
 exception when others then assert sqlerrm='participant_identity_mismatch'; end;
 begin
   update auth.users set email_confirmed_at=null where id=actor;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing verification';
 exception when others then assert sqlerrm='email_confirmation_required'; end;
 linked := public.hu30_authorize_invitation(digest,actor);
 assert linked->>'authorized'='true' and linked->>'participation_id'=item::text;
 assert linked=public.hu30_authorize_invitation(digest,actor), 'binding must be idempotent';
 assert (select participant_user_id=actor and status='pending' and consumed_at is null
  from public.co_debtor_invitations where id=item);
 assert (select count(*)=total from public.co_debtor_confirmations), 'access must never create financial evidence';
 assert not exists(select 1 from public.co_debtor_consent_events where invitation_id=item and event_type in ('confirmed','consent_granted'));
 foreach value in array array['expired','replaced','revoked','declined','confirmed'] loop
   begin
     update public.co_debtor_invitations set status=value where id=item;
     perform public.hu30_authorize_invitation(digest,actor);
     raise exception 'missing state denial';
   exception when others then assert sqlerrm='invitation_unavailable'; end;
 end loop;
 begin
   update public.co_debtor_invitations set created_at=clock_timestamp()-interval '2 days',
    expires_at=clock_timestamp()-interval '1 day' where id=item;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing expiry denial';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 begin
   update public.co_debtor_invitations set consumed_at=clock_timestamp() where id=item;
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing consumed token denial';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 begin
   perform public.hu30_authorize_invitation('manipulated',actor);
   raise exception 'missing token denial';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 -- Simulate a replacement while the recipient is away in login/verification.
 perform 1 from public.hu18_create_invitation(owner_id,'participant@hu30.invalid','12345678-5',
  't4a-replacement',clock_timestamp()+interval '7 days');
 begin
   perform public.hu30_authorize_invitation(digest,actor);
   raise exception 'missing late replacement denial';
 exception when others then assert sqlerrm='invitation_unavailable'; end;
 assert not has_function_privilege('authenticated','public.hu30_authorize_invitation(text,uuid)','EXECUTE');
end; $$;
rollback;
