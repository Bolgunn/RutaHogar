-- Rollback HU18 co-debtor consent persistence.
begin;

drop trigger if exists co_debtor_consent_events_append_only on public.co_debtor_consent_events;
drop function if exists public.hu18_reject_consent_event_mutation();

drop table if exists public.co_debtor_consent_events;
drop table if exists public.co_debtor_confirmations;
drop table if exists public.co_debtor_invitations;

commit;
