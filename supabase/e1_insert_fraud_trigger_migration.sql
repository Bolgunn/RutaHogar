-- Migración para evaluar reglas de fraude duro en la BD y actualizar el perfil
-- Resuelve el problema de raíz, de forma segura y centralizada en el motor SQL.

CREATE OR REPLACE FUNCTION public.check_ml_fraud_on_insert()
RETURNS trigger AS $$
DECLARE
  v_profile RECORD;
  v_device_hash text;
  v_intentos integer;
  v_ahorro_previo numeric;
  v_ahorro_actual numeric;
  v_renta numeric;
  v_time_to_submit numeric;
BEGIN
  v_device_hash := NEW.financial_data->'input'->>'device_id_hash';
  v_time_to_submit := COALESCE((NEW.financial_data->'input'->>'time_to_submit')::numeric, 999);

  -- 1. Evaluamos reglas duras en la BD (Fallback robusto y bypass de RLS por SECURITY DEFINER)
  IF v_device_hash IS NOT NULL THEN
    
    -- Tanteo: más de 3 intentos en 15 minutos
    SELECT count(*) INTO v_intentos 
    FROM public.evaluations 
    WHERE financial_data->'input'->>'device_id_hash' = v_device_hash
    AND created_at >= now() - interval '15 minutes';
    
    IF v_intentos >= 3 THEN -- >= 3 significa que el actual sería el 4to
       NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 99.0);
       NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Tanteo detectado: demasiadas evaluaciones en corto tiempo"'::jsonb;
    END IF;
    
    -- Avance irreal: salto ilógico en 24 horas
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
       END IF;
    END IF;
  END IF;

  -- Script automatizado
  IF v_time_to_submit < 5 THEN
    NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 95.0);
    NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || '"Tiempo de llenado anormalmente bajo (<5s)"'::jsonb;
  END IF;

  -- 2. Si cualquier regla (o el ML mismo) arrojó fraude, marcamos el perfil
  IF NEW.fraud_score_probability >= 90 THEN
    SELECT reliability_status INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
    
    IF v_profile.reliability_status IN ('normal', 'reactivado') THEN
      UPDATE public.profiles 
      SET reliability_status = 'sospechoso', updated_at = now() 
      WHERE id = NEW.user_id;
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
