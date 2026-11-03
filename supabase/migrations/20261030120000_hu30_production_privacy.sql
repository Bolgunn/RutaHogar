-- Forward-only hardening after the production migrations through 20261029120000.
-- No financial rows, formula, role assignment or historical migration is changed.
begin;

-- RLS and immutable-row triggers do not protect TRUNCATE.
revoke truncate, references, trigger on public.profiles, public.evaluations,
  public.scoring_history, public.evaluation_events, public.tracking_plans,
  public.tracking_events, public.improvement_goals, public.improvement_goal_events,
  public.mortgage_scenarios from public, anon, authenticated;

-- M7 recreates the contact RPC. Preserve its production service-role contract
-- explicitly rather than relying on the migration owner's default privileges.
grant execute on function public.list_lead_contacts(uuid[]) to service_role;

-- Preserve the installed HU15 implementation, including its later corrections.
-- Its raw snapshots are internal only; browser callers use the wrapper below.
do $$ begin
  if to_regprocedure('public.hu30_commercial_funnel_facts_raw()') is null then
    alter function public.commercial_funnel_facts() rename to hu30_commercial_funnel_facts_raw;
  end if;
end; $$;
revoke all on function public.hu30_commercial_funnel_facts_raw() from public, anon, authenticated;
grant execute on function public.hu30_commercial_funnel_facts_raw() to service_role;

create or replace function public.commercial_funnel_facts()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare document jsonb; fact jsonb; evaluation jsonb; facts jsonb := '[]'::jsonb;
begin
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"},{"Pragma":"no-cache"},{"Vary":"Authorization"}]', true);
  -- The existing implementation checks Auth, tenant, role and project membership.
  document := public.hu30_commercial_funnel_facts_raw();
  for fact in select value from jsonb_array_elements(coalesce(document->'facts','[]'::jsonb)) loop
    evaluation := fact->'evaluacion_actual';
    if public.hu30_has_complement(evaluation) then
      -- HU15 is not an authorized financial-detail projection. Keep only the
      -- historical score/classification; no derived capacity, narratives or input.
      fact := jsonb_set(fact,'{evaluacion_actual}',jsonb_build_object(
        'input','{}'::jsonb,'onboarding','{}'::jsonb,
        'result',jsonb_strip_nulls(jsonb_build_object(
          'score',evaluation->'result'->'score',
          'classification',evaluation->'result'->'classification',
          'algorithm_version',evaluation->'result'->'algorithm_version')),
        'co_debtor_visibility','hidden'));
    end if;
    facts := facts || jsonb_build_array(fact);
  end loop;
  return jsonb_set(document,'{facts}',facts);
end; $$;
revoke all on function public.commercial_funnel_facts() from public, anon, authenticated;
grant execute on function public.commercial_funnel_facts() to authenticated, service_role;

-- Private input for server-side ALG-10/ALG-18. Never grant this RPC to a browser.
create or replace function public.hu30_funnel_can_view_snapshot(p_lead uuid, p_snapshot jsonb, p_at timestamptz)
returns boolean language sql stable security definer set search_path=public as $$
  select not public.hu30_has_complement(p_snapshot) or exists (
    select 1 from public.co_debtor_confirmations c
    join public.co_debtor_invitations i on i.id=c.invitation_id
    where c.id::text=p_snapshot->'provenance'->>'co_debtor_confirmation_id'
      and i.lead_id=p_lead and (
        (i.status='confirmed' and public.hu30_closure_at(i.id) is null)
        or public.hu30_closure_at(i.id)+interval '30 days'>p_at));
$$;
revoke all on function public.hu30_funnel_can_view_snapshot(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.hu30_funnel_can_view_snapshot(uuid,jsonb,timestamptz) to service_role;

-- STABLE keeps facts, latest provenance and closure in one statement snapshot.
create or replace function public.hu30_commercial_funnel_source(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare previous_actor text:=current_setting('request.jwt.claim.sub',true);
  document jsonb; facts jsonb:='[]'::jsonb; fact jsonb; snapshot jsonb;
  scope uuid[]; tenant uuid; subject record; seen integer:=0;
  cutoff timestamptz; refresh_at timestamptz;
begin
  -- p_actor is supplied only by the server after Auth.getUser, never by a client RPC.
  perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
  document:=public.hu30_commercial_funnel_facts_raw();
  tenant:=public.get_my_inmobiliaria();
  select coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[]) into scope
    from jsonb_array_elements(document->'proyectos');
  -- Same subject universe/order as the retained HU15 RPC, including stage-only links.
  for subject in
    select p.id,row_number() over(order by p.id) ordinal from public.profiles p
    where p.role='usuario' and exists(select 1 from public.evaluations e where e.user_id=p.id)
      and exists(select 1 from unnest(scope) project_id where
        public.lead_belongs_to_proyecto(p.id,project_id) or exists(
          select 1 from public.commercial_stage_events ev where ev.subject_user_id=p.id
            and ev.inmobiliaria_id=tenant and ev.proyecto_id=project_id))
    order by p.id
  loop
    seen:=seen+1;
    fact:=document->'facts'->(seen-1);
    if fact is null or fact->>'lead_id' is distinct from subject.ordinal::text then
      raise exception 'funnel_source_mismatch';
    end if;
    select e.financial_data into snapshot from public.evaluations e where e.user_id=subject.id
      order by e.created_at desc,e.id desc limit 1;
    if not public.hu30_funnel_can_view_snapshot(subject.id,snapshot,(document->>'now')::timestamptz) then
      fact:=jsonb_set(fact,'{evaluacion_actual}',jsonb_build_object(
        'input','{}'::jsonb,'onboarding','{}'::jsonb,'result','{}'::jsonb,
        'co_debtor_visibility','hidden'));
    elsif public.hu30_has_complement(snapshot) then
      select public.hu30_closure_at(i.id)+interval '30 days' into cutoff
        from public.co_debtor_confirmations c join public.co_debtor_invitations i on i.id=c.invitation_id
        where c.id::text=snapshot->'provenance'->>'co_debtor_confirmation_id' and i.lead_id=subject.id;
      if cutoff>(document->>'now')::timestamptz and (refresh_at is null or cutoff<refresh_at) then refresh_at:=cutoff; end if;
    end if;
    facts:=facts||jsonb_build_array(fact);
  end loop;
  if seen<>jsonb_array_length(document->'facts') then raise exception 'funnel_source_mismatch'; end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return jsonb_set(document,'{facts}',facts)||jsonb_build_object('refresh_at',refresh_at);
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  raise;
end; $$;
revoke all on function public.hu30_commercial_funnel_source(uuid) from public,anon,authenticated;
grant execute on function public.hu30_commercial_funnel_source(uuid) to service_role;

commit;
