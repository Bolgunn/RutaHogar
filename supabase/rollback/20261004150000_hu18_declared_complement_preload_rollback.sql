-- Rollback HU18 invitation prefill persistence.
begin;

revoke all on function public.hu18_create_invitation(uuid, text, text, text, timestamptz, numeric, numeric, text, text, text)
  from public, anon, authenticated, service_role;
drop function if exists public.hu18_create_invitation(uuid, text, text, text, timestamptz, numeric, numeric, text, text, text);

alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_declared_complement_check,
  drop column if exists ingreso_mensual_complementario,
  drop column if exists deuda_mensual_complementario,
  drop column if exists tipo_contrato_complementario,
  drop column if exists continuidad_laboral_complementario,
  drop column if exists morosidad_complementario;

commit;
