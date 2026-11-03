do $$ begin
  if exists (select 1 from pg_trigger where tgname='hu27_own_access_guard' and tgrelid='public.profiles'::regclass) then
    raise exception 'Duplicate guard still present';
  end if;
  if not exists (select 1 from pg_trigger where tgname='hu30_profile_privileges' and tgrelid='public.profiles'::regclass) then
    raise exception 'Shared guard missing';
  end if;
end $$;

-- Preserve the canonical pending-assignment exception that the duplicate guard blocked.
update public.profiles set role='ejecutivo', inmobiliaria_id=null where id=auth.uid();
insert into public.proyectos values ('55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666');
insert into public.proyecto_ejecutivos values ('55555555-5555-4555-8555-555555555555','user@example.test','pendiente');
set role authenticated;
update public.profiles set inmobiliaria_id='66666666-6666-4666-8666-666666666666' where id=auth.uid();
do $$ begin
  begin update public.profiles set role='admin' where id=auth.uid(); raise exception 'Promotion accepted'; exception when insufficient_privilege then null; end;
  begin update public.profiles set estado_acceso='desactivado' where id=auth.uid(); raise exception 'Access state write accepted'; exception when insufficient_privilege then null; end;
  begin update public.profiles set reliability_status='sospechoso' where id=auth.uid(); raise exception 'Reliability write accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.profiles set role='usuario',estado_acceso='desactivado' where id=auth.uid();
set role supabase_auth_admin;
do $$ declare method text; result jsonb; begin
  foreach method in array array['password','oauth','token_refresh'] loop
    result := public.hu27_access_token_hook(jsonb_build_object('user_id','11111111-1111-4111-8111-111111111111','authentication_method',method,'claims','{}'::jsonb));
    if result->'error'->>'http_code' is distinct from '403' then raise exception 'Disabled account accepted for %',method; end if;
  end loop;
end $$;
reset role;
update public.profiles set estado_acceso='activo' where id=auth.uid();
update auth.identities set identity_data='{"email":"user@example.test"}';
set role supabase_auth_admin;
do $$ declare result jsonb; begin
  result := public.hu27_access_token_hook('{"user_id":"11111111-1111-4111-8111-111111111111","authentication_method":"oauth","claims":{"role":"authenticated"}}');
  if result <> '{"claims":{"role":"authenticated"}}'::jsonb then raise exception 'Reactivated account rejected'; end if;
end $$;
reset role;
