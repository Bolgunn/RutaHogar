"""Expand named test inputs; expected outputs always come from normative JSON."""

import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def cases(number):
    data = json.loads((ROOT / "docs" / "algorithms" / f"ALG-{number}-cases.json").read_text())
    assert len({case["name"] for case in data["cases"]}) == len(data["cases"])
    return data["cases"]


def flatten_result(result):
    flat = dict(result)
    for key in ("progress", "schedule", "verification", "evidence"):
        flat.update(result.get(key, {}))
    return flat


def assert_expected(actual, expected):
    for key, value in expected.items():
        assert key in actual, f"Missing output: {key}"
        assert actual[key] == value, key


def lineage_history(fixture):
    baseline = {
        "event_id": "e1", "event_kind": "baseline", "subject_user_id": "u1",
        "effective_at": "2026-01-01T12:00:00Z", "recorded_at": "2026-01-01T12:00:01Z",
        "reason": "first_evaluation",
        "patch": {"ingreso_mensual": 1000000, "deuda_mensual": 200000, "ahorro_disponible": 3000000},
    }
    baseline["recorded_complete_snapshot"] = copy.deepcopy(baseline["patch"])
    history = [baseline]
    if fixture == "latest_has_comuna_alternativa_maipu_and_income_1000000":
        baseline["patch"]["comuna_alternativa"] = "Maipú"
        baseline["recorded_complete_snapshot"]["comuna_alternativa"] = "Maipú"
    if fixture in {
        "e1_then_e2_savings_3500000", "e1_baseline_e2_savings_3500000_e3_debt_150000",
        "e1_e2_c2a_savings_3200000", "contains_event_e2", "contains_e2_savings_3500000",
    }:
        history.append({
            "event_id": "e2", "event_kind": "data_update", "subject_user_id": "u1",
            "effective_at": "2026-02-01T12:00:00Z", "recorded_at": "2026-02-01T12:00:01Z",
            "reason": "monthly_update", "previous": "e1", "patch": {"ahorro_disponible": 3500000},
            "recorded_complete_snapshot": {**baseline["patch"], "ahorro_disponible": 3500000},
        })
    if fixture == "e1_baseline_e2_savings_3500000_e3_debt_150000":
        history.append({
            "event_id": "e3", "event_kind": "data_update", "subject_user_id": "u1",
            "effective_at": "2026-03-01T12:00:00Z", "recorded_at": "2026-03-01T12:00:01Z",
            "reason": "monthly_update", "previous": "e2", "patch": {"deuda_mensual": 150000},
            "recorded_complete_snapshot": {**history[-1]["recorded_complete_snapshot"], "deuda_mensual": 150000},
        })
    if fixture == "e1_e2_c2a_savings_3200000":
        history.append({
            "event_id": "c2a", "event_kind": "correction", "subject_user_id": "u1",
            "effective_at": "2026-02-01T12:00:00Z", "recorded_at": "2026-02-03T09:00:00Z",
            "reason": "typing_error", "correction_of": "e2", "correction_effect": "replace",
            "patch": {"ahorro_disponible": 3200000},
            "recorded_complete_snapshot": {**baseline["patch"], "ahorro_disponible": 3200000},
        })
    return history
