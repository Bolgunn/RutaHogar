insert into auth.users values ('44444444-4444-4444-8444-444444444444', 'fixture-k@example.test');
insert into public.profiles (id,role,rut) values ('44444444-4444-4444-8444-444444444444','usuario','17493972-K');
set role supabase_auth_admin;
do $$
declare v_event jsonb; v_result jsonb;
begin
  v_event := '{"user":{"app_metadata":{"provider":"email"},"user_metadata":{"rut":"12.345.678-5"}}}';
  v_result := public.hu27_before_user_created(v_event);
  if (v_result->'error'->>'http_code')::integer is distinct from 400 then raise exception 'duplicate RUT accepted'; end if;
  v_result := public.hu27_before_user_created(jsonb_set(v_event, '{user,user_metadata,rut}', '"123456785"'));
  if not v_result ? 'error' then raise exception 'formatted duplicate accepted'; end if;
  v_result := public.hu27_before_user_created(jsonb_set(v_event, '{user,user_metadata,rut}', '"17.493.972-k"'));
  if not v_result ? 'error' then raise exception 'lowercase check digit duplicate accepted'; end if;
  v_result := public.hu27_before_user_created(jsonb_set(v_event, '{user,user_metadata,rut}', '"9.876.543-3"'));
  if v_result <> '{}'::jsonb then raise exception 'new RUT rejected'; end if;
  v_result := public.hu27_before_user_created(jsonb_set(v_event, '{user,app_metadata,provider}', '"google"'));
  if v_result <> '{}'::jsonb then raise exception 'Google flow changed'; end if;
  v_result := public.hu27_before_user_created('{"user":{"app_metadata":{"provider":"email"},"user_metadata":{}}}');
  if v_result <> '{}'::jsonb then raise exception 'staff invitation without RUT rejected'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('authenticated', 'public.hu27_before_user_created(jsonb)', 'execute')
    or has_function_privilege('anon', 'public.hu27_before_user_created(jsonb)', 'execute') then
    raise exception 'hook exposed to browser';
  end if;
end $$;
