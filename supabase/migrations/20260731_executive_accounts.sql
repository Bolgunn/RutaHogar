-- =============================================================
-- ScoreLeads — HU 7: alta de ejecutivos comerciales por el admin
-- =============================================================
-- El alta de la cuenta ocurre en la Edge Function `create-executive`
-- (necesita service_role para tocar auth.users). Aquí solo va la lectura
-- del roster, que la UI usa para listar los ejecutivos del tenant.
--
-- `profiles` no guarda el correo — vive en auth.users, que el cliente no
-- puede leer. Por eso el listado pasa por esta función SECURITY DEFINER
-- en vez de un select directo desde el frontend.

create or replace function public.list_inmobiliaria_executives(p_inmobiliaria_id uuid default null)
returns table (
  id uuid,
  email text,
  full_name text,
  phone text,
  inmobiliaria_id uuid,
  inmobiliaria_nombre text,
  proyectos_asignados bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    u.email::text,
    p.full_name,
    p.phone,
    p.inmobiliaria_id,
    i.nombre,
    (select count(*) from public.proyecto_ejecutivos pe where pe.ejecutivo_id = p.id),
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.inmobiliarias i on i.id = p.inmobiliaria_id
  where p.role = 'ejecutivo'
    -- Solo un admin lee el roster; el scoped admin queda acotado a su tenant.
    and coalesce(public.get_my_role(), '') = 'admin'
    and (
      public.get_my_inmobiliaria() is null
      or p.inmobiliaria_id = public.get_my_inmobiliaria()
    )
    and (p_inmobiliaria_id is null or p.inmobiliaria_id = p_inmobiliaria_id)
  order by p.full_name nulls last, u.email;
$$;

grant execute on function public.list_inmobiliaria_executives(uuid) to authenticated;

-- Resuelve el id de una cuenta por correo. La usa SOLO la Edge Function
-- `create-executive` para distinguir "crear cuenta nueva" de "promover cuenta
-- existente". Es deliberadamente inaccesible para usuarios finales: expondría
-- si un correo está registrado.
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

revoke execute on function public.find_user_id_by_email(text) from public;
revoke execute on function public.find_user_id_by_email(text) from anon;
revoke execute on function public.find_user_id_by_email(text) from authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;
