-- Migración para controlar avances irreales en el plan de mejora (HU16)

CREATE OR REPLACE FUNCTION public.check_housing_plan_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_new_progress jsonb;
  v_old_progress jsonb;
  v_new_total numeric := 0;
  v_old_total numeric := 0;
  v_income numeric := 0;
  v_month jsonb;
  v_profile RECORD;
BEGIN
  -- Extraer el array de meses registrados en el plan de ahorro
  v_new_progress := NEW.housing_plan->'progress'->'months';
  v_old_progress := OLD.housing_plan->'progress'->'months';

  -- Si no hay progreso nuevo, no hacemos nada
  IF v_new_progress IS NULL OR v_new_progress = v_old_progress THEN
    RETURN NEW;
  END IF;

  -- Sumar total ahorrado en el nuevo snapshot
  IF jsonb_typeof(v_new_progress) = 'array' THEN
    FOR v_month IN SELECT * FROM jsonb_array_elements(v_new_progress) LOOP
      v_new_total := v_new_total + COALESCE((v_month->>'savedAmount')::numeric, 0);
    END LOOP;
  END IF;

  -- Sumar total ahorrado en el viejo snapshot
  IF jsonb_typeof(v_old_progress) = 'array' THEN
    FOR v_month IN SELECT * FROM jsonb_array_elements(v_old_progress) LOOP
      v_old_total := v_old_total + COALESCE((v_month->>'savedAmount')::numeric, 0);
    END LOOP;
  END IF;

  -- Verificar si el salto de ahorro en una sola actualización es muy grande
  IF v_new_total > v_old_total THEN
    -- Obtenemos el ingreso mensual del snapshot inicial
    v_income := COALESCE((NEW.financial_data->'input'->>'ingreso_mensual')::numeric, 0);
    
    -- REGLA SIMPLE: Si el ahorro ingresado de una vez es mayor a 3 veces el sueldo, es sospechoso
    IF v_income > 0 AND (v_new_total - v_old_total) > (v_income * 3) THEN
      
      -- Obtenemos el estado actual del lead
      SELECT reliability_status INTO v_profile FROM public.profiles WHERE id = NEW.user_id;
      
      -- Si el lead está normal o reactivado, lo marcamos para revisión
      IF v_profile.reliability_status IN ('normal', 'reactivado') THEN
        UPDATE public.profiles 
        SET reliability_status = 'en_revision', updated_at = now() 
        WHERE id = NEW.user_id;
      END IF;
      
      -- Inyectamos un flag en la evaluación para que el admin sepa por qué se marcó
      NEW.shap_top_factors := COALESCE(NEW.shap_top_factors, '[]'::jsonb) || 
        '"Avance irreal vs renta mensual en Plan de Mejora"'::jsonb;
      NEW.fraud_score_probability := GREATEST(COALESCE(NEW.fraud_score_probability, 0), 100);
        
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger en la tabla evaluations
DROP TRIGGER IF EXISTS trg_check_housing_plan_progress ON public.evaluations;
CREATE TRIGGER trg_check_housing_plan_progress
BEFORE UPDATE ON public.evaluations
FOR EACH ROW
WHEN (OLD.housing_plan IS DISTINCT FROM NEW.housing_plan)
EXECUTE FUNCTION public.check_housing_plan_progress();
