from copy import deepcopy
from datetime import timedelta

import pytest

from app.scoring_engine.rule_boundaries import RuleBoundaryProvider
from app.tracking.contracts import TrackingError, parse_time
from app.tracking.projection import project_progress, future_snapshot
from app.tracking.scoring_adapter import score_snapshot
from test_service import valid_snapshot


def projection(latest=None, rows=None):
    snapshot = latest or {**valid_snapshot(), "ingreso_mensual": 2000000, "dividendo_estimado": 300000}
    history = rows or [
        {"event_id": "e1", "effective_at": "2026-01-01T00:00:00Z", "snapshot": {**snapshot, "ahorro_disponible": 1000000}},
        {"event_id": "e2", "effective_at": "2026-01-31T00:00:00Z", "snapshot": {**snapshot, "ahorro_disponible": 2000000}},
    ]
    inputs = {
        "subject_user_id": "u1", "as_of": "2026-01-31T00:00:00Z", "active_line": history,
        "variables": {"ahorro_disponible": {"direction": "increase", "min": 0}},
        "latest_effective_snapshot": history[-1]["snapshot"], "target_project": {"id": "p1"},
        "scoring_runner": lambda state, _at: score_snapshot(state),
        "rule_boundary_provider": RuleBoundaryProvider(),
    }
    return inputs


def test_first_compatible_uses_real_engines_and_first_representable_instant():
    inputs = projection()
    before = deepcopy(inputs["active_line"])
    result = project_progress(**inputs)
    assert result["status"] == "projected"
    target = parse_time(result["target_compatible_at"])
    state = future_snapshot(inputs["latest_effective_snapshot"], result["variables"], target)
    prior = future_snapshot(inputs["latest_effective_snapshot"], result["variables"], target - timedelta(microseconds=1))
    assert score_snapshot(state)["project_fit"]["status"] == "compatible"
    assert score_snapshot(prior)["project_fit"]["status"] != "compatible"
    assert result["milestones"][-1]["capacidad"]["capacidad_supuestos"]["version"] == "e4-matching-v1"
    assert inputs["active_line"] == before


def test_age_blocker_is_held_but_morosidad_is_not_invented_as_project_blocker():
    blocked = projection({**valid_snapshot(), "edad": 68, "ingreso_mensual": 2000000})
    assert project_progress(**blocked)["cause"] == "non_projectable_blocker"
    delinquent = projection({**valid_snapshot(), "morosidad_actual": "si", "ingreso_mensual": 2000000})
    assert project_progress(**delinquent)["status"] == "projected"


def test_other_owner_rejected_and_future_observations_do_not_enter_ols():
    inputs = projection()
    inputs["active_line"].append({
        "event_id": "future", "subject_user_id": "other",
        "effective_at": "2026-03-01T00:00:00Z", "snapshot": {"ahorro_disponible": 999999999},
    })
    with pytest.raises(TrackingError, match="owner_mismatch"):
        project_progress(**inputs)
    inputs["active_line"][-1]["subject_user_id"] = "u1"
    assert project_progress(**inputs)["variables"]["ahorro_disponible"]["observation_ids"] == ["e1", "e2"]


def test_boundary_provider_delegates_to_engine_predicates(monkeypatch):
    calls = {"financial": 0, "capacity": 0}
    provider_globals = RuleBoundaryProvider.milestones.__globals__
    real_financial = provider_globals["financial_rule_margins"]
    real_capacity = provider_globals["capacity_rule_margins"]

    def financial(state, indicators):
        calls["financial"] += 1
        return real_financial(state, indicators)

    def capacity(state, indicators):
        calls["capacity"] += 1
        return real_capacity(state, indicators)

    monkeypatch.setitem(provider_globals, "financial_rule_margins", financial)
    monkeypatch.setitem(provider_globals, "capacity_rule_margins", capacity)

    inputs = projection()
    project_progress(**inputs)

    assert calls["financial"] > 0
    assert calls["capacity"] > 0
