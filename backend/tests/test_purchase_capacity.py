import json
import os
import sys
from pathlib import Path

import pytest

os.environ["GROQ_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring import calculate_score
from app.scoring_engine.indicators import calculate_financial_indicators
from app.scoring_engine.purchase_capacity import calculate_purchase_capacity

CASES_PATH = Path(__file__).resolve().parents[2] / "docs" / "algorithms" / "ALG-9-cases.json"
CASES = json.loads(CASES_PATH.read_text(encoding="utf-8"))["cases"]

CAPACITY_KEYS = {
    "capacidad_compra_estimada_uf",
    "capacidad_compra_estimada_clp",
    "capacidad_por_renta_uf",
    "capacidad_por_pie_uf",
    "capacidad_asistida_uf",
    "restriccion_vinculante",
    "dividendo_maximo_sostenible_clp",
    "capacidad_status",
    "capacidad_supuestos",
}


def _capacity(entrada: dict) -> dict:
    # property_value is 0 on purpose: ALG-9 is preference-independent and must not read it.
    indicators = calculate_financial_indicators(entrada, 0)
    return calculate_purchase_capacity(entrada, indicators)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_alg9_case(case):
    resultado = _capacity(case["input"])
    for key, expected in case["expect"].items():
        assert resultado[key] == expected, f"{case['name']} · {key}"


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_invariantes(case):
    resultado = _capacity(case["input"])
    capacidad = resultado["capacidad_compra_estimada_uf"]
    status = resultado["capacidad_status"]

    assert capacidad is None or capacidad >= 0
    assert "capacidad_supuestos" in resultado

    if status == "ok":
        assert capacidad == min(resultado["capacidad_por_renta_uf"], resultado["capacidad_por_pie_uf"])

    if status in {"ok", "sin_capacidad"}:
        assert resultado["restriccion_vinculante"] in {"renta", "pie"}
    else:
        assert resultado["restriccion_vinculante"] is None
        assert all(resultado[key] is None for key in CAPACITY_KEYS - {"capacidad_status", "capacidad_supuestos"})

    if resultado["capacidad_supuestos"]["plazo_bajo_minimo"]:
        assert status in {"ok", "sin_capacidad"}


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_es_determinista(case):
    assert _capacity(case["input"]) == _capacity(case["input"])


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_es_independiente_de_la_preferencia(case):
    con_preferencia = dict(case["input"])
    con_preferencia.update(
        {
            "comuna_objetivo": "Las Condes",
            "valor_propiedad": 250000000,
            "dividendo_estimado": 9999999,
        }
    )
    assert _capacity(con_preferencia) == _capacity(case["input"])


def test_score_no_pierde_ninguna_clave_previa():
    entrada = CASES[0]["input"]
    resultado = calculate_score(dict(entrada), include_ai=False)
    indicadores = resultado["financial_indicators"]

    previos = calculate_financial_indicators(entrada, indicadores["property_value_clp"])
    for key, valor in previos.items():
        assert indicadores[key] == valor, key
    assert set(indicadores) - set(previos) == CAPACITY_KEYS
