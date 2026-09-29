"""ALG-13: observed OLS plus dependency-supplied, complete rule milestones."""

from copy import deepcopy
from datetime import timedelta
from math import fsum, isfinite

from .contracts import TrackingError, parse_time

ALGORITHM_VERSION = "hu13-observed-projection-v1"
SECONDS_PER_DAY = timedelta(days=1).total_seconds()


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and isfinite(value)


def fit_variable(active_line, field, descriptor, as_of):
    valid = []
    for row in active_line:
        value = row["snapshot"].get(field)
        if (parse_time(row["effective_at"]) <= as_of and numeric(value)
                and ("min" not in descriptor or value >= descriptor["min"])):
            valid.append(row)
    valid.sort(key=lambda row: (parse_time(row["effective_at"]), row["event_id"]))
    times = [parse_time(row["effective_at"]) for row in valid]
    result = {
        "status": "not_projectable", "cause": "insufficient_data",
        "slope_per_day": None, "intercept": None, "origin_at": times[0].isoformat() if times else None,
        "observation_ids": [row["event_id"] for row in valid], "distinct_dates": len(set(times)),
        "domain": deepcopy(descriptor),
    }
    if result["distinct_dates"] < 2:
        return result
    x = [(at - times[0]).total_seconds() / SECONDS_PER_DAY for at in times]
    y = [row["snapshot"][field] for row in valid]
    try:
        x_mean, y_mean = fsum(x) / len(x), fsum(y) / len(y)
        slope = fsum((a - x_mean) * (b - y_mean) for a, b in zip(x, y)) / fsum((a - x_mean) ** 2 for a in x)
        intercept = y_mean - slope * x_mean
    except (OverflowError, ValueError, ZeroDivisionError):
        return {**result, "cause": "invalid_numeric_series"}
    if not isfinite(slope) or not isfinite(intercept):
        return {**result, "cause": "invalid_numeric_series"}
    result.update(slope_per_day=slope, intercept=intercept)
    if slope == 0:
        result["cause"] = "zero_slope"
    elif (descriptor["direction"] == "increase" and slope < 0
          or descriptor["direction"] == "reduce" and slope > 0):
        result["cause"] = "adverse_direction"
    else:
        result.update(status="projected", cause=None)
    return result


def future_snapshot(latest, models, at):
    state = deepcopy(latest)
    for field, model in models.items():
        if model["status"] != "projected":
            continue
        days = (parse_time(at) - parse_time(model["origin_at"])).total_seconds() / SECONDS_PER_DAY
        value = model["intercept"] + model["slope_per_day"] * days
        domain = model["domain"]
        if "min" in domain:
            value = max(domain["min"], value)
        state[field] = value
    return state


def project_progress(
    *, subject_user_id, as_of, active_line, variables, latest_effective_snapshot,
    target_project, scoring_runner, rule_boundary_provider,
    excluded_observation_ids=(), projection_provenance=None,
):
    cutoff = parse_time(as_of)
    for row in active_line:
        if row.get("subject_user_id", subject_user_id) != subject_user_id:
            raise TrackingError("owner_mismatch")
    eligible = [row for row in active_line if parse_time(row["effective_at"]) <= cutoff]
    models = {field: fit_variable(eligible, field, descriptor, cutoff)
              for field, descriptor in variables.items()}
    versions = sorted({
        version for row in eligible
        if (version := row.get("scoring_version") or row.get("provenance", {}).get("scoring_version"))
    })
    used = {event_id for model in models.values() for event_id in model["observation_ids"]}
    output = {
        "status": "not_projectable", "cause": None, "cutoff_at": cutoff.isoformat(),
        "target_compatible_at": None, "variables": models, "milestones": [],
        "provenance": {
            **(projection_provenance or {}), "algorithm_version": ALGORITHM_VERSION,
            "source_scoring_versions": versions,
            "active_observation_ids": [row["event_id"] for row in eligible if row["event_id"] in used],
            "excluded_observation_ids": list(excluded_observation_ids),
        },
    }
    if not target_project:
        return {**output, "cause": "missing_project_goal"}
    latest = deepcopy(latest_effective_snapshot or {})
    latest["project_goal"] = deepcopy(target_project)
    current = scoring_runner(latest, cutoff)

    def material(at, state, result):
        return {
            "at": at.isoformat(),
            "projected_fields": {name: state.get(name) for name, model in models.items()
                                 if model["status"] == "projected"},
            "score": result["score"], "classification": result["classification"],
            "capacidad": {key: value for key, value in result.get("financial_indicators", {}).items()
                          if key.startswith("capacidad_") or key == "restriccion_vinculante"},
            "project_fit": deepcopy(result["project_fit"]),
        }

    if current and current.get("project_fit", {}).get("status") == "compatible":
        output["milestones"].append(material(cutoff, latest, current))
        return {**output, "status": "already_compatible", "target_compatible_at": cutoff.isoformat()}
    if not eligible or all(model["cause"] == "insufficient_data" for model in models.values()):
        return {**output, "cause": "insufficient_data"}
    if not current or current.get("project_fit", {}).get("status") in {None, "requires_info"}:
        return {**output, "cause": "incomplete_state"}
    output["milestones"].append(material(cutoff, latest, current))
    if rule_boundary_provider.held_blocker(latest, current):
        return {**output, "cause": "non_projectable_blocker"}
    if not any(model["status"] == "projected" for model in models.values()):
        return {**output, "cause": "no_favorable_trend"}
    state_at = lambda at: future_snapshot(latest, models, at)
    for at in sorted(set(rule_boundary_provider.milestones(latest, models, cutoff, state_at, scoring_runner))):
        at = parse_time(at)
        if at <= cutoff:
            continue
        state = state_at(at)
        result = scoring_runner(state, at)
        output["milestones"].append(material(at, state, result))
        if result["project_fit"]["status"] == "compatible":
            return {**output, "status": "projected", "target_compatible_at": at.isoformat()}
    return {**output, "cause": "objective_unreachable"}
