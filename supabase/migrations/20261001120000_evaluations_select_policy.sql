-- El policy aplicado a mano en producción (HU16) consultaba lead_status_history,
-- que quedó sin privilegios para authenticated. Postgres valida privilegios de
-- toda relación del policy al planificar, así que cualquier SELECT o
-- INSERT ... RETURNING sobre evaluations fallaba con 42501.
-- admin_inmobiliario ve lo mismo que ejecutivo.
drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select
  using (
    (auth.uid() = user_id)
    or
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]))
  );
