-- El policy "Evaluations select own" (HU16) consulta lead_status_history.
-- Postgres exige SELECT sobre cada tabla del policy al planificar, así que
-- sin este grant toda lectura de evaluations falla con 42501.
-- Solo lectura: las escrituras siguen pasando por update_lead_reliability.
-- La tabla todavía no la crea ninguna migración de develop (llegó a mano con
-- HU16), por eso el bloque solo actúa si existe.
do $$
begin
  if to_regclass('public.lead_status_history') is null then
    return;
  end if;

  grant select on table public.lead_status_history to authenticated;

  -- Admin ve todo. Ejecutivo y admin_inmobiliario ven los cambios hechos por
  -- staff de su inmobiliaria y los automáticos (changed_by null, del sweeper).
  drop policy if exists "Staff select lead_status_history" on public.lead_status_history;
  create policy "Staff select lead_status_history"
    on public.lead_status_history
    for select
    to authenticated
    using (
      public.get_my_role() = 'admin'
      or (
        public.get_my_role() = any (array['ejecutivo'::text, 'admin_inmobiliario'::text])
        and (
          changed_by is null
          or exists (
            select 1 from public.profiles actor
            where actor.id = lead_status_history.changed_by
              and actor.inmobiliaria_id = public.get_my_inmobiliaria()
          )
        )
      )
    );
end
$$;
