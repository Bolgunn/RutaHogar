-- El 2026-10-05 el policy "Evaluations select own" de producción apareció
-- reducido a (auth.uid() = user_id) por una edición a mano: ningún ejecutivo ni
-- admin veía leads en el dashboard. Ninguna migración define ese cuerpo. Esta
-- vuelve a declarar el de 20261001120000 (que sigue registrada como aplicada)
-- para que el historial de migraciones vuelva a describir producción.
-- No editar este policy en el editor SQL: es la tercera vez que se rompe así.
begin;

drop policy if exists "Evaluations select own" on public.evaluations;
create policy "Evaluations select own"
  on public.evaluations
  for select
  using (
    (auth.uid() = user_id)
    or
    (public.get_my_role() = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]))
  );

commit;
