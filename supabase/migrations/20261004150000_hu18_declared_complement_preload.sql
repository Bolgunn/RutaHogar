-- HU18: retain the five lead-declared complementary fields with each invitation
-- so a valid public token can prefill only that scoped data.
begin;

alter table public.co_debtor_invitations
  add column if not exists ingreso_mensual_complementario numeric,
  add column if not exists deuda_mensual_complementario numeric,
  add column if not exists tipo_contrato_complementario text,
  add column if not exists continuidad_laboral_complementario text,
  add column if not exists morosidad_complementario text;

alter table public.co_debtor_invitations
  drop constraint if exists co_debtor_invitations_declared_complement_check;
alter table public.co_debtor_invitations
  add constraint co_debtor_invitations_declared_complement_check
  check (
    num_nonnulls(
      ingreso_mensual_complementario,
      deuda_mensual_complementario,
      tipo_contrato_complementario,
      continuidad_laboral_complementario,
      morosidad_complementario
    ) = 0
    or (
      num_nonnulls(
        ingreso_mensual_complementario,
        deuda_mensual_complementario,
        tipo_contrato_complementario,
        continuidad_laboral_complementario,
        morosidad_complementario
      ) = 5
      and ingreso_mensual_complementario >= 0
      and deuda_mensual_complementario >= 0
      and tipo_contrato_complementario in ('indefinido', 'plazo_fijo', 'independiente', 'honorarios_variable')
      and continuidad_laboral_complementario in ('menos_6_meses', 'entre_6_y_12_meses', 'entre_1_y_3_anios', 'mas_3_anios')
      and morosidad_complementario in ('si', 'no')
    )
  );

-- Keep both existing overloads for historical callers. This service-only
-- signature persists the lead declaration atomically with the new invitation.
create or replace function public.hu18_create_invitation(
  p_lead_id uuid,
  p_recipient_email text,
  p_recipient_rut text,
  p_token_digest text,
  p_expires_at timestamptz,
  p_ingreso_mensual_complementario numeric,
  p_deuda_mensual_complementario numeric,
  p_tipo_contrato_complementario text,
  p_continuidad_laboral_complementario text,
  p_morosidad_complementario text
)
returns table (invitation_id uuid, previous_invitation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare created_invitation record;
begin
  select * into created_invitation
  from public.hu18_create_invitation(
    p_lead_id,
    p_recipient_email,
    p_recipient_rut,
    p_token_digest,
    p_expires_at
  );

  update public.co_debtor_invitations
    set ingreso_mensual_complementario = p_ingreso_mensual_complementario,
        deuda_mensual_complementario = p_deuda_mensual_complementario,
        tipo_contrato_complementario = p_tipo_contrato_complementario,
        continuidad_laboral_complementario = p_continuidad_laboral_complementario,
        morosidad_complementario = p_morosidad_complementario
    where id = created_invitation.invitation_id;

  return query select created_invitation.invitation_id, created_invitation.previous_invitation_id;
end;
$$;

revoke all on function public.hu18_create_invitation(uuid, text, text, text, timestamptz, numeric, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.hu18_create_invitation(uuid, text, text, text, timestamptz, numeric, numeric, text, text, text)
  to service_role;

commit;
