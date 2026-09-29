from copy import deepcopy
from itertools import permutations

import pytest

from app.tracking.contracts import TrackingError
from app.tracking.lineage import append_event, reconstruct
from case_support import lineage_history

FIELDS = {name: {"nullable": False} for name in ("ingreso_mensual", "deuda_mensual", "ahorro_disponible")}


def test_input_permutations_have_identical_lineage_and_audit():
    rows = lineage_history("e1_e2_c2a_savings_3200000")
    expected = reconstruct(rows, "u1", FIELDS)
    for order in permutations(rows):
        assert reconstruct(list(order), "u1", FIELDS) == expected


@pytest.mark.parametrize("reference", ["missing", "e2"])
def test_missing_and_cyclic_references_are_rejected_without_mutation(reference):
    rows = lineage_history("e1_then_e2_savings_3500000")
    rows[-1]["previous"] = reference
    original = deepcopy(rows)
    with pytest.raises(TrackingError, match="invalid_lineage"):
        reconstruct(rows, "u1", FIELDS)
    assert rows == original


def test_equal_timestamp_corrections_use_id_not_query_order():
    rows = lineage_history("e1_e2_c2a_savings_3200000")
    rows.append({**rows[-1], "event_id": "c2b", "correction_of": "c2a", "patch": {"ahorro_disponible": 1}})
    assert reconstruct(rows[::-1], "u1", FIELDS)["latest_effective_snapshot"]["ahorro_disponible"] == 1


def test_baseline_correction_keeps_identity_and_cannot_remove_required_state():
    rows = lineage_history("empty")
    correction = {
        "event_id": "c1", "event_kind": "correction", "subject_user_id": "u1",
        "effective_at": rows[0]["effective_at"], "recorded_at": "2026-03-01T00:00:00Z",
        "reason": "Corrección", "correction_of": "e1", "correction_effect": "replace",
        "patch": {**rows[0]["patch"], "ahorro_disponible": 1},
    }
    contract = {name: {**value, "required": True} for name, value in FIELDS.items()}
    result = append_event(rows, correction, "u1", "u1", contract)
    assert result["baseline_event_id"] == "e1"
    assert result["active_line"][0]["event_id"] == "c1"
    assert result["audit_line"][0] == rows[0]
    invalid = {**correction, "patch": {}, "correction_effect": "annul"}
    rejected = append_event(rows, invalid, "u1", "u1", contract)
    assert rejected["outcome"] == "rejected"
    assert rejected["error"] == "invalid_lineage"
    assert rows == lineage_history("empty")

    # A complete descendant does not make the baseline slot annullable: its
    # antecedents are corrected by replacing that immutable logical slot.
    complete_descendant = {
        "event_id": "e2", "event_kind": "data_update", "subject_user_id": "u1",
        "effective_at": "2026-02-01T00:00:00Z", "recorded_at": "2026-02-01T00:00:01Z",
        "reason": "Actualización completa", "previous": "e1", "patch": deepcopy(rows[0]["patch"]),
    }
    with_descendant = [*rows, complete_descendant]
    rejected = append_event(with_descendant, invalid, "u1", "u1", contract)
    assert rejected["outcome"] == "rejected"
    assert rejected["error"] == "invalid_lineage"
