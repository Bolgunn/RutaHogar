-- Destructive rollback: removes export audit metadata. Back it up first if needed.
begin;
drop function if exists public.hu22_export_rows(uuid[],uuid[]);
drop function if exists public.hu22_export_delivery(uuid,text);
drop function if exists public.hu22_record_export(jsonb);
drop policy if exists "export_events_read" on public.export_events;
drop table if exists public.export_events;
commit;
