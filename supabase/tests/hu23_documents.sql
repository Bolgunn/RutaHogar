-- Disposable database only. Test privileges and evidence invariants independently of Python.
begin;
do $$
declare signature text; relation_name text;
begin
  foreach signature in array array[
    'public.hu23_read(uuid,uuid)', 'public.hu23_create(uuid,uuid,text,timestamptz)',
    'public.hu23_lifecycle(uuid,uuid,integer,text,jsonb)', 'public.hu23_confirm(uuid,uuid,jsonb,jsonb)'
  ] loop
    if has_function_privilege('authenticated',signature,'execute') or has_function_privilege('anon',signature,'execute')
      then raise exception 'browser can call privileged HU23 RPC: %',signature; end if;
    if not has_function_privilege('service_role',signature,'execute') then raise exception 'missing backend grant: %',signature; end if;
  end loop;
  foreach relation_name in array array['document_processes','document_candidates','document_field_evidence'] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||relation_name)::regclass) then
      raise exception 'RLS disabled: %',relation_name; end if;
    if has_table_privilege('authenticated','public.'||relation_name,'insert,update,delete')
      or has_table_privilege('anon','public.'||relation_name,'select,insert,update,delete') then
      raise exception 'excessive client grants: %',relation_name; end if;
    if has_table_privilege('service_role','public.'||relation_name,'insert,update,delete') then
      raise exception 'backend can bypass lifecycle through table writes: %',relation_name; end if;
  end loop;
  if hu23_allowed_field('liquidacion_sueldo','deuda_mensual') or hu23_allowed_field('documento_laboral','ingreso_mensual')
    or hu23_allowed_field('certificado_ahorro','rut') then raise exception 'allowlist failure'; end if;
  if hu23_valid_value('ingreso_mensual','true') or hu23_valid_value('tipo_contrato','"arbitrary"')
    or hu23_valid_value('ingreso_mensual','0') then raise exception 'value validation failure'; end if;
end;
$$;
rollback;
