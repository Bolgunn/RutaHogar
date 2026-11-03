begin;
do $$ begin
 if has_function_privilege('anon','hu23_local_ocr(uuid,uuid,text,uuid)','execute')
   or has_function_privilege('authenticated','hu23_local_ocr(uuid,uuid,text,uuid)','execute')
   or has_function_privilege('service_role','hu23_cleanup_before_local_ocr(text,uuid,uuid,text,uuid,jsonb,integer)','execute') then
   raise exception 'Local OCR internal controls exposed';
 end if;
 if not has_function_privilege('service_role','hu23_local_ocr(uuid,uuid,text,uuid)','execute') then
   raise exception 'Local OCR service role unavailable';
 end if;
 if exists(select 1 from document_ocr_jobs where provider='azure' and
   (model_id<>'prebuilt-layout' or api_version<>'2024-11-30')) then
   raise exception 'Existing Azure metadata changed';
 end if;
 if has_table_privilege('authenticated','document_ocr_jobs','INSERT,UPDATE,DELETE,SELECT') then
   raise exception 'Local provider exposed OCR metadata';
 end if;
end $$;
rollback;
