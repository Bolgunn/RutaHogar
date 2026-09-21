import copy

import pytest

from case_support import assert_expected, cases, lineage_history


@pytest.mark.parametrize("case", cases(11), ids=lambda case: case["name"])
def test_alg11_case(case):
    from app.tracking.lineage import append_event, reconstruct

    data = copy.deepcopy(case["input"])
    history = data.get("history", lineage_history(data.get("history_fixture", "baseline_e1")))
    untouched = copy.deepcopy(history)
    field_contract = {
        "ingreso_mensual": {"nullable": False}, "deuda_mensual": {"nullable": False},
        "ahorro_disponible": {"nullable": False}, "comuna_alternativa": {"nullable": True},
        **data.get("field_contract", {}),
    }
    if "events_unordered" in data:
        events = data["events_unordered"]
        for event in events:
            event.update(subject_user_id="u1", reason="monthly_update")
        result = reconstruct(history + events, "u1", field_contract)
    else:
        event = data["event"] if "event" in data else copy.deepcopy(history[-1])
        event.setdefault("subject_user_id", data["subject_user_id"])
        if event.get("event_kind") == "data_update" and "previous" not in event:
            event["previous"] = history[-1]["event_id"]
        result = append_event(history, event, data["actor_user_id"], data["subject_user_id"], field_contract)
    assert history == untouched
    flat = dict(result)
    flat["active_event_ids"] = [row["event_id"] for row in result.get("active_line", [])]
    flat["audit_event_ids"] = [row["event_id"] for row in result.get("audit_line", [])]
    for field, value in (result.get("latest_effective_snapshot") or {}).items():
        flat[f"latest_{field}"] = value
    flat["stored_snapshot_of_e3_unchanged"] = history == untouched
    flat["records_appended"] = int(result.get("outcome") == "appended")
    flat["returned_event_id"] = (result.get("appended_record") or {}).get("event_id")
    assert_expected(flat, case["expect"])
