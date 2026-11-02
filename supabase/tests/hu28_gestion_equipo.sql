-- Run with ON_ERROR_STOP as a superuser named postgres against a disposable database (schema.sql
-- and the migrations applied, or a `supabase start` stack with postgres promoted); leaves no
-- fixture rows. Regression test for 20261102120000_hu28_gestion_equipo. Anonymous calls and the
-- last-admin race are in hu28_team_stack.mjs: they need PostgREST and two connections.
begin;

-- The fixtures write their own profiles; the production sign-up trigger would write them first.
drop trigger if exists on_auth_user_created on auth.users;

-- Hosted Supabase grants table privileges to authenticated and lets RLS decide.
grant select, insert, update on public.profiles to authenticated;
grant select on public.proyecto_ejecutivos, public.proyectos to authenticated;
grant delete on public.proyectos to authenticated;

insert into public.inmobiliarias(id, nombre) values
  ('a2800000-0000-0000-0000-00000000000a', 'HU28 A'),
  ('a2800000-0000-0000-0000-00000000000b', 'HU28 B');

insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf) values
  ('b2800000-0000-0000-0000-000000000001', 'a2800000-0000-0000-0000-00000000000a', 'HU28 Uno', 'Ñuñoa', 'departamento', 3000, 5000),
  ('b2800000-0000-0000-0000-000000000002', 'a2800000-0000-0000-0000-00000000000a', 'HU28 Dos', 'Maipú', 'departamento', 2000, 3000),
  ('b2800000-0000-0000-0000-000000000003', 'a2800000-0000-0000-0000-00000000000a', 'HU28 Tres', 'Macul', 'departamento', 2000, 3000),
  ('b2800000-0000-0000-0000-000000000004', 'a2800000-0000-0000-0000-00000000000b', 'HU28 Otro', 'Macul', 'departamento', 2000, 3000);

insert into auth.users(id, email) values
  ('c2800000-0000-0000-0000-000000000001', 'hu28-admin@example.invalid'),
  ('c2800000-0000-0000-0000-000000000002', 'hu28-admin2@example.invalid'),
  ('c2800000-0000-0000-0000-000000000003', 'hu28-exec@example.invalid'),
  ('c2800000-0000-0000-0000-000000000004', 'hu28-exec2@example.invalid'),
  ('c2800000-0000-0000-0000-000000000005', 'hu28-other-admin@example.invalid'),
  ('c2800000-0000-0000-0000-000000000006', 'hu28-other-exec@example.invalid'),
  ('c2800000-0000-0000-0000-000000000007', 'hu28-lead@example.invalid'),
  ('c2800000-0000-0000-0000-000000000008', 'hu28-global@example.invalid'),
  ('c2800000-0000-0000-0000-000000000009', 'hu28-loose@example.invalid');

insert into public.profiles(id, full_name, role, inmobiliaria_id) values
  ('c2800000-0000-0000-0000-000000000001', 'Admin Uno', 'admin_inmobiliario', 'a2800000-0000-0000-0000-00000000000a'),
  ('c2800000-0000-0000-0000-000000000002', 'Admin Dos', 'admin', 'a2800000-0000-0000-0000-00000000000a'),
  ('c2800000-0000-0000-0000-000000000003', 'Exec Uno', 'ejecutivo', 'a2800000-0000-0000-0000-00000000000a'),
  ('c2800000-0000-0000-0000-000000000004', 'Exec Dos', 'ejecutivo', 'a2800000-0000-0000-0000-00000000000a'),
  ('c2800000-0000-0000-0000-000000000005', 'Otro Admin', 'admin_inmobiliario', 'a2800000-0000-0000-0000-00000000000b'),
  ('c2800000-0000-0000-0000-000000000006', 'Otro Exec', 'ejecutivo', 'a2800000-0000-0000-0000-00000000000b'),
  ('c2800000-0000-0000-0000-000000000007', 'Lead', 'usuario', null),
  ('c2800000-0000-0000-0000-000000000008', 'Global', 'admin', null),
  ('c2800000-0000-0000-0000-000000000009', 'Suelto', 'ejecutivo', null);

insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, source, estado) values
  ('b2800000-0000-0000-0000-000000000001', 'c2800000-0000-0000-0000-000000000003', 'hu28-exec@example.invalid', 'manual', 'vinculado'),
  ('b2800000-0000-0000-0000-000000000002', 'c2800000-0000-0000-0000-000000000003', 'hu28-exec@example.invalid', 'manual', 'vinculado');

create temp table hu28_ids (id uuid, etiqueta text) on commit drop;
grant select on hu28_ids to authenticated;
create function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected % from: %', p_message, p_sql using errcode = 'P0002';
exception
  when sqlstate 'P0002' then raise;
  when others then
    if position(p_message in sqlerrm) = 0 then
      raise exception 'expected %, got %, from: %', p_message, sqlerrm, p_sql;
    end if;
end;
$$;

-- Schema: closed values, browser denied, insert-only.
do $$
begin
  assert (select estado_acceso from public.profiles where id = 'c2800000-0000-0000-0000-000000000003') = 'activo';
  perform pg_temp.expect_error(
    $q$update public.profiles set estado_acceso = 'x' where id = 'c2800000-0000-0000-0000-000000000003'$q$,
    'profiles_estado_acceso_check');
  assert not has_table_privilege('authenticated', 'public.audit_events', 'select'), 'browser reads audit_events';
  assert not has_table_privilege('anon', 'public.audit_events', 'select'), 'anon reads audit_events';
  assert not has_table_privilege('service_role', 'public.audit_events', 'update'), 'service updates audit_events';
  assert (select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'RLS off on audit_events';
  assert not exists (select 1 from pg_policy where polrelid = 'public.audit_events'::regclass), 'audit_events has a policy';
  declare fn text; begin
    foreach fn in array array[
      'public.hu28_log_event(uuid,uuid,text,uuid,text,jsonb,jsonb,jsonb,text)',
      'public.hu28_list_team(uuid)',
      'public.hu28_set_member_role(uuid,uuid,text,uuid,text)',
      'public.hu28_set_member_access(uuid,uuid,text,uuid,text)',
      'public.hu28_update_member(uuid,uuid,text,text,uuid,text)',
      'public.hu28_lock_member(uuid,uuid)',
      'public.hu28_is_last_active_admin(uuid,uuid)'
    ] loop
      assert not has_function_privilege('authenticated', fn, 'execute'), fn || ' open to authenticated';
      assert not has_function_privilege('anon', fn, 'execute'), fn || ' open to anon';
    end loop;
  end;
  perform public.hu28_log_event('a2800000-0000-0000-0000-00000000000a', null, null, null, 'equipo.datos_actualizados');
  perform pg_temp.expect_error($q$update public.audit_events set reason = 'x'$q$, 'audit_events_insert_only');
  perform pg_temp.expect_error($q$delete from public.audit_events$q$, 'audit_events_insert_only');
  perform pg_temp.expect_error($q$truncate public.audit_events$q$, 'audit_events_insert_only');
  perform pg_temp.expect_error(
    $q$insert into public.audit_events(actor_role, event_type) values ('sistema', 'equipo.inventado')$q$,
    'audit_events_event_type_check');
end $$;

-- A browser never changes estado_acceso, not even an admin on someone else.
do $$
begin
  perform set_config('request.jwt.claim.sub', 'c2800000-0000-0000-0000-000000000003', true);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.expect_error(
    $q$update public.profiles set estado_acceso = 'desactivado' where id = auth.uid()$q$,
    'profile_privilege_change_forbidden');
  perform set_config('request.jwt.claim.sub', 'c2800000-0000-0000-0000-000000000008', true);
  update public.profiles set estado_acceso = 'desactivado' where id = 'c2800000-0000-0000-0000-000000000003';
  assert not found, 'a browser reached another profile';
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Policies. Nobody reads another tenant or a lead through the table, except a global admin.
do $$
declare
  v_seen uuid[];
begin
  perform set_config('role', 'authenticated', true);

  perform set_config('request.jwt.claim.sub', 'c2800000-0000-0000-0000-000000000003', true);
  v_seen := array(select id from public.profiles order by id);
  assert v_seen = array['c2800000-0000-0000-0000-000000000003']::uuid[], 'exec: ' || v_seen::text;
  v_seen := array(select id from public.list_staff_names(array[
    'c2800000-0000-0000-0000-000000000001', 'c2800000-0000-0000-0000-000000000006',
    'c2800000-0000-0000-0000-000000000007']::uuid[]));
  assert v_seen = array['c2800000-0000-0000-0000-000000000001']::uuid[], 'names cross a team: ' || v_seen::text;

  perform set_config('request.jwt.claim.sub', 'c2800000-0000-0000-0000-000000000001', true);
  v_seen := array(select id from public.profiles order by id);
  assert v_seen = array['c2800000-0000-0000-0000-000000000001']::uuid[], 'admin: ' || v_seen::text;
  update public.profiles set full_name = 'x' where id = 'c2800000-0000-0000-0000-000000000003';
  assert not found, 'tenant admin updated a colleague through the table';

  perform set_config('request.jwt.claim.sub', 'c2800000-0000-0000-0000-000000000007', true);
  assert (select count(*) from public.profiles) = 1, 'lead reads other profiles';

  perform set_config('request.jwt.claim.sub', 'c2800000-0000-0000-0000-000000000008', true);
  assert (select count(*) from public.profiles where id in (
    'c2800000-0000-0000-0000-000000000003', 'c2800000-0000-0000-0000-000000000006', 'c2800000-0000-0000-0000-000000000007'
  )) = 3, 'global admin lost read';
  update public.profiles set full_name = 'x' where id = 'c2800000-0000-0000-0000-000000000003';
  assert not found, 'global admin updated through the table';

  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Team limits, for any actor.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  b uuid := 'a2800000-0000-0000-0000-00000000000b';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  admin2 uuid := 'c2800000-0000-0000-0000-000000000002';
  exec1 uuid := 'c2800000-0000-0000-0000-000000000003';
  other_admin uuid := 'c2800000-0000-0000-0000-000000000005';
  global_admin uuid := 'c2800000-0000-0000-0000-000000000008';
begin
  perform pg_temp.expect_error(format('select public.hu28_set_member_role(%L, %L, %L, %L, %L)', a, admin1, 'ejecutivo', admin1, 'admin_inmobiliario'), 'self_change_forbidden');
  perform pg_temp.expect_error(format('select public.hu28_set_member_access(%L, %L, %L, %L, %L)', a, admin1, 'desactivado', admin1, 'admin_inmobiliario'), 'self_change_forbidden');
  perform pg_temp.expect_error(format('select public.hu28_set_member_role(%L, %L, %L, %L, %L)', a, exec1, 'admin', admin1, 'admin_inmobiliario'), 'invalid_role');
  perform pg_temp.expect_error(format('select public.hu28_set_member_role(%L, %L, %L, %L, %L)', b, exec1, 'admin_inmobiliario', other_admin, 'admin_inmobiliario'), 'not_found');
  perform pg_temp.expect_error(format('select public.hu28_set_member_access(%L, %L, %L, %L, %L)', b, exec1, 'desactivado', other_admin, 'admin_inmobiliario'), 'not_found');
  perform pg_temp.expect_error(format('select public.hu28_update_member(%L, %L, %L, %L, %L, %L)', b, exec1, 'x', null, other_admin, 'admin_inmobiliario'), 'not_found');

  -- Tenant admin counts as an admin: demoting one of two is allowed, then the other is the last.
  assert (public.hu28_set_member_role(a, admin2, 'ejecutivo', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert (select role from public.profiles where id = admin2) = 'ejecutivo';
  perform pg_temp.expect_error(format('select public.hu28_set_member_role(%L, %L, %L, %L, %L)', a, admin1, 'ejecutivo', global_admin, 'admin'), 'last_active_admin');
  perform pg_temp.expect_error(format('select public.hu28_set_member_access(%L, %L, %L, %L, %L)', a, admin1, 'desactivado', global_admin, 'admin'), 'last_active_admin');
  assert (public.hu28_set_member_role(a, admin2, 'admin_inmobiliario', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert exists (select 1 from public.audit_events where subject_user_id = admin2 and event_type = 'equipo.rol_cambiado'
    and before ->> 'rol' = 'ejecutivo' and after ->> 'rol' = 'admin_inmobiliario' and actor_id = admin1), 'role change not logged';
  -- An admin with a tenant is already its admin: asking for the other label changes nothing.
  update public.profiles set role = 'admin' where id = admin2;
  assert not (public.hu28_set_member_role(a, admin2, 'admin_inmobiliario', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert (select role from public.profiles where id = admin2) = 'admin';
end $$;

-- Deactivation: access, assignments, audit; reactivation restores access only.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  exec1 uuid := 'c2800000-0000-0000-0000-000000000003';
  v_result jsonb;
begin
  v_result := public.hu28_set_member_access(a, exec1, 'desactivado', admin1, 'admin_inmobiliario');
  assert jsonb_array_length(v_result -> 'proyectos') = 2, v_result::text;
  assert not exists (select 1 from public.proyecto_ejecutivos where ejecutivo_id = exec1), 'assignments kept';
  assert (select count(*) from public.audit_events where subject_user_id = exec1
    and event_type = 'equipo.proyecto_retirado' and actor_id = admin1
    and details ->> 'por_desactivacion' = 'true' and details ->> 'origen' = 'equipo') = 2, 'project removals not logged';
  assert exists (select 1 from public.audit_events where subject_user_id = exec1 and event_type = 'equipo.acceso_desactivado'
    and jsonb_array_length(details -> 'proyectos') = 2), 'deactivation not logged';

  -- Idempotent, so a failed ban can be retried without a second entry.
  assert not (public.hu28_set_member_access(a, exec1, 'desactivado', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert (select count(*) from public.audit_events where subject_user_id = exec1 and event_type = 'equipo.acceso_desactivado') = 1;

  perform pg_temp.expect_error(format('select public.hu28_set_member_role(%L, %L, %L, %L, %L)', a, exec1, 'admin_inmobiliario', admin1, 'admin_inmobiliario'), 'member_deactivated');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', exec1::text, true);
  assert public.get_my_role() is null, 'deactivated keeps a role';
  assert (select count(*) from public.profiles) = 1, 'deactivated reads the team';
  assert public.is_global_admin() is false;
  assert public.can_admin_inmobiliaria(a) is false;
  perform set_config('request.jwt.claim.sub', admin1::text, true);
  perform pg_temp.expect_error(
    $q$select public.assign_executive('b2800000-0000-0000-0000-000000000001', 'hu28-exec@example.invalid')$q$,
    'desactivada');
  assert not exists (select 1 from public.list_inmobiliaria_executives() where id = exec1), 'deactivated in the roster';
  assert exists (select 1 from public.list_inmobiliaria_executives() where id = 'c2800000-0000-0000-0000-000000000004'), 'admin_inmobiliario has an empty roster';
  assert not exists (select 1 from public.list_inmobiliaria_executives() where id = 'c2800000-0000-0000-0000-000000000006'), 'roster crosses tenants';
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);

  assert (public.hu28_set_member_access(a, exec1, 'activo', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert not exists (select 1 from public.proyecto_ejecutivos where ejecutivo_id = exec1), 'reactivation restored projects';
  assert exists (select 1 from public.audit_events where subject_user_id = exec1 and event_type = 'equipo.acceso_reactivado');
  assert exists (select 1 from public.audit_events where subject_user_id = exec1 and event_type = 'equipo.acceso_desactivado'), 'history lost on reactivation';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', exec1::text, true);
  assert public.get_my_role() = 'ejecutivo', 'reactivated has no role';
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Organizational data: the entry names the fields, never the values.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  exec2 uuid := 'c2800000-0000-0000-0000-000000000004';
begin
  assert (public.hu28_update_member(a, exec2, 'Exec Nuevo', '+56 9 1111', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert not (public.hu28_update_member(a, exec2, 'Exec Nuevo', '+56 9 1111', admin1, 'admin_inmobiliario') ->> 'cambio')::boolean;
  assert (select full_name from public.profiles where id = exec2) = 'Exec Nuevo';
  assert (select count(*) from public.audit_events where subject_user_id = exec2 and event_type = 'equipo.datos_actualizados') = 1;
  assert (select details from public.audit_events where subject_user_id = exec2 and event_type = 'equipo.datos_actualizados')
    = '{"campos": ["nombre", "telefono"]}'::jsonb;
end $$;

-- Assignments from the catalog and the team page, and a project deletion.
do $$
declare
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  admin2 uuid := 'c2800000-0000-0000-0000-000000000002';
  exec2 uuid := 'c2800000-0000-0000-0000-000000000004';
  uno uuid := 'b2800000-0000-0000-0000-000000000001';
  tres uuid := 'b2800000-0000-0000-0000-000000000003';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', admin1::text, true);
  perform public.assign_executive(uno, 'hu28-exec2@example.invalid');
  perform public.assign_executive(tres, 'hu28-exec2@example.invalid', 'equipo');
  perform public.assign_executive(tres, 'hu28-exec2@example.invalid', 'equipo');
  perform public.assign_executive(tres, 'hu28-admin@example.invalid', 'equipo');
  perform set_config('hu28.origen', '', true);
  perform public.unassign_executive(uno, 'hu28-exec2@example.invalid');
  perform public.assign_executive(uno, 'hu28-exec2@example.invalid');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);

  assert (select estado from public.proyecto_ejecutivos where proyecto_id = tres and ejecutivo_email = 'hu28-admin@example.invalid') = 'vinculado',
    'a team admin stayed pending';
  assert (select count(*) from public.audit_events where subject_user_id = exec2 and event_type = 'equipo.proyecto_asignado') = 3,
    'assignments logged wrong, a repeat must not count';
  assert exists (select 1 from public.audit_events where subject_user_id = exec2 and event_type = 'equipo.proyecto_asignado'
    and actor_id = admin1 and actor_role = 'admin_inmobiliario' and source = 'web'
    and inmobiliaria_id = 'a2800000-0000-0000-0000-00000000000a' and details ->> 'origen' = 'proyectos'
    and details ->> 'proyecto' = 'HU28 Uno'), 'catalog assignment not logged';
  assert exists (select 1 from public.audit_events where subject_user_id = exec2 and event_type = 'equipo.proyecto_asignado'
    and details ->> 'origen' = 'equipo' and details ->> 'proyecto' = 'HU28 Tres'), 'team assignment origin lost';
  assert exists (select 1 from public.audit_events where subject_user_id = exec2 and event_type = 'equipo.proyecto_retirado'
    and actor_id = admin1 and details ->> 'origen' = 'proyectos'), 'unassignment not logged';

  -- schema.sql's "Proyectos select tenant" still omits admin_inmobiliario, so a tenant admin deletes.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', admin2::text, true);
  delete from public.proyectos where id = tres;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  assert (select count(*) from public.audit_events where event_type = 'equipo.proyecto_retirado'
    and entity_id = tres and details ->> 'por_eliminacion' = 'true') = 2, 'project deletion not logged once per assignment';
  assert (select count(*) from public.audit_events where event_type = 'equipo.proyecto_retirado' and entity_id = tres) = 2,
    'cascade wrote a second entry';
  assert exists (select 1 from public.audit_events where entity_id = tres and actor_id = admin2
    and event_type = 'equipo.proyecto_retirado' and inmobiliaria_id = 'a2800000-0000-0000-0000-00000000000a' and details ->> 'proyecto' = 'HU28 Tres'), 'deletion lost its actor, tenant or name';
end $$;

-- The list derives the failed email from the latest invitation event.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  exec2 uuid := 'c2800000-0000-0000-0000-000000000004';
  v_team jsonb;
  v_member jsonb;
begin
  perform public.hu28_log_event(a, admin1, 'admin_inmobiliario', exec2, 'equipo.invitacion_creada');
  v_team := public.hu28_list_team(a);
  select m into v_member from jsonb_array_elements(v_team -> 'miembros') m where m ->> 'id' = exec2::text;
  assert (v_member ->> 'correo_fallido')::boolean, 'a send with no recorded result looks sent';
  perform public.hu28_log_event(a, admin1, 'admin_inmobiliario', exec2, 'equipo.invitacion_fallida');
  v_team := public.hu28_list_team(a);
  select m into v_member from jsonb_array_elements(v_team -> 'miembros') m where m ->> 'id' = exec2::text;
  assert (v_member ->> 'correo_fallido')::boolean, 'failed email not shown';
  assert v_member ->> 'email' = 'hu28-exec2@example.invalid';
  assert jsonb_array_length(v_member -> 'proyectos') = 1, v_member::text;
  assert jsonb_array_length(v_team -> 'miembros') = 4, 'team crosses tenants or misses staff';
  assert jsonb_array_length(v_team -> 'proyectos') = 2, v_team -> 'proyectos';

  perform pg_sleep(0.01);
  perform public.hu28_log_event(a, admin1, 'admin_inmobiliario', exec2, 'equipo.invitacion_reenviada');
  v_team := public.hu28_list_team(a);
  select m into v_member from jsonb_array_elements(v_team -> 'miembros') m where m ->> 'id' = exec2::text;
  assert not (v_member ->> 'correo_fallido')::boolean, 'a successful resend must clear it';
end $$;

-- The global admin's catalog path stays inside the same limits and leaves a trail.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  b uuid := 'a2800000-0000-0000-0000-00000000000b';
  global_admin uuid := 'c2800000-0000-0000-0000-000000000008';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', global_admin::text, true);
  perform pg_temp.expect_error(format('select public.assign_admin(%L, %L)', a, 'hu28-other-admin@example.invalid'), 'único administrador');
  perform public.assign_admin(b, 'hu28-other-exec@example.invalid');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  assert exists (select 1 from public.audit_events where subject_user_id = 'c2800000-0000-0000-0000-000000000006'
    and event_type = 'equipo.rol_cambiado' and actor_id = global_admin and after ->> 'rol' = 'admin_inmobiliario'), 'assign_admin not logged';
end $$;

-- A pending assignment never links an account outside the team.
do $$
declare
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  uno uuid := 'b2800000-0000-0000-0000-000000000001';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', admin1::text, true);
  perform public.assign_executive(uno, 'hu28-lead@example.invalid');
  perform public.assign_executive(uno, 'hu28-other-admin@example.invalid');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  assert (select count(*) from public.audit_events where entity_id = uno and event_type = 'equipo.proyecto_asignado'
    and subject_user_id is null and details ->> 'email' in ('hu28-lead@example.invalid', 'hu28-other-admin@example.invalid')) = 2,
    'a pending assignment linked someone outside the team';
end $$;

-- Only saving a password ends an invitation. A sign-in date does not, and a browser cannot clear it.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  exec2 uuid := 'c2800000-0000-0000-0000-000000000004';
  v_member jsonb;
begin
  update public.profiles set password_pendiente = true where id = exec2;
  update auth.users set last_sign_in_at = now() where id = exec2;
  select m into v_member from jsonb_array_elements(public.hu28_list_team(a) -> 'miembros') m where m ->> 'id' = exec2::text;
  assert (v_member ->> 'password_pendiente')::boolean, 'a sign-in date ended the invitation';
  assert v_member ->> 'ultimo_ingreso' is null, 'an opened link shows as a sign-in';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', exec2::text, true);
  perform pg_temp.expect_error(
    $q$update public.profiles set password_pendiente = false where id = auth.uid()$q$,
    'profile_privilege_change_forbidden');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);

  update auth.users set encrypted_password = 'nueva' where id = exec2;
  assert not (select password_pendiente from public.profiles where id = exec2), 'saving a password did not end the invitation';
end $$;

-- An admin who never finished signing up is not an active admin.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  admin2 uuid := 'c2800000-0000-0000-0000-000000000002';
  global_admin uuid := 'c2800000-0000-0000-0000-000000000008';
begin
  assert not public.hu28_is_last_active_admin(a, admin1);
  update public.profiles set password_pendiente = true where id = admin2;
  assert public.hu28_is_last_active_admin(a, admin1), 'an unfinished admin counted';
  perform pg_temp.expect_error(format('select public.hu28_set_member_access(%L, %L, %L, %L, %L)', a, admin1, 'desactivado', global_admin, 'admin'), 'last_active_admin');
  update public.profiles set password_pendiente = false where id = admin2;
end $$;

-- A name edit does not leave the old name in the split fields; a phone edit keeps them.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  exec2 uuid := 'c2800000-0000-0000-0000-000000000004';
begin
  update public.profiles set nombre = 'Exec', apellido_paterno = 'Viejo', apellido_materno = 'Antiguo' where id = exec2;
  perform public.hu28_update_member(a, exec2, 'Exec Nuevo', '+56 9 2222', admin1, 'admin_inmobiliario');
  assert (select nombre from public.profiles where id = exec2) = 'Exec', 'a phone edit touched the split fields';
  perform public.hu28_update_member(a, exec2, 'Otra Persona', '+56 9 2222', admin1, 'admin_inmobiliario');
  assert (select nombre is null and apellido_paterno is null and apellido_materno is null from public.profiles where id = exec2),
    'the split fields kept the old name';
end $$;

-- Every entry into a team leaves a record, and a pending assignment is not counted twice.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  loose uuid := 'c2800000-0000-0000-0000-000000000009';
  pending uuid := 'c280000a-0000-0000-0000-00000000000a';
  uno uuid := 'b2800000-0000-0000-0000-000000000001';
  dos uuid := 'b2800000-0000-0000-0000-000000000002';
begin
  insert into auth.users(id, email) values (pending, 'hu28-pending@example.invalid');
  insert into public.profiles(id, full_name, role, inmobiliaria_id) values (pending, 'Pendiente', 'ejecutivo', null);
  insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
    values (dos, null, 'hu28-pending@example.invalid', 'manual', 'pendiente');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', admin1::text, true);
  perform public.assign_executive(uno, 'hu28-loose@example.invalid', 'equipo');
  perform set_config('request.jwt.claim.sub', pending::text, true);
  perform public.resolve_pending_executives();
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);

  assert (select inmobiliaria_id from public.profiles where id = loose) = a;
  assert exists (select 1 from public.audit_events where subject_user_id = loose and event_type = 'equipo.miembro_vinculado'
    and actor_id = admin1 and inmobiliaria_id = a), 'assign_executive joined a team silently';
  assert exists (select 1 from public.audit_events where subject_user_id = pending and event_type = 'equipo.miembro_vinculado'
    and actor_id = pending and inmobiliaria_id = a), 'resolve_pending_executives joined a team silently';
  assert (select count(*) from public.audit_events where subject_user_id = pending and event_type = 'equipo.proyecto_asignado'
    and details ->> 'por_vinculacion' = 'true' and entity_id = dos) = 1, 'the link to the pending assignment is missing';
  assert (select count(*) from public.audit_events where event_type = 'equipo.proyecto_asignado' and entity_id = dos
    and details ->> 'email' = 'hu28-pending@example.invalid' and details ->> 'por_vinculacion' is null) = 1,
    'the team history would count this assignment twice';
end $$;

-- A link and its record commit together, and only for an executive with no team.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  b uuid := 'a2800000-0000-0000-0000-00000000000b';
  admin1 uuid := 'c2800000-0000-0000-0000-000000000001';
  free uuid := 'c280000b-0000-0000-0000-00000000000b';
begin
  insert into auth.users(id, email) values (free, 'hu28-free@example.invalid');
  insert into public.profiles(id, full_name, role, inmobiliaria_id) values (free, 'Libre', 'ejecutivo', null);
  perform public.hu28_link_executive(a, free, admin1, 'admin_inmobiliario');
  assert (select inmobiliaria_id from public.profiles where id = free) = a;
  assert (select count(*) from public.audit_events where subject_user_id = free and event_type = 'equipo.miembro_vinculado') = 1;
  perform pg_temp.expect_error(format('select public.hu28_link_executive(%L, %L, %L, %L)', b, free, admin1, 'admin_inmobiliario'), 'not_found');
  perform pg_temp.expect_error(format('select public.hu28_link_executive(%L, %L, %L, %L)', a, 'c2800000-0000-0000-0000-000000000007', admin1, 'admin_inmobiliario'), 'not_found');
end $$;

-- assign_admin never reaches the caller, a global admin or an admin of that same inmobiliaria.
-- A move leaves the old team's projects behind and a record in the old team.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  b uuid := 'a2800000-0000-0000-0000-00000000000b';
  admin2 uuid := 'c2800000-0000-0000-0000-000000000002';
  global_admin uuid := 'c2800000-0000-0000-0000-000000000008';
  mover uuid := 'c280000c-0000-0000-0000-00000000000c';
  other_global uuid := 'c280000d-0000-0000-0000-00000000000d';
  uno uuid := 'b2800000-0000-0000-0000-000000000001';
begin
  insert into auth.users(id, email) values (mover, 'hu28-mover@example.invalid'), (other_global, 'hu28-global2@example.invalid');
  insert into public.profiles(id, full_name, role, inmobiliaria_id) values
    (mover, 'Se Muda', 'ejecutivo', a), (other_global, 'Global Dos', 'admin', null);
  insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, source, estado)
    values (uno, mover, 'hu28-mover@example.invalid', 'manual', 'vinculado');

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', global_admin::text, true);
  perform pg_temp.expect_error(format('select public.assign_admin(%L, %L)', a, 'hu28-global@example.invalid'), 'propia función');
  perform pg_temp.expect_error(format('select public.assign_admin(%L, %L)', a, 'hu28-global2@example.invalid'), 'administrador global');
  perform public.assign_admin(a, 'hu28-admin2@example.invalid');
  perform public.assign_admin(b, 'hu28-mover@example.invalid');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);

  assert (select role from public.profiles where id = admin2) = 'admin', 'a tenant admin was rewritten';
  assert not exists (select 1 from public.audit_events where subject_user_id = admin2 and event_type = 'equipo.rol_cambiado' and actor_id = global_admin),
    'a no-op left an entry';
  assert (select inmobiliaria_id from public.profiles where id = mover) = b;
  assert not exists (select 1 from public.proyecto_ejecutivos where ejecutivo_id = mover), 'old assignments stayed';
  assert exists (select 1 from public.audit_events where subject_user_id = mover and event_type = 'equipo.proyecto_retirado'
    and inmobiliaria_id = a and actor_id = global_admin), 'the removal has no entry in the old team';
  assert exists (select 1 from public.audit_events where subject_user_id = mover and event_type = 'equipo.rol_cambiado'
    and inmobiliaria_id = a and details ->> 'traslado' = 'true'), 'the old team has no record of the move';
  assert exists (select 1 from public.audit_events where subject_user_id = mover and event_type = 'equipo.rol_cambiado'
    and inmobiliaria_id = b and details ->> 'traslado' is null), 'the new team has no record of the move';
end $$;

-- The list reports the ban, and assign_admin leaves a buyer's account alone.
do $$
declare
  a uuid := 'a2800000-0000-0000-0000-00000000000a';
  exec2 uuid := 'c2800000-0000-0000-0000-000000000004';
  lead uuid := 'c2800000-0000-0000-0000-000000000007';
  global_admin uuid := 'c2800000-0000-0000-0000-000000000008';
  v_member jsonb;
begin
  update auth.users set banned_until = now() + interval '1 day' where id = exec2;
  select m into v_member from jsonb_array_elements(public.hu28_list_team(a) -> 'miembros') m where m ->> 'id' = exec2::text;
  assert (v_member ->> 'baneado')::boolean, 'ban not reported';
  update auth.users set banned_until = now() - interval '1 day' where id = exec2;
  select m into v_member from jsonb_array_elements(public.hu28_list_team(a) -> 'miembros') m where m ->> 'id' = exec2::text;
  assert not (v_member ->> 'baneado')::boolean, 'an expired ban is not a ban';

  insert into public.evaluations(user_id, score, classification) values (lead, 60, 'Medio');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', global_admin::text, true);
  perform pg_temp.expect_error(format('select public.assign_admin(%L, %L)', a, 'hu28-lead@example.invalid'), 'comprador');
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  assert (select role from public.profiles where id = lead) = 'usuario';
end $$;

rollback;
