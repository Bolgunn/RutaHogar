import os
import sys
import asyncio
from pathlib import Path

os.environ["GROQ_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError

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


def blocker_codes(result):
    return {blocker.get("code") for blocker in result.get("blockers", [])}


def improvement_action_types(result):
    return {action.get("type") for action in result.get("structured_improvement_plan", [])}


def test_high_profile_without_blockers_is_high_and_project_compatible():
    result = post_score(base_payload())

    assert result["classification"] == "Alto"
    assert result["score"] >= 75
    assert result["project_fit"]["compatible"] is True
    assert result["project_fit"]["classification"] == "Compatible"
    assert result["commercial_priority_detail"]["action"] == "Contactar ahora"
    assert result["main_blocker"] is None


def test_current_delinquency_caps_high_profile_to_medium():
    result = post_score(
        base_payload(
            morosidad_actual="si",
            monto_morosidad=1_200_000,
            antiguedad_morosidad="3_a_12_meses",
        )
    )

    assert result["classification"] == "Medio"
    assert result["original_classification"] == "Alto"
    assert result["main_blocker"]["code"] == "morosidad_vigente"
    assert result["commercial_priority_detail"]["action"] == "No derivar todavía"


def test_insufficient_down_payment_creates_blocker_and_savings_plan():
    result = post_score(base_payload(ahorro_disponible=1_000_000))

    assert "pie_insuficiente" in blocker_codes(result)
    assert "increase_savings" in improvement_action_types(result)


def test_high_debt_creates_debt_blocker_and_reduction_plan():
    result = post_score(
        base_payload(
            ingreso_mensual=2_000_000,
            deuda_mensual=900_000,
            dividendo_estimado=400_000,
            ahorro_disponible=20_000_000,
            property_value_clp=80_000_000,
        )
    )

    assert blocker_codes(result).intersection({"deuda_actual_alta", "carga_total_alta"})
    assert "reduce_debt" in improvement_action_types(result)


def test_incomplete_income_complement_requires_validation_or_more_information():
    try:
        result = post_score(
            base_payload(
                complemento_renta=True,
                ingreso_mensual_complementario=None,
                deuda_mensual_complementario=None,
                tipo_contrato_complementario=None,
                continuidad_laboral_complementario=None,
                morosidad_complementario=None,
                relacion_complementario=None,
            )
        )
    except ValidationError:
        return

    assert result["classification"] == "Requiere antecedentes"
    assert "complemento_incompleto" in blocker_codes(result)


def test_weak_income_complement_relation_creates_blocker():
    result = post_score(
        base_payload(
            complemento_renta=True,
            ingreso_mensual_complementario=2_000_000,
            deuda_mensual_complementario=100_000,
            tipo_contrato_complementario="indefinido",
            continuidad_laboral_complementario="mas_3_anios",
            morosidad_complementario="no",
            relacion_complementario="amigo",
        )
    )

    assert "complemento_debil" in blocker_codes(result)


def test_age_and_long_term_creates_risky_term_blocker():
    result = post_score(base_payload(edad=60, plazo_credito_hipotecario=15))

    assert "edad_plazo_riesgoso" in blocker_codes(result)
    assert "adjust_credit_term" in improvement_action_types(result)


def test_score_does_not_require_groq_api_key(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "")

    result = post_score(base_payload())

    assert result["score"] >= 0
    assert result["classification"] in {"Alto", "Medio", "Bajo", "Requiere antecedentes"}
    assert "ai_explanation" in result
    assert "user_explanation_deterministic" in result


if __name__ == "__main__":
    test_high_profile_without_blockers_is_high_and_project_compatible()
    test_current_delinquency_caps_high_profile_to_medium()
    test_insufficient_down_payment_creates_blocker_and_savings_plan()
    test_high_debt_creates_debt_blocker_and_reduction_plan()
    test_incomplete_income_complement_requires_validation_or_more_information()
    test_weak_income_complement_relation_creates_blocker()
    test_age_and_long_term_creates_risky_term_blocker()
    class DummyMonkeypatch:
        def setenv(self, key, val):
            os.environ[key] = val
    test_score_does_not_require_groq_api_key(DummyMonkeypatch())
    print("All professional score tests PASSED successfully!")

