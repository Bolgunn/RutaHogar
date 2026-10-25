begin;
do $$ declare b storage.buckets;
begin
 select * into b from storage.buckets where id='hu23-document-temporary';
 if not found or b.public or b.file_size_limit<>(hu23_upload_limits()->>'max_bytes')::bigint
   or b.allowed_mime_types<>array['application/pdf','image/jpeg','image/png'] then raise exception 'unsafe HU23 bucket'; end if;
 if has_function_privilege('authenticated','hu23_upload_authorize(uuid,uuid,jsonb)','execute')
   or has_function_privilege('anon','hu23_upload_complete(uuid,uuid,integer)','execute') then raise exception 'client can forge admission'; end if;
 if has_table_privilege('authenticated','document_uploads','SELECT,INSERT,UPDATE,DELETE')
   or has_table_privilege('anon','document_uploads','SELECT,INSERT,UPDATE,DELETE') then raise exception 'client can access upload internals'; end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
   and policyname='HU23 no original reads' and permissive='RESTRICTIVE') then raise exception 'missing restrictive isolation'; end if;
end $$;
rollback;
