-- HU18: co-debtor invitation, confirmation and consent audit persistence.
-- Public co-debtor flows are token-gated by backend endpoints; they never use
-- the Supabase browser client directly.
begin;

create table if not exists public.co_debtor_invitations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.profiles(id) on delete restrict,
  recipient_email text not null check (length(trim(recipient_email)) > 0),
  recipient_phone text not null check (length(trim(recipient_phone)) > 0),
  token_digest text not null unique check (length(trim(token_digest)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'expired', 'confirmed', 'revoked', 'replaced')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  replaced_at timestamptz,
  replacement_of_invitation_id uuid
    references public.co_debtor_invitations(id) on delete restrict,
  phone_verified_at timestamptz,
  whatsapp_contact_opt_in boolean not null default false,
  whatsapp_contact_opted_in_at timestamptz,
  created_at timestamptz not null default now(),
  constraint co_debtor_invitations_expiry_check check (expires_at > created_at),
  constraint co_debtor_invitations_replacement_check check (
    replacement_of_invitation_id is distinct from id
  )
);

-- A partial index expresses the single-active-invitation invariant. Expiry is
-- materialized by the backend state transition, rather than a volatile clock in
-- an index predicate.
create unique index if not exists co_debtor_invitations_one_pending_per_lead_idx
  on public.co_debtor_invitations (lead_id)
  where status = 'pending';
create index if not exists co_debtor_invitations_lead_created_idx
  on public.co_debtor_invitations (lead_id, created_at desc);
create index if not exists co_debtor_invitations_expiry_idx
  on public.co_debtor_invitations (expires_at)
  where status = 'pending';

create table if not exists public.co_debtor_confirmations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null unique
    references public.co_debtor_invitations(id) on delete restrict,
  ingreso_mensual_complementario numeric not null
    check (ingreso_mensual_complementario >= 0),
  deuda_mensual_complementario numeric not null
    check (deuda_mensual_complementario >= 0),
  tipo_contrato_complementario text not null
    check (tipo_contrato_complementario in ('indefinido', 'plazo_fijo', 'independiente', 'honorarios_variable')),
  continuidad_laboral_complementario text not null
    check (continuidad_laboral_complementario in (
      'menos_6_meses', 'entre_6_y_12_meses', 'entre_1_y_3_anios', 'mas_3_anios'
    )),
  morosidad_complementario text not null
    check (morosidad_complementario in ('si', 'no')),
  treatment_consent_version text not null
    check (length(trim(treatment_consent_version)) > 0),
  treatment_consented_at timestamptz not null,
  confirmed_at timestamptz not null default now()
);

create index if not exists co_debtor_confirmations_confirmed_idx
  on public.co_debtor_confirmations (confirmed_at desc);

-- This table deliberately has no jsonb or free-form payload column: consent
-- audit records must never carry the co-debtor's financial values.
create table if not exists public.co_debtor_consent_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null
    references public.co_debtor_invitations(id) on delete restrict,
  event_type text not null
    check (event_type in ('invited', 'consent_granted', 'confirmed', 'revoked')),
  actor_type text not null
    check (actor_type in ('lead', 'co_debtor', 'system')),
  invitation_status text not null
    check (invitation_status in ('pending', 'expired', 'confirmed', 'revoked', 'replaced')),
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists co_debtor_consent_events_invitation_occurred_idx
  on public.co_debtor_consent_events (invitation_id, occurred_at, id);

create or replace function public.hu18_reject_consent_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'co_debtor_consent_events_are_append_only' using errcode = '23514';
end;
$$;

drop trigger if exists co_debtor_consent_events_append_only on public.co_debtor_consent_events;
create trigger co_debtor_consent_events_append_only
  before update or delete on public.co_debtor_consent_events
  for each row execute function public.hu18_reject_consent_event_mutation();

alter table public.co_debtor_invitations enable row level security;
alter table public.co_debtor_confirmations enable row level security;
alter table public.co_debtor_consent_events enable row level security;

-- Browser access is limited to the lead's own invitation/audit records. Raw
-- co-debtor confirmations are readable only by their owning lead or by the
-- backend service role; there is intentionally no executive/staff policy.
drop policy if exists "Co-debtor invitations select own lead" on public.co_debtor_invitations;
create policy "Co-debtor invitations select own lead"
  on public.co_debtor_invitations
  for select to authenticated
  using (auth.uid() = lead_id);

drop policy if exists "Co-debtor invitations insert own lead" on public.co_debtor_invitations;
create policy "Co-debtor invitations insert own lead"
  on public.co_debtor_invitations
  for insert to authenticated
  with check (auth.uid() = lead_id);

drop policy if exists "Co-debtor confirmations select own lead" on public.co_debtor_confirmations;
create policy "Co-debtor confirmations select own lead"
  on public.co_debtor_confirmations
  for select to authenticated
  using (
    exists (
      select 1
      from public.co_debtor_invitations invitation
      where invitation.id = invitation_id
        and invitation.lead_id = auth.uid()
    )
  );

drop policy if exists "Co-debtor consent events select own lead" on public.co_debtor_consent_events;
create policy "Co-debtor consent events select own lead"
  on public.co_debtor_consent_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.co_debtor_invitations invitation
      where invitation.id = invitation_id
        and invitation.lead_id = auth.uid()
    )
  );

revoke all on table public.co_debtor_invitations,
  public.co_debtor_confirmations,
  public.co_debtor_consent_events from anon, authenticated;
grant select, insert on table public.co_debtor_invitations to authenticated;
grant select on table public.co_debtor_confirmations,
  public.co_debtor_consent_events to authenticated;
grant select, insert, update, delete on table public.co_debtor_invitations,
  public.co_debtor_confirmations to service_role;
grant select, insert on table public.co_debtor_consent_events to service_role;

commit;
