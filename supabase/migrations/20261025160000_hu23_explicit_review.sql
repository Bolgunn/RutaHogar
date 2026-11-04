-- HU23 T5: explicit actionable decisions; unresolved fields never receive fabricated choices.
begin;
create function public.hu23_confirmation_enabled()
returns boolean language sql immutable set search_path=public,pg_temp as $$ select true; $$;
revoke all on function public.hu23_confirmation_enabled() from public,anon,authenticated;
grant execute on function public.hu23_confirmation_enabled() to service_role;

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
  if not hu23_confirmation_enabled() then raise exception 'confirmation_disabled'; end if;
  if p.state <> 'awaiting_review' then raise exception 'invalid_transition'; end if;
  if p.expires_at <= clock_timestamp() then raise exception 'expired'; end if;
  if p_request->>'expected_revision' is null or p.revision <> (p_request->>'expected_revision')::integer then raise exception 'stale_review'; end if;
  if p_request->'confirmed' is distinct from 'true'::jsonb or p_request->>'request_id' is null then raise exception 'invalid_request'; end if;
  decisions := p_request->'decisions';
  if jsonb_typeof(decisions) is distinct from 'array' or jsonb_array_length(decisions) <> (select count(*) from document_candidates where process_id=p.id
       and detection='detected' and comparison in ('match','difference')) then raise exception 'invalid_decision'; end if;
  if (select count(distinct value->>'field') from jsonb_array_elements(decisions)) <> jsonb_array_length(decisions) then raise exception 'invalid_decision'; end if;
  select event_id into rev from tracking_events where user_id = p_user order by recorded_at desc,event_id desc limit 1;
  if rev is distinct from p.base_revision then raise exception 'lineage_conflict'; end if;
  for d in select value from jsonb_array_elements(decisions) loop
    select * into c from document_candidates where process_id=p.id and field=d->>'field';
    if not found or c.detection<>'detected' or c.comparison='insufficient' or not hu23_allowed_field(p.document_type,d->>'field') or coalesce(d->>'decision','') not in ('accept_detected','keep_declared') then raise exception 'invalid_decision'; end if;
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

commit;
