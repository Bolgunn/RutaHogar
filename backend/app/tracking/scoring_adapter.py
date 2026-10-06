"""The existing score contract and engine remain the only financial authority."""

from copy import deepcopy
from math import isfinite
from types import NoneType
from typing import get_args

from .contracts import TrackingError

METADATA_FIELDS = {"project_goal", "property_value_source", "comuna_alternativa", "birth_date", "onboarding_snapshot"}


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
    if state.get("onboarding_snapshot") is not None and not isinstance(state["onboarding_snapshot"], dict):
        raise TrackingError("invalid_patch")
    try:
        result = ScoreRequest.model_validate(state).model_dump(mode="json")
    except ValidationError:
        raise TrackingError("invalid_patch") from None
    # Explicit clears are source facts, even where /score has legacy fallback aliases.
    result.update({name: None for name, value in state.items() if value is None})
    result.update({name: deepcopy(state[name]) for name in METADATA_FIELDS if name in state})
    return result


def market_snapshot_from_result(result):
    """Read the immutable BCCh bundle embedded in a prior evaluation result."""
    from ..market_data.snapshot import SnapshotValidationError, validate_snapshot

    candidate = (result or {}).get("financial_indicators", {}).get("capacidad_supuestos", {}).get("market_snapshot")
    try:
        return validate_snapshot(candidate)
    except SnapshotValidationError:
        return None


def resolve_tracking_market_snapshot():
    """I/O boundary for a new HU13 line; pure scoring never invokes this."""
    from ..market_data.service import MarketSnapshotUnavailable, resolve_market_snapshot_from_environment

    try:
        return resolve_market_snapshot_from_environment()
    except MarketSnapshotUnavailable as exc:
        raise TrackingError("market_data_unavailable") from exc


def score_snapshot(snapshot, *, market_snapshot=None):
    """Recalculate a complete HU13 state with one explicitly supplied BCCh bundle."""
    from ..scoring import calculate_score
    from ..market_data.snapshot import SnapshotValidationError, validate_snapshot

    supplied = market_snapshot if market_snapshot is not None else (snapshot or {}).get("market_snapshot")
    try:
        resolved = validate_snapshot(supplied)
    except SnapshotValidationError as exc:
        raise TrackingError("market_data_unavailable") from exc
    return calculate_score(deepcopy(snapshot), include_ai=False, market_snapshot=resolved)


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
