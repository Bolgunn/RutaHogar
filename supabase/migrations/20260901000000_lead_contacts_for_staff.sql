-- Expone datos de contacto solo a personal comercial autenticado.
-- No abre acceso directo a public.profiles para ejecutivos.
create or replace function public.list_lead_contacts(p_user_ids uuid[])
returns table (
  id uuid,
  full_name text,
  phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.phone
  from public.profiles p
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and p.role = 'usuario'
    and coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text]);
$$;

revoke all on function public.list_lead_contacts(uuid[]) from public;
grant execute on function public.list_lead_contacts(uuid[]) to authenticated;
