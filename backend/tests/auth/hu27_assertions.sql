do $$ begin
  update public.profiles set rut='12.345.678-5' where id='33333333-3333-4333-8333-333333333333';
  begin
    update public.profiles set rut='123456785' where role='ejecutivo';
    raise exception 'expected duplicate rejection';
  exception when unique_violation then null;
  end;
  if has_function_privilege('anon','public.hu27_access_token_hook(jsonb)','execute')
     or has_function_privilege('authenticated','public.hu27_access_token_hook(jsonb)','execute') then
    raise exception 'hook exposed to browser';
  end if;
  if has_function_privilege('authenticated','public.hu27_guard_profile_rut()','execute') then raise exception 'RUT guard exposed'; end if;
end $$;
set role supabase_auth_admin;
do $$ declare result jsonb; begin
  result := public.hu27_access_token_hook('{"user_id":"11111111-1111-4111-8111-111111111111","authentication_method":"oauth","claims":{"role":"authenticated"}}');
  if result <> '{"claims":{"role":"authenticated"}}'::jsonb then raise exception 'claims changed'; end if;
  perform public.hu27_access_token_hook('{"user_id":"22222222-2222-4222-8222-222222222222","authentication_method":"password","claims":{"role":"authenticated"}}');
  begin
    perform public.hu27_access_token_hook('{"user_id":"22222222-2222-4222-8222-222222222222","authentication_method":"oauth","claims":{}}');
    raise exception 'expected staff OAuth rejection';
  exception when raise_exception then
    if sqlerrm = 'expected staff OAuth rejection' then raise; end if;
  end;
  begin
    perform public.hu27_access_token_hook('{"user_id":"22222222-2222-4222-8222-222222222222","authentication_method":"token_refresh","claims":{"amr":[{"method":"oauth"}]}}');
    raise exception 'expected staff refresh rejection';
  exception when raise_exception then
    if sqlerrm = 'expected staff refresh rejection' then raise; end if;
  end;
end $$;
reset role;
set role authenticated;
do $$ begin
  update public.profiles set role='usuario' where id=auth.uid();
  insert into public.profiles (id,role,rut) values (auth.uid(),'usuario','12345678-5') on conflict(id) do update set rut=excluded.rut;
  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'expected self-promotion rejection';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set inmobiliaria_id='44444444-4444-4444-8444-444444444444' where id=auth.uid();
    raise exception 'expected company reassignment rejection';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.profiles set role='ejecutivo' where id='11111111-1111-4111-8111-111111111111';
set role authenticated;
insert into public.profiles (id,role) values (auth.uid(),'ejecutivo') on conflict(id) do update set role=excluded.role;
reset role;
update public.profiles set role='usuario' where id='11111111-1111-4111-8111-111111111111';
update auth.identities set identity_data='{"email":"other@example.test"}';
set role supabase_auth_admin;
do $$ begin
  begin
    perform public.hu27_access_token_hook('{"user_id":"11111111-1111-4111-8111-111111111111","authentication_method":"oauth","claims":{}}');
    raise exception 'expected email mismatch rejection';
  exception when raise_exception then
    if sqlerrm = 'expected email mismatch rejection' then raise; end if;
  end;
end $$;
reset role;
