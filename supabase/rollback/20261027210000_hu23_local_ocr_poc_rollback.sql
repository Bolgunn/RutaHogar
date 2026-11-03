-- Preserve local OCR jobs: rollback only when no local-provider rows exist.
begin;
do $$ begin
  if exists (select 1 from public.document_ocr_jobs where provider = 'local') then
    raise exception 'hu23_local_jobs_prevent_rollback';
  end if;
end $$;
drop function public.hu23_local_ocr(uuid,uuid,text,uuid);
drop function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer);
alter function public.hu23_cleanup_before_local_ocr(text,uuid,uuid,text,uuid,jsonb,integer) rename to hu23_cleanup;
grant execute on function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) to service_role;
alter table public.document_ocr_jobs drop constraint document_ocr_jobs_provider_metadata_check;
alter table public.document_ocr_jobs add constraint document_ocr_jobs_api_version_check check (api_version='2024-11-30');
alter table public.document_ocr_jobs add constraint document_ocr_jobs_model_id_check check (model_id='prebuilt-layout');
alter table public.document_ocr_jobs drop column provider;
commit;
