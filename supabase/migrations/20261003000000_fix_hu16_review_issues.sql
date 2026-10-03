-- Fix for HU16 PR review: Sweeper column names and security, 
-- missing RLS in lead_status_history, unsecure update_lead_reliability, 
-- overly restrictive evaluations policy, and fixing invalid references to evaluations.input.

-- 1. Restore the fix for evaluations select policy (using target_commune and financial_data)
DROP POLICY IF EXISTS "Evaluations select own" ON public.evaluations;
CREATE POLICY "Evaluations select own"
  ON public.evaluations
  FOR SELECT
  USING (
    (auth.uid() = user_id)
    OR (public.get_my_role() IN ('admin', 'ejecutivo'))
    OR (
      public.get_my_role() = 'admin_inmobiliario'
      AND (
        EXISTS (
          SELECT 1 FROM public.proyectos pr
          WHERE pr.inmobiliaria_id = public.get_my_inmobiliaria()
          AND (
            pr.comuna = COALESCE(evaluations.target_commune, evaluations.financial_data->'input'->>'comuna_objetivo')
            OR pr.comuna = (SELECT onboarding_data->>'comuna_interes' FROM public.profiles p WHERE p.id = evaluations.user_id)
            OR pr.comuna = (SELECT onboarding_data->>'comuna_alternativa' FROM public.profiles p WHERE p.id = evaluations.user_id)
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.lead_status_history lsh
          JOIN public.profiles exec_p ON exec_p.id = lsh.changed_by
          WHERE lsh.profile_id = evaluations.user_id
          AND exec_p.inmobiliaria_id = public.get_my_inmobiliaria()
        )
      )
    )
  );

-- 2. Secure update_lead_reliability (add role check)
CREATE OR REPLACE FUNCTION public.update_lead_reliability(
  p_lead_id uuid,
  p_reporter_id uuid DEFAULT NULL,
  p_new_status text DEFAULT 'silenciado',
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status text;
  v_changed_by uuid;
  v_role text;
BEGIN
  v_changed_by := auth.uid();
  v_role := public.get_my_role();

  IF v_role NOT IN ('ejecutivo', 'admin', 'admin_inmobiliario') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT reliability_status INTO v_old_status FROM public.profiles WHERE id = p_lead_id;
  
  UPDATE public.profiles 
  SET reliability_status = p_new_status, updated_at = now()
  WHERE id = p_lead_id;

  INSERT INTO public.lead_status_history (profile_id, changed_by, old_status, new_status, reason)
  VALUES (p_lead_id, v_changed_by, v_old_status, p_new_status, COALESCE(p_reason, 'Cambio de estado'));
END;
$$;
REVOKE ALL ON FUNCTION public.update_lead_reliability(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_lead_reliability(uuid, uuid, text, text) TO authenticated;

-- 3. Add RLS to lead_status_history
ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff select lead_status_history" ON public.lead_status_history;
CREATE POLICY "Staff select lead_status_history"
ON public.lead_status_history FOR SELECT
USING (public.get_my_role() IN ('ejecutivo', 'admin', 'admin_inmobiliario'));

-- 4. Fix the sweep_fraudulent_leads function
CREATE OR REPLACE FUNCTION public.sweep_fraudulent_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into history
  INSERT INTO public.lead_status_history (
    profile_id, 
    old_status, 
    new_status, 
    reason, 
    changed_by
  )
  SELECT DISTINCT ON (p.id)
    p.id, 
    'normal', 
    'sospechoso', 
    'Alerta automática (Sweeper): Probabilidad de fraude (' || e.fraud_score_probability || '%) excede el umbral.', 
    p.id
  FROM public.profiles p
  JOIN public.evaluations e ON p.id = e.user_id
  WHERE e.fraud_score_probability >= 80
    AND p.reliability_status = 'normal';

  -- Update profiles
  UPDATE public.profiles p
  SET reliability_status = 'sospechoso',
      updated_at = now()
  FROM public.evaluations e
  WHERE p.id = e.user_id
    AND e.fraud_score_probability >= 80
    AND p.reliability_status = 'normal';
END;
$$;
REVOKE ALL ON FUNCTION public.sweep_fraudulent_leads() FROM public;

-- 5. Fix get_reported_leads_for_admin (replace nonexistent e.input with coalesce(e.target_commune, e.financial_data->'input'->>'comuna_objetivo'))
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
              pr.comuna = COALESCE(e.target_commune, e.financial_data->'input'->>'comuna_objetivo')
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

-- 6. Fix get_lead_status_history_for_admin (replace nonexistent e.input with coalesce(e.target_commune, e.financial_data->'input'->>'comuna_objetivo'))
CREATE OR REPLACE FUNCTION public.get_lead_status_history_for_admin()
RETURNS TABLE (
  history_id uuid,
  profile_id uuid,
  lead_name text,
  lead_email text,
  changed_by_name text,
  changed_by_email text,
  old_status text,
  new_status text,
  reason text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    h.id AS history_id,
    p.id AS profile_id,
    p.full_name AS lead_name,
    u_lead.email::text AS lead_email,
    p_changer.full_name AS changed_by_name,
    u_changer.email::text AS changed_by_email,
    h.old_status,
    h.new_status,
    h.reason,
    h.created_at
  FROM public.lead_status_history h
  JOIN public.profiles p ON p.id = h.profile_id
  JOIN auth.users u_lead ON u_lead.id = p.id
  LEFT JOIN public.profiles p_changer ON p_changer.id = h.changed_by
  LEFT JOIN auth.users u_changer ON u_changer.id = h.changed_by
  WHERE (
    public.get_my_role() = 'admin'
    OR (
      public.get_my_role() = 'admin_inmobiliario'
      AND (
        EXISTS (
          SELECT 1 FROM public.evaluations e
          JOIN public.proyectos pr ON pr.inmobiliaria_id = public.get_my_inmobiliaria()
          WHERE e.user_id = p.id
          AND (
            pr.comuna = COALESCE(e.target_commune, e.financial_data->'input'->>'comuna_objetivo')
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
  ORDER BY h.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_lead_status_history_for_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.get_lead_status_history_for_admin() TO authenticated;
