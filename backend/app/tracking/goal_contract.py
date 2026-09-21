"""Freeze structured targets once; never derive numeric goals from legacy prose."""

from calendar import monthrange
from copy import deepcopy

from .constants import GOAL_ALGORITHM_VERSION
from .contracts import TrackingError, parse_time

NUMERIC_SOURCES = {
    "increase_savings": ("ahorro_disponible", "increase", "CLP"),
    "reduce_debt": ("deuda_mensual", "reduce", "CLP/month"),
    "adjust_property_goal": ("dividendo_estimado", "reduce", "CLP/month"),
    "regularize_debt": ("monto_morosidad", "reduce", "CLP"),
    "adjust_credit_term": ("plazo_credito_hipotecario", "reduce", "years"),
}


def freeze_goals(actions, baseline_at, goal_ids):
    if len(actions) != len(goal_ids) or len(set(goal_ids)) != len(goal_ids):
        raise TrackingError("invalid_goal_identity")
    start = parse_time(baseline_at)
    goals = []
    for index, (action, goal_id) in enumerate(zip(actions, goal_ids)):
        if not all(key in action for key in ("type", "current_value", "target_value")):
            raise TrackingError("invalid_goal_contract")
        source, direction, unit = NUMERIC_SOURCES.get(action["type"], (None, None, None))
        target_at = None
        if action.get("estimated_months") is not None:
            months = action["estimated_months"]
            if not isinstance(months, int) or months < 0:
                raise TrackingError("invalid_goal_contract")
            year, month = divmod(start.year * 12 + start.month - 1 + months, 12)
            month += 1
            target_at = start.replace(year=year, month=month, day=min(start.day, monthrange(year, month)[1])).isoformat()
        goals.append({
            "id": goal_id, "source_action_type": action["type"], "source_ordinal": index,
            "title": action.get("title", ""), "description": action.get("description", ""),
            "type": "numeric" if source else "categorical", "direction": direction,
            "initial_value": deepcopy(action["current_value"]), "target_value": deepcopy(action["target_value"]),
            "unit": unit, "source": source, "verifiable": source is not None,
            "target_at": target_at, "definition_version": GOAL_ALGORITHM_VERSION,
            "original_action": deepcopy(action),
        })
    return goals
