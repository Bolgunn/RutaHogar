-- HU23 T1. No bucket, OCR, scheduler or historical evaluation changes.
begin;

create or replace function public.hu23_allowed_field(p_type text, p_field text)
returns boolean language sql immutable set search_path = public as $$
  select case p_type when 'liquidacion_sueldo' then p_field = 'ingreso_mensual'
    when 'certificado_ahorro' then p_field = 'ahorro_disponible'
    when 'documento_laboral' then p_field in ('tipo_contrato','continuidad_laboral') else false end;
$$;
create or replace function public.hu23_valid_value(p_field text, p_value jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
begin
  if p_field in ('ingreso_mensual','ahorro_disponible') then
    return jsonb_typeof(p_value) = 'number' and (p_value::text)::numeric between 0 and 9007199254740991
      and (p_field <> 'ingreso_mensual' or (p_value::text)::numeric > 0);
  elsif p_field = 'tipo_contrato' then
    return jsonb_typeof(p_value) = 'string' and p_value #>> '{}' in ('indefinido','plazo_fijo','independiente','honorarios_variable');
  elsif p_field = 'continuidad_laboral' then
    return jsonb_typeof(p_value) = 'string' and p_value #>> '{}' in ('menos_6_meses','entre_6_y_12_meses','entre_1_y_3_anios','mas_3_anios');
  end if;
  return false;
exception when invalid_text_representation then return false;
end;
$$;

create table public.document_processes (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  document_type text not null check(document_type in ('liquidacion_sueldo','certificado_ahorro','documento_laboral')),
  state text not null default 'awaiting_upload' check(state in ('awaiting_upload','ready','processing','awaiting_review','confirmed','cancelled','processing_failed','expired')),
  revision integer not null default 0 check(revision >= 0),
  plan_id uuid not null,
  base_evaluation_id uuid not null,
  base_revision uuid not null,
  storage_path text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  processing_at timestamptz,
  review_at timestamptz,
  closed_at timestamptz,
  parser_version text check(parser_version ~ '^[A-Za-z0-9_.-]{1,64}$'),
  normalizer_version text check(normalizer_version ~ '^[A-Za-z0-9_.-]{1,64}$'),
  contract_version text not null default 'hu23-v1' check(contract_version = 'hu23-v1'),
  failure_code text check(failure_code in ('unreadable_document','provider_unavailable','invalid_result')),
  deletion_state text not null default 'not_requested' check(deletion_state in ('not_requested','delete_pending','deleting','deleted','retry_required')),
  deletion_attempts integer not null default 0 check(deletion_attempts >= 0),
  deletion_at timestamptz,
  confirm_request jsonb,
  tracking_event_id uuid,
  unique(id,user_id,document_type),
  foreign key(plan_id,user_id) references public.tracking_plans(id,user_id),
  foreign key(base_evaluation_id,user_id) references public.evaluations(id,user_id),
  foreign key(base_revision,plan_id,user_id) references public.tracking_events(event_id,plan_id,user_id),
  foreign key(tracking_event_id,plan_id,user_id) references public.tracking_events(event_id,plan_id,user_id),
  check(expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  check((state in ('confirmed','cancelled','processing_failed','expired')) = (closed_at is not null)),
  check((state in ('confirmed','cancelled','processing_failed','expired')) = (deletion_state <> 'not_requested')),
  check((deletion_state = 'deleted') = (deletion_at is not null)),
  check(deletion_state <> 'deleted' or storage_path is null),
  check((state = 'confirmed') = (confirm_request is not null)),
  check(state not in ('awaiting_review','confirmed') or (parser_version is not null and normalizer_version is not null and review_at is not null)),
  check(state = 'confirmed' or tracking_event_id is null)
);
create index document_processes_cleanup_idx on public.document_processes(deletion_state,expires_at);
create index document_processes_owner_idx on public.document_processes(user_id,created_at desc);

-- Values here are temporary. Every terminal transition deletes these rows.
create table public.document_candidates (
  process_id uuid not null,
  user_id uuid not null,
  document_type text not null,
  field text not null,
  detection text not null check(detection in ('detected','ambiguous','not_detected')),
  detected_value jsonb,
  declared_value jsonb,
  comparison text not null check(comparison in ('match','difference','insufficient')),
  page integer not null check(page between 1 and 2),
  primary key(process_id,field),
  foreign key(process_id,user_id,document_type) references public.document_processes(id,user_id,document_type),
  check(public.hu23_allowed_field(document_type,field)),
  check((detection = 'detected' and detected_value is not null and public.hu23_valid_value(field,detected_value))
    or (detection <> 'detected' and detected_value is null)),
  check(declared_value is null or public.hu23_valid_value(field,declared_value)),
  check((comparison = 'insufficient') = (detection <> 'detected' or declared_value is null)),
  check(comparison <> 'match' or detected_value = declared_value),
  check(comparison <> 'difference' or detected_value <> declared_value)
);
-- Append-only categorical evidence: never copy a rejected candidate amount.
create table public.document_field_evidence (
  process_id uuid not null,
  user_id uuid not null,
  document_type text not null,
  field text not null,
  comparison text not null check(comparison in ('match','difference')),
  decision text not null check(decision in ('accept_detected','keep_declared')),
  backing_at_confirmation text not null check(backing_at_confirmation in ('respaldado','con_diferencia')),
  confirmed_at timestamptz not null default clock_timestamp(),
  plan_id uuid not null,
  source_event_id uuid not null,
  tracking_event_id uuid,
  primary key(process_id,field),
  foreign key(process_id,user_id,document_type) references public.document_processes(id,user_id,document_type),
  foreign key(source_event_id,plan_id,user_id) references public.tracking_events(event_id,plan_id,user_id),
  foreign key(tracking_event_id,plan_id,user_id) references public.tracking_events(event_id,plan_id,user_id),
  check(public.hu23_allowed_field(document_type,field)),
  check(backing_at_confirmation = case when comparison = 'difference' and decision = 'keep_declared'
    then 'con_diferencia' else 'respaldado' end)
);
create trigger hu23_evidence_immutable before update or delete on public.document_field_evidence
  for each row execute function public.hu13_reject_mutation();

alter table public.document_processes enable row level security;
alter table public.document_candidates enable row level security;
alter table public.document_field_evidence enable row level security;
revoke all on public.document_processes, public.document_candidates, public.document_field_evidence from public,anon,authenticated,service_role;
grant select on public.document_processes, public.document_candidates, public.document_field_evidence to authenticated,service_role;
create policy "HU23 owner processes" on public.document_processes for select to authenticated
  using(user_id = auth.uid() and public.get_my_role() = 'usuario');
create policy "HU23 owner review" on public.document_candidates for select to authenticated
  using(user_id = auth.uid() and public.get_my_role() = 'usuario' and exists (
    select 1 from public.document_processes p where p.id = process_id and p.state = 'awaiting_review' and p.expires_at > clock_timestamp()));
create policy "HU23 owner evidence" on public.document_field_evidence for select to authenticated
  using(user_id = auth.uid() and public.get_my_role() = 'usuario');

create or replace function public.hu23_require_owner(p_user uuid, p_process uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from profiles where id = p_user and role = 'usuario') then
    raise exception 'not_found';
  end if;
  if p_process is not null and not exists(select 1 from document_processes where id = p_process and user_id = p_user) then
    raise exception 'not_found';
  end if;
end;
$$;
create or replace function public.hu23_read(p_user uuid,p_process uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p document_processes;
begin
  perform hu23_require_owner(p_user,p_process);
  select * into p from document_processes where id = p_process;
  return jsonb_build_object('process',to_jsonb(p),
    'candidates',case when p.state = 'awaiting_review' and p.expires_at > clock_timestamp()
      then coalesce((select jsonb_agg(to_jsonb(c) order by field) from document_candidates c where process_id = p.id),'[]') else '[]'::jsonb end,
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by field) from document_field_evidence e where process_id = p.id),'[]'));
end;
$$;
create or replace function public.hu23_create(p_user uuid,p_process uuid,p_type text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p document_processes; plan tracking_plans; rev uuid;
begin
  perform hu23_require_owner(p_user);
  perform 1 from profiles where id = p_user for update;
  select * into p from document_processes where id = p_process;
  if found then
    if p.user_id <> p_user then raise exception 'not_found'; end if;
    if p.document_type <> p_type then raise exception 'idempotency_conflict'; end if;
    return hu23_read(p_user,p_process);
  end if;
  select * into plan from tracking_plans where user_id = p_user;
  if not found then raise exception 'tracking_baseline_required'; end if;
  select event_id into rev from tracking_events where user_id = p_user order by recorded_at desc,event_id desc limit 1;
  insert into document_processes(id,user_id,document_type,plan_id,base_evaluation_id,base_revision,storage_path,expires_at)
    values(p_process,p_user,p_type,plan.id,plan.baseline_evaluation_id,rev,
      p_user::text || '/' || p_process::text || '/' || gen_random_uuid()::text,p_expires_at);
  return hu23_read(p_user,p_process);
end;
$$;

-- Internal lifecycle only; no raw extraction endpoint/grant for browser roles.
create or replace function public.hu23_lifecycle(p_user uuid,p_process uuid,p_revision integer,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare p document_processes; next_state text; item jsonb; rev uuid;
begin
  perform hu23_require_owner(p_user,p_process);
  perform 1 from profiles where id = p_user for update;
  select * into p from document_processes where id = p_process for update;
  if p_action = 'cancel' and p.state = 'cancelled' then return hu23_read(p_user,p_process); end if;
  if p_action = 'cleanup' and p.deletion_state = 'deleted' and p_payload->>'deletion_state' = 'deleted' then return hu23_read(p_user,p_process); end if;
  if p_revision is null or p.revision <> p_revision then raise exception 'stale_review'; end if;
  if p_action = 'cleanup' then
    if p.closed_at is null then raise exception 'invalid_transition'; end if;
    next_state := p_payload->>'deletion_state';
    if p.deletion_state = 'deleted' and next_state = 'deleted' then return hu23_read(p_user,p_process); end if;
    if not ((p.deletion_state in ('delete_pending','retry_required') and next_state = 'deleting')
       or (p.deletion_state = 'deleting' and next_state in ('deleted','retry_required'))) then raise exception 'invalid_transition'; end if;
    update document_processes set deletion_state = next_state, revision = revision+1,
      deletion_attempts = deletion_attempts + case when next_state = 'deleting' then 1 else 0 end,
      deletion_at = case when next_state = 'deleted' then clock_timestamp() else null end,
      storage_path = case when next_state = 'deleted' then null else storage_path end where id = p.id;
    return hu23_read(p_user,p_process);
  end if;
  if p.closed_at is not null then raise exception 'already_closed'; end if;
  if p_action not in ('cancel','fail','expire') and p.expires_at <= clock_timestamp() then raise exception 'expired'; end if;
  next_state := case p_action when 'ready' then 'ready' when 'start' then 'processing'
    when 'result' then 'awaiting_review' when 'cancel' then 'cancelled'
    when 'fail' then 'processing_failed' when 'expire' then 'expired' else null end;
  if next_state is null then raise exception 'invalid_transition'; end if;
  if not ((p.state = 'awaiting_upload' and p_action = 'ready') or (p.state = 'ready' and p_action = 'start')
    or (p.state = 'processing' and p_action = 'result') or p_action in ('cancel','fail','expire')) then raise exception 'invalid_transition'; end if;
  if p_action = 'expire' and p.expires_at > clock_timestamp() then raise exception 'invalid_transition'; end if;
  if p_action = 'fail' and coalesce(p_payload->>'failure_code','') not in ('unreadable_document','provider_unavailable','invalid_result') then raise exception 'invalid_result'; end if;
  if p_action = 'result' then
    select event_id into rev from tracking_events where user_id = p_user order by recorded_at desc,event_id desc limit 1;
    if rev is distinct from p.base_revision then raise exception 'lineage_conflict'; end if;
    if p_payload->>'document_type' is distinct from p.document_type or jsonb_typeof(p_payload->'candidates') is distinct from 'array'
       or jsonb_array_length(p_payload->'candidates') not between 1 and 2 then raise exception 'invalid_result'; end if;
    for item in select value from jsonb_array_elements(p_payload->'candidates') loop
      insert into document_candidates(process_id,user_id,document_type,field,detection,detected_value,declared_value,comparison,page)
        values(p.id,p.user_id,p.document_type,item->>'field',item->>'detection',nullif(item->'value','null'::jsonb),
          nullif(item->'declared_value','null'::jsonb),item->>'comparison',(item->>'page')::integer);
    end loop;
  end if;
  update document_processes set state = next_state, revision = revision+1,
    processing_at = case when p_action = 'start' then clock_timestamp() else processing_at end,
    review_at = case when p_action = 'result' then clock_timestamp() else review_at end,
    parser_version = case when p_action = 'result' then p_payload->>'parser_version' else parser_version end,
    normalizer_version = case when p_action = 'result' then p_payload->>'normalizer_version' else normalizer_version end,
    failure_code = case when p_action = 'fail' then p_payload->>'failure_code' else null end,
    closed_at = case when p_action in ('cancel','fail','expire') then clock_timestamp() else null end,
    deletion_state = case when p_action in ('cancel','fail','expire') then 'delete_pending' else 'not_requested' end
    where id = p.id;
  if p_action in ('cancel','fail','expire') then delete from document_candidates where process_id = p.id; end if;
  return hu23_read(p_user,p_process);
end;
$$;

create or replace function public.hu23_confirm(p_user uuid,p_process uuid,p_request jsonb,p_update jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p document_processes; c document_candidates; d jsonb; decisions jsonb; patch jsonb := '{}';
  rev uuid; event_id_value uuid; source_id uuid; item jsonb;
begin
  perform hu23_require_owner(p_user,p_process);
  perform 1 from profiles where id = p_user for update;
  select * into p from document_processes where id = p_process for update;
  if p.state = 'confirmed' then
    if p.confirm_request is distinct from p_request then raise exception 'idempotency_conflict'; end if;
    return hu23_read(p_user,p_process);
  end if;
  if p.state <> 'awaiting_review' then raise exception 'invalid_transition'; end if;
  if p.expires_at <= clock_timestamp() then raise exception 'expired'; end if;
  if p_request->>'expected_revision' is null or p.revision <> (p_request->>'expected_revision')::integer then raise exception 'stale_review'; end if;
  if p_request->'confirmed' is distinct from 'true'::jsonb or p_request->>'request_id' is null then raise exception 'invalid_request'; end if;
  decisions := p_request->'decisions';
  if jsonb_typeof(decisions) is distinct from 'array' or jsonb_array_length(decisions) <> (select count(*) from document_candidates where process_id=p.id)
    or jsonb_array_length(decisions) = 0 then raise exception 'invalid_decision'; end if;
  if (select count(distinct value->>'field') from jsonb_array_elements(decisions)) <> jsonb_array_length(decisions) then raise exception 'invalid_decision'; end if;
  select event_id into rev from tracking_events where user_id = p_user order by recorded_at desc,event_id desc limit 1;
  if rev is distinct from p.base_revision then raise exception 'lineage_conflict'; end if;
  for d in select value from jsonb_array_elements(decisions) loop
    select * into c from document_candidates where process_id=p.id and field=d->>'field';
    if not found or not hu23_allowed_field(p.document_type,d->>'field') or coalesce(d->>'decision','') not in ('accept_detected','keep_declared') then raise exception 'invalid_decision'; end if;
    if d->>'decision' = 'accept_detected' then
      if c.detection <> 'detected' or c.comparison = 'insufficient' then raise exception 'invalid_decision'; end if;
      if c.comparison = 'difference' then patch := patch || jsonb_build_object(c.field,c.detected_value); end if;
    end if;
  end loop;
  if patch <> '{}' then
    item := p_update->'records'->'events'->0;
    if p_update is null or jsonb_typeof(p_update) is distinct from 'object'
      or p_update->'records'->'evaluations' is distinct from '[]'::jsonb
      or p_update->'records'->'goals' is distinct from '[]'::jsonb
      or nullif(p_update->'records'->'plan','null'::jsonb) is not null
      or jsonb_array_length(p_update->'records'->'events') <> 1
      or item->>'event_kind' is distinct from 'data_update' or nullif(item->'evaluation_id','null'::jsonb) is not null
      or item->'patch' is distinct from patch or p_update->'command'->'patch' is distinct from patch
      or (item->>'previous')::uuid is distinct from rev then raise exception 'invalid_update'; end if;
    -- HU13 serializes and appends the source event, with no evaluations/market/scorer.
    perform hu13_commit(p_user,p_update->'command',rev,p_update->'records');
    event_id_value := (item->>'event_id')::uuid;
  elsif p_update is not null and p_update <> 'null'::jsonb then raise exception 'invalid_update';
  end if;
  source_id := coalesce(event_id_value,p.base_revision);
  for d in select value from jsonb_array_elements(decisions) loop
    select * into c from document_candidates where process_id=p.id and field=d->>'field';
    if c.comparison <> 'insufficient' then
      insert into document_field_evidence(process_id,user_id,document_type,field,comparison,decision,backing_at_confirmation,plan_id,source_event_id,tracking_event_id)
      values(p.id,p_user,p.document_type,c.field,c.comparison,d->>'decision',
        case when c.comparison='difference' and d->>'decision'='keep_declared' then 'con_diferencia' else 'respaldado' end,
        p.plan_id,source_id,event_id_value);
    end if;
  end loop;
  update document_processes set state='confirmed',closed_at=clock_timestamp(),deletion_state='delete_pending',
    revision=revision+1,confirm_request=p_request,tracking_event_id=event_id_value where id=p.id;
  delete from document_candidates where process_id=p.id;
  return hu23_read(p_user,p_process);
end;
$$;

-- Default PUBLIC EXECUTE would allow fabricated internal OCR/confirmation records.
revoke all on function public.hu23_allowed_field(text,text),public.hu23_valid_value(text,jsonb),
  public.hu23_require_owner(uuid,uuid),public.hu23_read(uuid,uuid),public.hu23_create(uuid,uuid,text,timestamptz),
  public.hu23_lifecycle(uuid,uuid,integer,text,jsonb),public.hu23_confirm(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
-- Constraint helpers are harmless, read-free and necessary for evaluating constraints.
grant execute on function public.hu23_allowed_field(text,text),public.hu23_valid_value(text,jsonb) to service_role;
grant execute on function public.hu23_read(uuid,uuid),public.hu23_create(uuid,uuid,text,timestamptz),
  public.hu23_lifecycle(uuid,uuid,integer,text,jsonb),public.hu23_confirm(uuid,uuid,jsonb,jsonb) to service_role;
commit;
