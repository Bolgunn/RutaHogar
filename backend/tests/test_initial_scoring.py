import json
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scoring import _apply_caps, _final_classification, _weighted
from app.scoring_engine.components import calculate_component_scores
from app.scoring_engine.indicators import calculate_financial_scope

DOCUMENT = json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-1-cases.json").read_text())


def scenarios():
    for case in DOCUMENT["cases"]:
        if case.get("scope") != "evaluation_precondition":
            yield case
        for variant in case.get("variants", []):
            if variant.get("scope") != "evaluation_precondition":
                yield variant


def assert_partial(actual, expected):
    for key, value in expected.items():
        if isinstance(value, dict):
            assert_partial(actual[key], value)
        elif isinstance(value, float):
            assert math.isclose(actual[key], value, rel_tol=0, abs_tol=1e-9), key
        else:
            assert actual[key] == value, key


@pytest.mark.parametrize("case", list(scenarios()), ids=lambda case: case["name"])
def test_alg1_component_cases(case):
    input_value = case["input"]
    components = calculate_component_scores(input_value["data"], input_value["indicators"], input_value["blockers"])
    base = _weighted(components)
    adjusted, _ = _apply_caps(base, input_value["blockers"])
    classification, _ = _final_classification(adjusted, input_value["blockers"])
    actual = {
        "component_scores": components,
        "base_score": base,
        "adjusted_score": adjusted,
        "score": adjusted,
        "original_classification": "Alto" if base >= 75 else "Medio" if base >= 50 else "Bajo",
        "classification": classification,
    }
    assert_partial(actual, case["expect"])
    if "expect_financial_scope" in case:
        assert_partial(calculate_financial_scope(input_value["data"]), case["expect_financial_scope"])
