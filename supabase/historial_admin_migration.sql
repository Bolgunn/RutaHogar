-- =============================================================
-- ScoreLeads — HU16: Historial de estados de leads para admins
-- =============================================================

DROP FUNCTION IF EXISTS public.get_lead_status_history_for_admin();

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
language sql
stable
security definer
set search_path = public
as $$
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
  where (
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
$$;

grant execute on function public.get_lead_status_history_for_admin() to authenticated;
