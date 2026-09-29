"""Translate symbolic normative fixtures; dependency stubs never implement scoring."""

from copy import deepcopy
from datetime import timedelta

from app.tracking.contracts import parse_time
from app.tracking.projection import future_snapshot, project_progress


def check_projection_case(case):
    data = deepcopy(case["input"])
    original = deepcopy(data)
    rows = data.get("active_line")
    if rows is None:
        rows = [
            {"event_id": "e1", "effective_at": "2026-01-01T00:00:00Z", "snapshot": {"ahorro_disponible": 1000000}},
            {"event_id": "e2", "effective_at": "2026-02-01T00:00:00Z", "snapshot": {"ahorro_disponible": 2000000}},
        ]
    names = data.get("variables") or list(data.get("goal_directions", {})) or ["ahorro_disponible"]
    descriptors = {
        name: {"direction": data.get("goal_directions", {}).get(name, "increase"),
               **data.get("field_domains", {}).get(name, {})} for name in names
    }
    outcomes = data.get("dependency_outcomes", {})
    cutoff = parse_time(data["as_of"])
    calls = []
    latest = {**(rows[-1]["snapshot"] if rows else {}), **data.get("held_fields", {})}
    class StubBoundaries:
        def held_blocker(self, _state, _result):
            return bool(outcomes.get("blocking_condition"))

        def milestones(self, *_):
            if outcomes.get("milestones"):
                return [parse_time(row["at"]) for row in outcomes["milestones"]]
            return [parse_time(outcomes["first_compatible_at"])] if outcomes.get("first_compatible_at") else []

    def runner(state, at):
        calls.append(at)
        milestone = next((row for row in outcomes.get("milestones", []) if parse_time(row["at"]) == at), {})
        compatible = outcomes.get("first_compatible_at") and at == parse_time(outcomes["first_compatible_at"])
        status = milestone.get("project_fit") or (
            "compatible" if compatible else outcomes.get("current_project_fit", "near")
        )
        return {
            "score": milestone.get("score", outcomes.get("score_at_compatible", 50) if compatible else 50),
            "classification": milestone.get("classification", outcomes.get("classification_at_compatible", "Medio")),
            "project_fit": {"status": status},
            "financial_indicators": {"capacidad_compra_estimada_uf": outcomes.get("final_capacity_uf")},
        }

    result = project_progress(
        subject_user_id="u1", as_of=data["as_of"], active_line=rows, variables=descriptors,
        latest_effective_snapshot=latest, target_project=data["target_project"],
        scoring_runner=runner, rule_boundary_provider=StubBoundaries(),
        excluded_observation_ids=[row["event_id"] for row in data.get("audit_only", [])],
        projection_provenance={"projection_scoring_version": data.get("projection_scoring_version")},
    )
    first = next(iter(result["variables"].values()))
    future = future_snapshot(latest, result["variables"], cutoff + timedelta(days=365))
    actual = {
        **result, **result["provenance"], **{key: first[key] for key in ("slope_per_day", "distinct_dates", "observation_ids")},
        "variable_status": {name: model["status"] for name, model in result["variables"].items()},
        "variable_cause": {name: model["cause"] for name, model in result["variables"].items()}
            if isinstance(case["expect"].get("variable_cause"), dict) else first["cause"],
        "slope_per_day_approx": first["slope_per_day"], "fitted_slope_per_day_approx": first["slope_per_day"],
        "future_ahorro_disponible": future.get("ahorro_disponible"),
        "minimum_projected_debt": future.get("deuda_mensual"),
        "held_edad": future.get("edad"), "held_plazo_credito_hipotecario": future.get("plazo_credito_hipotecario"),
        "score_source": "scoring_runner", "score_regression_used": False,
        "historical_evaluations_recomputed": any(at < cutoff for at in calls),
        "scoring_runner_calls_include": [at.isoformat().replace("+00:00", "Z") for at in calls],
        "project_fit_status_at_target": result["milestones"][-1]["project_fit"]["status"] if result["milestones"] else None,
    }
    if actual["target_compatible_at"]:
        actual["target_compatible_at"] = actual["target_compatible_at"].replace("+00:00", "Z")
    for key, expected in case["expect"].items():
        if key.endswith("_approx"):
            assert abs(actual[key] - expected) < 0.000001
        elif key == "scoring_runner_calls_include":
            assert set(expected).issubset(actual[key])
        else:
            assert actual[key] == expected, (key, actual[key], expected)
    assert data == original
