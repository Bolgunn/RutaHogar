-- Non-destructive: stop new admission while preserving locators and cleanup access.
begin;
revoke execute on function public.hu23_upload_authorize(uuid,uuid,jsonb),public.hu23_upload_complete(uuid,uuid,integer) from service_role;
drop policy if exists "HU23 exact upload" on storage.objects;
drop policy if exists "HU23 guard insert" on storage.objects;
create policy "HU23 guard insert" on storage.objects as restrictive for insert to public
 with check(bucket_id<>'hu23-document-temporary');
update public.document_uploads set upload_expires_at=greatest(authorized_at+interval '1 microsecond',clock_timestamp())
 where admitted_at is null and upload_expires_at>clock_timestamp();
-- Keep private bucket, no-read/update/delete guards, upload tombstones and verified facts.
commit;
