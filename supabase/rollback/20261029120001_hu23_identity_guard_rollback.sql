-- Restore the preceding HU23 constraint without deleting documents or evidence.
-- This intentionally fails if identity_inconsistent rows exist; resolve via an
-- approved forward plan rather than deleting or changing historical evidence.
begin;
drop function if exists public.hu23_reject_identity(uuid,uuid,integer,uuid);
alter table public.document_processes drop constraint if exists document_processes_failure_code_check;
alter table public.document_processes add constraint document_processes_failure_code_check
  check (failure_code in ('unreadable_document','provider_unavailable','invalid_result'));
commit;
