create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
grant usage on schema auth to public;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table inmobiliarias(id uuid primary key);
create table profiles(id uuid primary key,role text,inmobiliaria_id uuid,full_name text,phone text);
create table evaluations(id uuid,user_id uuid,created_at timestamptz,score numeric,classification text,email text,financial_data jsonb);
create table memberships(lead uuid,project uuid);
create function public.get_my_role() returns text language sql stable security definer as $$select role from profiles where id=auth.uid()$$;
create function public.get_my_inmobiliaria() returns uuid language sql stable security definer as $$select inmobiliaria_id from profiles where id=auth.uid()$$;
create function public.lead_belongs_to_proyecto(p_lead uuid,p_proyecto uuid) returns boolean language sql stable security definer as $$select exists(select 1 from memberships where lead=p_lead and project=p_proyecto)$$;
insert into inmobiliarias values ('22222222-2222-4222-8222-222222222222'),('88888888-8888-4888-8888-888888888888');
insert into profiles values
('11111111-1111-4111-8111-111111111111','ejecutivo','22222222-2222-4222-8222-222222222222','Executive',null),
('77777777-7777-4777-8777-777777777777','ejecutivo','22222222-2222-4222-8222-222222222222','Other executive',null),
('99999999-9999-4999-8999-999999999999','admin_inmobiliario','22222222-2222-4222-8222-222222222222','Admin',null),
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin_inmobiliario','88888888-8888-4888-8888-888888888888','Outside admin',null),
('55555555-5555-4555-8555-555555555555','usuario',null,'Lead',null);
insert into evaluations values ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',now(),75,'Alto','lead@example.test','{}');
insert into memberships values ('55555555-5555-4555-8555-555555555555','33333333-3333-4333-8333-333333333333');
