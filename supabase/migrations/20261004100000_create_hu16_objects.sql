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

-- 5. Trigger for automatic detection on evaluation insert
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
  v_deuda_mensual numeric;
  v_dividendo_estimado numeric;
  v_morosidad_actual text;
  v_monto_morosidad numeric;
  v_edad numeric;
  v_plazo_credito numeric;
  v_reasons text[] := ARRAY[]::text[];
BEGIN
  v_device_hash := NEW.financial_data->'input'->>'device_id_hash';
  v_time_to_submit := COALESCE((NEW.financial_data->'input'->>'time_to_submit')::numeric, 999);
  v_renta := COALESCE((NEW.financial_data->'input'->>'ingreso_mensual')::numeric, 0);
  v_ahorro_actual := COALESCE((NEW.financial_data->'input'->>'ahorro_disponible')::numeric, 0);
  v_deuda_mensual := COALESCE((NEW.financial_data->'input'->>'deuda_mensual')::numeric, 0);
  v_dividendo_estimado := COALESCE((NEW.financial_data->'input'->>'dividendo_estimado')::numeric, 0);
  v_morosidad_actual := NEW.financial_data->'input'->>'morosidad_actual';
  v_monto_morosidad := COALESCE((NEW.financial_data->'input'->>'monto_morosidad')::numeric, 0);
  v_edad := COALESCE((NEW.financial_data->'input'->>'edad')::numeric, 0);
  v_plazo_credito := COALESCE((NEW.financial_data->'input'->>'plazo_credito_hipotecario')::numeric, 0);

  -- =============================================================
  -- REGLAS DE VALORES INCONSISTENTES / CONTRADICTORIOS (E1 Proposal A)
  -- =============================================================
  -- Regla 1: Deuda mensual supera o iguala al ingreso
  IF v_renta > 0 AND v_deuda_mensual >= v_renta THEN
    v_reasons := array_append(v_reasons, 'Deuda mensual supera o iguala al ingreso mensual');
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Deuda mensual declarada supera o iguala al ingreso mensual"'::jsonb;
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
  END IF;

  -- Regla 2: Dividendo estimado no viable (> 85% de ingreso)
  IF v_renta > 0 AND v_dividendo_estimado > (v_renta * 0.85) THEN
    v_reasons := array_append(v_reasons, 'Dividendo estimado compromete más del 85% del ingreso');
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Dividendo estimado compromete más del 85% del ingreso"'::jsonb;
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
  END IF;

  -- Regla 3: Ahorro desproporcionado (> 120x ingreso)
  IF v_renta > 0 AND v_ahorro_actual > (v_renta * 120) THEN
    v_reasons := array_append(v_reasons, 'Ahorro disponible supera 120 veces el ingreso mensual');
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Ahorro disponible supera 120 veces el ingreso mensual"'::jsonb;
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
  END IF;

  -- Regla 4: Morosidad contradictoria
  IF (v_morosidad_actual = 'no' AND v_monto_morosidad > 0) OR (v_morosidad_actual = 'si' AND v_monto_morosidad <= 0) THEN
    v_reasons := array_append(v_reasons, 'Contradicción en declaración de morosidad y monto');
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Contradicción entre declaración de morosidad y monto registrado"'::jsonb;
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
  END IF;

  -- Regla 5: Edad + plazo crédito hipotecario supera 85 años
  IF v_edad > 0 AND v_plazo_credito > 0 AND (v_edad + v_plazo_credito) > 85 THEN
    v_reasons := array_append(v_reasons, 'Edad más plazo de crédito hipotecario supera los 85 años');
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Edad declarada más plazo de crédito supera los 85 años"'::jsonb;
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
  END IF;

  -- =============================================================
  -- REGLAS DE COMPORTAMIENTO / ANTI-BOT
  -- =============================================================
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
       IF v_renta > 0 AND v_ahorro_actual > (v_ahorro_previo + (v_renta * 3)) THEN
          NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
          NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Avance de ahorro irreal detectado en 24h"'::jsonb;
          v_reasons := array_append(v_reasons, 'Avance de ahorro irreal detectado en 24h');
       END IF;
    END IF;
  END IF;

  -- Script automatizado / Bot
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
        'Alerta automática (Evaluación): ' || COALESCE(array_to_string(v_reasons, '; '), 'Inconsistencias detectadas'), 
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
