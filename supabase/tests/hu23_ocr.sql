begin;
do $$ begin
 if has_table_privilege('authenticated','document_ocr_jobs','SELECT,INSERT,UPDATE,DELETE')
   or has_table_privilege('anon','document_ocr_jobs','SELECT,INSERT,UPDATE,DELETE') then raise exception 'OCR metadata exposed'; end if;
 if has_function_privilege('authenticated','hu23_ocr_step(uuid,uuid,text,uuid,jsonb)','execute')
   or has_function_privilege('anon','hu23_ocr_step(uuid,uuid,text,uuid,jsonb)','execute') then raise exception 'OCR can be forged'; end if;
 if not exists(select 1 from pg_class where oid='document_ocr_jobs'::regclass and relrowsecurity) then raise exception 'OCR RLS disabled'; end if;
end $$;
rollback;
