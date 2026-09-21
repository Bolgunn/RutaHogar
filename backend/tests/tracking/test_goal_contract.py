from copy import deepcopy

from app.scoring_engine.blockers import detect_blockers
from app.scoring_engine.improvement_plan import build_structured_improvement_plan
from app.scoring_engine.indicators import calculate_financial_indicators
from app.tracking.goal_contract import freeze_goals
from app.tracking.goal_progress import calculate_goal_progress


def test_real_reduce_debt_already_satisfied_preserves_original_quantities():
    snapshot = {
        "ingreso_mensual": 1000000, "deuda_mensual": 200000,
        "ahorro_disponible": 10000000, "dividendo_estimado": 300000,
    }
    indicators = calculate_financial_indicators(snapshot, 100000000)
    actions = build_structured_improvement_plan(snapshot, indicators, detect_blockers(snapshot, indicators))
    original = deepcopy(actions)
    goals = freeze_goals(actions, "2026-01-01T00:00:00Z", [f"g{i}" for i in range(len(actions))])
    debt_goal = next(goal for goal in goals if goal["source_action_type"] == "reduce_debt")
    assert debt_goal["direction"] == "reduce"
    assert debt_goal["initial_value"] == 200000
    assert debt_goal["target_value"] == 300000
    progress = calculate_goal_progress(
        debt_goal, "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z",
        current_value=snapshot["deuda_mensual"], target_at=debt_goal["target_at"],
    )
    assert progress["action_status"] == "cumplida"
    assert progress["progress"]["percentage"] == 100
    assert actions == original


def test_no_prose_parser_and_calendar_month_end():
    action = {
        "type": "review_installment_down_payment", "title": "Texto no numérico",
        "current_value": 0, "target_value": 0, "estimated_months": 1,
    }
    goal = freeze_goals([action], "2026-01-31T00:00:00Z", ["g1"])[0]
    assert not goal["verifiable"]
    assert goal["source"] is None
    assert goal["target_at"].startswith("2026-02-28")
    assert goal["original_action"] == action


def test_empty_structured_plan_remains_empty():
    assert freeze_goals([], "2026-01-01T00:00:00Z", []) == []
