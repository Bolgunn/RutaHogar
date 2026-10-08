from copy import deepcopy
from datetime import datetime, timezone

import pytest

from app.tracking.contracts import TrackingError
from app.tracking.staff import CO_DEBTOR_CONFIRMED_FIELDS, StaffLeadService


LEAD_ID = "11111111-1111-1111-1111-111111111111"
OUTSIDE_LEAD_ID = "22222222-2222-2222-2222-222222222222"


def confirmed_values():
    return {
        "ingreso_mensual_complementario": 1_400_000,
        "deuda_mensual_complementario": 120_000,
        "tipo_contrato_complementario": "indefinido",
        "continuidad_laboral_complementario": "mas_3_anios",
        "morosidad_complementario": "no",
    }


def evaluation():
    return {
        "id": "evaluation-1",
        "user_id": LEAD_ID,
        "created_at": "2026-10-04T12:00:00Z",
        "financial_data": {
            "input": {
                "ingreso_mensual": 1_000_000,
                "complemento_renta": True,
                "relacion_complementario": "pareja_conviviente",
                **confirmed_values(),
            },
            "result": {"score": 71, "classification": "Medio"},
        },
    }


class StaffRepository:
    def __init__(self):
        self.invitation = None
        self.rows = [evaluation()]
        self.history_rows = [{
            "id": "history-1", "evaluation_id": "evaluation-1", "user_id": LEAD_ID,
            "score": 71, "classification": "Medio", "created_at": "2026-10-04T12:00:00Z",
            "snapshot": {"input": deepcopy(evaluation()["financial_data"]["input"]), "result": {"score": 71}},
        }]

    def staff_actor(self, _token):
        return {"id": "staff-1", "role": "ejecutivo", "inmobiliaria_id": "tenant-1"}

    def staff_can_access(self, _actor, lead_id):
        return lead_id == LEAD_ID

    def staff_evaluations(self):
        return deepcopy(self.rows)

    def staff_contacts(self, lead_ids):
        return {lead_id: {"full_name": "Lead autorizado", "phone": "+56912345678"} for lead_id in lead_ids}

    def staff_lead_evaluations(self, lead_id):
        return [deepcopy(row) for row in self.rows if row["user_id"] == lead_id]

    def staff_co_debtor_invitation(self, _lead_id):
        return deepcopy(self.invitation)

    def staff_history(self, _lead_id):
        return deepcopy(self.history_rows)


def service(repository):
    return StaffLeadService(repository, clock=lambda: datetime(2026, 10, 4, tzinfo=timezone.utc))


def test_authorized_executive_receives_only_declared_provenance_while_pending():
    repository = StaffRepository()
    repository.invitation = {"status": "pending", "expires_at": "2026-10-11T00:00:00Z"}

    detail = service(repository).lead_detail("executive-token", LEAD_ID)

    assert detail["co_debtor"] == {"status": "pending", "source": "lead_declared"}
    assert not any(field in str(detail["co_debtor"]) for field in CO_DEBTOR_CONFIRMED_FIELDS)


def test_confirmed_projection_exposes_exactly_five_current_values_and_lead_relation():
    repository = StaffRepository()
    repository.invitation = {"status": "confirmed", "co_debtor_confirmations": [confirmed_values()]}

    detail = service(repository).lead_detail("executive-token", LEAD_ID)

    co_debtor = detail["co_debtor"]
    assert co_debtor["status"] == "confirmed"
    assert co_debtor["source"] == "co_debtor_confirmed"
    assert set(co_debtor["confirmed"]) == set(CO_DEBTOR_CONFIRMED_FIELDS)
    assert co_debtor["confirmed"] == confirmed_values()
    assert co_debtor["relation"] == {"value": "pareja_conviviente", "source": "lead_declared"}
    assert "token" not in str(co_debtor).lower()
    assert "digest" not in str(co_debtor).lower()


def test_revocation_keeps_history_but_redacts_all_co_debtor_values_everywhere():
    repository = StaffRepository()
    repository.invitation = {"status": "revoked", "token_digest": "never-read", "co_debtor_confirmations": [confirmed_values()]}

    detail = service(repository).lead_detail("executive-token", LEAD_ID)
    list_projection = service(repository).evaluations("executive-token")

    assert detail["co_debtor"] == {"status": "revoked", "source": "excluded_after_revocation"}
    assert detail["history"][0]["score"] == 71
    serialized = str({"list": list_projection, "history": detail["history"], "co_debtor": detail["co_debtor"]})
    for field in (*CO_DEBTOR_CONFIRMED_FIELDS, "relacion_complementario"):
        assert field not in serialized
    assert "1400000" not in serialized
    assert "120000" not in serialized


def test_decline_excludes_all_co_debtor_values_from_the_staff_projection():
    repository = StaffRepository()
    repository.invitation = {"status": "declined", "token_digest": "never-read", "co_debtor_confirmations": [confirmed_values()]}

    detail = service(repository).lead_detail("executive-token", LEAD_ID)

    assert detail["co_debtor"] == {"status": "declined", "source": "excluded_after_decline"}
    assert "confirmed" not in detail["co_debtor"]
    serialized = str(detail)
    for field in (*CO_DEBTOR_CONFIRMED_FIELDS, "relacion_complementario"):
        assert field not in serialized
    assert "1400000" not in serialized
    assert "120000" not in serialized


def test_refresh_after_confirmed_to_revoked_transition_removes_the_values():
    repository = StaffRepository()
    repository.invitation = {"status": "confirmed", "co_debtor_confirmations": [confirmed_values()]}
    projection = service(repository)

    assert projection.lead_detail("executive-token", LEAD_ID)["co_debtor"]["confirmed"] == confirmed_values()

    repository.invitation = {"status": "revoked", "co_debtor_confirmations": [confirmed_values()]}
    refreshed = projection.lead_detail("executive-token", LEAD_ID)

    assert refreshed["co_debtor"] == {"status": "revoked", "source": "excluded_after_revocation"}
    assert "1400000" not in str(refreshed)


def test_scope_denial_never_returns_another_leads_hu18_data():
    repository = StaffRepository()
    repository.invitation = {"status": "confirmed", "co_debtor_confirmations": [confirmed_values()]}

    with pytest.raises(TrackingError, match="owner_mismatch"):
        service(repository).lead_detail("executive-token", OUTSIDE_LEAD_ID)

    assert service(repository).evaluations("executive-token")["items"]
    assert all(row["user_id"] == LEAD_ID for row in service(repository).evaluations("executive-token")["items"])


def test_list_checks_each_lead_scope_once_and_keeps_newest_first_order():
    repository = StaffRepository()
    allowed_leads = {f"lead-{index}" for index in range(0, 40, 3)}
    repository.rows = [
        {**evaluation(), "id": f"evaluation-{index}-{copy}", "user_id": f"lead-{index}"}
        for index in range(40) for copy in range(2)
    ]
    checked = []
    repository.staff_can_access = lambda _actor, lead_id: checked.append(lead_id) or lead_id in allowed_leads

    items = service(repository).evaluations("executive-token")["items"]

    assert sorted(checked) == sorted(f"lead-{index}" for index in range(40))
    assert [row["id"] for row in items] == [row["id"] for row in repository.rows if row["user_id"] in allowed_leads]
