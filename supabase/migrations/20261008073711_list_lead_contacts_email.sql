-- Add email to list_lead_contacts

drop function if exists public.list_lead_contacts(uuid[]);

create or replace function public.list_lead_contacts(p_user_ids uuid[]) 
returns table (id uuid, nombre text, apellido_paterno text, apellido_materno text, full_name text, phone text, rut text, reliability_status text, email text) 
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.apellido_paterno, p.apellido_materno, p.full_name, p.phone, p.rut, p.reliability_status, u.email 
  from public.profiles p 
  left join auth.users u on p.id = u.id 
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[])) 
  and p.role = 'usuario' 
  and coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]); 
$$;

REVOKE EXECUTE ON FUNCTION public.list_lead_contacts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.list_lead_contacts(uuid[]) TO authenticated;
