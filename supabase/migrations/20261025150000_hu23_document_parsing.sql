-- HU23 T4. No new financial facts: temporary candidates + durable remote deletion duty.
begin;
alter table public.document_ocr_jobs drop constraint document_ocr_jobs_lease_kind_check;
alter table public.document_ocr_jobs add constraint document_ocr_jobs_lease_kind_check
 check(lease_kind in ('submit','poll','delete','parse'));
alter table public.document_ocr_jobs add column parse_attempts integer not null default 0 check(parse_attempts>=0);

create function public.hu23_parsing_enabled()
returns boolean language sql immutable set search_path=public,pg_temp as $$ select true; $$;

create function public.hu23_parse_control(p_user uuid,p_process uuid,p_action text,p_token uuid default null,p_delay integer default 2)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p document_processes; j document_ocr_jobs; stamp timestamptz:=clock_timestamp(); claimed boolean:=false;
begin
 perform hu23_require_owner(p_user,p_process);
 perform 1 from profiles where id=p_user for update;
 select * into p from document_processes where id=p_process for update;
 select * into j from document_ocr_jobs where process_id=p.id for update;
 if p_action not in ('claim','retry','release','fail') then raise exception 'invalid_transition'; end if;
 if p_action='claim' and not hu23_parsing_enabled() then raise exception 'parsing_disabled'; end if;
 if p.closed_at is null and p.expires_at<=stamp then
   perform hu23_lifecycle(p_user,p.id,p.revision,'expire','{}');
   select * into p from document_processes where id=p_process;
 end if;
 if p_action='claim' then
   if p.state='awaiting_review' or p.closed_at is not null then null;
   elsif p.state<>'ocr_ready' or j.job_state is distinct from 'succeeded' or j.deletion_state<>'not_requested' then
     raise exception 'invalid_transition';
   elsif coalesce(j.lease_until,stamp)<=stamp and j.next_attempt_at<=stamp then
     if j.parse_attempts>=5 then
       perform hu23_lifecycle(p_user,p.id,p.revision,'fail','{"failure_code":"provider_unavailable"}');
     else
       update document_ocr_jobs set lease_kind='parse',lease_token=gen_random_uuid(),lease_until=stamp+interval '45 seconds',
         parse_attempts=parse_attempts+1 where process_id=p.id;
       claimed:=true;
     end if;
   end if;
 else
   if j.lease_kind is distinct from 'parse' or j.lease_token is distinct from p_token then raise exception 'stale_review'; end if;
   update document_ocr_jobs set lease_kind=null,lease_token=null,lease_until=null,
     next_attempt_at=case when p_action='release' then stamp else stamp+make_interval(secs=>greatest(2,least(86400,p_delay))) end where process_id=p.id;
   if p_action='fail' and p.closed_at is null then
     perform hu23_lifecycle(p_user,p.id,p.revision,'fail','{"failure_code":"invalid_result"}');
   end if;
 end if;
 select * into p from document_processes where id=p_process;
 select * into j from document_ocr_jobs where process_id=p_process;
 return jsonb_build_object('process',to_jsonb(p),'job',case when j.process_id is null then null else to_jsonb(j) end,'claimed',claimed);
end;
$$;
revoke all on function public.hu23_parsing_enabled(),public.hu23_parse_control(uuid,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.hu23_parsing_enabled(),public.hu23_parse_control(uuid,uuid,text,uuid,integer) to service_role;

-- Extend the existing lifecycle only for OCR-ready consumption, fencing and atomic deletion duty.
create or replace function public.hu23_lifecycle(p_user uuid,p_process uuid,p_revision integer,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare p document_processes; j document_ocr_jobs; next_state text; item jsonb; rev uuid;
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
    or (p.state in ('processing','ocr_ready') and p_action = 'result') or p_action in ('cancel','fail','expire')) then raise exception 'invalid_transition'; end if;
  if p_action = 'expire' and p.expires_at > clock_timestamp() then raise exception 'invalid_transition'; end if;
  if p_action = 'fail' and coalesce(p_payload->>'failure_code','') not in ('unreadable_document','provider_unavailable','invalid_result') then raise exception 'invalid_result'; end if;
  if p_action = 'result' then
    if not hu23_parsing_enabled() then raise exception 'parsing_disabled'; end if;
    select * into j from document_ocr_jobs where process_id=p.id for update;
    if found and (p.state<>'ocr_ready' or j.job_state<>'succeeded' or j.deletion_state<>'not_requested'
      or j.lease_kind is distinct from 'parse' or coalesce(j.lease_until<=clock_timestamp(),true)
      or j.lease_token is distinct from (p_payload->>'parse_token')::uuid) then raise exception 'stale_review'; end if;
    if p.state='ocr_ready' and j.process_id is null then raise exception 'invalid_transition'; end if;
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
  if p_action='result' and j.process_id is not null then
    update document_ocr_jobs set deletion_state='delete_pending',next_attempt_at=clock_timestamp(),
      lease_kind=null,lease_token=null,lease_until=null where process_id=p.id;
  end if;
  if p_action in ('cancel','fail','expire') then delete from document_candidates where process_id = p.id; end if;
  return hu23_read(p_user,p_process);
end;
$$;

commit;
