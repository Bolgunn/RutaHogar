-- Run with ON_ERROR_STOP as a superuser named postgres against a disposable database
-- (hu13_bootstrap.sql, schema.sql and the migrations applied); leaves no fixture rows.
-- Regression test for 20261031120000_profiles_privilege_guard_fix: a browser role cannot change
-- its own role or tenant, while sign-in, onboarding, executive creation and admin assignment
-- keep working. supabase-js upserts reach Postgres as INSERT ... ON CONFLICT DO UPDATE, and
-- GoTrue inserts into auth.users as supabase_auth_admin; both are reproduced literally below.
begin;

create role supabase_auth_admin;
alter table auth.users add column raw_user_meta_data jsonb;
grant usage on schema auth to supabase_auth_admin;
grant select, insert on auth.users to supabase_auth_admin;

-- Hosted Supabase grants table privileges to authenticated and lets RLS decide.
grant select, insert, update on public.profiles to authenticated;

insert into public.inmobiliarias(id, nombre) values
  ('a3000000-0000-0000-0000-000000000001', 'PG Inmobiliaria A'),
  ('a3000000-0000-0000-0000-000000000002', 'PG Inmobiliaria B');
insert into public.proyectos(id, inmobiliaria_id, nombre, comuna, tipo, precio_min_uf, precio_max_uf) values
  ('b3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'PG Proyecto A', 'Ñuñoa', 'departamento', 3000, 5000);
insert into auth.users(id, email) values
  ('c3000000-0000-0000-0000-000000000001', 'pg-lead@example.invalid'),
  ('c3000000-0000-0000-0000-000000000002', 'pg-lead-new@example.invalid'),
  ('c3000000-0000-0000-0000-000000000003', 'pg-exec@example.invalid'),
  ('c3000000-0000-0000-0000-000000000004', 'pg-exec-free@example.invalid'),
  ('c3000000-0000-0000-0000-000000000005', 'pg-exec-pending@example.invalid'),
  ('c3000000-0000-0000-0000-000000000006', 'pg-tenant-admin@example.invalid'),
  ('c3000000-0000-0000-0000-000000000007', 'pg-global-admin@example.invalid'),
  ('c3000000-0000-0000-0000-000000000008', 'pg-lead-to-admin@example.invalid'),
  ('c3000000-0000-0000-0000-000000000009', 'pg-lead-to-exec@example.invalid'),
  ('c3000000-0000-0000-0000-00000000000a', 'pg-legacy-tenant-admin@example.invalid');
insert into public.profiles(id, full_name, role, inmobiliaria_id) values
  ('c3000000-0000-0000-0000-000000000001', 'Lead', 'usuario', null),
  ('c3000000-0000-0000-0000-000000000003', 'Exec', 'ejecutivo', 'a3000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000004', 'Exec Free', 'ejecutivo', null),
  ('c3000000-0000-0000-0000-000000000005', 'Exec Pending', 'ejecutivo', null),
  ('c3000000-0000-0000-0000-000000000006', 'Tenant Admin', 'admin_inmobiliario', 'a3000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000007', 'Global Admin', 'admin', null),
  ('c3000000-0000-0000-0000-000000000008', 'Lead', 'usuario', null),
  ('c3000000-0000-0000-0000-000000000009', 'Lead', 'usuario', null),
  ('c3000000-0000-0000-0000-00000000000a', 'Legacy Tenant Admin', 'admin', 'a3000000-0000-0000-0000-000000000001');
insert into public.proyecto_ejecutivos(proyecto_id, ejecutivo_id, ejecutivo_email, source, estado) values
  ('b3000000-0000-0000-0000-000000000001', null, 'pg-exec-pending@example.invalid', 'manual', 'pendiente');

create function pg_temp.act_as(p_role text, p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  perform set_config('role', p_role, true);
end;
$$;

create function pg_temp.act_as_system() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

-- The statement must fail on the guard itself, not on RLS or a constraint.
create function pg_temp.expect_guard(p_label text, p_sql text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    if sqlerrm <> 'profile_privilege_change_forbidden' then
      raise exception '%: denied by something other than the guard: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception '%: the write was allowed', p_label;
end;
$$;

create function pg_temp.expect_profile(p_label text, p_id uuid, p_role text, p_tenant uuid) returns void language plpgsql as $$
declare v_role text; v_tenant uuid; v_found boolean;
begin
  select role, inmobiliaria_id, true into v_role, v_tenant, v_found from public.profiles where id = p_id;
  if v_found is not true or v_role is distinct from p_role or v_tenant is distinct from p_tenant then
    raise exception '%: expected %/%, got %/% (found: %)', p_label, p_role, p_tenant, v_role, v_tenant, v_found;
  end if;
end;
$$;

-- What supabase-js .upsert() sends for upsertProfile: the row without inmobiliaria_id.
create function pg_temp.upsert_own(p_id uuid, p_role text) returns void language plpgsql as $$
begin
  insert into public.profiles(id, full_name, role, onboarding_data, updated_at, created_at)
  values (p_id, 'Guardado', p_role, '{"paso": 1}'::jsonb, now(), now())
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    onboarding_data = excluded.onboarding_data,
    updated_at = excluded.updated_at,
    created_at = excluded.created_at;
end;
$$;

-- A lead cannot change its role or tenant, by any write shape.
do $$
declare lead uuid := 'c3000000-0000-0000-0000-000000000001';
begin
  perform pg_temp.act_as('authenticated', lead);
  perform pg_temp.expect_guard('update own role',
    format($q$update public.profiles set role = 'admin' where id = %L$q$, lead));
  perform pg_temp.expect_guard('update own role to tenant admin',
    format($q$update public.profiles set role = 'admin_inmobiliario' where id = %L$q$, lead));
  perform pg_temp.expect_guard('update own tenant',
    format($q$update public.profiles set inmobiliaria_id = 'a3000000-0000-0000-0000-000000000002' where id = %L$q$, lead));
  perform pg_temp.expect_guard('upsert own role',
    format($q$select pg_temp.upsert_own(%L, 'admin')$q$, lead));
  perform pg_temp.act_as_system();
  perform pg_temp.expect_profile('lead unchanged', lead, 'usuario', null);
end $$;

-- An account with no profile can only create usuario with no tenant.
do $$
declare fresh uuid := 'c3000000-0000-0000-0000-000000000002';
begin
  perform pg_temp.act_as('authenticated', fresh);
  perform pg_temp.expect_guard('insert as admin',
    format($q$insert into public.profiles(id, role) values (%L, 'admin')$q$, fresh));
  perform pg_temp.expect_guard('insert as ejecutivo',
    format($q$insert into public.profiles(id, role) values (%L, 'ejecutivo')$q$, fresh));
  perform pg_temp.expect_guard('insert with tenant',
    format($q$insert into public.profiles(id, role, inmobiliaria_id) values (%L, 'usuario', 'a3000000-0000-0000-0000-000000000001')$q$, fresh));
  perform pg_temp.expect_guard('insert with null role',
    format($q$insert into public.profiles(id, role) values (%L, null)$q$, fresh));
  perform pg_temp.expect_guard('upsert as admin',
    format($q$select pg_temp.upsert_own(%L, 'admin')$q$, fresh));
  -- ensureUserProfile on an account without a profile row.
  perform pg_temp.upsert_own(fresh, 'usuario');
  perform pg_temp.act_as_system();
  perform pg_temp.expect_profile('first profile', fresh, 'usuario', null);
end $$;

-- Sign-in and onboarding: same-value upserts and plain updates pass for every role.
do $$
declare
  lead uuid := 'c3000000-0000-0000-0000-000000000001';
  exec uuid := 'c3000000-0000-0000-0000-000000000003';
  tenant_admin uuid := 'c3000000-0000-0000-0000-000000000006';
  global_admin uuid := 'c3000000-0000-0000-0000-000000000007';
  tenant uuid := 'a3000000-0000-0000-0000-000000000001';
begin
  perform pg_temp.act_as('authenticated', lead);
  perform pg_temp.upsert_own(lead, 'usuario');
  update public.profiles set onboarding_data = '{"paso": 2}'::jsonb where id = lead;
  perform pg_temp.act_as('authenticated', exec);
  perform pg_temp.upsert_own(exec, 'ejecutivo');
  perform pg_temp.act_as('authenticated', tenant_admin);
  perform pg_temp.upsert_own(tenant_admin, 'admin_inmobiliario');
  perform pg_temp.act_as('authenticated', global_admin);
  perform pg_temp.upsert_own(global_admin, 'admin');
  perform pg_temp.act_as_system();
  perform pg_temp.expect_profile('lead upsert', lead, 'usuario', null);
  perform pg_temp.expect_profile('exec upsert keeps tenant', exec, 'ejecutivo', tenant);
  perform pg_temp.expect_profile('tenant admin upsert keeps tenant', tenant_admin, 'admin_inmobiliario', tenant);
  perform pg_temp.expect_profile('global admin upsert', global_admin, 'admin', null);
  if (select onboarding_data ->> 'paso' from public.profiles where id = lead) <> '2' then
    raise exception 'onboarding update was lost';
  end if;
end $$;

-- Staff cannot use their own session to climb or move either.
do $$
declare
  exec uuid := 'c3000000-0000-0000-0000-000000000003';
  exec_free uuid := 'c3000000-0000-0000-0000-000000000004';
  tenant_admin uuid := 'c3000000-0000-0000-0000-000000000006';
  global_admin uuid := 'c3000000-0000-0000-0000-000000000007';
  lead uuid := 'c3000000-0000-0000-0000-000000000001';
begin
  perform pg_temp.act_as('authenticated', exec);
  perform pg_temp.expect_guard('exec to admin',
    format($q$select pg_temp.upsert_own(%L, 'admin')$q$, exec));
  perform pg_temp.expect_guard('exec changes tenant',
    format($q$update public.profiles set inmobiliaria_id = 'a3000000-0000-0000-0000-000000000002' where id = %L$q$, exec));
  perform pg_temp.act_as('authenticated', exec_free);
  perform pg_temp.expect_guard('tenantless exec claims a tenant with no pending assignment',
    format($q$update public.profiles set inmobiliaria_id = 'a3000000-0000-0000-0000-000000000002' where id = %L$q$, exec_free));
  perform pg_temp.act_as('authenticated', tenant_admin);
  perform pg_temp.expect_guard('tenant admin to global admin',
    format($q$update public.profiles set role = 'admin', inmobiliaria_id = null where id = %L$q$, tenant_admin));
  -- Whether RLS filters the row out or the guard rejects it, the row must not change.
  begin
    update public.profiles set role = 'admin' where id = exec;
  exception when insufficient_privilege then
    null;
  end;
  perform pg_temp.act_as('authenticated', global_admin);
  perform pg_temp.expect_guard('global admin changes own role',
    format($q$update public.profiles set role = 'usuario' where id = %L$q$, global_admin));
  -- Policy "Profiles update admin": a global admin managing someone else stays allowed.
  update public.profiles set role = 'ejecutivo' where id = lead;
  update public.profiles set role = 'usuario' where id = lead;
  perform pg_temp.act_as_system();
  perform pg_temp.expect_profile('tenant admin did not promote', exec, 'ejecutivo', 'a3000000-0000-0000-0000-000000000001');
end $$;

-- Sign-up: GoTrue fires on_auth_user_created as supabase_auth_admin, role unset.
-- user_metadata is client-controlled, so a staff role in it must not become one.
-- The trigger exists only in production; schema.sql and the migrations do not create it.
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

set local session authorization supabase_auth_admin;
insert into auth.users(id, email, raw_user_meta_data) values
  ('c3000000-0000-0000-0000-000000000011', 'pg-signup-admin@example.invalid', '{"role": "admin", "full_name": "Atacante"}'),
  ('c3000000-0000-0000-0000-000000000012', 'pg-signup-lead@example.invalid', '{"role": "usuario", "full_name": "Lead Nuevo"}'),
  ('c3000000-0000-0000-0000-000000000013', 'pg-signup-plain@example.invalid', null);
-- create-executive, new account: auth.admin.createUser with role in user_metadata.
insert into auth.users(id, email, raw_user_meta_data) values
  ('c3000000-0000-0000-0000-000000000014', 'pg-new-exec@example.invalid', '{"role": "ejecutivo", "full_name": "Exec Nuevo"}');
reset session authorization;

do $$
declare
  new_exec uuid := 'c3000000-0000-0000-0000-000000000014';
  existing_lead uuid := 'c3000000-0000-0000-0000-000000000009';
  tenant uuid := 'a3000000-0000-0000-0000-000000000001';
begin
  perform pg_temp.expect_profile('signup with admin metadata', 'c3000000-0000-0000-0000-000000000011', 'usuario', null);
  perform pg_temp.expect_profile('signup as lead', 'c3000000-0000-0000-0000-000000000012', 'usuario', null);
  perform pg_temp.expect_profile('signup without metadata', 'c3000000-0000-0000-0000-000000000013', 'usuario', null);
  perform pg_temp.expect_profile('create-executive before upsert', new_exec, 'usuario', null);

  -- create-executive continues with the service_role client, new and existing accounts.
  perform pg_temp.act_as('service_role', null);
  insert into public.profiles(id, full_name, role, inmobiliaria_id, phone, updated_at)
  values (new_exec, 'Exec Nuevo', 'ejecutivo', tenant, null, now())
  on conflict (id) do update set
    full_name = excluded.full_name, role = excluded.role,
    inmobiliaria_id = excluded.inmobiliaria_id, phone = excluded.phone, updated_at = excluded.updated_at;
  insert into public.profiles(id, full_name, role, inmobiliaria_id, updated_at)
  values (existing_lead, 'Lead', 'ejecutivo', tenant, now())
  on conflict (id) do update set
    full_name = excluded.full_name, role = excluded.role,
    inmobiliaria_id = excluded.inmobiliaria_id, updated_at = excluded.updated_at;
  perform pg_temp.act_as_system();
  perform pg_temp.expect_profile('create-executive, new account', new_exec, 'ejecutivo', tenant);
  perform pg_temp.expect_profile('create-executive, existing account', existing_lead, 'ejecutivo', tenant);
end $$;

-- SECURITY DEFINER RPCs keep working from a browser session, and only for their actors.
do $$
declare
  lead uuid := 'c3000000-0000-0000-0000-000000000001';
  exec_free uuid := 'c3000000-0000-0000-0000-000000000004';
  exec_pending uuid := 'c3000000-0000-0000-0000-000000000005';
  assigning_admin uuid := 'c3000000-0000-0000-0000-00000000000a';
  global_admin uuid := 'c3000000-0000-0000-0000-000000000007';
  lead_to_admin uuid := 'c3000000-0000-0000-0000-000000000008';
  tenant uuid := 'a3000000-0000-0000-0000-000000000001';
  project uuid := 'b3000000-0000-0000-0000-000000000001';
  v_denied boolean := false;
begin
  perform pg_temp.act_as('authenticated', global_admin);
  perform public.assign_admin(tenant, 'pg-lead-to-admin@example.invalid');
  perform pg_temp.act_as('authenticated', assigning_admin);
  perform public.assign_executive(project, 'pg-exec-free@example.invalid');
  perform pg_temp.act_as('authenticated', exec_pending);
  perform public.resolve_pending_executives();
  perform pg_temp.act_as_system();
  -- schema.sql and production write admin_inmobiliario; 20260729 alone writes admin.
  if not exists (select 1 from public.profiles where id = lead_to_admin
      and role in ('admin', 'admin_inmobiliario') and inmobiliaria_id = tenant) then
    raise exception 'assign_admin did not apply';
  end if;
  perform pg_temp.expect_profile('assign_executive', exec_free, 'ejecutivo', tenant);
  perform pg_temp.expect_profile('resolve_pending_executives', exec_pending, 'ejecutivo', tenant);

  perform pg_temp.act_as('authenticated', lead);
  begin
    perform public.assign_admin(tenant, 'pg-lead@example.invalid');
  exception when others then
    v_denied := true;
  end;
  perform pg_temp.act_as_system();
  if not v_denied then
    raise exception 'a lead ran assign_admin';
  end if;
  perform pg_temp.expect_profile('lead after assign_admin attempt', lead, 'usuario', null);
end $$;

rollback;
