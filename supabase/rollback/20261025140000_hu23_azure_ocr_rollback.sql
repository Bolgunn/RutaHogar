-- Non-destructive disablement: retain result identifiers and remote cleanup duties.
begin;
create or replace function public.hu23_ocr_disabled()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='INSERT' or new.submit_attempts>old.submit_attempts or new.poll_attempts>old.poll_attempts then
   raise exception 'hu23_disabled';
 end if;
 return new;
end;
$$;
create trigger hu23_ocr_disabled before insert or update on public.document_ocr_jobs
 for each row execute function public.hu23_ocr_disabled();
revoke all on function public.hu23_ocr_disabled() from public,anon,authenticated;
-- Keep the owner-checked RPC for read, in-flight acknowledgement and cleanup only;
-- trigger prevents all new submissions/polls while preserving facts and deletion.
commit;
