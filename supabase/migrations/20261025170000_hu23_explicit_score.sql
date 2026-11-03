-- HU23 T6. A durable explicit intent wraps the UNCHANGED normal HU13 scoring commit.
begin;
create function public.hu23_score_enabled()
returns boolean language sql immutable set search_path=public,pg_temp as $$ select true; $$;

create table public.document_score_requests(
 user_id uuid not null references public.profiles(id),
 request_id uuid not null,
 plan_id uuid not null,
 revision uuid not null,
 previous_event_id uuid not null,
 validation_token uuid not null,
 evidence_count bigint not null check(evidence_count>0),
 sources jsonb not null check(jsonb_typeof(sources)='array' and jsonb_array_length(sources) between 1 and 4),
 reference_evaluation_id uuid,
 event_id uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 evaluation_id uuid,
 completed_at timestamptz,
 primary key(user_id,request_id),
 unique(user_id,revision,validation_token),
 foreign key(revision,plan_id,user_id) references public.tracking_events(event_id,plan_id,user_id),
 foreign key(previous_event_id,plan_id,user_id) references public.tracking_events(event_id,plan_id,user_id),
 foreign key(reference_evaluation_id,user_id) references public.evaluations(id,user_id),
 foreign key(evaluation_id,user_id) references public.evaluations(id,user_id),
 check((evaluation_id is null)=(completed_at is null))
);
alter table public.document_score_requests enable row level security;
revoke all on public.document_score_requests from public,anon,authenticated,service_role;
grant select on public.document_score_requests to service_role;

create function public.hu23_score_context(p_user uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform hu23_require_owner(p_user);
 return jsonb_build_object('user_id',p_user,'tracking',hu13_read(p_user),'evidence',coalesce((
   select jsonb_agg(to_jsonb(e)||jsonb_build_object('deletion_state',p.deletion_state)
     order by e.confirmed_at,e.process_id,e.field)
     from document_field_evidence e join document_processes p on p.id=e.process_id
     where e.user_id=p_user and p.state='confirmed'),'[]'::jsonb));
end;
$$;

create function public.hu23_score_intent(p_user uuid,p_action text,p_request jsonb,p_context jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j document_score_requests; rev uuid; item jsonb; amount bigint;
begin
 perform hu23_require_owner(p_user);
 if p_action not in ('find','prepare') then raise exception 'invalid_request'; end if;
 perform 1 from profiles where id=p_user for update;
 select * into j from document_score_requests where user_id=p_user and request_id=(p_request->>'request_id')::uuid for update;
 if found then
   if j.revision is distinct from (p_request->>'expected_revision')::uuid
      or j.validation_token is distinct from (p_request->>'validation_token')::uuid then raise exception 'idempotency_conflict'; end if;
 else
   select * into j from document_score_requests where user_id=p_user
     and revision=(p_request->>'expected_revision')::uuid and validation_token=(p_request->>'validation_token')::uuid for update;
 end if;
 if j.request_id is not null then
   if p_action='prepare' and j.completed_at is null and not hu23_score_enabled() then raise exception 'score_update_disabled'; end if;
   return to_jsonb(j)||jsonb_build_object('result',(select command_result from tracking_events where event_id=j.event_id and user_id=p_user));
 end if;
 if p_action='find' then return 'null'::jsonb; end if;
 if p_action<>'prepare' then raise exception 'invalid_request'; end if;
 if not hu23_score_enabled() then raise exception 'score_update_disabled'; end if;
 select event_id into rev from tracking_events where user_id=p_user order by recorded_at desc,event_id desc limit 1;
 select count(*) into amount from document_field_evidence where user_id=p_user;
 if rev is distinct from (p_request->>'expected_revision')::uuid
    or amount is distinct from (p_context->>'evidence_count')::bigint then raise exception 'stale_score_state'; end if;
 if jsonb_typeof(p_context->'sources') is distinct from 'array'
    or jsonb_array_length(p_context->'sources') not between 1 and 4 then raise exception 'no_score_pending'; end if;
 for item in select value from jsonb_array_elements(p_context->'sources') loop
   if item is distinct from jsonb_build_object('process_id',item->>'process_id','field',item->>'field')
      or not exists(select 1 from document_field_evidence e join document_processes p on p.id=e.process_id
       where e.user_id=p_user and e.process_id=(item->>'process_id')::uuid and e.field=item->>'field'
         and e.backing_at_confirmation='respaldado' and p.state='confirmed' and p.deletion_state='deleted')
     then raise exception 'invalid_decision'; end if;
 end loop;
 insert into document_score_requests(user_id,request_id,plan_id,revision,previous_event_id,validation_token,
   evidence_count,sources,reference_evaluation_id)
 values(p_user,(p_request->>'request_id')::uuid,(p_context->>'plan_id')::uuid,rev,
   (p_context->>'previous_event_id')::uuid,(p_request->>'validation_token')::uuid,amount,
   p_context->'sources',(p_context->>'reference_evaluation_id')::uuid) returning * into j;
 return to_jsonb(j);
end;
$$;

create function public.hu23_score_commit(p_user uuid,p_event uuid,p_command jsonb,p_revision uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j document_score_requests; rev uuid; amount bigint; ev jsonb; evaluation jsonb; result jsonb;
begin
 perform hu23_require_owner(p_user);
 perform 1 from profiles where id=p_user for update;
 select * into j from document_score_requests where user_id=p_user and event_id=p_event for update;
 if not found then raise exception 'not_found'; end if;
 if p_command->>'event_id' is distinct from j.event_id::text or p_command->>'reason'<>'hu23_datos_validados'
   or p_command->>'event_kind'<>'evaluation' or p_command->'patch' is distinct from '{}'::jsonb
   or (p_command->>'previous_event_id')::uuid is distinct from j.previous_event_id
   or (p_command->>'effective_at')::timestamptz is distinct from j.created_at then raise exception 'invalid_update'; end if;
 if j.completed_at is not null then
   return (select command_result from tracking_events where event_id=j.event_id and user_id=p_user);
 end if;
 if not hu23_score_enabled() then raise exception 'score_update_disabled'; end if;
 select event_id into rev from tracking_events where user_id=p_user order by recorded_at desc,event_id desc limit 1;
 select count(*) into amount from document_field_evidence where user_id=p_user;
 if rev is distinct from j.revision or p_revision is distinct from j.revision or amount<>j.evidence_count then
   raise exception 'stale_score_state'; end if;
 if jsonb_array_length(p_records->'events')<>1 or jsonb_array_length(p_records->'evaluations')<>1
    or p_records->'plan' is distinct from 'null'::jsonb or p_records->'goals' is distinct from '[]'::jsonb then raise exception 'invalid_update'; end if;
 ev:=p_records->'events'->0; evaluation:=p_records->'evaluations'->0;
 if ev->>'event_kind'<>'evaluation' or ev->>'reason'<>'hu23_datos_validados'
    or ev->'patch' is distinct from '{}'::jsonb or ev->>'event_id' is distinct from j.event_id::text
    or ev->>'evaluation_id' is distinct from evaluation->>'id'
    or ev->'provenance'->'hu23_document_validation'->'evidence' is distinct from j.sources
    or evaluation->'provenance'->'hu23_document_validation'->'evidence' is distinct from j.sources then raise exception 'invalid_update'; end if;
 result:=hu13_commit(p_user,p_command,j.revision,p_records);
 update document_score_requests set evaluation_id=(evaluation->>'id')::uuid,completed_at=clock_timestamp()
   where user_id=p_user and request_id=j.request_id;
 return result;
end;
$$;
revoke all on function public.hu23_score_enabled(),public.hu23_score_context(uuid),
 public.hu23_score_intent(uuid,text,jsonb,jsonb),public.hu23_score_commit(uuid,uuid,jsonb,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hu23_score_enabled(),public.hu23_score_context(uuid),
 public.hu23_score_intent(uuid,text,jsonb,jsonb),public.hu23_score_commit(uuid,uuid,jsonb,uuid,jsonb) to service_role;
commit;
