begin;
create table public.export_events (
  id uuid primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('ejecutivo','admin','admin_inmobiliario')),
  inmobiliaria_id uuid not null references public.inmobiliarias(id),
  kind text not null check (kind in ('dossier','leads','metrics')),
  format text not null check (format in ('pdf','xlsx')),
  blocks jsonb not null,
  evaluation_ids jsonb not null default '[]',
  project_id uuid,
  filters jsonb not null default '{}',
  source_at text,
  generated_at timestamptz not null default now(),
  record_count integer check (record_count >= 0),
  status text not null check (status in ('prepared','delivery_requested')),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$')
);
create index export_events_tenant_date on public.export_events(inmobiliaria_id, generated_at desc);
alter table public.export_events enable row level security;
revoke all on public.export_events from public, anon, authenticated;
grant select on public.export_events to authenticated;
grant all on public.export_events to service_role;
create policy export_events_read on public.export_events for select to authenticated using (
  inmobiliaria_id = public.get_my_inmobiliaria()
  and (actor_id = auth.uid() and public.get_my_role() = 'ejecutivo'
       or public.get_my_role() in ('admin','admin_inmobiliario'))
);
comment on table public.export_events is 'HU22 metadata only. delivery_requested means delivery to browser was requested; not proof of a saved file. SHA-256 is reported by the client, not a server signature.';
create function public.hu22_record_export(p_record jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_row public.export_events;
begin
  v_row := jsonb_populate_record(null::public.export_events, p_record);
  insert into public.export_events select (v_row).*;
  return jsonb_build_object('id', v_row.id);
end;
$$;
create function public.hu22_export_delivery(p_id uuid, p_sha256 text) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.export_events where id=p_id and sha256 is not null and sha256<>p_sha256) then
    raise exception 'idempotency_conflict';
  end if;
  update public.export_events set status='delivery_requested', sha256=p_sha256 where id=p_id;
  return jsonb_build_object('id', p_id);
end;
$$;
revoke all on function public.hu22_record_export(jsonb), public.hu22_export_delivery(uuid,text) from public, anon, authenticated;
grant execute on function public.hu22_record_export(jsonb), public.hu22_export_delivery(uuid,text) to service_role;
-- Private batch read. p_projects is derived from the caller's authenticated
-- commercial_funnel_facts() response by the backend, never from request JSON.
create function public.hu22_export_rows(p_evaluations uuid[], p_projects uuid[]) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from (
    select e.id,e.user_id,e.created_at,e.score,e.classification,e.email,e.financial_data,
           p.full_name,p.phone,
           (select jsonb_agg(pr) from unnest(p_projects) pr where public.lead_belongs_to_proyecto(e.user_id,pr)) as authorized_projects
    from public.evaluations e join public.profiles p on p.id=e.user_id
    where e.id=any(p_evaluations)
      and exists(select 1 from unnest(p_projects) pr where public.lead_belongs_to_proyecto(e.user_id,pr))
  ) r;
$$;
revoke all on function public.hu22_export_rows(uuid[],uuid[]) from public,anon,authenticated;
grant execute on function public.hu22_export_rows(uuid[],uuid[]) to service_role;
commit;
