-- Base migration for HU16: Create tables, columns, roles, and automated triggers
-- Required so that migrations run cleanly on fresh databases and track history for automatic flags.

-- 1. Allow 'admin_inmobiliario' in profiles role check
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('usuario', 'ejecutivo', 'admin', 'admin_inmobiliario'));

-- 2. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS reliability_status text NOT NULL DEFAULT 'normal' 
    CHECK (reliability_status IN ('normal', 'sospechoso', 'en_revision', 'descartado', 'reactivado', 'silenciado'));

-- 3. Add columns to evaluations
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS fraud_score_probability numeric,
  ADD COLUMN IF NOT EXISTS shap_top_factors jsonb DEFAULT '[]'::jsonb;

-- 4. Create lead_status_history table
CREATE TABLE IF NOT EXISTS public.lead_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_status text,
  new_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Trigger for housing plan progress check
CREATE OR REPLACE FUNCTION public.check_housing_plan_progress()
RETURNS trigger AS $$
DECLARE
  v_old_total numeric := 0;
  v_new_total numeric := 0;
  v_income numeric := 0;
  v_days_active numeric;
  v_months_active numeric;
  v_max_logical_savings numeric;
  v_fraud_reason jsonb := NULL;
  v_fraud_text text := NULL;
  v_current_status text;
BEGIN
  IF NEW.housing_plan IS NOT NULL THEN
    v_old_total := COALESCE((OLD.housing_plan->'meta_ahorro'->>'monto_actual')::numeric, 0);
    v_new_total := COALESCE((NEW.housing_plan->'meta_ahorro'->>'monto_actual')::numeric, 0);
    v_income := COALESCE((NEW.financial_data->'input'->>'ingreso_mensual')::numeric, 0);
    
    IF v_income > 0 THEN
      v_days_active := EXTRACT(EPOCH FROM (now() - NEW.created_at)) / 86400;
      v_months_active := GREATEST(0, v_days_active / 30.0);
      v_max_logical_savings := (v_income * 3) + (v_income * v_months_active);

      IF (v_new_total - v_old_total) > (v_income * 3) THEN
        v_fraud_text := 'Avance irreal vs renta mensual en Plan de Mejora';
        v_fraud_reason := to_jsonb(v_fraud_text);
      ELSIF v_new_total > v_max_logical_savings THEN
        v_fraud_text := 'Velocidad de ahorro matemáticamente imposible (Smurfing detectado)';
        v_fraud_reason := to_jsonb(v_fraud_text);
      END IF;

      IF v_fraud_reason IS NOT NULL THEN
        SELECT reliability_status INTO v_current_status FROM public.profiles WHERE id = NEW.user_id;
        
        -- Si está normal o reactivado, marcamos sospechoso y dejamos trazabilidad en el historial
        IF v_current_status IN ('normal', 'reactivado') THEN
          UPDATE public.profiles 
          SET reliability_status = 'sospechoso', updated_at = now() 
          WHERE id = NEW.user_id;

          INSERT INTO public.lead_status_history (profile_id, old_status, new_status, reason, changed_by)
          VALUES (NEW.user_id, v_current_status, 'sospechoso', 'Alerta automática (Plan de Ahorro): ' || v_fraud_text, NULL);
        END IF;
        
        NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || v_fraud_reason;
        NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 100);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_housing_plan_progress ON public.evaluations;
CREATE TRIGGER trg_check_housing_plan_progress
BEFORE UPDATE ON public.evaluations
FOR EACH ROW
WHEN (OLD.housing_plan IS DISTINCT FROM NEW.housing_plan)
EXECUTE FUNCTION public.check_housing_plan_progress();

-- 6. Trigger for automatic detection on evaluation insert
CREATE OR REPLACE FUNCTION public.check_ml_fraud_on_insert()
RETURNS trigger AS $$
DECLARE
  v_current_status text;
  v_device_hash text;
  v_intentos integer;
  v_ahorro_previo numeric;
  v_ahorro_actual numeric;
  v_renta numeric;
  v_time_to_submit numeric;
  v_reasons text[] := ARRAY[]::text[];
BEGIN
  v_device_hash := NEW.financial_data->'input'->>'device_id_hash';
  v_time_to_submit := COALESCE((NEW.financial_data->'input'->>'time_to_submit')::numeric, 999);

  IF v_device_hash IS NOT NULL THEN
    -- Tanteo: más de 3 intentos en 15 minutos
    SELECT count(*) INTO v_intentos 
    FROM public.evaluations 
    WHERE financial_data->'input'->>'device_id_hash' = v_device_hash
      AND created_at >= now() - interval '15 minutes';
    
    IF v_intentos >= 3 THEN 
       NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
       NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Tanteo detectado: demasiadas evaluaciones en corto tiempo"'::jsonb;
       v_reasons := array_append(v_reasons, 'Tanteo excesivo detectado');
    END IF;
    
    -- Avance irreal: salto de ahorro ilógico en 24 horas
    SELECT (financial_data->'input'->>'ahorro_disponible')::numeric INTO v_ahorro_previo
    FROM public.evaluations
    WHERE financial_data->'input'->>'device_id_hash' = v_device_hash
      AND created_at >= now() - interval '24 hours'
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_ahorro_previo IS NOT NULL THEN
       v_ahorro_actual := COALESCE((NEW.financial_data->'input'->>'ahorro_disponible')::numeric, 0);
       v_renta := COALESCE((NEW.financial_data->'input'->>'ingreso_mensual')::numeric, 0);
       IF v_ahorro_actual > (v_ahorro_previo + (v_renta * 3)) THEN
          NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
          NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Avance de ahorro irreal detectado en 24h"'::jsonb;
          v_reasons := array_append(v_reasons, 'Avance de ahorro irreal detectado en 24h');
       END IF;
    END IF;
  END IF;

  -- Script automatizado
  IF v_time_to_submit < 5 THEN
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 95.0);
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Tiempo de llenado anormalmente bajo (<5s)"'::jsonb;
    v_reasons := array_append(v_reasons, 'Tiempo de llenado anormalmente bajo (<5s)');
  END IF;

  -- Si se activó alguna regla que deja la probabilidad >= 90%, marcamos sospechoso y registramos historial
  IF NEW.fraud_score_probability >= 90 THEN
    SELECT reliability_status INTO v_current_status FROM public.profiles WHERE id = NEW.user_id;
    
    IF v_current_status IN ('normal', 'reactivado') THEN
      UPDATE public.profiles 
      SET reliability_status = 'sospechoso', updated_at = now() 
      WHERE id = NEW.user_id;

      INSERT INTO public.lead_status_history (profile_id, old_status, new_status, reason, changed_by)
      VALUES (
        NEW.user_id, 
        v_current_status, 
        'sospechoso', 
        'Alerta automática (Evaluación): ' || COALESCE(array_to_string(v_reasons, ', '), 'Inconsistencias detectadas'), 
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_ml_fraud_on_insert ON public.evaluations;
CREATE TRIGGER trg_check_ml_fraud_on_insert
BEFORE INSERT ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.check_ml_fraud_on_insert();
