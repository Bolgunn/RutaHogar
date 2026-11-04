from datetime import datetime, timedelta, timezone

import pytest

from app.tracking.co_debtor_access import can_show_snapshot, project_row

NOW = datetime(2026, 11, 3, tzinfo=timezone.utc)


def declared():
    return {"input": {"complemento_renta": True, "ingreso_mensual_complementario": 1400000},
            "provenance": {"co_debtor_consent": {"complement_source": "lead_declared", "complement_confirmation_status": "not_confirmed"}},
            "result": {"score": 75, "recommendations": ["titular"], "improvement_plan": ["plan"]}}


def confirmed():
    snapshot = declared()
    snapshot["provenance"] = {"co_debtor_confirmation_id": "confirmed-1",
        "co_debtor_consent": {"complement_source": "co_debtor_confirmed"}}
    return snapshot


def invitation(status="confirmed", closed_at=None):
    return {"lead_id": "owner", "status": status,
            "co_debtor_confirmations": [{"id": "confirmed-1", "confirmed_at": "2026-09-01T00:00:00Z"}],
            "co_debtor_consent_events": ([{"event_type": "revoked", "occurred_at": closed_at.isoformat()}] if closed_at else [])}


@pytest.mark.parametrize("status", ["pending", "declined", "revoked"])
def test_owner_own_declaration_stays_visible_staff_is_redacted(status):
    snapshot = declared()
    row = {"user_id": "owner", "financial_data": snapshot}
    evidence = [{"lead_id": "owner", "status": status, "co_debtor_confirmations": [], "co_debtor_consent_events": []}]
    assert project_row(row, evidence, NOW, owner=True) == row
    staff = project_row(row, evidence, NOW, owner=False)
    assert staff["co_debtor_visibility"] == "hidden"
    assert "1400000" not in str(staff) and "recommendations" not in str(staff)


def test_confirmed_snapshot_only_visible_with_matching_participation_and_within_window():
    row = {"user_id": "owner", "financial_data": confirmed()}
    assert project_row(row, [invitation()], NOW, owner=True) == row
    assert project_row(row, [invitation()], NOW, owner=False) == row
    closed = invitation("revoked", NOW - timedelta(days=31))
    for owner in (True, False):
        for evidence in ([], [closed], [{**invitation(), "lead_id": "other"}]):
            result = project_row(row, evidence, NOW, owner=owner)
            assert result["co_debtor_visibility"] == "hidden"
            assert "1400000" not in str(result)


def test_owner_does_not_get_unverifiable_or_contradictory_confirmed_data():
    snapshot = declared()
    del snapshot["provenance"]
    assert not can_show_snapshot(snapshot, [], NOW, owner=True)
    snapshot = declared()
    snapshot["provenance"]["co_debtor_confirmation_id"] = "unknown"
    assert not can_show_snapshot(snapshot, [], NOW, owner=True)


def test_old_hidden_snapshot_does_not_block_later_individual_projection():
    from app.tracking.owner_reads import OwnerReadService

    class Repository:
        def co_debtor_rows(self, user_id):
            return [invitation("revoked", NOW - timedelta(days=31))]
        def owner_evaluations(self, user_id):
            return [{"id": "old", "user_id": "owner", "financial_data": confirmed()},
                    {"id": "new", "user_id": "owner", "financial_data": {"input": {"ingreso_mensual": 42}}}]

    view = {"status": "projected", "cutoff_at": NOW.isoformat(), "variables": {}, "milestones": [],
            "target_compatible_at": NOW.isoformat(),
            "provenance": {"active_observation_ids": ["new-event"]}}
    evidence = OwnerReadService(Repository(), "owner", NOW).projection_evidence()
    assert set(evidence) == {"new"}
    assert "1400000" not in str(evidence)


def test_confirmed_hu18_legacy_with_persisted_consent_is_not_discarded():
    from app.tracking.repository import TrackingRepository

    repo = TrackingRepository.__new__(TrackingRepository)
    legacy = {"id": "old-invitation", "status": "confirmed", "participant_user_id": None,
              "co_debtor_confirmations": [{"id": "old-confirmation", "revision_number": 1,
                "participant_user_id": None, "confirmed_at": "2026-09-01T00:00:00Z",
                "treatment_consent_version": "HU18", "treatment_consented_at": "2026-09-01T00:00:00Z"}],
              "co_debtor_consent_events": [{"event_type": "consent_granted", "actor_type": "co_debtor", "invitation_status": "confirmed",
                "occurred_at": "2026-09-01T00:00:00Z"}, {"event_type": "confirmed", "actor_type": "co_debtor", "invitation_status": "confirmed",
                "occurred_at": "2026-09-01T00:00:00Z"}]}
    repo.request = lambda method, path, **kwargs: [legacy] if method == "GET" else False
    facts = repo.load_co_debtor_consent("owner")
    assert facts["co_debtor_confirmed"]["participant_user_id"] is None
    assert not facts["exclude_complement"]


@pytest.mark.parametrize("status", ["pending", "declined", "revoked", "replaced"])
def test_legacy_terminal_or_pending_status_never_accepted(status):
    from app.tracking.co_debtor import is_legacy_confirmation
    item = legacy_evidence()
    item["status"] = status
    assert not is_legacy_confirmation(item, item["co_debtor_confirmations"][0])


def legacy_evidence():
    return {"id": "i", "status": "confirmed", "participant_user_id": None,
            "co_debtor_confirmations": [{"id": "c", "revision_number": 1, "participant_user_id": None,
                "request_id": None, "accepted_relation_event_id": None, "confirmed_at": "2026-09-01T00:00:00Z",
                "treatment_consented_at": "2026-09-01T00:00:00Z", "treatment_consent_version": "HU18"}],
            "co_debtor_consent_events": [{"event_type": event, "actor_type": "co_debtor", "invitation_status": "confirmed"}
                                         for event in ("consent_granted", "confirmed")]}


def test_legacy_evidence_rejects_ambiguous_or_incomplete_records():
    from app.tracking.co_debtor import is_legacy_confirmation
    from copy import deepcopy
    item = legacy_evidence()
    assert is_legacy_confirmation(item, item["co_debtor_confirmations"][0])
    for mutate in (lambda x: x["co_debtor_consent_events"].pop(),
                   lambda x: x["co_debtor_confirmations"][0].update(request_id="new"),
                   lambda x: x["co_debtor_confirmations"][0].update(treatment_consented_at=None),
                   lambda x: x["co_debtor_confirmations"].append(dict(x["co_debtor_confirmations"][0]))):
        changed = deepcopy(item); mutate(changed)
        assert not is_legacy_confirmation(changed, changed["co_debtor_confirmations"][0])


@pytest.mark.parametrize("consistent", [True, False])
def test_modern_confirmations_keep_strict_participant_rule(consistent):
    from app.tracking.repository import TrackingRepository
    item = legacy_evidence()
    item["participant_user_id"] = "participant"
    item["co_debtor_confirmations"][0].update(participant_user_id="participant" if consistent else "different",
        accepted_relation_event_id="relation", request_id="request")
    item["co_debtor_consent_events"].append({"id": "relation", "relation_revision": 1, "relation_value": "conyuge"})
    repo = TrackingRepository.__new__(TrackingRepository)
    repo.request = lambda method, path, **kwargs: [item] if method == "GET" else False
    assert repo.load_co_debtor_consent("owner")["exclude_complement"] is not consistent


@pytest.mark.parametrize("kinds,visible_ids,expected", [
    (["individual", "individual"], {"e0", "e1"}, ["event0", "event1"]),
    (["legacy_hidden", "individual"], {"e1"}, ["event1"]),
    (["confirmed_visible", "individual"], {"e0", "e1"}, ["event0", "event1"]),
    (["revoked_hidden", "individual"], {"e1"}, ["event1"]),
    (["legacy_hidden", "revoked_hidden"], set(), []),
    (["individual", "legacy_hidden", "individual"], {"e0", "e2"}, ["event0", "event2"]),
])
def test_projection_calculates_only_from_visible_persisted_inputs(monkeypatch, kinds, visible_ids, expected):
    from app.tracking.service import TrackingService
    import app.tracking.projection as algorithm
    import app.tracking.service as service_module

    line = [{"event_id": f"event{i}", "evaluation_id": f"e{i}",
             "effective_at": f"2026-10-{i+1:02}T00:00:00Z",
             "snapshot": {"ingreso_mensual": 987654321, "complemento_renta": True}}
            for i in range(len(kinds))]
    evaluations = {f"e{i}": {"input": {"ingreso_mensual": 1000 + i, "project_goal": {"id": "p"}}}
                   for i in range(len(kinds)) if f"e{i}" in visible_ids}
    service = TrackingService.__new__(TrackingService)
    service.read = lambda user, as_of: {"status": "active", "cutoff_at": NOW.isoformat(),
        "active_line": line, "audit_line": [], "baseline": {"target_project_snapshot": {"id": "hidden-target"}},
        "latest_effective_snapshot": {"ingreso_mensual": 987654321}}
    service.market_snapshot_resolver = lambda: None
    service._score = lambda state, market: None
    monkeypatch.setattr(service_module, "valid_project_snapshot", lambda state: state.get("project_goal"))
    monkeypatch.setattr(algorithm, "project_progress", lambda **kwargs: kwargs)
    output = service.projection("owner", visible_evaluations=evaluations)
    if not expected:
        assert output["status"] == "not_projectable" and not output["milestones"]
    else:
        assert [row["event_id"] for row in output["active_line"]] == expected
        assert output["target_project"] == {"id": "p"}
        assert "987654321" not in str(output) and "hidden-target" not in str(output)


def test_projection_does_not_fall_back_to_older_visible_when_current_is_hidden():
    from app.tracking.service import TrackingService
    service = TrackingService.__new__(TrackingService)
    service.read = lambda user, as_of: {"status": "active", "cutoff_at": NOW.isoformat(), "audit_line": [],
        "active_line": [{"event_id": "old", "evaluation_id": "visible", "effective_at": "2026-10-01T00:00:00Z"},
                        {"event_id": "new", "evaluation_id": "hidden", "effective_at": "2026-10-02T00:00:00Z"}]}
    assert service.projection("owner", visible_evaluations={"visible": {"input": {"ingreso_mensual": 1}}})["status"] == "not_projectable"


def test_real_alg13_outputs_only_visible_individual_milestone(monkeypatch):
    from app.tracking.service import TrackingService
    import app.tracking.service as service_module
    service = TrackingService.__new__(TrackingService)
    service.read = lambda user, as_of: {"status": "active", "cutoff_at": NOW.isoformat(),
        "active_line": [{"event_id": "hidden", "evaluation_id": "old", "effective_at": "2026-10-01T00:00:00Z",
                         "snapshot": {"ingreso_mensual": 987654321}},
                        {"event_id": "visible", "evaluation_id": "new", "effective_at": "2026-10-02T00:00:00Z",
                         "snapshot": {"ingreso_mensual": 987654321}}],
        "audit_line": [], "baseline": {"target_project_snapshot": {"id": "hidden"}}}
    service.market_snapshot_resolver = lambda: None
    service._score = lambda state, market: {"score": 70, "classification": "Alto", "algorithm_version": "test",
                                              "project_fit": {"status": "compatible"}}
    monkeypatch.setattr(service_module, "valid_project_snapshot", lambda state: state.get("project_goal"))
    output = service.projection("owner", visible_evaluations={"new": {"input": {
        "ingreso_mensual": 1000, "ahorro_disponible": 200, "deuda_mensual": 0, "project_goal": {"id": "visible"}}}})
    assert output["status"] == "already_compatible"
    assert output["provenance"]["active_observation_ids"] == ["visible"]
    assert output["milestones"] and "987654321" not in str(output)
    assert "hidden" not in str(output)


def test_legacy_guard_corrective_preserves_original_modern_guard():
    from pathlib import Path
    root = Path(__file__).resolve().parents[3]
    original = (root / "supabase/migrations/20261021120000_hu30_confirmation_revisions.sql").read_text()
    corrective = (root / "supabase/migrations/20261103120000_hu30_hu18_legacy_confirmation_guard.sql").read_text()
    guard = original.split("  select max(revision_number) into latest", 1)[1].split("drop trigger", 1)[0]
    assert "  select max(revision_number) into latest" + guard in corrective
    for field in ("treatment_consented_at", "treatment_consent_version", "consent_granted", "confirmed",
                  "request_id is null", "participant_user_id is null", "actor_user_id is null"):
        assert field in corrective
