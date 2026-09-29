-- Script de Pruebas Automatizadas para Reglas y Funciones de HU16
-- Ejecutar en Supabase SQL Editor o a través del CLI (psql)
-- Se ejecuta dentro de un bloque DO con ROLLBACK implícito en caso de error de aserción.

DO $$
DECLARE
  v_user_id1 uuid := gen_random_uuid();
  v_user_id2 uuid := gen_random_uuid();
  v_evaluation_id1 uuid := gen_random_uuid();
  v_evaluation_id2 uuid := gen_random_uuid();
  v_status text;
  v_fraud_score numeric;
  v_reported_count int;
BEGIN
  RAISE NOTICE '--- INICIANDO SUITE DE PRUEBAS AUTOMATIZADAS HU16 ---';

  -- 1. Setup: Crear perfiles falsos para las pruebas
  INSERT INTO public.profiles (id, full_name, reliability_status) 
  VALUES 
    (v_user_id1, 'Test User 1 (Plan Mejora)', 'normal'),
    (v_user_id2, 'Test User 2 (Sweeper)', 'normal');

  -------------------------------------------------------------------------
  -- TEST 1: Regla de Avance Irreal en Plan de Mejora (Trigger)
  -------------------------------------------------------------------------
  RAISE NOTICE 'Ejecutando Test 1: Trigger de Plan de Mejora...';
  
  -- Insertar evaluación inicial con sueldo de 1.000.000 y ahorro de 0
  INSERT INTO public.evaluations (id, user_id, financial_data, housing_plan)
  VALUES (
    v_evaluation_id1, 
    v_user_id1, 
    '{"input": {"ingreso_mensual": 1000000}}'::jsonb, 
    '{"status": "en_curso", "progress": {"months": []}}'::jsonb
  );

  -- Simular una actualización donde el usuario mágicamente ahorra 5.000.000 (más de 3x su sueldo)
  UPDATE public.evaluations
  SET housing_plan = '{"status": "en_curso", "progress": {"months": [{"savedAmount": 5000000}]}}'::jsonb
  WHERE id = v_evaluation_id1;

  -- Aserción: El perfil debe haber cambiado a 'en_revision' automáticamente
  SELECT reliability_status INTO v_status FROM public.profiles WHERE id = v_user_id1;
  ASSERT v_status = 'en_revision', 'Fallo Test 1: El estado debería ser en_revision, pero es ' || v_status;

  SELECT fraud_score_probability INTO v_fraud_score FROM public.evaluations WHERE id = v_evaluation_id1;
  ASSERT v_fraud_score = 100, 'Fallo Test 1: La probabilidad de fraude debería ser 100.';
  
  RAISE NOTICE '✅ Test 1 Superado.';

  -------------------------------------------------------------------------
  -- TEST 2: Sweeper de Consistencia Eventual
  -------------------------------------------------------------------------
  RAISE NOTICE 'Ejecutando Test 2: Sweeper de fraude (Consistencia)...';
  
  -- Insertar evaluación con fraude alto pero que se quedó en estado normal por error de red
  INSERT INTO public.evaluations (id, user_id, fraud_score_probability)
  VALUES (v_evaluation_id2, v_user_id2, 95.0);

  -- Ejecutar el sweeper (Barrendero)
  PERFORM public.sweep_fraudulent_leads();

  -- Aserción: El sweeper debe haber cambiado el estado a 'sospechoso'
  SELECT reliability_status INTO v_status FROM public.profiles WHERE id = v_user_id2;
  ASSERT v_status = 'sospechoso', 'Fallo Test 2: El estado debería ser sospechoso tras el sweeper, pero es ' || v_status;
  
  RAISE NOTICE '✅ Test 2 Superado.';

  -------------------------------------------------------------------------
  -- Limpiar los datos generados (Rollback manual para dejar todo limpio)
  -------------------------------------------------------------------------
  DELETE FROM public.evaluations WHERE id IN (v_evaluation_id1, v_evaluation_id2);
  DELETE FROM public.profiles WHERE id IN (v_user_id1, v_user_id2);
  DELETE FROM public.lead_status_history WHERE lead_id = v_user_id2;

  RAISE NOTICE '--- PRUEBAS AUTOMATIZADAS FINALIZADAS CORRECTAMENTE ---';

END $$;
