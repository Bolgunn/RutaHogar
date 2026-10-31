-- Raw co-debtor snapshots must be read through authenticated projections.
begin;

create or replace function public.hu30_has_complement(value jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(value->'input'->>'complemento_renta','false') = 'true'
    or value->'provenance'->>'co_debtor_confirmation_id' is not null
    or coalesce(value->'input_snapshot'->>'complemento_renta','false') = 'true'
    or coalesce(value->>'complemento_renta','false') = 'true'
    or coalesce(value->'result'->'financial_indicators'->>'ingreso_complementario_considerado','0') <> '0'
    or coalesce(value->'result_snapshot'->'financial_indicators'->>'ingreso_complementario_considerado','0') <> '0'
    or exists (select 1 from jsonb_each(coalesce(value->'input',value->'input_snapshot',value,'{}'::jsonb)) f
      where f.key in ('ingreso_mensual_complementario','deuda_mensual_complementario',
        'tipo_contrato_complementario','continuidad_laboral_complementario','morosidad_complementario',
        'relacion_complementario') and f.value <> 'null'::jsonb);
$$;

drop policy if exists "Evaluations select own" on public.evaluations;
drop policy if exists "Evaluations select sales" on public.evaluations;
create policy "Evaluations select own" on public.evaluations for select to authenticated
  using (auth.uid() = user_id and not public.hu30_has_complement(financial_data));
drop policy if exists "Scoring history select staff" on public.scoring_history;
drop policy if exists "Scoring history select own" on public.scoring_history;
create policy "Scoring history select own" on public.scoring_history for select to authenticated
  using (auth.uid() = user_id and not public.hu30_has_complement(snapshot));
drop policy if exists "Evaluation events select staff" on public.evaluation_events;
-- Annotation payloads can contain financial narratives. Only the projection reads them.
revoke select on public.evaluation_events, public.tracking_events, public.tracking_plans from authenticated, anon;
revoke insert, update, delete on public.evaluations, public.scoring_history from authenticated, anon;
revoke all on public.co_debtor_invitations, public.co_debtor_confirmations,
  public.co_debtor_consent_events from authenticated, anon;
grant execute on function public.hu30_has_complement(jsonb) to authenticated;

-- HU17 persists another financial snapshot. Its owner-only reads must honor
-- the same closure, without depending on visibility of the raw evaluations table.
create or replace function public.hu30_owner_can_view_evaluation(p_evaluation_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.evaluations e where e.id=p_evaluation_id and e.user_id=auth.uid()
    and (not public.hu30_has_complement(e.financial_data) or exists (
      select 1 from public.co_debtor_confirmations c join public.co_debtor_invitations i on i.id=c.invitation_id
      where c.id::text=e.financial_data->'provenance'->>'co_debtor_confirmation_id'
        and i.lead_id=e.user_id and (
          (i.status='confirmed' and public.hu30_closure_at(i.id) is null)
          or public.hu30_closure_at(i.id)+interval '30 days' > clock_timestamp())
    )));
$$;
revoke all on function public.hu30_owner_can_view_evaluation(uuid) from public,anon;
grant execute on function public.hu30_owner_can_view_evaluation(uuid) to authenticated,service_role;
drop policy if exists "Mortgage scenarios select own" on public.mortgage_scenarios;
create policy "Mortgage scenarios select own" on public.mortgage_scenarios for select to authenticated
  using (auth.uid()=user_id and public.hu30_owner_can_view_evaluation(evaluation_id));
create or replace function public.hu30_owner_has_evaluation_consent(p_evaluation_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.evaluations where id=p_evaluation_id and user_id=auth.uid()
    and coalesce(financial_data->'input'->>'consentimiento','false')='true');
$$;
revoke all on function public.hu30_owner_has_evaluation_consent(uuid) from public,anon;
grant execute on function public.hu30_owner_has_evaluation_consent(uuid) to authenticated;
drop policy if exists "Mortgage scenarios insert own consented evaluation" on public.mortgage_scenarios;
create policy "Mortgage scenarios insert own consented evaluation" on public.mortgage_scenarios for insert to authenticated
  with check (auth.uid()=user_id and public.hu30_owner_can_view_evaluation(evaluation_id)
    and public.hu30_owner_has_evaluation_consent(evaluation_id));
create or replace function public.hu30_list_mortgage_scenarios(p_evaluation_id uuid)
returns setof public.mortgage_scenarios language sql stable security definer set search_path=public as $$
  select (jsonb_populate_record(null::public.mortgage_scenarios,
    to_jsonb(s) || case when public.hu30_owner_can_view_evaluation(s.evaluation_id) then '{}'::jsonb
    else jsonb_build_object('input_snapshot','{}'::jsonb,'result_snapshot',
      jsonb_build_object('financial_status','Histórico no disponible')) end)).*
  from public.mortgage_scenarios s where s.user_id=auth.uid() and s.evaluation_id=p_evaluation_id
  order by s.created_at desc;
$$;
revoke all on function public.hu30_list_mortgage_scenarios(uuid) from public,anon;
grant execute on function public.hu30_list_mortgage_scenarios(uuid) to authenticated;

-- Generated goals can contain financial narratives from their source evaluation.
drop policy if exists "Improvement goals select own" on public.improvement_goals;
create policy "Improvement goals select own" on public.improvement_goals for select to authenticated
  using (auth.uid()=user_id and (tracking_plan_id is null or public.hu30_owner_can_view_evaluation(evaluation_id)));
create or replace function public.hu30_list_owner_goals()
returns setof public.improvement_goals language sql stable security definer set search_path=public as $$
  select (jsonb_populate_record(null::public.improvement_goals,to_jsonb(g) ||
    case when g.tracking_plan_id is null or public.hu30_owner_can_view_evaluation(g.evaluation_id) then '{}'::jsonb
    else jsonb_build_object('title','Meta histórica','description','','progress_data','{"hu30_visibility":"hidden"}'::jsonb) end)).*
    from public.improvement_goals g where g.user_id=auth.uid() order by g.created_at;
$$;
revoke all on function public.hu30_list_owner_goals() from public,anon;
grant execute on function public.hu30_list_owner_goals() to authenticated;

create or replace function public.hu30_guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_role text; actor_tenant uuid;
begin
  -- PostgREST SET ROLE survives SECURITY DEFINER; current_user would not.
  if current_setting('role',true) in ('service_role','postgres','none')
      and (current_setting('role',true) <> 'none' or session_user = 'postgres') then return new; end if;
  if tg_op = 'INSERT' then
    if new.role <> 'usuario' or new.inmobiliaria_id is not null then
      raise exception 'profile_privilege_change_forbidden' using errcode='42501';
    end if;
    return new;
  end if;
  if new.role is not distinct from old.role and new.inmobiliaria_id is not distinct from old.inmobiliaria_id then
    return new;
  end if;
  select role,inmobiliaria_id into actor_role,actor_tenant from public.profiles where id=auth.uid();
  if auth.uid() is distinct from old.id and actor_role = 'admin' and actor_tenant is null then return new; end if;
  -- Existing tenant admins may manage executive assignments inside their tenant,
  -- but cannot mint a role or move a profile out of its organization.
  if auth.uid() is distinct from old.id and actor_role in ('admin','admin_inmobiliario')
      and actor_tenant is not null and old.role='ejecutivo' and new.role='ejecutivo'
      and (old.inmobiliaria_id is null or old.inmobiliaria_id=actor_tenant)
      and new.inmobiliaria_id=actor_tenant then return new; end if;
  -- resolve_pending_executives may attach an existing executive (including
  -- the caller) to an administrator-created pending assignment. It cannot
  -- promote a lead or grant membership in an arbitrary tenant.
  if old.role='ejecutivo' and new.role='ejecutivo' and old.inmobiliaria_id is null
      and new.inmobiliaria_id is not null and actor_role in ('admin','ejecutivo')
      and exists (select 1 from public.proyecto_ejecutivos pe
        join public.proyectos pr on pr.id=pe.proyecto_id join auth.users u on u.id=old.id
        where pe.estado='pendiente' and lower(u.email)=lower(pe.ejecutivo_email)
          and pr.inmobiliaria_id=new.inmobiliaria_id
          and (actor_tenant is null or actor_tenant=new.inmobiliaria_id)) then return new; end if;
  raise exception 'profile_privilege_change_forbidden' using errcode='42501';
end;
$$;
drop trigger if exists hu30_profile_privileges on public.profiles;
create trigger hu30_profile_privileges before insert or update on public.profiles
  for each row execute function public.hu30_guard_profile_privileges();
revoke all on function public.hu30_guard_profile_privileges() from public,anon,authenticated;

commit;
