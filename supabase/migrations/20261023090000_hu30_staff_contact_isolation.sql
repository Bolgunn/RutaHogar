-- Prerequisite: existing 20260922000000 profile names migration.
-- No data backfill, financial recalculation or historical migration edits.
begin;
-- HU30 T9B: one server-side scope for contact and related history readers.
create or replace function public.hu30_staff_can_read_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles target
    where target.id = p_lead and target.role = 'usuario'
      and (
        (public.get_my_role() = 'admin' and public.get_my_inmobiliaria() is null)
        or (public.get_my_role() in ('ejecutivo','admin','admin_inmobiliario')
          and public.get_my_inmobiliaria() is not null
          and public.lead_belongs_to_inmobiliaria(target.id, public.get_my_inmobiliaria()))
      )
  );
$$;
revoke all on function public.hu30_staff_can_read_lead(uuid) from public,anon;
grant execute on function public.hu30_staff_can_read_lead(uuid) to authenticated;

drop function if exists public.list_lead_contacts(uuid[]);

create or replace function public.list_lead_contacts(p_user_ids uuid[])
returns table (
  id uuid,
  nombre text,
  apellido_paterno text,
  apellido_materno text,
  full_name text,
  phone text,
  rut text,
  reliability_status text,
  email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"},{"Pragma":"no-cache"},{"Vary":"Authorization"}]', true);
  return query
  select p.id, p.nombre, p.apellido_paterno, p.apellido_materno, p.full_name, p.phone, p.rut,
         coalesce(p.reliability_status, 'normal') as reliability_status,
         u.email::text as email
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and p.role = 'usuario'
    and public.hu30_staff_can_read_lead(p.id);
end;
$$;

revoke all on function public.list_lead_contacts(uuid[]) from public;
grant execute on function public.list_lead_contacts(uuid[]) to authenticated;


-- changed_by identifies the actor, never the tenant of the subject lead.
drop policy if exists "Staff select lead_status_history" on public.lead_status_history;
create policy "Staff select lead_status_history"
  on public.lead_status_history for select to authenticated
  using (public.hu30_staff_can_read_lead(profile_id));
grant select on public.lead_status_history to authenticated;

-- Keep existing admin-only contracts, also constrained by the subject lead.
create or replace function public.get_reported_leads_for_admin()
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  rut text,
  reliability_status text,
  created_at timestamptz,
  fraud_score_probability numeric,
  shap_top_factors jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"},{"Pragma":"no-cache"},{"Vary":"Authorization"}]', true);
  return query
  select distinct on (p.id)
    p.id,
    u.email::text as email,
    p.full_name,
    p.phone,
    p.rut,
    p.reliability_status,
    e.created_at,
    case when public.hu30_has_complement(e.financial_data) then null else e.fraud_score_probability end,
    case when public.hu30_has_complement(e.financial_data) then null else e.shap_top_factors end
  from public.profiles p
  join auth.users u on u.id = p.id
  join public.evaluations e on e.user_id = p.id
  where public.hu30_staff_can_read_lead(p.id)
    and p.reliability_status in ('en_revision', 'silenciado', 'descartado', 'sospechoso')
    and (
      public.get_my_role() = 'admin'
      or (
        public.get_my_role() = 'admin_inmobiliario'
        and (
          exists (
            select 1 from public.proyectos pr
            where pr.inmobiliaria_id = public.get_my_inmobiliaria()
            and (
              pr.comuna = coalesce(e.target_commune, e.financial_data->'input'->>'comuna_objetivo')
              or pr.comuna = p.onboarding_data->>'comuna_interes'
              or pr.comuna = p.onboarding_data->>'comuna_alternativa'
            )
          )
          or exists (
            select 1 from public.lead_status_history lsh
            join public.profiles exec_p on exec_p.id = lsh.changed_by
            where lsh.profile_id = p.id
            and exec_p.inmobiliaria_id = public.get_my_inmobiliaria()
          )
        )
      )
    )
  order by p.id, e.created_at desc;
end;
$$;

create or replace function public.get_lead_status_history_for_admin()
returns table (
  history_id uuid,
  profile_id uuid,
  lead_name text,
  lead_email text,
  changed_by_name text,
  changed_by_email text,
  old_status text,
  new_status text,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('response.headers', '[{"Cache-Control":"private, no-store"},{"Pragma":"no-cache"},{"Vary":"Authorization"}]', true);
  return query
  select 
    h.id as history_id,
    p.id as profile_id,
    p.full_name as lead_name,
    u_lead.email::text as lead_email,
    p_changer.full_name as changed_by_name,
    u_changer.email::text as changed_by_email,
    h.old_status,
    h.new_status,
    h.reason,
    h.created_at
  from public.lead_status_history h
  join public.profiles p on p.id = h.profile_id
  join auth.users u_lead on u_lead.id = p.id
  left join public.profiles p_changer on p_changer.id = h.changed_by
  left join auth.users u_changer on u_changer.id = h.changed_by
  where public.hu30_staff_can_read_lead(p.id) and (
    public.get_my_role() = 'admin'
    or (
      public.get_my_role() = 'admin_inmobiliario'
      and (
        exists (
          select 1 from public.evaluations e
          join public.proyectos pr on pr.inmobiliaria_id = public.get_my_inmobiliaria()
          where e.user_id = p.id
          and (
            pr.comuna = coalesce(e.target_commune, e.financial_data->'input'->>'comuna_objetivo')
            or pr.comuna = p.onboarding_data->>'comuna_interes'
            or pr.comuna = p.onboarding_data->>'comuna_alternativa'
          )
        )
        or exists (
          select 1 from public.lead_status_history lsh
          join public.profiles exec_p on exec_p.id = lsh.changed_by
          where lsh.profile_id = p.id
          and exec_p.inmobiliaria_id = public.get_my_inmobiliaria()
        )
      )
    )
  )
  order by h.created_at desc;
end;
$$;

revoke all on function public.get_reported_leads_for_admin(),public.get_lead_status_history_for_admin() from public,anon;
grant execute on function public.get_reported_leads_for_admin(),public.get_lead_status_history_for_admin() to authenticated;

commit;
