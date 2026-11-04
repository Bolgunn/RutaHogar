begin;
do $$ begin
 if has_function_privilege('authenticated','hu23_parse_control(uuid,uuid,text,uuid,integer)','execute')
   or has_function_privilege('anon','hu23_parse_control(uuid,uuid,text,uuid,integer)','execute') then
   raise exception 'public can fabricate parsing'; end if;
 if not hu23_parsing_enabled() then raise exception 'parsing disabled after migration'; end if;
end $$;
rollback;
