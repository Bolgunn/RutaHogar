-- Ensure rut column exists in profiles (Fix for comment 1)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS rut text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reliability_status text DEFAULT 'normal';

drop function if exists public.list_lead_contacts(uuid[]);

-- Fix for comment 2: Include reliability_status and admin_inmobiliario role
create or replace function public.list_lead_contacts(p_user_ids uuid[]) 
returns table (id uuid, nombre text, apellido_paterno text, apellido_materno text, full_name text, phone text, rut text, reliability_status text) 
language sql stable security definer set search_path = public as $$ 
  select p.id, p.nombre, p.apellido_paterno, p.apellido_materno, p.full_name, p.phone, p.rut, p.reliability_status 
  from public.profiles p 
  where p.id = any(coalesce(p_user_ids, '{}'::uuid[])) 
  and p.role = 'usuario' 
  and coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]); 
$$;

-- Grant execution to authenticated users
REVOKE EXECUTE ON FUNCTION public.list_lead_contacts(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.list_lead_contacts(uuid[]) TO authenticated;

-- Fix for comment 4: Add missing update_lead_reliability RPC
CREATE OR REPLACE FUNCTION public.update_lead_reliability(p_lead_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Verify caller has staff privileges (ejecutivo, admin, admin_inmobiliario)
  IF NOT coalesce(public.get_my_role(), '') = any (array['ejecutivo'::text, 'admin'::text, 'admin_inmobiliario'::text]) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE public.profiles
  SET reliability_status = p_status,
      updated_at = now()
  WHERE id = p_lead_id AND role = 'usuario';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_lead_reliability(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_lead_reliability(uuid, text) TO authenticated;