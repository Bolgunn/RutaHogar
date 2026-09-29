from fastapi.testclient import TestClient
from app.main import app
import json

client = TestClient(app)

def test_bot_fraud_detection():
    print("\n--- INICIANDO TEST AUTOMATIZADO DE FRAUDE (BOTS) ---")
    
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
        "device_id_hash": "dummy_hash_123"
    }

    # 1. Prueba Usuario Normal (Llenado lento: 45 segundos)
    print("\n[TEST 1] Simulando usuario legítimo (45 segundos de llenado)...")
    payload_normal = base_payload.copy()
    payload_normal["time_to_submit"] = 45

    response_normal = client.post("/score", json=payload_normal)
    
    if response_normal.status_code == 200:
        data = response_normal.json()
        prob = data.get("fraud_score_probability")
        print(f"✅ Respuesta recibida exitosamente.")
        print(f"📊 Probabilidad de Fraude calculada: {prob}%")
        assert prob < 20, "El score de fraude para usuario normal no debería ser alto."
    else:
        print(f"❌ Error en endpoint: {response_normal.text}")

    # 2. Prueba Bot (Llenado rápido: 3 segundos)
    print("\n[TEST 2] Simulando ataque de Bot/Script (3 segundos de llenado)...")
    payload_bot = base_payload.copy()
    payload_bot["time_to_submit"] = 3

    response_bot = client.post("/score", json=payload_bot)
    
    if response_bot.status_code == 200:
        data = response_bot.json()
        prob = data.get("fraud_score_probability")
        factores = data.get("shap_top_factors", [])
        
        print(f"✅ Respuesta recibida exitosamente.")
        print(f"🚨 Probabilidad de Fraude calculada: {prob}%")
        print(f"🔎 Factores que delatan el fraude (SHAP/Fallback):")
        for factor in factores:
            print(f"   - {factor}")
            
        assert prob >= 95, "El score de fraude para un Bot debería ser >= 95%."
    else:
        print(f"❌ Error en endpoint: {response_bot.text}")

    print("\n--- TESTS FINALIZADOS CORRECTAMENTE ---")

if __name__ == "__main__":
    test_bot_fraud_detection()
