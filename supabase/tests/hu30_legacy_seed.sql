-- Disposable database ONLY: execute before HU30 to exercise real legacy rows.
insert into auth.users(id,email) values ('b3000000-0000-0000-0000-000000000001','legacy@hu30.invalid');
insert into public.profiles(id,role) values ('b3000000-0000-0000-0000-000000000001','usuario');
insert into public.co_debtor_invitations(id,lead_id,recipient_email,status,token_digest,expires_at)
values('b3000000-0000-0000-0000-000000000002','b3000000-0000-0000-0000-000000000001',
 'unlinked@hu30.invalid','confirmed','hu30-legacy-token',clock_timestamp()+interval '7 days');
insert into public.co_debtor_confirmations(id,invitation_id,ingreso_mensual_complementario,
 deuda_mensual_complementario,tipo_contrato_complementario,continuidad_laboral_complementario,
 morosidad_complementario,treatment_consent_version,treatment_consented_at,confirmed_at)
values('b3000000-0000-0000-0000-000000000003','b3000000-0000-0000-0000-000000000002',
 900000,50000,'indefinido','mas_3_anios','no','hu18-legacy','2026-10-01T12:00:00Z','2026-10-01T12:00:00Z');
insert into public.evaluations(id,user_id,score,classification,financial_data)
values('b3000000-0000-0000-0000-000000000004','b3000000-0000-0000-0000-000000000001',70,'Medio',
 '{"input":{"complemento_renta":true,"ingreso_mensual_complementario":900000},"result":{"score":70,"classification":"Medio"}}');
