-- =============================================================
-- RutaHogar — HU 26: métricas de interés por proyecto
-- =============================================================
-- Diseño: docs/stories/HU26-metricas-interes-proyecto/PLAN.md (Entities) y
-- docs/algorithms/ALG-19-project-interest-metrics.md (Inputs).
--
-- · proyecto_visualizaciones: una fila por lead, proyecto y día de Santiago
--   (ALG-19 A2). Guarda solo el día: es dato de comportamiento del lead.
--   Sin policies ni grants para los roles del navegador; se escribe solo con
--   registrar_visualizacion_proyecto(). on delete cascade en profiles mantiene
--   la cancelación ARCO.
-- · project_interest_facts(): de solo lectura, para el admin de la inmobiliaria.
--   Devuelve { now, proyectos, leads } con conteos por lead anónimo; ALG-19
--   calcula todo en el navegador. No sale id de perfil, email ni instante de una
--   interacción: lead_id es un número dentro de la llamada.
--
-- Se aplica después del merge con `supabase db push` (nunca en el editor SQL).
begin;

create table if not exists public.proyecto_visualizaciones (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  dia date not null,
  primera_at timestamptz not null default now(),
  primary key (usuario_id, proyecto_id, dia)
);

create index if not exists proyecto_visualizaciones_proyecto_idx
  on public.proyecto_visualizaciones (proyecto_id);

alter table public.proyecto_visualizaciones enable row level security;
revoke all on table public.proyecto_visualizaciones from public, anon, authenticated;

-- Staff navegando el catálogo no es demanda (ALG-19 A7), y un aviso del portal
-- (proyectos_rag) no es un proyecto de una inmobiliaria: ambos devuelven false.
create or replace function public.registrar_visualizacion_proyecto(p_proyecto uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_added integer;
begin
  if v_uid is null
     or coalesce(public.get_my_role(), '') <> 'usuario'
     or not exists (select 1 from public.proyectos where id = p_proyecto) then
    return false;
  end if;

  insert into public.proyecto_visualizaciones (usuario_id, proyecto_id, dia)
  values (v_uid, p_proyecto, (now() at time zone 'America/Santiago')::date)
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return v_added > 0;
end;
$$;

create or replace function public.project_interest_facts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.get_my_role();
  v_tenant uuid := public.get_my_inmobiliaria();
  v_scope uuid[];
  v_proyectos jsonb;
  v_leads jsonb;
begin
  if auth.uid() is null
     or v_tenant is null
     or coalesce(v_role, '') not in ('admin_inmobiliario', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(array_agg(pr.id order by pr.nombre, pr.id), '{}')
    into v_scope
  from public.proyectos pr
  where pr.inmobiliaria_id = v_tenant;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pr.id,
           'nombre', pr.nombre,
           'comuna', pr.comuna,
           'tipo', pr.tipo,
           'precio_min_uf', pr.precio_min_uf,
           'precio_max_uf', pr.precio_max_uf,
           'estado', pr.estado
         ) order by array_position(v_scope, pr.id)), '[]'::jsonb)
    into v_proyectos
  from public.proyectos pr
  where pr.id = any(v_scope);

  with vistas as (
    select v.usuario_id, v.proyecto_id, count(*) as n
    from public.proyecto_visualizaciones v
    where v.proyecto_id = any(v_scope)
    group by 1, 2
  ),
  favoritos as (
    select f.usuario_id, f.proyecto_id
    from public.proyecto_favoritos f
    where f.proyecto_id = any(v_scope)
  ),
  simulaciones as (
    select s.user_id as usuario_id, s.project_id as proyecto_id, count(*) as n
    from public.mortgage_scenarios s
    where s.project_id = any(v_scope)
    group by 1, 2
  ),
  pares as (
    select usuario_id, proyecto_id from vistas
    union
    select usuario_id, proyecto_id from favoritos
    union
    select usuario_id, proyecto_id from simulaciones
  ),
  leads as (
    select pa.usuario_id,
           row_number() over (order by pa.usuario_id) as n,
           jsonb_agg(jsonb_build_object(
             'proyecto_id', pa.proyecto_id,
             'visualizaciones', coalesce(vi.n, 0),
             'favorito', fa.usuario_id is not null,
             'simulaciones', coalesce(si.n, 0)
           ) order by array_position(v_scope, pa.proyecto_id)) as interacciones
    from pares pa
    join public.profiles pf on pf.id = pa.usuario_id and pf.role = 'usuario'
    left join vistas vi on vi.usuario_id = pa.usuario_id and vi.proyecto_id = pa.proyecto_id
    left join favoritos fa on fa.usuario_id = pa.usuario_id and fa.proyecto_id = pa.proyecto_id
    left join simulaciones si on si.usuario_id = pa.usuario_id and si.proyecto_id = pa.proyecto_id
    group by pa.usuario_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'lead_id', l.n::text,
           'evaluacion_actual', (
             select jsonb_build_object(
                      'input', coalesce(e.financial_data -> 'input', '{}'::jsonb),
                      'onboarding', coalesce(pf.onboarding_data, '{}'::jsonb),
                      'result', coalesce(e.financial_data -> 'result', '{}'::jsonb)
                    )
             from public.evaluations e
             join public.profiles pf on pf.id = e.user_id
             where e.user_id = l.usuario_id
             order by e.created_at desc, e.id desc
             limit 1
           ),
           'interacciones', l.interacciones
         ) order by l.n), '[]'::jsonb)
    into v_leads
  from leads l;

  return jsonb_build_object('now', clock_timestamp(), 'proyectos', v_proyectos, 'leads', v_leads);
end;
$$;

revoke all on function public.registrar_visualizacion_proyecto(uuid) from public, anon, authenticated;
grant execute on function public.registrar_visualizacion_proyecto(uuid) to authenticated;
revoke all on function public.project_interest_facts() from public, anon, authenticated;
grant execute on function public.project_interest_facts() to authenticated;

commit;
