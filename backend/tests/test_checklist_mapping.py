import os
import sys
import asyncio
from pathlib import Path

os.environ["GROQ_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import ScoreRequest, score_endpoint


def base_payload(**overrides):
    payload = {
        "ingreso_mensual": 5_000_000,
        "deuda_mensual": 200_000,
        "edad": 35,
        "ahorro_disponible": 40_000_000,
        "property_value_clp": 100_000_000,
        "plazo_credito_hipotecario": 20,
        "tipo_contrato": "indefinido",
        "continuidad_laboral": "mas_3_anios",
        "morosidad_actual": "no",
        "dividendo_estimado": 900_000,
        "complemento_renta": False,
        "consentimiento": True,
        "declara_patrimonio": False,
    }
    payload.update(overrides)
    return payload


def post_score(payload):
    request = ScoreRequest(**payload)
    return asyncio.run(score_endpoint(request))


def test_risk_codes_exposed_in_api():
    """HU11 DoD: Verify risk_codes are exposed in score endpoint response."""
    result = post_score(base_payload())
    assert "risk_codes" in result, "risk_codes key must be present in score response"
    assert isinstance(result["risk_codes"], list)


def test_delinquency_risk_code_mapping():
    """HU11 E2: morosidad_alta/media maps to risk_codes."""
    result = post_score(
        base_payload(
            morosidad_actual="si",
            monto_morosidad=500_000,
            antiguedad_morosidad="3_a_12_meses",
        )
    )
    assert "risk_codes" in result
    assert "morosidad_alta" in result["risk_codes"]


def test_high_debt_risk_code_mapping():
    """HU11 E2: deuda_alta maps to risk_codes when debt exceeds 40% income."""
    result = post_score(
        base_payload(
            ingreso_mensual=2_000_000,
            deuda_mensual=900_000,
        )
    )
    assert "risk_codes" in result
    assert "deuda_alta" in result["risk_codes"]


def test_low_savings_risk_code_mapping():
    """HU11 E2: ahorro_bajo / precio_objetivo map to risk_codes when savings are low."""
    result = post_score(
        base_payload(
            ahorro_disponible=1_000_000,
            property_value_clp=100_000_000,
        )
    )
    assert "risk_codes" in result
    assert "ahorro_bajo" in result["risk_codes"]
    assert "precio_objetivo" in result["risk_codes"]


def test_work_continuity_and_independent_risk_codes():
    """HU11 E2: continuidad_baja & contrato_independiente map to risk_codes."""
    result = post_score(
        base_payload(
            tipo_contrato="independiente",
            continuidad_laboral="menos_6_meses",
        )
    )
    assert "risk_codes" in result
    assert "contrato_independiente" in result["risk_codes"] or "continuidad_baja" in result["risk_codes"]


if __name__ == "__main__":
    test_risk_codes_exposed_in_api()
    test_delinquency_risk_code_mapping()
    test_high_debt_risk_code_mapping()
    test_low_savings_risk_code_mapping()
    test_work_continuity_and_independent_risk_codes()
    print("All backend tests for HU11 checklist risk code mapping PASSED successfully!")
