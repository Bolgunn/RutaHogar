-- Non-destructive activation rollback. Keep evidence/lineage, owner reads and cleanup.
begin;
revoke execute on function public.hu23_create(uuid,uuid,text,timestamptz),
  public.hu23_confirm(uuid,uuid,jsonb,jsonb) from service_role;
create or replace function public.hu23_lifecycle(p_user uuid,p_process uuid,p_revision integer,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare p document_processes; next_state text; item jsonb; rev uuid;
begin
  if p_action not in ('cancel','fail','expire','cleanup') then raise exception 'hu23_disabled'; end if;
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

-- Existing sessions may still be closed and deletion acknowledged by authorized backend.
revoke all on function public.hu23_lifecycle(uuid,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.hu23_lifecycle(uuid,uuid,integer,text,jsonb) to service_role;
commit;
