-- HU23 T2. Private direct upload with authenticated, operation-aware RLS.
begin;
-- Kept in sync with documents/config.py by contract tests. Frontend reads backend limits.
create or replace function public.hu23_upload_limits()
returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select '{"bucket":"hu23-document-temporary","max_bytes":4000000,"max_pdf_pages":2,"lease_seconds":600}'::jsonb;
$$;
do $$ begin
 if to_regprocedure('storage.allow_only_operation(text)') is null then
   raise exception 'HU23 requires the official operation-aware Storage helpers; no permissive fallback';
 end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hu23-document-temporary','hu23-document-temporary',false,
 (public.hu23_upload_limits()->>'max_bytes')::bigint,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create unique index hu23_process_owner_unique on public.document_processes(id,user_id);
-- One object identity per process. Keep its locator as a tombstone for late uploads/cleanup.
create table public.document_uploads (
 process_id uuid primary key,
 user_id uuid not null,
 bucket_id text not null default 'hu23-document-temporary' check(bucket_id='hu23-document-temporary'),
 storage_path text not null unique,
 extension text not null check(extension in ('pdf','jpg','jpeg','png')),
 content_type text not null,
 client_pages integer not null,
 authorized_at timestamptz not null default clock_timestamp(),
 upload_expires_at timestamptz not null,
 reconcile_until timestamptz not null,
 admitted_at timestamptz,
 storage_object_id uuid,
 size_bytes bigint,
 admission_error text check(admission_error in ('upload_object_missing','upload_invalid_metadata','upload_authorization_expired')),
 foreign key(process_id,user_id) references public.document_processes(id,user_id),
 check((extension='pdf' and content_type='application/pdf') or (extension in ('jpg','jpeg') and content_type='image/jpeg') or (extension='png' and content_type='image/png')),
 check(client_pages between 1 and 2 and (extension='pdf' or client_pages=1)),
 check(upload_expires_at>authorized_at and reconcile_until>=upload_expires_at),
 check((admitted_at is null)=(storage_object_id is null)),
 check(size_bytes is null or size_bytes between 1 and 4000000)
);
alter table public.document_uploads enable row level security;
revoke all on public.document_uploads from public,anon,authenticated,service_role;
grant select on public.document_uploads to service_role;
create index hu23_upload_recovery_idx on public.document_uploads(reconcile_until);

-- Exact operation check also blocks createSignedUploadUrl: its two-hour bearer
-- capability must not outlive this revocable ten-minute authenticated lease.
create or replace function public.hu23_may_upload(p_path text)
returns boolean language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare p document_processes; u document_uploads;
begin
 if not storage.allow_only_operation('object.upload') or auth.uid() is null or public.get_my_role()<>'usuario' then return false; end if;
 select d.* into p from document_processes d join document_uploads x on x.process_id=d.id
   where x.storage_path=p_path and d.user_id=auth.uid() for share of d;
 if not found then return false; end if;
 select * into u from document_uploads where process_id=p.id for share;
 return p.state='awaiting_upload' and p.storage_path=p_path and p.expires_at>clock_timestamp()
   and u.upload_expires_at>clock_timestamp() and u.admitted_at is null
   and not exists(select 1 from storage.objects where bucket_id=u.bucket_id and name=p_path);
end;
$$;
revoke all on function public.hu23_may_upload(text) from public;
grant execute on function public.hu23_may_upload(text) to authenticated,anon;
-- Restrictive policies protect this bucket even if another HU has a broad permissive policy.
create policy "HU23 exact upload" on storage.objects for insert to authenticated
 with check(bucket_id='hu23-document-temporary' and public.hu23_may_upload(name));
create policy "HU23 guard insert" on storage.objects as restrictive for insert to public
 with check(bucket_id<>'hu23-document-temporary' or public.hu23_may_upload(name));
create policy "HU23 no original reads" on storage.objects as restrictive for select to public
 using(bucket_id<>'hu23-document-temporary');
create policy "HU23 no overwrite" on storage.objects as restrictive for update to public
 using(bucket_id<>'hu23-document-temporary') with check(bucket_id<>'hu23-document-temporary');
create policy "HU23 no client delete" on storage.objects as restrictive for delete to public
 using(bucket_id<>'hu23-document-temporary');

-- Storage may check permission before transferring bytes and commit metadata with
-- a privileged role later. Recheck the lease at that commit, including late uploads.
create or replace function public.hu23_guard_storage_object()
returns trigger language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare p document_processes; u document_uploads;
begin
 if tg_op='UPDATE' then
   if (old.bucket_id='hu23-document-temporary' or new.bucket_id='hu23-document-temporary')
      and (to_jsonb(new)-array['updated_at','last_accessed_at']) is distinct from (to_jsonb(old)-array['updated_at','last_accessed_at'])
      then raise exception 'hu23_no_overwrite'; end if;
   return new;
 end if;
 if new.bucket_id<>'hu23-document-temporary' then return new; end if;
 select d.* into p from document_processes d join document_uploads x on x.process_id=d.id
   where x.storage_path=new.name and d.user_id::text=new.owner_id for share of d;
 if not found then raise exception 'upload_not_authorized'; end if;
 select * into u from document_uploads where process_id=p.id for share;
 if p.state<>'awaiting_upload' or p.storage_path<>new.name or p.expires_at<=clock_timestamp()
    or u.upload_expires_at<=clock_timestamp() or u.admitted_at is not null then raise exception 'upload_not_authorized'; end if;
 return new;
end;
$$;
create trigger hu23_storage_object_guard before insert or update on storage.objects
 for each row execute function public.hu23_guard_storage_object();
revoke all on function public.hu23_guard_storage_object() from public,anon,authenticated;

create or replace function public.hu23_upload_authorize(p_user uuid,p_process uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare p document_processes; u document_uploads; stamp timestamptz:=clock_timestamp();
 ext text:=p_request->>'extension'; mime text:=p_request->>'content_type'; pages integer:=(p_request->>'client_pages')::integer;
begin
 perform hu23_require_owner(p_user,p_process);
 perform 1 from profiles where id=p_user for update;
 select * into p from document_processes where id=p_process for update;
 if p.closed_at is not null or p.state<>'awaiting_upload' then raise exception 'invalid_transition'; end if;
 if p.expires_at<=stamp then
   perform hu23_lifecycle(p_user,p.id,p.revision,'expire','{}');
   return hu23_read(p_user,p.id);
 end if;
 if p.revision is distinct from (p_request->>'expected_revision')::integer then raise exception 'stale_review'; end if;
 if not ((ext='pdf' and mime='application/pdf') or (ext in ('jpg','jpeg') and mime='image/jpeg') or (ext='png' and mime='image/png'))
    or pages is null or pages<1 or pages>(hu23_upload_limits()->>'max_pdf_pages')::integer or (ext<>'pdf' and pages<>1) then raise exception 'invalid_upload_request'; end if;
 select * into u from document_uploads where process_id=p.id for update;
 if found then
   if u.extension<>ext or u.content_type<>mime or u.client_pages<>pages then raise exception 'upload_format_locked'; end if;
   if exists(select 1 from storage.objects where bucket_id=u.bucket_id and name=u.storage_path) then raise exception 'upload_already_exists'; end if;
   if u.upload_expires_at>stamp then return jsonb_build_object('process',to_jsonb(p),'upload',to_jsonb(u)); end if;
   update document_uploads set authorized_at=stamp,
     upload_expires_at=least(stamp+make_interval(secs=>(hu23_upload_limits()->>'lease_seconds')::integer),p.expires_at),
     reconcile_until=least(stamp+make_interval(secs=>2*(hu23_upload_limits()->>'lease_seconds')::integer),p.created_at+interval '24 hours')
     where process_id=p.id returning * into u;
 else
   insert into document_uploads(process_id,user_id,storage_path,extension,content_type,client_pages,upload_expires_at,reconcile_until)
    values(p.id,p_user,p_user::text||'/'||p.id::text||'/'||gen_random_uuid()::text||'.'||ext,ext,mime,pages,
      least(stamp+make_interval(secs=>(hu23_upload_limits()->>'lease_seconds')::integer),p.expires_at),
      least(stamp+make_interval(secs=>2*(hu23_upload_limits()->>'lease_seconds')::integer),p.created_at+interval '24 hours')) returning * into u;
   update document_processes set storage_path=u.storage_path where id=p.id returning * into p;
 end if;
 return jsonb_build_object('process',to_jsonb(p),'upload',to_jsonb(u));
end;
$$;

create or replace function public.hu23_upload_complete(p_user uuid,p_process uuid,p_revision integer)
returns jsonb language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare p document_processes; u document_uploads; o storage.objects; err text; size_value numeric;
begin
 perform hu23_require_owner(p_user,p_process);
 perform 1 from profiles where id=p_user for update;
 select * into p from document_processes where id=p_process for update;
 select * into u from document_uploads where process_id=p.id for update;
 if p.state='ready' and u.admitted_at is not null then return hu23_read(p_user,p.id); end if;
 if p.closed_at is not null or p.state<>'awaiting_upload' then raise exception 'invalid_transition'; end if;
 if p.expires_at<=clock_timestamp() then
   perform hu23_lifecycle(p_user,p.id,p.revision,'expire','{}'); return hu23_read(p_user,p.id);
 end if;
 if p.revision is distinct from p_revision then raise exception 'stale_review'; end if;
 if u.process_id is null then raise exception 'upload_not_authorized'; end if;
 select * into o from storage.objects where bucket_id=u.bucket_id and name=u.storage_path;
 if not found then err:='upload_object_missing';
 elsif u.upload_expires_at<=clock_timestamp() then err:='upload_authorization_expired';
 else
   if coalesce(o.metadata->>'size','') ~ '^[0-9]{1,18}$' then size_value:=(o.metadata->>'size')::numeric; end if;
   if p.storage_path is distinct from u.storage_path or o.owner_id is distinct from p_user::text
      or size_value is null or size_value<1 or size_value>(hu23_upload_limits()->>'max_bytes')::numeric
      or coalesce(o.metadata->>'mimetype','')<>u.content_type then err:='upload_invalid_metadata'; end if;
 end if;
 if err is not null then
   update document_uploads set admission_error=err where process_id=p.id;
   perform hu23_lifecycle(p_user,p.id,p.revision,'fail','{"failure_code":"invalid_result"}');
   return hu23_read(p_user,p.id)||jsonb_build_object('upload_error',err);
 end if;
 update document_uploads set admitted_at=clock_timestamp(),storage_object_id=o.id,size_bytes=size_value where process_id=p.id;
 return hu23_lifecycle(p_user,p.id,p.revision,'ready','{}');
end;
$$;
create or replace function public.hu23_require_absent_object()
returns trigger language plpgsql security definer set search_path=public,storage,pg_temp as $$
begin
 if new.deletion_state='deleted' and old.deletion_state is distinct from 'deleted' and exists(
   select 1 from document_uploads u join storage.objects o on o.bucket_id=u.bucket_id and o.name=u.storage_path
    where u.process_id=new.id
 ) then raise exception 'upload_not_deleted'; end if;
 return new;
end;
$$;
create trigger hu23_object_deletion_guard before update of deletion_state on public.document_processes
 for each row execute function public.hu23_require_absent_object();
revoke all on function public.hu23_require_absent_object() from public,anon,authenticated;

-- T1 exposed ready/start only internally; T2 enforces their upload prerequisite in DB too.
create or replace function public.hu23_require_admitted_upload()
returns trigger language plpgsql security definer set search_path=public,storage,pg_temp as $$
begin
 if new.state in ('ready','processing') and old.state is distinct from new.state and not exists(
   select 1 from document_uploads u join storage.objects o on o.id=u.storage_object_id
    and o.bucket_id=u.bucket_id and o.name=u.storage_path and o.owner_id=u.user_id::text
   where u.process_id=new.id and u.user_id=new.user_id and u.admitted_at is not null and new.storage_path=u.storage_path
 ) then raise exception 'upload_not_verified'; end if;
 return new;
end;
$$;
create trigger hu23_admitted_upload before update of state on public.document_processes
 for each row execute function public.hu23_require_admitted_upload();
revoke all on function public.hu23_upload_limits(),public.hu23_upload_authorize(uuid,uuid,jsonb),
 public.hu23_upload_complete(uuid,uuid,integer),public.hu23_require_admitted_upload() from public,anon,authenticated;
grant execute on function public.hu23_upload_limits(),public.hu23_upload_authorize(uuid,uuid,jsonb),
 public.hu23_upload_complete(uuid,uuid,integer) to service_role;
commit;
