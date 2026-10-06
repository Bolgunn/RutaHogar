"""ALG-12: progress against an immutable quantitative or conditional baseline."""

from math import isfinite

from .constants import TEMPORAL_TOLERANCE_PP
from .contracts import parse_time


def calculate_goal_progress(
    goal, baseline_at, as_of, current_value=None, target_at=None,
    prior_goal_events=None, manual_confirmation=None,
):
    prior = [event for event in prior_goal_events or [] if event.get("active", True)]
    completed = [event["event_id"] for event in prior if event["action_status"] == "cumplida"]
    initial, target = goal.get("initial_value"), goal.get("target_value")
    verifiable = goal["verifiable"]
    received = manual_confirmation is not None
    confirmed = bool(manual_confirmation and manual_confirmation.get("confirmed"))
    accepted, rejection = False, None
    percentage, remaining = None, None
    sufficient = current_value is not None
    if not verifiable:
        accepted = confirmed
        percentage = 100 if confirmed else 0
        sufficient = True
        remaining = None if confirmed else target
    elif goal["type"] == "numeric":
        sufficient = (
            isinstance(current_value, (int, float)) and not isinstance(current_value, bool)
            and isfinite(current_value)
        )
        if sufficient:
            increase = goal["direction"] == "increase"
            fulfilled = current_value >= target if increase else current_value <= target
            baseline_satisfied = initial >= target if increase else initial <= target
            remaining = max(target - current_value if increase else current_value - target, 0)
            if baseline_satisfied:
                percentage = 100 if fulfilled else 0
            else:
                percentage = max(0, min(100, 100 * (current_value - initial) / (target - initial)))
    elif sufficient:
        percentage = 100 if current_value == target else 0
        remaining = None if percentage == 100 else target
    if verifiable and confirmed and sufficient and percentage != 100:
        rejection = "verifiable_data_contradiction"
    if not sufficient:
        action = prior[-1]["action_status"] if prior else "pendiente"
    else:
        action = "cumplida" if percentage == 100 else "en_progreso" if percentage > 0 else "pendiente"
    expected, temporal = None, None
    temporal_reason = "insufficient_data" if not sufficient else "missing_target_date"
    if sufficient and target_at is not None:
        start, end, cutoff = map(parse_time, (baseline_at, target_at, as_of))
        expected = 100 if end <= start else max(0, min(100, 100 * (cutoff - start) / (end - start)))
        temporal_reason = None
        temporal = (
            "adelantado" if percentage > expected + TEMPORAL_TOLERANCE_PP
            else "atrasado" if percentage < expected - TEMPORAL_TOLERANCE_PP
            else "dentro_de_lo_esperado"
        )
    return {
        "goal_id": goal["id"], "calculation_status": "ok" if sufficient else "insufficient_data",
        "action_status": action, "temporal_status": temporal, "temporal_status_reason": temporal_reason,
        "progress": {
            "initial_value": initial, "current_value": current_value, "target_value": target,
            "percentage": percentage, "remaining_value": remaining,
        },
        "schedule": {"expected_percentage": expected, "tolerance_pp": TEMPORAL_TOLERANCE_PP},
        "verification": {
            "verifiable": verifiable, "source": goal.get("source"),
            "manual_confirmation_received": received, "manual_confirmation_accepted": accepted,
            "rejection_reason": rejection,
        },
        "evidence": {
            "ever_completed": bool(completed), "completion_event_ids": completed,
            "currently_regressed": bool(completed) and action != "cumplida",
        },
    }
