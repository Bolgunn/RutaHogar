-- Desde HU13 las evaluaciones se insertan sin `email`, por lo que el panel
-- comercial mostraba "Sin correo registrado". El correo vive solo en
-- auth.users; esta función (security definer) lo expone al staff junto al
-- resto del contacto del lead.
--
-- Conserva las columnas de 20261005000000 (que producción no registra como
-- aplicada: allí la función solo devolvía id, full_name, phone y
-- reliability_status) y el rol admin_inmobiliario.

alter table public.profiles add column if not exists rut text;
alter table public.profiles add column if not exists reliability_status text default 'normal';

-- Cambia el tipo de retorno: requiere drop + create.
drop function if exists public.list_lead_contacts(uuid[]);

create function public.list_lead_contacts(p_user_ids uuid[])
returns table (
  id uuid,
  nombre text,
  apellido_paterno text,
  apellido_materno text,
  full_name text,
  phone text,
  rut text,
  reliability_status text,
  email text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.apellido_paterno, p.apellido_materno, p.full_name, p.phone, p.rut,
         coalesce(p.reliability_status, 'normal') as reliability_status,
         u.email::text as email
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and p.role = 'usuario'
    and coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]);
$$;

revoke all on function public.list_lead_contacts(uuid[]) from public;
grant execute on function public.list_lead_contacts(uuid[]) to authenticated;
