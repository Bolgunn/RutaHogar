-- Restore the project catalog columns required by the frozen frontend contract.
--
-- The canonical migration history already defines both columns. This follow-up
-- is intentionally idempotent so it also repairs hosted databases where they
-- were removed outside the recorded migration history. Existing rows receive
-- an empty commune instead of an invented location; administrators must supply
-- the real value on their next edit. New rows keep the original NOT NULL rule.

begin;

alter table public.proyectos
  add column if not exists comuna text;

alter table public.proyectos
  add column if not exists descripcion text;

update public.proyectos
set comuna = ''
where comuna is null;

alter table public.proyectos
  alter column comuna set not null;

commit;
