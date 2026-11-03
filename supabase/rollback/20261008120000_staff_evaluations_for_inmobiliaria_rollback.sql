-- Rollback de 20261008120000_staff_evaluations_for_inmobiliaria.sql.
-- Requiere volver antes al backend que chequeaba el alcance lead por lead.
begin;
drop function if exists public.staff_evaluations_for_inmobiliaria(uuid);
commit;
