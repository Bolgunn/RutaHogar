create role anon;
create role authenticated;
create role supabase_auth_admin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create table auth.identities (user_id uuid references auth.users(id), provider text, identity_data jsonb);
create table public.profiles (id uuid primary key references auth.users(id), role text, rut text, inmobiliaria_id uuid, reliability_status text not null default 'normal', estado_acceso text not null default 'activo', password_pendiente boolean not null default false);
alter table public.profiles enable row level security;
grant usage on schema auth to supabase_auth_admin;
grant select on auth.users, auth.identities to supabase_auth_admin;
insert into auth.users values
('11111111-1111-4111-8111-111111111111','user@example.test'),
('22222222-2222-4222-8222-222222222222','staff@example.test'),
('33333333-3333-4333-8333-333333333333','legacy@example.test');
insert into public.profiles (id,role,rut) values
('11111111-1111-4111-8111-111111111111','usuario','12.345.678-5'),
('22222222-2222-4222-8222-222222222222','ejecutivo',null),
('33333333-3333-4333-8333-333333333333','usuario','12345678-5');
insert into auth.identities values ('11111111-1111-4111-8111-111111111111','google','{"email":"user@example.test"}');
create function auth.uid() returns uuid language sql as $$ select '11111111-1111-4111-8111-111111111111'::uuid $$;
grant usage on schema auth to authenticated;
grant select, insert, update on public.profiles to authenticated;
create policy test_own_profile on public.profiles to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table public.proyectos(id uuid, inmobiliaria_id uuid);
create table public.proyecto_ejecutivos(proyecto_id uuid, ejecutivo_email text, estado text);
