begin;
do $$ begin
 if has_table_privilege('authenticated','document_score_requests','SELECT,INSERT,UPDATE,DELETE')
   or has_table_privilege('anon','document_score_requests','SELECT,INSERT,UPDATE,DELETE') then raise exception 'score intents exposed'; end if;
 if has_function_privilege('authenticated','hu23_score_commit(uuid,uuid,jsonb,uuid,jsonb)','EXECUTE')
   or has_function_privilege('anon','hu23_score_context(uuid)','EXECUTE') then raise exception 'score mutation public'; end if;
 if not hu23_score_enabled() then raise exception 'score disabled after migration'; end if;
end $$;
rollback;
