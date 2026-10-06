-- =============================================================
-- RutaHogar — Cambios relevantes desde la ultima visita
-- =============================================================
-- Diseno funcional documentado en la historia correspondiente.
-- Base aditiva: no toca scoring, tracking HU13 ni contrato de catalogo.
begin;

create table if not exists public.lead_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  materiality_key text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  detected_at timestamptz not null default clock_timestamp(),
  project_id uuid references public.proyectos(id) on delete set null,
  project_name text,
  tone text not null default 'info',
  title text not null,
  summary text not null,
  previous_value jsonb,
  current_value jsonb,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  source text not null default 'job',
  seen_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint lead_change_events_type_check check (event_type in (
    'project_compatible_unlocked',
    'score_band_improved',
    'monthly_plan_summary',
    'uf_reachability_crossed',
    'quick_update_submitted'
  )),
  constraint lead_change_events_tone_check check (tone in ('positive', 'info', 'warning')),
  constraint lead_change_events_source_check check (source in ('job', 'landing', 'quick_update', 'backfill')),
  constraint lead_change_events_title_check check (length(trim(title)) > 0),
  constraint lead_change_events_summary_check check (length(trim(summary)) > 0),
  unique (user_id, event_type, materiality_key)
);

create index if not exists lead_change_events_user_unseen_idx
  on public.lead_change_events (user_id, seen_at, occurred_at desc, id desc);
create index if not exists lead_change_events_user_type_idx
  on public.lead_change_events (user_id, event_type, occurred_at desc);

create table if not exists public.lead_change_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.lead_change_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  status text not null,
  provider text,
  provider_message_id text,
  recipient text,
  subject text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  error_code text,
  attempted_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint lead_change_notifications_channel_check check (channel in ('email')),
  constraint lead_change_notifications_status_check check (status in ('skipped', 'queued', 'sent', 'failed'))
);

create index if not exists lead_change_notifications_user_channel_idx
  on public.lead_change_notifications (user_id, channel, attempted_at desc);
create index if not exists lead_change_notifications_event_idx
  on public.lead_change_notifications (event_id, channel);

create table if not exists public.lead_notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  channel text not null default 'email',
  enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, event_type, channel),
  constraint lead_notification_preferences_type_check check (event_type in (
    'project_compatible_unlocked',
    'score_band_improved',
    'monthly_plan_summary',
    'uf_reachability_crossed',
    'quick_update_submitted'
  )),
  constraint lead_notification_preferences_channel_check check (channel in ('email', 'in_app'))
);

alter table public.lead_notification_preferences
  drop constraint if exists lead_notification_preferences_channel_check;
alter table public.lead_notification_preferences
  add constraint lead_notification_preferences_channel_check check (channel in ('email', 'in_app'));

alter table public.lead_change_events enable row level security;
alter table public.lead_change_notifications enable row level security;
alter table public.lead_notification_preferences enable row level security;

drop policy if exists "Lead change events select own" on public.lead_change_events;
create policy "Lead change events select own" on public.lead_change_events
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Lead change events update own seen" on public.lead_change_events;
create policy "Lead change events update own seen" on public.lead_change_events
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Lead notification preferences select own" on public.lead_notification_preferences;
create policy "Lead notification preferences select own" on public.lead_notification_preferences
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Lead notification preferences upsert own" on public.lead_notification_preferences;
create policy "Lead notification preferences upsert own" on public.lead_notification_preferences
  for all to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Lead change notifications select none" on public.lead_change_notifications;
create policy "Lead change notifications select none" on public.lead_change_notifications
  for select to authenticated using (false);

revoke insert, delete on public.lead_change_events from anon, authenticated;
revoke insert, update, delete on public.lead_change_notifications from anon, authenticated;
grant select, update on public.lead_change_events to authenticated;
grant select, insert, update on public.lead_notification_preferences to authenticated;
grant select, insert, update, delete on public.lead_change_events,
  public.lead_change_notifications, public.lead_notification_preferences to service_role;

create or replace function public.lead_changes_due_leads(p_limit integer default 100)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(row_data order by row_data->>'user_id'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'user_id', e.user_id,
      'email', u.email,
      'latest_evaluation_id', e.id,
      'latest_evaluation_at', e.created_at,
      'classification', e.classification,
      'score', e.score,
      'financial_data', e.financial_data,
      'previous_evaluation', prev.previous_evaluation,
      'last_lead_change_email_at', (
        select max(n.sent_at)
        from public.lead_change_notifications n
        where n.user_id = e.user_id and n.channel = 'email' and n.status = 'sent'
      )
    ) as row_data
    from (
      select distinct on (ev.user_id) ev.*
      from public.evaluations ev
      where ev.user_id is not null
      order by ev.user_id, ev.created_at desc nulls last, ev.id desc
    ) e
    left join auth.users u on u.id = e.user_id
    left join lateral (
      select jsonb_build_object(
        'id', p.id,
        'created_at', p.created_at,
        'classification', p.classification,
        'score', p.score,
        'financial_data', p.financial_data
      ) as previous_evaluation
      from public.evaluations p
      where p.user_id = e.user_id and p.id <> e.id
      order by p.created_at desc nulls last, p.id desc
      limit 1
    ) prev on true
    order by e.created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) rows;
$$;

create or replace function public.lead_changes_record_event(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  saved public.lead_change_events%rowtype;
begin
  insert into public.lead_change_events (
    id, user_id, event_type, materiality_key, occurred_at, project_id, project_name,
    tone, title, summary, previous_value, current_value, payload, source
  ) values (
    coalesce((p_event->>'id')::uuid, gen_random_uuid()),
    (p_event->>'user_id')::uuid,
    p_event->>'event_type',
    p_event->>'materiality_key',
    coalesce((p_event->>'occurred_at')::timestamptz, clock_timestamp()),
    nullif(p_event->>'project_id', '')::uuid,
    nullif(p_event->>'project_name', ''),
    coalesce(nullif(p_event->>'tone', ''), 'info'),
    p_event->>'title',
    p_event->>'summary',
    p_event->'previous_value',
    p_event->'current_value',
    coalesce(p_event->'payload', '{}'::jsonb),
    coalesce(nullif(p_event->>'source', ''), 'job')
  )
  on conflict (user_id, event_type, materiality_key) do update set
    detected_at = public.lead_change_events.detected_at
  returning * into saved;

  return to_jsonb(saved);
end;
$$;

create or replace function public.lead_changes_record_notification(p_notification jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  saved public.lead_change_notifications%rowtype;
begin
  insert into public.lead_change_notifications (
    event_id, user_id, channel, status, provider, provider_message_id,
    recipient, subject, payload, error_code, sent_at
  ) values (
    (p_notification->>'event_id')::uuid,
    (p_notification->>'user_id')::uuid,
    coalesce(nullif(p_notification->>'channel', ''), 'email'),
    p_notification->>'status',
    nullif(p_notification->>'provider', ''),
    nullif(p_notification->>'provider_message_id', ''),
    nullif(p_notification->>'recipient', ''),
    nullif(p_notification->>'subject', ''),
    coalesce(p_notification->'payload', '{}'::jsonb),
    nullif(p_notification->>'error_code', ''),
    case when p_notification->>'status' = 'sent' then clock_timestamp() else null end
  ) returning * into saved;

  return to_jsonb(saved);
end;
$$;

grant execute on function public.lead_changes_due_leads(integer) to service_role;
grant execute on function public.lead_changes_record_event(jsonb) to service_role;
grant execute on function public.lead_changes_record_notification(jsonb) to service_role;

create or replace function public.lead_changes_record_quick_update(p_event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  saved public.lead_change_events%rowtype;
begin
  if caller is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_event->>'event_type' is distinct from 'quick_update_submitted' then
    raise exception 'invalid_event_type';
  end if;

  insert into public.lead_change_events (
    user_id, event_type, materiality_key, occurred_at, project_name,
    tone, title, summary, previous_value, current_value, payload, source
  ) values (
    caller,
    'quick_update_submitted',
    coalesce(nullif(p_event->>'materiality_key', ''), 'quick-update:' || gen_random_uuid()::text),
    coalesce((p_event->>'occurred_at')::timestamptz, clock_timestamp()),
    nullif(p_event->>'project_name', ''),
    coalesce(nullif(p_event->>'tone', ''), 'positive'),
    coalesce(nullif(p_event->>'title', ''), 'Actualizaste un dato de tu perfil'),
    coalesce(nullif(p_event->>'summary', ''), 'Registramos un avance reportado desde Inicio.'),
    p_event->'previous_value',
    p_event->'current_value',
    coalesce(p_event->'payload', '{}'::jsonb),
    'quick_update'
  ) returning * into saved;

  return to_jsonb(saved);
end;
$$;

grant execute on function public.lead_changes_record_quick_update(jsonb) to authenticated;

commit;
