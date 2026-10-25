from copy import deepcopy
from datetime import datetime, timedelta, timezone

import pytest

from app.tracking.co_debtor import historical_visibility, select_confirmation
from app.tracking.co_debtor_access import project_row
from app.tracking.contracts import TrackingError
from app.tracking.repository import select_current_co_debtor_invitation
from app.tracking.staff import StaffLeadService
from test_staff_co_debtor_projection import StaffRepository, LEAD_ID, OUTSIDE_LEAD_ID, confirmed_values

NOW = datetime(2026, 10, 21, tzinfo=timezone.utc)


def participation(status="confirmed", closed_at=None):
    rows = [{"id": "v2", "revision_number": 2, "confirmed_at": "2026-09-01T00:00:00Z", **confirmed_values()},
            {"id": "v1", "revision_number": 1, "confirmed_at": "2026-08-01T00:00:00Z", **confirmed_values()}]
    return {"id": "participation-1", "lead_id": LEAD_ID, "status": status,
            "co_debtor_confirmations": rows,
            "co_debtor_consent_events": [{"event_type": status, "occurred_at": closed_at.isoformat()}] if closed_at else []}


def snapshot_row(ref="v1"):
    return {"id": "evaluation-1", "user_id": LEAD_ID, "financial_data": {
        "input": {"ingreso_mensual": 1000000, "complemento_renta": True, **confirmed_values()},
        "provenance": {"co_debtor_confirmation_id": ref},
        "result": {"score": 75, "classification": "Alto", "ai_explanation": "Co-deudor: $1.400.000",
                   "financial_indicators": {"ingreso_principal": 1000000, "ingreso_total": 2400000,
                                            "ingreso_complementario_considerado": 1400000}}}}


def test_single_legacy_confirmation_is_readable_without_fabricated_identity():
    legacy = confirmed_values()
    assert select_confirmation([legacy]) == legacy
    assert "participant_user_id" not in legacy


def test_revision_selection_is_explicit_and_history_keeps_its_uuid():
    rows = participation()["co_debtor_confirmations"]
    original = deepcopy(rows)
    assert select_confirmation(rows)["id"] == "v2"
    assert select_confirmation(rows, "v1")["id"] == "v1"
    assert select_confirmation(rows, "missing") is None
    assert rows == original


@pytest.mark.parametrize("rows", [[{"revision_number": 1}, {"revision_number": 1}],
                                  [{"revision_number": 1}, {}], [{"revision_number": 0}]])
def test_ambiguous_revisions_fail_closed(rows):
    with pytest.raises(TrackingError, match="co_debtor_revision_conflict"):
        select_confirmation(rows)


def test_pending_selection_is_not_truncated_or_dependent_on_response_order():
    rows = [{"id": str(i), "created_at": f"2026-10-{i+1:02}T00:00:00Z", "status": "revoked"} for i in range(15)]
    pending = {"id": "old-pending", "created_at": "2026-01-01", "status": "pending"}
    assert select_current_co_debtor_invitation([*rows, pending]) == pending


@pytest.mark.parametrize("status", ["revoked", "replaced"])
def test_window_is_visible_before_but_not_at_exact_thirty_day_cutoff(status):
    closed = NOW - timedelta(days=30)
    item = participation(status, closed)
    assert historical_visibility(item, NOW - timedelta(microseconds=1))["visible"]
    assert not historical_visibility(item, NOW)["visible"]


def test_later_revocation_does_not_restart_window():
    item = participation("replaced", NOW - timedelta(days=31))
    first = historical_visibility(item, NOW)
    item["status"] = "revoked"
    item["co_debtor_consent_events"].append({"event_type": "revoked", "occurred_at": NOW.isoformat()})
    assert historical_visibility(item, NOW) == first


def test_unknown_closure_timestamp_does_not_invent_grace_period():
    assert not historical_visibility(participation("revoked"), NOW)["visible"]


def test_expired_snapshot_projection_removes_derivable_values_and_narratives_not_evidence():
    row = snapshot_row()
    original = deepcopy(row)
    item = participation("revoked", NOW - timedelta(days=31))
    result = project_row(row, [item], NOW, owner=True)
    serialized = str(result)
    assert "1400000" not in serialized and "$1.400.000" not in serialized
    assert "ingreso_total" not in serialized
    assert result["financial_data"]["result"]["score"] == 75
    assert row == original


def test_grace_period_preserves_exact_used_revision_snapshot():
    row = snapshot_row()
    item = participation("revoked", NOW - timedelta(days=29))
    assert project_row(row, [item], NOW) == row


@pytest.mark.parametrize("role,tenant", [("ejecutivo", "tenant-1"), ("admin_inmobiliario", "tenant-1"), ("admin", None)])
def test_staff_projection_keeps_authorization_and_uses_pinned_revision(role, tenant):
    repo = StaffRepository()
    repo.rows = [snapshot_row()]
    repo.invitation = participation()
    repo.co_debtor_rows = lambda ids: [participation()]
    repo.staff_actor = lambda token: {"id": "staff-1", "role": role, "inmobiliaria_id": tenant}
    service = StaffLeadService(repo, clock=lambda: NOW)
    assert service.lead_detail("token", LEAD_ID)["co_debtor"]["used_revision"]["id"] == "v1"
    with pytest.raises(TrackingError, match="owner_mismatch"):
        service.lead_detail("token", OUTSIDE_LEAD_ID)


def test_pending_replacement_that_was_restored_does_not_close_later_confirmation():
    item = participation()
    item['co_debtor_consent_events'] = [{'event_type': 'replaced', 'occurred_at': '2026-07-01T00:00:00Z'}]
    assert historical_visibility(item, NOW)['visible']
    assert historical_visibility(item, NOW)['closure_at'] is None


def test_owner_history_merges_annotations_only_while_snapshot_is_visible():
    from app.tracking.owner_reads import OwnerReadService

    repo = StaffRepository()
    item = participation('revoked', NOW - timedelta(days=31))
    row = snapshot_row()
    repo.co_debtor_rows = lambda ids: [item]
    repo.history_rows = [{**row, 'evaluation_id': row['id'], 'snapshot': row['financial_data']}]
    repo.owner_annotations = lambda user: [{'evaluation_id': row['id'], 'kind': 'milestone',
                                          'payload': {'details': 'Co-deudor $1.400.000'}}]
    output = OwnerReadService(repo, LEAD_ID, NOW).history()
    assert '$1.400.000' not in str(output)
    item['co_debtor_consent_events'] = []
    item['status'] = 'confirmed'
    assert OwnerReadService(repo, LEAD_ID, NOW).history()['items'][0]['events'][0]['details'] == 'Co-deudor $1.400.000'


@pytest.mark.parametrize('snapshot', [
    {'input_snapshot': {'complemento_renta': True}},
    {'result_snapshot': {'financial_indicators': {'ingreso_complementario_considerado': 100}}},
    {'input': {'complemento_renta': False, 'ingreso_mensual_complementario': 100}},
])
def test_unknown_legacy_shapes_are_redacted_instead_of_becoming_individual(snapshot):
    output = project_row({'snapshot': snapshot}, [], NOW)
    assert output['co_debtor_visibility'] == 'hidden'
    assert 'ingreso_mensual_complementario' not in str(output)


def test_every_confirmed_evaluation_records_the_canonical_revision_and_effective_relation():
    from test_co_debtor_confirmation import service, confirmed_facts, declared_snapshot
    from test_service import command

    repo, tracking = service()
    repo.co_debtor_consent = {**confirmed_facts(), 'revision_number': 2,
                            'relation_declaration_event_id': 'relation-v2',
                            'declared_relation': 'padre_madre'}
    tracking.execute('u1', command(declared_snapshot()))
    stored = repo.bundle['evaluations'][0]['financial_data']
    assert stored['provenance']['co_debtor_confirmation_id'] == repo.co_debtor_consent['co_debtor_confirmed']['id']
    assert stored['provenance']['co_debtor_consent']['revision_number'] == 2
    assert stored['provenance']['co_debtor_consent']['relation_declaration_event_id'] == 'relation-v2'
    assert stored['input']['relacion_complementario'] == 'padre_madre'


def test_unlinked_legacy_confirmation_cannot_be_reused_for_a_new_confirmed_evaluation():
    from test_co_debtor_confirmation import service, confirmed_facts, declared_snapshot
    from test_service import command

    repo, tracking = service()
    repo.co_debtor_consent = {**confirmed_facts(), 'exclude_complement': True}
    tracking.execute('u1', command(declared_snapshot()))
    stored = repo.bundle['evaluations'][0]['financial_data']
    assert not stored['input']['complemento_renta']
    assert not stored['provenance'].get('co_debtor_confirmation_id')


def test_goals_derived_from_closed_baseline_are_hidden_even_after_new_individual_evaluation():
    from app.tracking.owner_reads import OwnerReadService

    repo = StaffRepository()
    repo.co_debtor_rows = lambda ids: [participation('revoked', NOW - timedelta(days=31))]
    repo.owner_evaluations = lambda user: [snapshot_row(), {'id': 'individual', 'financial_data': {'input': {'ingreso_mensual': 1}}}]
    output = OwnerReadService(repo, LEAD_ID, NOW).tracking_view({
        'current_evaluation_id': 'individual', 'baseline': {'baseline_evaluation_id': 'evaluation-1'},
        'goals': [{'definition': {'description': 'Co-deudor $1.400.000', 'target_value': 1400000}}]})
    assert output['goals'] == []


@pytest.mark.parametrize('matches', [True, False])
def test_t4b_equality_controls_only_the_existing_recalculation_signal(matches):
    from test_co_debtor_confirmation import service, confirmed_facts, declared_snapshot
    from test_service import command

    repo, tracking = service()
    tracking.execute('u1', command(declared_snapshot()))
    repo.co_debtor_consent = {**confirmed_facts(), 'matches_evaluated': matches}
    assert tracking.read('u1')['co_debtor']['score_update_required'] is not matches
    if matches:
        with pytest.raises(TrackingError, match='co_debtor_confirmation_already_applied'):
            tracking.update_score_with_confirmed_co_debtor('u1')
        assert len(repo.bundle['evaluations']) == 1
