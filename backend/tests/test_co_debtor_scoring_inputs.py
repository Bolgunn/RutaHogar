from copy import deepcopy
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

from app.scoring_engine.co_debtor_inputs import assemble_co_debtor_scoring_input
from app.scoring_engine.indicators import calculate_financial_indicators, calculate_financial_scope
from app.tracking.repository import TrackingRepository


NOW = datetime(2026, 10, 4, tzinfo=timezone.utc)
FINANCIAL_FIELDS = (
    "ingreso_mensual_complementario",
    "deuda_mensual_complementario",
    "tipo_contrato_complementario",
    "continuidad_laboral_complementario",
    "morosidad_complementario",
)


def lead_input(**overrides):
    value = {
        "ingreso_mensual": 1_000_000,
        "deuda_mensual": 150_000,
        "complemento_renta": True,
        "ingreso_mensual_complementario": 800_000,
        "deuda_mensual_complementario": 80_000,
        "tipo_contrato_complementario": "plazo_fijo",
        "continuidad_laboral_complementario": "entre_6_y_12_meses",
        "morosidad_complementario": "no",
        "relacion_complementario": "pareja_conviviente",
    }
    value.update(overrides)
    return value


def confirmed_values(**overrides):
    value = {
        "ingreso_mensual_complementario": 1_600_000,
        "deuda_mensual_complementario": 320_000,
        "tipo_contrato_complementario": "indefinido",
        "continuidad_laboral_complementario": "mas_3_anios",
        "morosidad_complementario": "no",
        # This value is intentionally ignored: relation is lead-declared.
        "relacion_complementario": "otro",
    }
    value.update(overrides)
    return value


def test_no_co_debtor_leaves_scoring_input_unchanged():
    declared = lead_input(complemento_renta=False)
    original = deepcopy(declared)

    resolved, provenance = assemble_co_debtor_scoring_input(declared, now=NOW)

    assert resolved == original
    assert provenance["complement_source"] is None
    assert provenance["complement_confirmation_status"] is None


def test_pending_complement_uses_lead_declaration_and_is_marked_not_confirmed():
    declared = lead_input()
    resolved, provenance = assemble_co_debtor_scoring_input(
        declared,
        co_debtor_consent={
            "invitation_status": "pending",
            "created_at": "2026-10-03T12:00:00Z",
            "expires_at": "2026-10-10T12:00:00Z",
        },
        now=NOW,
    )

    assert resolved == declared
    assert provenance == {
        "invitation_status": "pending",
        "complement_source": "lead_declared",
        "complement_confirmation_status": "not_confirmed",
        "decision_rule": "R5",
        "rescore_required": False,
    }


def test_declared_complement_without_an_invitation_is_not_confirmed():
    declared = lead_input()

    resolved, provenance = assemble_co_debtor_scoring_input(declared, now=NOW)

    assert resolved == declared
    assert provenance == {
        "invitation_status": None,
        "complement_source": "lead_declared",
        "complement_confirmation_status": "not_confirmed",
        "decision_rule": "R5",
        "rescore_required": False,
    }


def test_confirmed_values_replace_all_five_together_but_relation_stays_with_lead():
    declared = lead_input()
    confirmed = confirmed_values()

    resolved, provenance = assemble_co_debtor_scoring_input(
        declared,
        co_debtor_consent={
            "invitation_status": "confirmed",
            "co_debtor_confirmed": confirmed,
        },
        now=NOW,
    )

    assert {field: resolved[field] for field in FINANCIAL_FIELDS} == {
        field: confirmed[field] for field in FINANCIAL_FIELDS
    }
    assert resolved["relacion_complementario"] == declared["relacion_complementario"]
    assert provenance["complement_source"] == "co_debtor_confirmed"
    assert provenance["complement_confirmation_status"] == "confirmed"

    # Income and debt now enter the score from the same confirmed source.
    scope = calculate_financial_scope(resolved)
    assert scope["ingreso_complementario_considerado"] == confirmed["ingreso_mensual_complementario"]
    assert scope["deuda_complementaria_considerada"] == confirmed["deuda_mensual_complementario"]
    indicators = calculate_financial_indicators(resolved)
    assert indicators["deuda_total"] == declared["deuda_mensual"] + confirmed["deuda_mensual_complementario"]


def test_revocation_removes_the_complement_from_all_future_score_inputs():
    resolved, provenance = assemble_co_debtor_scoring_input(
        lead_input(),
        co_debtor_consent={
            "invitation_status": "revoked",
            "co_debtor_confirmed": confirmed_values(),
        },
        now=NOW,
    )

    assert resolved["complemento_renta"] is False
    assert all(resolved[field] is None for field in (*FINANCIAL_FIELDS, "relacion_complementario"))
    assert provenance["complement_source"] == "excluded_after_revocation"
    assert provenance["complement_confirmation_status"] == "revoked"
    assert calculate_financial_scope(resolved) == {
        "ingreso_principal": 1_000_000.0,
        "ingreso_complementario_considerado": 0.0,
        "ingreso_total": 1_000_000.0,
        "deuda_principal": 150_000.0,
        "deuda_complementaria_considerada": 0.0,
        "deuda_total": 150_000.0,
    }


def test_declining_an_invitation_removes_the_declared_complement_from_future_score_inputs():
    resolved, provenance = assemble_co_debtor_scoring_input(
        lead_input(),
        co_debtor_consent={"invitation_status": "declined"},
        now=NOW,
    )

    assert resolved["complemento_renta"] is False
    assert all(resolved[field] is None for field in (*FINANCIAL_FIELDS, "relacion_complementario"))
    assert provenance["complement_source"] == "excluded_after_decline"
    assert provenance["complement_confirmation_status"] == "declined"


def test_repository_loads_only_latest_server_side_hu18_facts():
    repository = TrackingRepository.__new__(TrackingRepository)
    calls = []

    def request(method, path, **kwargs):
        calls.append((method, path, kwargs))
        return [{
            "status": "confirmed",
            "created_at": "2026-10-01T00:00:00Z",
            "expires_at": "2026-10-08T00:00:00Z",
            "co_debtor_confirmations": confirmed_values(),
        }]

    repository.request = request
    facts = repository.load_co_debtor_consent("lead-1")

    assert facts == {
        "invitation_status": "confirmed",
        "created_at": "2026-10-01T00:00:00Z",
        "expires_at": "2026-10-08T00:00:00Z",
        "co_debtor_confirmed": confirmed_values(),
    }
    method, path, kwargs = calls[0]
    query = parse_qs(urlsplit(path).query)
    assert method == "GET"
    assert kwargs == {}
    assert query["lead_id"] == ["eq.lead-1"]
    assert query["order"] == ["created_at.desc"]
    assert query["limit"] == ["10"]
    assert "recipient_email" not in query["select"][0]
    assert "management_token" not in query["select"][0]


def test_repository_prefers_a_new_pending_invitation_over_a_previous_revocation():
    repository = TrackingRepository.__new__(TrackingRepository)
    repository.request = lambda *_args, **_kwargs: [
        {"status": "revoked", "created_at": "2026-10-06T00:00:00Z", "expires_at": "2026-10-08T00:00:00Z"},
        {"status": "pending", "created_at": "2026-10-05T00:00:00Z", "expires_at": "2026-10-12T00:00:00Z"},
    ]

    assert repository.load_co_debtor_consent("lead-1")["invitation_status"] == "pending"


def test_staff_repository_prefers_an_older_pending_invitation_over_the_newest_revocation():
    repository = TrackingRepository.__new__(TrackingRepository)
    rows = [
        {"status": "revoked", "created_at": "2026-10-06T00:00:00Z"},
        {"status": "pending", "created_at": "2026-10-05T00:00:00Z"},
    ]
    calls = []
    repository.request = lambda *args, **kwargs: calls.append((args, kwargs)) or rows

    assert repository.staff_co_debtor_invitation("lead-1") == rows[1]
    query = parse_qs(urlsplit(calls[0][0][1]).query)
    assert query["order"] == ["created_at.desc"]
    assert query["limit"] == ["10"]


def test_staff_repository_prefers_an_older_pending_invitation_over_the_newest_decline():
    repository = TrackingRepository.__new__(TrackingRepository)
    rows = [
        {"status": "declined", "created_at": "2026-10-06T00:00:00Z"},
        {"status": "pending", "created_at": "2026-10-05T00:00:00Z"},
    ]
    repository.request = lambda *_args, **_kwargs: rows

    assert repository.staff_co_debtor_invitation("lead-1") == rows[1]


def test_staff_repository_uses_the_newest_invitation_when_none_is_pending():
    repository = TrackingRepository.__new__(TrackingRepository)
    rows = [
        {"status": "declined", "created_at": "2026-10-06T00:00:00Z"},
        {"status": "revoked", "created_at": "2026-10-05T00:00:00Z"},
    ]
    repository.request = lambda *_args, **_kwargs: rows

    assert repository.staff_co_debtor_invitation("lead-1") == rows[0]


def test_staff_repository_returns_none_without_invitations():
    repository = TrackingRepository.__new__(TrackingRepository)
    repository.request = lambda *_args, **_kwargs: []

    assert repository.staff_co_debtor_invitation("lead-1") is None
