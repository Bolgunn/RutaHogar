-- Corrective: same output as 20261030120000, without the per-lead overhead.
-- The loop re-extracted document->'facts' and rebuilt facts||[fact] on every
-- lead, copying the whole multi-MB array each pass, and walked each snapshot
-- with hu30_has_complement twice. With ~200 leads that ran ~5.8 s against the
-- 8 s authenticator statement_timeout, so the Edge Function answered
-- metrics_unavailable. Facts, ordering, redaction and grants are unchanged.
begin;

create or replace function public.hu30_commercial_funnel_source(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare previous_actor text:=current_setting('request.jwt.claim.sub',true);
  document jsonb; raw_facts jsonb; facts jsonb[]:='{}'; fact jsonb; snapshot jsonb;
  scope uuid[]; tenant uuid; subject record; seen integer:=0; source_now timestamptz; has_complement boolean;
  cutoff timestamptz; refresh_at timestamptz;
begin
  -- p_actor is supplied only by the server after Auth.getUser, never by a client RPC.
  perform set_config('request.jwt.claim.sub',coalesce(p_actor::text,''),true);
  document:=public.hu30_commercial_funnel_facts_raw();
  raw_facts:=coalesce(document->'facts','[]'::jsonb);
  source_now:=(document->>'now')::timestamptz;
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
    fact:=raw_facts->(seen-1);
    if fact is null or fact->>'lead_id' is distinct from subject.ordinal::text then
      raise exception 'funnel_source_mismatch';
    end if;
    select e.financial_data into snapshot from public.evaluations e where e.user_id=subject.id
      order by e.created_at desc,e.id desc limit 1;
    -- can_view is true for every snapshot without a complement, so the full
    -- recursive walk runs once per lead instead of twice.
    has_complement:=public.hu30_has_complement(snapshot);
    if has_complement and not public.hu30_funnel_can_view_snapshot(subject.id,snapshot,source_now) then
      fact:=jsonb_set(fact,'{evaluacion_actual}',jsonb_build_object(
        'input','{}'::jsonb,'onboarding','{}'::jsonb,'result','{}'::jsonb,
        'co_debtor_visibility','hidden'));
    elsif has_complement then
      select public.hu30_closure_at(i.id)+interval '30 days' into cutoff
        from public.co_debtor_confirmations c join public.co_debtor_invitations i on i.id=c.invitation_id
        where c.id::text=snapshot->'provenance'->>'co_debtor_confirmation_id' and i.lead_id=subject.id;
      if cutoff>source_now and (refresh_at is null or cutoff<refresh_at) then refresh_at:=cutoff; end if;
    end if;
    -- array_append on a local array is done in place; jsonb || jsonb copies.
    facts:=array_append(facts,fact);
  end loop;
  if seen<>jsonb_array_length(raw_facts) then raise exception 'funnel_source_mismatch'; end if;
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  return jsonb_set(document,'{facts}',to_jsonb(facts))||jsonb_build_object('refresh_at',refresh_at);
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(previous_actor,''),true);
  raise;
end; $$;
revoke all on function public.hu30_commercial_funnel_source(uuid) from public,anon,authenticated;
grant execute on function public.hu30_commercial_funnel_source(uuid) to service_role;

commit;
