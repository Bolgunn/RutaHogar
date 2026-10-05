-- No reasigna roles: si quedan perfiles admin_inmobiliario, decidir a mano su rol
-- antes de estrechar el check.
do $$
begin
  if exists (select 1 from public.profiles where role = 'admin_inmobiliario') then
    raise exception 'Hay perfiles con role = admin_inmobiliario; reasígnalos antes de revertir.';
  end if;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add  constraint profiles_role_check
    check (role in ('usuario', 'ejecutivo', 'admin'));
