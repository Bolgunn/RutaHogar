-- Run with ON_ERROR_STOP against a disposable database (hu13_bootstrap.sql, schema.sql and
-- the migrations applied); leaves no fixture rows. Regression test for
-- 20261005130000_restore_evaluations_staff_select: staff read every lead's evaluations, a lead
-- reads only its own. On 2026-10-05 a hand edit left the policy as (auth.uid() = user_id) and
-- every staff dashboard showed 0 leads.
begin;

insert into public.inmobiliarias(id, nombre) values ('a2000000-0000-0000-0000-000000000001', 'ES Inmobiliaria');
insert into auth.users(id, email) values
  ('c2000000-0000-0000-0000-000000000001', 'es-lead-1@example.invalid'),
  ('c2000000-0000-0000-0000-000000000002', 'es-lead-2@example.invalid'),
  ('c2000000-0000-0000-0000-000000000003', 'es-exec@example.invalid'),
  ('c2000000-0000-0000-0000-000000000004', 'es-admin@example.invalid');
insert into public.profiles(id, role, inmobiliaria_id) values
  ('c2000000-0000-0000-0000-000000000001', 'usuario', null),
  ('c2000000-0000-0000-0000-000000000002', 'usuario', null),
  ('c2000000-0000-0000-0000-000000000003', 'ejecutivo', 'a2000000-0000-0000-0000-000000000001'),
  ('c2000000-0000-0000-0000-000000000004', 'admin', 'a2000000-0000-0000-0000-000000000001');
insert into public.evaluations(id, user_id, score, classification, created_at) values
  ('d2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 80, 'Alto', '2026-10-01Z'),
  ('d2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 50, 'Medio', '2026-10-02Z');

-- Hosted Supabase grants table privileges to authenticated and lets RLS decide.
grant select on public.evaluations to authenticated;

create function pg_temp.es_visible() returns bigint language sql as $$
  select count(*) from public.evaluations where id::text like 'd2000000-%';
$$;

set local role authenticated;

select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000003', true);
do $$ begin assert pg_temp.es_visible() = 2, 'ejecutivo reads every lead''s evaluations'; end $$;

select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000004', true);
do $$ begin assert pg_temp.es_visible() = 2, 'admin reads every lead''s evaluations'; end $$;

select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);
do $$
begin
  assert pg_temp.es_visible() = 1, 'a lead reads only its own evaluation';
  assert exists (select 1 from public.evaluations where id = 'd2000000-0000-0000-0000-000000000001'), 'own evaluation visible';
end $$;

-- The hand-edited body must fail the staff assertion: proves this test catches the outage.
reset role;
drop policy "Evaluations select own" on public.evaluations;
create policy "Evaluations select own" on public.evaluations for select using (auth.uid() = user_id);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000003', true);
do $$ begin assert pg_temp.es_visible() = 0, 'own-only body hides every lead from staff'; end $$;

reset role;
select 'evaluations_staff_select tests passed' as result;
rollback;
