from copy import deepcopy

import pytest

from app.tracking.contracts import TrackingError
from app.tracking.service import CO_DEBTOR_CONFIRMATION_REASON
from test_service import command, service, valid_snapshot


def declared_snapshot(**overrides):
    snapshot = {
        **valid_snapshot(),
        "ahorro_disponible": 30_000_000,
        "complemento_renta": True,
        "ingreso_mensual_complementario": 800_000,
        "deuda_mensual_complementario": 50_000,
        "tipo_contrato_complementario": "plazo_fijo",
        "continuidad_laboral_complementario": "entre_6_y_12_meses",
        "morosidad_complementario": "no",
        "relacion_complementario": "pareja_conviviente",
    }
    snapshot.update(overrides)
    return snapshot


def confirmed_values(**overrides):
    values = {
        "ingreso_mensual_complementario": 1_500_000,
        "deuda_mensual_complementario": 300_000,
        "tipo_contrato_complementario": "indefinido",
        "continuidad_laboral_complementario": "mas_3_anios",
        "morosidad_complementario": "no",
    }
    values.update(overrides)
    return values


def pending_facts():
    return {
        "invitation_status": "pending",
        "created_at": "2026-03-01T00:00:00Z",
        "expires_at": "2026-03-08T00:00:00Z",
    }


def confirmed_facts(**overrides):
    confirmation = {"id": "confirmation-1", **confirmed_values()}
    confirmation.update(overrides.pop("co_debtor_confirmed", {}))
    facts = {"invitation_status": "confirmed", "co_debtor_confirmed": confirmation}
    facts.update(overrides)
    return facts


def baseline_with_pending_complement():
    repository, tracking = service()
    repository.co_debtor_consent = pending_facts()
    baseline = tracking.execute("u1", command(declared_snapshot()))
    return repository, tracking, baseline


def test_explicit_confirmation_update_creates_a_new_immutable_evaluation():
    repository, tracking, _ = baseline_with_pending_complement()
    previous = deepcopy(repository.bundle["evaluations"][0])
    repository.co_debtor_consent = confirmed_facts()

    result = tracking.update_score_with_confirmed_co_debtor("u1")

    assert len(repository.bundle["evaluations"]) == 2
    current = repository.bundle["evaluations"][-1]
    current_input = current["financial_data"]["input"]
    assert result["evaluation_ids"] == [current["id"]]
    assert repository.bundle["events"][-1]["reason"] == CO_DEBTOR_CONFIRMATION_REASON
    assert repository.bundle["events"][-1]["event_kind"] == "evaluation"
    assert repository.bundle["events"][-1]["provenance"]["co_debtor_confirmation_id"] == "confirmation-1"
    assert current_input["ingreso_mensual_complementario"] == 1_500_000
    assert current_input["deuda_mensual_complementario"] == 300_000
    assert current_input["tipo_contrato_complementario"] == "indefinido"
    assert current_input["continuidad_laboral_complementario"] == "mas_3_anios"
    assert current_input["morosidad_complementario"] == "no"
    assert current_input["relacion_complementario"] == "pareja_conviviente"
    assert repository.bundle["evaluations"][0] == previous
    assert (
        current["financial_data"]["result"]["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]
        == previous["financial_data"]["result"]["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]
    )


@pytest.mark.parametrize(
    ("facts", "error"),
    [
        (None, "co_debtor_confirmation_required"),
        (pending_facts(), "co_debtor_confirmation_required"),
        ({"invitation_status": "revoked"}, "co_debtor_consent_revoked"),
    ],
)
def test_confirmation_update_requires_current_confirmed_consent(facts, error):
    repository, tracking, _ = baseline_with_pending_complement()
    previous = deepcopy(repository.bundle)
    repository.co_debtor_consent = facts

    with pytest.raises(TrackingError, match=error):
        tracking.update_score_with_confirmed_co_debtor("u1")

    assert repository.bundle == previous


def test_confirmation_by_itself_has_no_automatic_evaluation_effect():
    repository, _, _ = baseline_with_pending_complement()
    previous = deepcopy(repository.bundle)

    repository.co_debtor_consent = confirmed_facts()

    assert repository.bundle == previous


def test_each_confirmation_is_consumed_once_even_when_its_values_match_the_lead_declaration():
    repository, tracking, _ = baseline_with_pending_complement()
    declared = repository.bundle["evaluations"][0]["financial_data"]["input"]
    repository.co_debtor_consent = confirmed_facts(co_debtor_confirmed={
        field: declared[field]
        for field in (
            "ingreso_mensual_complementario",
            "deuda_mensual_complementario",
            "tipo_contrato_complementario",
            "continuidad_laboral_complementario",
            "morosidad_complementario",
        )
    })

    assert tracking.read("u1")["co_debtor"]["score_update_required"] is True
    first = tracking.update_score_with_confirmed_co_debtor("u1")

    evaluations = repository.bundle["evaluations"]
    assert len(evaluations) == 2
    assert len({evaluation["id"] for evaluation in evaluations}) == 2
    assert evaluations[0]["financial_data"]["result"]["score"] == evaluations[1]["financial_data"]["result"]["score"]
    assert first["evaluation_ids"] == [evaluations[1]["id"]]
    assert repository.bundle["events"][-1]["provenance"]["co_debtor_confirmation_id"] == "confirmation-1"
    assert tracking.read("u1")["co_debtor"]["score_update_required"] is False

    with pytest.raises(TrackingError, match="co_debtor_confirmation_already_applied"):
        tracking.update_score_with_confirmed_co_debtor("u1")
    assert len(repository.bundle["evaluations"]) == 2

    repository.co_debtor_consent = pending_facts()
    assert tracking.read("u1")["co_debtor"]["score_update_required"] is False

    repository.co_debtor_consent = confirmed_facts(co_debtor_confirmed={
        "id": "confirmation-2",
        **confirmed_values(ingreso_mensual_complementario=600_000),
    })
    assert tracking.read("u1")["co_debtor"]["score_update_required"] is True
    tracking.update_score_with_confirmed_co_debtor("u1")
    assert len(repository.bundle["evaluations"]) == 3
    assert tracking.read("u1")["co_debtor"]["score_update_required"] is False


def test_revoked_confirmation_never_requires_a_score_update():
    repository, tracking, _ = baseline_with_pending_complement()
    repository.co_debtor_consent = {"invitation_status": "revoked", "co_debtor_confirmed": {"id": "confirmation-1"}}

    assert tracking.read("u1")["co_debtor"]["score_update_required"] is False


def test_explicit_confirmation_update_can_produce_a_different_score():
    repository, tracking, _ = baseline_with_pending_complement()
    original_score = repository.bundle["evaluations"][0]["financial_data"]["result"]["score"]
    repository.co_debtor_consent = confirmed_facts(co_debtor_confirmed=confirmed_values(
        ingreso_mensual_complementario=2_000_000,
        deuda_mensual_complementario=0,
    ))

    tracking.update_score_with_confirmed_co_debtor("u1")

    assert repository.bundle["evaluations"][-1]["financial_data"]["result"]["score"] != original_score


def test_insufficient_down_payment_is_identical_before_and_after_confirmation():
    repository, tracking = service()
    repository.co_debtor_consent = pending_facts()
    tracking.execute("u1", command(declared_snapshot(
        ahorro_disponible=6_000_000,
        property_value=2_200,
        property_value_unit="uf",
        property_value_uf=2_200,
        property_value_clp=None,
    )))
    repository.co_debtor_consent = confirmed_facts()
    tracking.update_score_with_confirmed_co_debtor("u1")

    baseline, confirmed = [row["financial_data"]["result"] for row in repository.bundle["evaluations"]]
    expected_minimum = 2_200 * 40_695 * 0.10
    for result in (baseline, confirmed):
        indicators = result["financial_indicators"]
        assert indicators["property_value_uf"] == 2_200
        assert indicators["pie_minimo_clp"] == expected_minimum
        assert indicators["brecha_pie_minimo"] == expected_minimum - 6_000_000
        assert "pie_insuficiente" in {blocker["code"] for blocker in result["blockers"]}
    assert (
        baseline["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]
        == confirmed["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]
    )
