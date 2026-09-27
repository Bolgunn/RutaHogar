-- Migración para Fase 3 (E1 HU16)
-- Agrega las columnas para almacenar el resultado del modelo ML antifraude.

ALTER TABLE public.evaluations
ADD COLUMN IF NOT EXISTS fraud_score_probability numeric,
ADD COLUMN IF NOT EXISTS shap_top_factors jsonb;

-- Función "Barrendera" (Sweeper) para Consistencia Eventual (Nivel 2)
-- Busca leads que tengan evaluaciones con alta probabilidad de fraude (>= 80%) 
-- pero cuyo estado siga siendo 'normal' (debido a un fallo de red), y los corrige.
CREATE OR REPLACE FUNCTION public.sweep_fraudulent_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Insertar el historial para los leads que van a ser cambiados
  INSERT INTO public.lead_status_history (
    lead_id, 
    previous_status, 
    new_status, 
    reason, 
    changed_by, 
    changed_by_role
  )
  SELECT 
    p.id, 
    'normal', 
    'sospechoso', 
    'Alerta automática (Sweeper): Probabilidad de fraude (' || e.fraud_score_probability || '%) excede el umbral.', 
    p.id, -- System trigger essentially, using lead id as fallback
    'system'
  FROM public.profiles p
  JOIN public.evaluations e ON p.id = e.user_id
  WHERE e.fraud_score_probability >= 80
    AND p.reliability_status = 'normal';

  -- 2. Actualizar el estado en el perfil
  UPDATE public.profiles p
  SET reliability_status = 'sospechoso',
      updated_at = now()
  FROM public.evaluations e
  WHERE p.id = e.user_id
    AND e.fraud_score_probability >= 80
    AND p.reliability_status = 'normal';
END;
$$;

-- Actualizar RPC para retornar campos de fraude
DROP FUNCTION IF EXISTS public.get_reported_leads_for_admin();

CREATE OR REPLACE FUNCTION public.get_reported_leads_for_admin()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  phone text,
  rut text,
  reliability_status text,
  created_at timestamptz,
  fraud_score_probability numeric,
  shap_top_factors jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id)
    p.id,
    u.email::text AS email,
    p.full_name,
    p.phone,
    p.rut,
    p.reliability_status,
    e.created_at,
    e.fraud_score_probability,
    e.shap_top_factors
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  JOIN public.evaluations e ON e.user_id = p.id
  WHERE p.reliability_status IN ('en_revision', 'silenciado', 'descartado', 'sospechoso')
    AND (
      public.get_my_role() = 'admin'
      OR (
        public.get_my_role() = 'admin_inmobiliario'
        AND (
          EXISTS (
            SELECT 1 FROM public.proyectos pr
            WHERE pr.inmobiliaria_id = public.get_my_inmobiliaria()
            AND (
              pr.comuna = e.input->>'comuna_objetivo'
              OR pr.comuna = p.onboarding_data->>'comuna_interes'
              OR pr.comuna = p.onboarding_data->>'comuna_alternativa'
            )
          )
          OR EXISTS (
            SELECT 1 FROM public.lead_status_history lsh
            JOIN public.profiles exec_p ON exec_p.id = lsh.changed_by
            WHERE lsh.profile_id = p.id
            AND exec_p.inmobiliaria_id = public.get_my_inmobiliaria()
          )
        )
      )
    )
  ORDER BY p.id, e.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_reported_leads_for_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.get_reported_leads_for_admin() TO authenticated;
