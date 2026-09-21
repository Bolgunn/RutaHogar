"""The existing score contract and engine remain the only financial authority."""

from copy import deepcopy
from math import isfinite
from types import NoneType
from typing import get_args

from .contracts import TrackingError

METADATA_FIELDS = {"project_goal", "property_value_source", "comuna_alternativa", "birth_date"}


def financial_field_contract():
    # Imported at the boundary to avoid a main -> routes -> main import cycle.
    from ..main import ScoreRequest

    return {
        **{
            name: {"nullable": NoneType in get_args(field.annotation), "required": field.is_required()}
            for name, field in ScoreRequest.model_fields.items()
        },
        **{name: {"nullable": True} for name in METADATA_FIELDS},
    }


def complete_snapshot(state):
    from pydantic import ValidationError
    from ..main import ScoreRequest

    if set(state) - set(financial_field_contract()):
        raise TrackingError("invalid_patch")
    if any(isinstance(value, float) and not isfinite(value) for value in state.values()):
        raise TrackingError("invalid_patch")
    if state.get("project_goal") is not None and not isinstance(state["project_goal"], dict):
        raise TrackingError("invalid_patch")
    try:
        result = ScoreRequest.model_validate(state).model_dump(mode="json")
    except ValidationError:
        raise TrackingError("invalid_patch") from None
    # Explicit clears are source facts, even where /score has legacy fallback aliases.
    result.update({name: None for name, value in state.items() if value is None})
    result.update({name: deepcopy(state[name]) for name in METADATA_FIELDS if name in state})
    return result


def score_snapshot(snapshot):
    from ..scoring import calculate_score

    return calculate_score(deepcopy(snapshot), include_ai=False)


def provenance(result):
    indicators = result.get("financial_indicators", {})
    assumptions = deepcopy(indicators.get("capacidad_supuestos", {}))
    version = result["algorithm_version"]
    return {
        "scoring_version": version, "project_fit_version": version,
        "capacity_version": assumptions.get("version"),
        "market_assumptions": assumptions,
        "lineage_algorithm_version": "hu13-lineage-v1",
        "goal_algorithm_version": "hu13-goal-progress-v2",
    }
