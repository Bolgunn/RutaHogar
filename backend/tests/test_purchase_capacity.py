import json
import math
import os
import sys
from pathlib import Path

import pytest

os.environ["GROQ_API_KEY"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring_engine.indicators import calculate_financial_scope
from app.scoring_engine.purchase_capacity import calculate_purchase_capacity

DOCUMENT = json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-9-cases.json").read_text())


def scenarios():
    for case in DOCUMENT["cases"]:
        yield case
        for variant in case.get("variants", []):
            yield variant


def assert_partial(actual, expected, path=""):
    if path.endswith(".version") and expected == "initial-scoring-snapshot-draft":
        # Documentary fixture label is intentionally not the runtime version (PLAN step 5).
        return
    if isinstance(expected, dict):
        for key, value in expected.items():
            assert key in actual, f"missing {path}.{key}"
            assert_partial(actual[key], value, f"{path}.{key}")
    elif isinstance(expected, float):
        tolerance = DOCUMENT["numeric_tolerances"].get(path.lstrip("."), 0)
        assert math.isclose(actual, expected, rel_tol=0, abs_tol=tolerance), path
    else:
        assert actual == expected, path


@pytest.mark.parametrize("case", list(scenarios()), ids=lambda case: case["name"])
def test_alg9_cases(case):
    result = calculate_purchase_capacity(case["input"])
    assert_partial(result, case["expect"])
    if "expect_financial_scope" in case:
        assert_partial(calculate_financial_scope(case["input"]), case["expect_financial_scope"])


@pytest.mark.parametrize("case", list(scenarios()), ids=lambda case: case["name"])
def test_alg9_invariants(case):
    result = calculate_purchase_capacity(case["input"])
    assert result["capacidad_supuestos"]
    if result["capacidad_status"] in {"ok", "sin_capacidad"}:
        assert result["capacidad_compra_estimada_uf"] == min(result["capacidad_por_renta_uf"], result["capacidad_por_pie_uf"])
    else:
        assert result["restriccion_vinculante"] is None
