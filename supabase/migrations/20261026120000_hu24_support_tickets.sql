-- =============================================================
-- HU24 — Asistente virtual y sistema de tickets para usuarios
-- Tabla support_tickets, RLS y funciones RPC para gestión de tickets
-- =============================================================

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text null,
  user_email text null,
  role text not null,
  inmobiliaria_id uuid null,
  subject text not null,
  message text not null,
  transcript jsonb not null default '[]'::jsonb,
  screen_id text null,
  status text not null default 'abierto' check (status in ('abierto', 'en_proceso', 'en_curso', 'resuelto', 'cerrado')),
  admin_reply text null,
  replied_at timestamptz null,
  replied_by uuid null references auth.users(id) on delete set null,
  status_updated_at timestamptz null,
  status_updated_by uuid null references auth.users(id) on delete set null,
  notified_at timestamptz null,
  notification_error text null,
  user_feedback text null check (user_feedback in ('helpful', 'unhelpful')),
  user_feedback_at timestamptz null,
  thread jsonb not null default '[]'::jsonb,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  constraint support_tickets_user_client_request_key unique (user_id, client_request_id)
);

-- Garantizar reglas ON DELETE en caso de que la tabla ya existiera previamente
alter table public.support_tickets
  drop constraint if exists support_tickets_user_id_fkey,
  add constraint support_tickets_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.support_tickets
  drop constraint if exists support_tickets_replied_by_fkey,
  add constraint support_tickets_replied_by_fkey
    foreign key (replied_by) references auth.users(id) on delete set null;

alter table public.support_tickets
  drop constraint if exists support_tickets_status_updated_by_fkey,
  add constraint support_tickets_status_updated_by_fkey
    foreign key (status_updated_by) references auth.users(id) on delete set null;

create index if not exists idx_support_tickets_user_id on public.support_tickets(user_id);
create index if not exists idx_support_tickets_status on public.support_tickets(status);
create index if not exists idx_support_tickets_created_at on public.support_tickets(created_at desc);

-- RLS: Cada usuario lee solo sus tickets; el admin global lee todos.
-- La creación se realiza exclusivamente vía backend (service_role) para garantizar
-- redacción de datos personales (PII) e integridad de estado inicial.
alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_select" on public.support_tickets;
create policy "support_tickets_select"
  on public.support_tickets
  for select
  using (
    user_id = auth.uid() or public.is_global_admin()
  );

drop policy if exists "support_tickets_insert" on public.support_tickets;

-- Restricción estricta: ninguna inserción, actualización o eliminación directa por clientes
revoke insert, update, delete on public.support_tickets from public, authenticated, anon;
grant select on public.support_tickets to authenticated;

-- Eliminar sobrecargas de 2 parámetros que generan ambigüedad PGRST203 en PostgREST
drop function if exists public.update_support_ticket_status(uuid, text);
drop function if exists public.submit_ticket_user_feedback(uuid, text);

-- RPC SECURITY DEFINER para actualizar el estado del ticket y registrar respuesta (solo admin global)
create or replace function public.update_support_ticket_status(
  p_ticket_id uuid,
  p_status text,
  p_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets%rowtype;
begin
  if auth.uid() is null or not public.is_global_admin() then
    raise exception 'Acceso denegado: solo el administrador global puede modificar tickets.';
  end if;

  if p_status not in ('abierto', 'en_proceso', 'en_curso', 'resuelto', 'cerrado') then
    raise exception 'Estado de ticket invalido: %', p_status;
  end if;

  update public.support_tickets
  set status = case when p_status = 'en_curso' then 'en_proceso' else p_status end,
      status_updated_at = now(),
      status_updated_by = auth.uid(),
      admin_reply = coalesce(nullif(trim(p_reply), ''), admin_reply),
      replied_at = case when p_reply is not null and trim(p_reply) <> '' then now() else replied_at end,
      replied_by = case when p_reply is not null and trim(p_reply) <> '' then auth.uid() else replied_by end,
      thread = case
        when p_reply is not null and trim(p_reply) <> '' then
          coalesce(thread, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('role', 'admin', 'content', trim(p_reply), 'created_at', now()))
        else thread
      end
  where id = p_ticket_id
  returning * into v_ticket;

  if not found then
    raise exception 'Ticket no encontrado: %', p_ticket_id;
  end if;

  return to_jsonb(v_ticket);
end;
$$;

-- RPC SECURITY DEFINER para que el usuario confirme si la respuesta resolvió su duda o envíe réplica
create or replace function public.submit_ticket_user_feedback(
  p_ticket_id uuid,
  p_feedback text,
  p_user_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.support_tickets%rowtype;
  v_new_status text;
  v_turn jsonb;
begin
  if auth.uid() is null then
    raise exception 'Acceso denegado: debes iniciar sesion para enviar feedback.';
  end if;

  select * into v_ticket from public.support_tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket no encontrado: %', p_ticket_id;
  end if;

  if v_ticket.user_id is distinct from auth.uid() and not public.is_global_admin() then
    raise exception 'Acceso denegado: solo el creador del ticket puede enviar feedback.';
  end if;

  if p_feedback not in ('helpful', 'unhelpful') then
    raise exception 'Feedback invalido: %', p_feedback;
  end if;

  v_new_status := case when p_feedback = 'helpful' then 'resuelto' else 'en_proceso' end;

  if p_user_reply is not null and trim(p_user_reply) <> '' then
    v_turn := jsonb_build_object(
      'role', 'user',
      'content', left(trim(p_user_reply), 2000),
      'created_at', now()
    );
  end if;

  update public.support_tickets
  set status = v_new_status,
      status_updated_at = now(),
      user_feedback = p_feedback,
      user_feedback_at = now(),
      thread = case
        when v_turn is not null then coalesce(thread, '[]'::jsonb) || jsonb_build_array(v_turn)
        else thread
      end
  where id = p_ticket_id
  returning * into v_ticket;

  return jsonb_build_object(
    'id', v_ticket.id,
    'status', v_ticket.status,
    'user_feedback', v_ticket.user_feedback,
    'user_feedback_at', v_ticket.user_feedback_at,
    'thread', v_ticket.thread
  );
end;
$$;

revoke all on function public.update_support_ticket_status(uuid, text, text) from public, anon;
revoke all on function public.submit_ticket_user_feedback(uuid, text, text) from public, anon;
grant execute on function public.update_support_ticket_status(uuid, text, text) to authenticated;
grant execute on function public.submit_ticket_user_feedback(uuid, text, text) to authenticated;
