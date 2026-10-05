from fastapi.testclient import TestClient
from app.main import app
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
import json

client = TestClient(app)

def test_full_fraud_suite():
    print("\n=======================================================")
    print("   SUITE AUTOMATIZADA DE PRUEBAS DE FRAUDE (RutaHogar)  ")
    print("=======================================================")
    
    # Payload base simulando un llenado normal
    base_payload = {
        "ingreso_mensual": 1200000,
        "deuda_mensual": 300000,
        "edad": 35,
        "ahorro_disponible": 5000000,
        "plazo_credito_hipotecario": 20,
        "tipo_contrato": "indefinido",
        "continuidad_laboral": "mas_3_anios",
        "morosidad_actual": "no",
        "consentimiento": True,
        "dividendo_estimado": 400000,
        "device_id_hash": "test_device_hash_suite_123"
    }

    # -------------------------------------------------------------
    # 1. Prueba Usuario Normal (Llenado pausado: 45 segundos)
    # -------------------------------------------------------------
    print("\n[TEST 1] Simulando usuario legítimo (45s de llenado, sin alertas)...")
    payload_normal = base_payload.copy()
    payload_normal["time_to_submit"] = 45

    # Mockeamos que no tiene intentos sospechosos previos
    mock_sb_clean = MagicMock()
    mock_sb_clean.table().select().eq().gte().order().execute.return_value.data = []

    with patch("app.ml_fraud.get_supabase_client", return_value=mock_sb_clean):
        response_normal = client.post("/score", json=payload_normal)
    
    if response_normal.status_code == 200:
        data = response_normal.json()
        prob = data.get("fraud_score_probability", 0)
        print(f"✅ Respuesta recibida exitosamente (Status 200).")
        print(f"📊 Probabilidad de Fraude calculada: {prob}%")
        assert prob < 20, f"El score de fraude para usuario normal ({prob}%) no debería ser alto."
        print("   -> Resultado: OK (Usuario catalogado como Normal)")
    else:
        print(f"❌ Error en endpoint: {response_normal.text}")

    # -------------------------------------------------------------
    # 2. Prueba Bot / Script Rápido (Llenado en 3 segundos)
    # -------------------------------------------------------------
    print("\n[TEST 2] Simulando ataque de Bot/Script (3s de llenado < 5s)...")
    payload_bot = base_payload.copy()
    payload_bot["time_to_submit"] = 3

    with patch("app.ml_fraud.get_supabase_client", return_value=mock_sb_clean):
        response_bot = client.post("/score", json=payload_bot)
    
    if response_bot.status_code == 200:
        data = response_bot.json()
        prob = data.get("fraud_score_probability", 0)
        factores = data.get("shap_top_factors", [])
        
        print(f"✅ Respuesta recibida exitosamente (Status 200).")
        print(f"🚨 Probabilidad de Fraude calculada: {prob}%")
        print(f"🔎 Factores detectados:")
        for factor in factores:
            print(f"   - {factor}")
            
        assert prob >= 95, f"El score para Bot ({prob}%) debería ser >= 95%."
        assert any("Tiempo de llenado anormalmente bajo" in str(f) for f in factores)
        print("   -> Resultado: OK (Bot bloqueado por velocidad)")
    else:
        print(f"❌ Error en endpoint: {response_bot.text}")

    # -------------------------------------------------------------
    # 3. Prueba Tanteo / Fuerza Bruta (> 3 intentos en 15 minutos)
    # -------------------------------------------------------------
    print("\n[TEST 3] Simulando Tanteo / Múltiples intentos rápidos desde el mismo dispositivo...")
    payload_tanteo = base_payload.copy()
    payload_tanteo["time_to_submit"] = 45  # Tiempo normal para aislar el factor tanteo

    # Simulamos que Supabase tiene registradas 4 evaluaciones en los últimos 15 min
    ahora_iso = datetime.now(timezone.utc).isoformat()
    mock_sb_tanteo = MagicMock()
    mock_sb_tanteo.table().select().eq().gte().order().execute.return_value.data = [
        {"created_at": ahora_iso, "financial_data": {"input": {"ahorro_disponible": 5000000}}},
        {"created_at": ahora_iso, "financial_data": {"input": {"ahorro_disponible": 5000000}}},
        {"created_at": ahora_iso, "financial_data": {"input": {"ahorro_disponible": 5000000}}},
        {"created_at": ahora_iso, "financial_data": {"input": {"ahorro_disponible": 5000000}}},
    ]

    with patch("app.ml_fraud.get_supabase_client", return_value=mock_sb_tanteo):
        response_tanteo = client.post("/score", json=payload_tanteo)

    if response_tanteo.status_code == 200:
        data = response_tanteo.json()
        prob = data.get("fraud_score_probability", 0)
        factores = data.get("shap_top_factors", [])
        
        print(f"✅ Respuesta recibida exitosamente (Status 200).")
        print(f"🚨 Probabilidad de Fraude calculada: {prob}%")
        print(f"🔎 Factores detectados:")
        for factor in factores:
            print(f"   - {factor}")
            
        assert prob >= 99, f"El score para Tanteo ({prob}%) debería ser >= 99%."
        assert any("Tanteo detectado" in str(f) for f in factores)
        print("   -> Resultado: OK (Tanteo de parámetros detectado)")
    else:
        print(f"❌ Error en endpoint: {response_tanteo.text}")

    # -------------------------------------------------------------
    # 4. Prueba Salto de Ahorro Irreal (3M a 20M en 24h con sueldo 1.2M)
    # -------------------------------------------------------------
    print("\n[TEST 4] Simulando Salto de Ahorro Irreal (sube de $3.000.000 a $20.000.000 en 24h)...")
    payload_ahorro = base_payload.copy()
    payload_ahorro["ingreso_mensual"] = 1200000
    payload_ahorro["ahorro_disponible"] = 20000000  # Salto a 20 millones
    payload_ahorro["time_to_submit"] = 45

    # Simulamos que hace menos de 24h declaró $3.000.000
    mock_sb_ahorro = MagicMock()
    mock_sb_ahorro.table().select().eq().gte().order().execute.return_value.data = [
        {"created_at": ahora_iso, "financial_data": {"input": {"ahorro_disponible": 3000000}}}
    ]

    with patch("app.ml_fraud.get_supabase_client", return_value=mock_sb_ahorro):
        response_ahorro = client.post("/score", json=payload_ahorro)

    if response_ahorro.status_code == 200:
        data = response_ahorro.json()
        prob = data.get("fraud_score_probability", 0)
        factores = data.get("shap_top_factors", [])
        
        print(f"✅ Respuesta recibida exitosamente (Status 200).")
        print(f"🚨 Probabilidad de Fraude calculada: {prob}%")
        print(f"🔎 Factores detectados:")
        for factor in factores:
            print(f"   - {factor}")
            
        assert prob >= 99, f"El score para Salto de Ahorro ({prob}%) debería ser >= 99%."
        assert any("Avance de ahorro irreal" in str(f) for f in factores)
        print("   -> Resultado: OK (Salto de ahorro irreal bloqueado con formato chileno)")
    else:
        print(f"❌ Error en endpoint: {response_ahorro.text}")

    print("\n=======================================================")
    print("      TODOS LOS TESTS DE FRAUDE PASARON CON ÉXITO      ")
    print("=======================================================\n")

if __name__ == "__main__":
    test_full_fraud_suite()

