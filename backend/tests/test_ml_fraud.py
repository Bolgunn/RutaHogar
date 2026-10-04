import pytest
from app.ml_fraud import predict_fraud

def test_fraud_rule_normal_user():
    """Usuario legítimo: llenado lento, sin intentos previos anormales."""
    data = {
        "time_to_submit": 45,
        "intentos_previos": 0,
        "ingreso_mensual": 1200000,
        "ahorro_disponible": 5000000,
        "ahorro_previo_24h": None,
    }
    prob, factors = predict_fraud(data)
    assert prob < 20.0, "El score de fraude para usuario normal no debería ser alto."
    assert len(factors) == 0

def test_fraud_rule_tanteo():
    """Regla: Más de 3 intentos detectados (Tanteo)."""
    data = {
        "time_to_submit": 45,
        "intentos_previos": 4, # 4 intentos
        "ingreso_mensual": 1200000,
        "ahorro_disponible": 5000000,
    }
    prob, factors = predict_fraud(data)
    assert prob >= 99.0
    assert any("Tanteo detectado" in f for f in factors)

def test_fraud_rule_bot_fast_submit():
    """Regla: Llenado en menos de 5 segundos."""
    data = {
        "time_to_submit": 3, # 3 segundos
        "intentos_previos": 0,
        "ingreso_mensual": 1200000,
        "ahorro_disponible": 5000000,
    }
    prob, factors = predict_fraud(data)
    assert prob >= 95.0
    assert any("Tiempo de llenado anormalmente bajo" in f for f in factors)

def test_fraud_rule_avance_ahorro_irreal():
    """Regla: Salto de ahorro imposible de justificar con su sueldo."""
    data = {
        "time_to_submit": 45,
        "intentos_previos": 1,
        "ingreso_mensual": 1000000,
        "ahorro_previo_24h": 3000000,
        "ahorro_disponible": 20000000, # Subió de 3M a 20M teniendo renta de 1M
    }
    prob, factors = predict_fraud(data)
    assert prob >= 99.0
    assert any("Avance de ahorro irreal detectado en 24h" in f for f in factors)
