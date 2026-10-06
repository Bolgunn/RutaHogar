-- Producción ya admite admin_inmobiliario (aplicado a mano desde HU16, PR #97/#102)
-- y tiene perfiles con ese rol. Esto alinea el repo con producción; en producción
-- es un no-op. assign_admin y el resto de objetos HU16 quedan para ese PR.
alter table public.profiles
  drop constraint if exists profiles_role_check,
  add  constraint profiles_role_check
    check (role in ('usuario', 'ejecutivo', 'admin', 'admin_inmobiliario'));
