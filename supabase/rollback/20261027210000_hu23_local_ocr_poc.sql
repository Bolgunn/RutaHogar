begin;
-- Do not misroute outstanding local work to Azure during rollback.
do $$ begin
 if exists(select 1 from document_ocr_jobs where provider='local') then
   raise exception 'Purge local PoC jobs using normal HU23 retention before rollback';
 end if;
end $$;
drop function public.hu23_local_ocr(uuid,uuid,text,uuid);
drop function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer);
alter function public.hu23_cleanup_before_local_ocr(text,uuid,uuid,text,uuid,jsonb,integer) rename to hu23_cleanup;
grant execute on function public.hu23_cleanup(text,uuid,uuid,text,uuid,jsonb,integer) to service_role;
alter table public.document_ocr_jobs drop constraint document_ocr_jobs_provider_metadata_check;
alter table public.document_ocr_jobs drop column provider;
alter table public.document_ocr_jobs add constraint document_ocr_jobs_api_version_check check(api_version='2024-11-30');
alter table public.document_ocr_jobs add constraint document_ocr_jobs_model_id_check check(model_id='prebuilt-layout');
commit;
