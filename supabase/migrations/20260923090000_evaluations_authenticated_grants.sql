-- RLS sigue decidiendo qué filas puede operar cada usuario autenticado.
-- Estos privilegios de tabla solo permiten que Postgres llegue a evaluarla.
grant select, insert, update, delete
on table public.evaluations
to authenticated;
