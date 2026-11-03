-- =============================================================
-- RutaHogar — Evaluaciones staff acotadas por inmobiliaria en una sola consulta
-- =============================================================
-- /tracking/staff/evaluations hacía un POST a lead_belongs_to_inmobiliaria por
-- cada lead (~300 en producción) y superaba el timeout de 15 s del frontend.
-- Misma regla de alcance, resuelta en una sola consulta dentro de la base.
-- Solo service_role: recibe el tenant como parámetro, así que el navegador no
-- puede llamarla (el backend toma el tenant del perfil del actor).
begin;

-- Misma regla que lead_belongs_to_inmobiliaria (favorito en un proyecto del
-- tenant o comuna declarada de uno de ellos), en forma de conjunto: llamarla por
-- lead evaluaba lead_belongs_to_proyecto lead × proyecto y tardaba ~7 s en
-- producción. Si cambia esa regla, cambiar también esta.
create or replace function public.staff_evaluations_for_inmobiliaria(p_inmobiliaria uuid)
returns setof public.evaluations
language sql
stable
set search_path = public
as $$
  with tenant_projects as materialized (
    select pr.id, lower(trim(pr.comuna)) as comuna
    from public.proyectos pr
    where pr.inmobiliaria_id = p_inmobiliaria
  ),
  declared as (
    select e.user_id, lower(trim(c.comuna)) as comuna
    from public.evaluations e
    cross join lateral (values (e.target_commune), (e.alternative_commune),
      (e.financial_data -> 'input' ->> 'comuna_objetivo')) c(comuna)
    union all
    select p.id, lower(trim(c.comuna))
    from public.profiles p
    cross join lateral (values (p.onboarding_data ->> 'comuna_interes'),
      (p.onboarding_data ->> 'comuna_alternativa')) c(comuna)
  ),
  scoped as materialized (
    select p.id as user_id
    from public.profiles p
    where p.role = 'usuario'
      and (
        exists (
          select 1
          from public.proyecto_favoritos f
          join tenant_projects tp on tp.id = f.proyecto_id
          where f.usuario_id = p.id
        )
        or exists (
          select 1
          from declared d
          join tenant_projects tp on tp.comuna = d.comuna
          where d.user_id = p.id
            and d.comuna <> ''
        )
      )
  )
  select e.*
  from public.evaluations e
  where e.user_id in (select scoped.user_id from scoped)
  order by e.created_at desc;
$$;

revoke all on function public.staff_evaluations_for_inmobiliaria(uuid) from public, anon, authenticated;
grant execute on function public.staff_evaluations_for_inmobiliaria(uuid) to service_role;

commit;
