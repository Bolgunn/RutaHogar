-- TEST ONLY: Storage metadata/RLS primitives; does not emulate binary transfer.
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,
 file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),
 name text not null,owner_id text,metadata jsonb,version text default gen_random_uuid()::text,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz default clock_timestamp(),last_accessed_at timestamptz,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
grant select on storage.buckets to anon,authenticated,service_role;
create policy test_other_app_policy on storage.objects for all to public using(true) with check(true);
create function storage.allow_only_operation(op text) returns boolean language sql stable as $$
 select regexp_replace(coalesce(current_setting('storage.operation',true),''),'^storage\.','')
   = regexp_replace(op,'^storage\.','');
$$;
