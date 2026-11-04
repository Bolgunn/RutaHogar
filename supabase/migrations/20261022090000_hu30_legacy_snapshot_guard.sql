-- HU30 T6: legacy aliases/partial snapshots must not bypass safe projections.
begin;
create or replace function public.hu30_has_complement(value jsonb)
returns boolean language plpgsql immutable set search_path=public as $$
declare field text; child jsonb;
begin
 if jsonb_typeof(value)='array' then
  for child in select jsonb_array_elements(value) loop
   if public.hu30_has_complement(child) then return true; end if;
  end loop;
 elsif jsonb_typeof(value)='object' then
  for field,child in select * from jsonb_each(value) loop
   if child<>'null'::jsonb then
    if field='complemento_renta' and lower(child#>>'{}') in ('true','1','si','sí','yes') then return true; end if;
    if field<>'complemento_renta' and (field like 'complemento\_%' escape '\' or field in (
      'ingreso_mensual_complementario','deuda_mensual_complementario','tipo_contrato_complementario',
      'continuidad_laboral_complementario','morosidad_complementario','relacion_complementario',
      'co_debtor_confirmation_id','participant_user_id','recipient_rut','recipient_email','relation_value')) then return true; end if;
    if field='ingreso_complementario_considerado' and child not in ('0'::jsonb,'"0"'::jsonb) then return true; end if;
    if field='complement_source' and child#>>'{}' in ('co_debtor_confirmed','lead_declared','excluded_after_revocation','excluded_after_decline') then return true; end if;
    if field='evaluation_type' and child#>>'{}' in ('bipersonal_confirmed','declared_complement','unverifiable_origin') then return true; end if;
    if jsonb_typeof(child) in ('object','array') and public.hu30_has_complement(child) then return true; end if;
   end if;
  end loop;
 end if;
 return false;
end; $$;
-- Restore the established own-individual read path, including forward replay
-- after the conservative rollback. Existing RLS continues to deny staff/raw HU30.
grant select on public.evaluations,public.scoring_history to authenticated;
commit;
