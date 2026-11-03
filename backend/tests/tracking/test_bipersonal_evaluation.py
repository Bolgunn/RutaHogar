"""T5 uses ALG-9 unchanged and persists one explicit, immutable evaluation."""
from copy import deepcopy
from unittest.mock import patch

import pytest

from app.tracking.bipersonal import contribution_summary, evaluation_type
from app.tracking.contracts import TrackingError
from app.tracking.repository import TrackingRepository
from app.tracking.scoring_adapter import score_snapshot
from app.scoring_engine.purchase_capacity import capacity_limits
from test_service import command, service, valid_snapshot, market_snapshot
from test_co_debtor_confirmation import declared_snapshot, confirmed_values


def modern_facts(**values):
    confirmation = {"id": "confirmed-v2", "revision_number": 2, "participant_user_id": "participant", **confirmed_values(**values)}
    return {"invitation_status": "confirmed", "participation_id": "participation", "revision_number": 2,
            "relation_declaration_event_id": "relation-2", "declared_relation": "conyuge",
            "verified_revision": True, "co_debtor_confirmed": confirmation}


def evaluated(**values):
    repo, tracking = service()
    tracking.execute("u1", command(valid_snapshot()))
    repo.co_debtor_consent = modern_facts(**values)
    return repo, tracking


def stored(repo):
    return repo.bundle["evaluations"][-1]["financial_data"]


@pytest.mark.parametrize("savings,debt,sign", [(100_000_000, 0, 1), (1_000_000, 0, 0), (100_000_000, 1_800_000, -1)])
def test_positive_zero_negative_contribution_uses_unrounded_existing_engine(savings, debt, sign):
    repo, tracking = service()
    tracking.execute("u1", command({**valid_snapshot(), "ahorro_disponible": savings}))
    before = deepcopy(repo.bundle["evaluations"])
    repo.co_debtor_consent = modern_facts(deuda_mensual_complementario=debt)
    result = tracking.update_score_with_confirmed_co_debtor("u1")
    data = stored(repo)
    summary = data["result"]["bipersonal_summary"]
    assert summary["evaluation_type"] == "bipersonal_confirmed"
    assert summary["availability"] == "complete"
    delta = summary["delta"]["purchase_capacity_uf"]
    assert (delta > 0) - (delta < 0) == sign
    market = data["result"]["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]
    actual = capacity_limits(data["input"], market_snapshot=market)
    alone = capacity_limits({**data["input"], "ingreso_mensual_complementario": 0, "deuda_mensual_complementario": 0}, market_snapshot=market)
    assert delta == pytest.approx(actual["capacity"] - alone["capacity"])
    assert summary["delta"]["income_capacity_uf"] == pytest.approx(actual["by_income"] - alone["by_income"])
    for metric in ("purchase", "income"):
        assert summary["delta"][f"{metric}_capacity_clp"] == pytest.approx(summary["delta"][f"{metric}_capacity_uf"] * market["uf_value_clp"])
    assert len(repo.bundle["evaluations"]) == 2
    assert repo.bundle["evaluations"][:-1] == before
    assert result["evaluation_ids"] == [repo.bundle["evaluations"][-1]["id"]]
    assert data["provenance"]["co_debtor_confirmation_id"] == "confirmed-v2"
    assert data["provenance"]["co_debtor_consent"]["revision_number"] == 2
    assert data["provenance"]["co_debtor_consent"]["relation_declaration_event_id"] == "relation-2"
    assert data["input"]["relacion_complementario"] == "conyuge"
    assert len(repo.bundle["events"]) == 2  # No counterfactual event/evaluation.


def test_counterfactual_keeps_every_assumption_and_changes_only_two_financial_fields():
    data = {**declared_snapshot(), "project_goal": {"precio_min_uf": 3000, "subsidio": "unchanged"},
            "edad": 68, "plazo_credito_hipotecario": 30, "dividendo_estimado": 123456}
    market = market_snapshot()
    result = score_snapshot(data, market_snapshot=market)
    provenance = {"co_debtor_consent": {"complement_source": "co_debtor_confirmed"}, "co_debtor_confirmation_id": "v1"}
    original = deepcopy((data, result, provenance, market))
    with patch('app.tracking.bipersonal.capacity_limits', wraps=capacity_limits) as engine:
        summary = contribution_summary(data, result, provenance, verified_revision=True, market_snapshot=market)
    actual, alone = engine.call_args_list
    assert actual.args[0] == data
    assert alone.args[0] == {**data, "ingreso_mensual_complementario": 0, "deuda_mensual_complementario": 0}
    assert actual.kwargs == alone.kwargs == {"market_snapshot": market}
    assert summary["availability"] == "complete"
    assert (data, result, provenance, market) == original


def test_frozen_target_override_and_uf_are_the_same_in_both_scenarios():
    repo, tracking = service()
    target = {"id": "target", "precio_min_uf": 3200, "comuna": "santiago"}
    tracking.execute("u1", command({**valid_snapshot(), "project_goal": target}))
    repo.co_debtor_consent = modern_facts()
    with patch('app.tracking.bipersonal.capacity_limits', wraps=capacity_limits) as engine:
        tracking.update_score_with_confirmed_co_debtor("u1")
    data = stored(repo)
    actual, alone = engine.call_args_list
    assert actual.args[0]["property_value_uf"] == alone.args[0]["property_value_uf"] == 3200
    assert actual.args[0]["property_value_clp"] is alone.args[0]["property_value_clp"] is None
    assert actual.kwargs == alone.kwargs
    assert data["provenance"]["scoring_overrides"]["property_value"]["target_project"] == target
    assert actual.kwargs["market_snapshot"] == data["result"]["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]


@pytest.mark.parametrize("field,value", [("morosidad_complementario", "si"), ("ingreso_mensual_complementario", 0)])
def test_confirmed_but_not_financially_used_is_individual(field, value):
    repo, tracking = evaluated(**{field: value})
    tracking.update_score_with_confirmed_co_debtor("u1")
    data = stored(repo)
    assert data["result"]["financial_indicators"]["ingreso_complementario_considerado"] == 0
    assert data["result"]["bipersonal_summary"]["evaluation_type"] == "individual"
    assert data["result"]["bipersonal_summary"]["delta"]["purchase_capacity_uf"] == 0
    assert data["provenance"]["co_debtor_confirmation_id"] == 'confirmed-v2'


def test_current_relation_is_used_without_rewriting_initial_acceptance_or_history():
    repo, tracking = evaluated()
    previous = deepcopy(repo.bundle["evaluations"])
    repo.co_debtor_consent.update(declared_relation='amigo', relation_declaration_event_id='relation-3')
    facts = deepcopy(repo.co_debtor_consent)
    tracking.update_score_with_confirmed_co_debtor('u1')
    assert stored(repo)['input']['relacion_complementario'] == 'amigo'
    assert stored(repo)['result']['bipersonal_summary']['evaluation_type'] == 'individual'
    assert stored(repo)['provenance']['co_debtor_consent']['relation_declaration_event_id'] == 'relation-3'
    assert repo.co_debtor_consent == facts and repo.bundle['evaluations'][:-1] == previous


@pytest.mark.parametrize('status', ['revoked', 'replaced', 'expired', 'declined'])
def test_closed_participation_cannot_create_a_new_confirmed_evaluation(status):
    repo, tracking = evaluated()
    repo.co_debtor_consent['invitation_status'] = status
    original = deepcopy(repo.bundle)
    with pytest.raises(TrackingError):
        tracking.update_score_with_confirmed_co_debtor('u1')
    assert repo.bundle == original


def test_revision_changes_between_action_and_second_read_are_not_silently_substituted():
    repo, tracking = evaluated()
    old_loader = repo.load_co_debtor_consent
    calls = 0
    def loader(user):
        nonlocal calls
        calls += 1
        facts = old_loader(user)
        if calls == 2:
            facts['co_debtor_confirmed']['id'] = 'v3'
        return facts
    repo.load_co_debtor_consent = loader
    previous = deepcopy(repo.bundle)
    with pytest.raises(TrackingError, match='co_debtor_confirmation_required'):
        tracking.update_score_with_confirmed_co_debtor('u1')
    assert repo.bundle == previous


def test_same_values_do_not_create_evaluation_or_retroactively_upgrade_provenance():
    repo, tracking = service()
    tracking.execute('u1', command(declared_snapshot()))
    original = deepcopy(repo.bundle)
    repo.co_debtor_consent = {**modern_facts(), 'matches_evaluated': True}
    state = tracking.read('u1')['co_debtor']
    assert state['score_update_required'] is False
    assert state['message'] == 'Antecedentes coincidentes confirmados posteriormente'
    with pytest.raises(TrackingError, match='co_debtor_confirmation_already_applied'):
        tracking.update_score_with_confirmed_co_debtor('u1')
    assert repo.bundle == original


def test_retry_and_later_revocation_preserve_committed_history():
    repo, tracking = evaluated()
    tracking.update_score_with_confirmed_co_debtor('u1')
    original = deepcopy(repo.bundle)
    with pytest.raises(TrackingError, match='co_debtor_confirmation_already_applied'):
        tracking.update_score_with_confirmed_co_debtor('u1')
    repo.co_debtor_consent['invitation_status'] = 'revoked'
    tracking.read('u1')
    assert repo.bundle == original


@pytest.mark.parametrize('data,expected', [
    ({'input': {'complemento_renta': False}}, 'individual'),
    ({'input': {'complemento_renta': True}, 'provenance': {'co_debtor_consent': {'complement_source': 'lead_declared'}}}, 'declared_complement'),
    ({'input': {'complemento_renta': True}}, 'unverifiable_origin'),
    ({'result': {'financial_indicators': {'ingreso_complementario_considerado': 1}}}, 'unverifiable_origin'),
    ({'provenance': {'co_debtor_confirmation_id': 'legacy-v1'}}, 'unverifiable_origin'),
])
def test_legacy_classification_never_invents_verified_origin_or_mutates(data, expected):
    old = deepcopy(data)
    assert evaluation_type(data) == expected
    assert data == old


def test_new_individual_and_declared_results_keep_missing_contribution_null():
    repo, tracking = service()
    tracking.execute('u1', command(valid_snapshot()))
    summary = stored(repo)['result']['bipersonal_summary']
    assert summary['evaluation_type'] == 'individual'
    assert summary['availability'] == 'insufficient_data'
    repo, tracking = service()
    tracking.execute('u1', command(declared_snapshot()))
    summary = stored(repo)['result']['bipersonal_summary']
    assert summary['evaluation_type'] == 'declared_complement'
    assert all(value is None for value in summary['delta'].values())


def test_counterfactual_never_calls_score_ai_or_market_resolver():
    repo, tracking = evaluated()
    with patch.object(tracking, '_score', wraps=tracking._score) as scorer, patch.object(tracking, 'market_snapshot_resolver', side_effect=AssertionError('I/O')):
        tracking.update_score_with_confirmed_co_debtor('u1')
    assert scorer.call_count == 1


def test_repository_selects_highest_revision_and_verifies_linkage_not_array_order():
    repo = object.__new__(TrackingRepository)
    row = {'id':'participation', 'status':'confirmed', 'participant_user_id':'actor', 'co_debtor_confirmations':[
        {'id':'v2','revision_number':2,'participant_user_id':'actor',**confirmed_values()},
        {'id':'v1','revision_number':1,'participant_user_id':'actor','accepted_relation_event_id':'relation-1',**confirmed_values()}],
        'co_debtor_consent_events':[{'id':'relation-1','relation_revision':1,'relation_value':'conyuge'}]}
    repo.request = lambda method, *args, **kwargs: [deepcopy(row)] if method=='GET' else False
    facts = repo.load_co_debtor_consent('u1')
    assert facts['co_debtor_confirmed']['id'] == 'v2' and facts['verified_revision']
    row['co_debtor_confirmations'][0]['participant_user_id']='other'
    assert not repo.load_co_debtor_consent('u1')['verified_revision']


def test_explicit_incorporation_survives_the_next_normal_update_from_an_individual_line():
    repo, tracking = evaluated()
    tracking.update_score_with_confirmed_co_debtor('u1')
    current = repo.bundle['events'][-1]
    assert current['recorded_complete_snapshot']['complemento_renta'] is True
    tracking.execute('u1', command({'ahorro_disponible': 2000000}, current['event_id'], '2026-04-01T00:00:00Z'))
    assert stored(repo)['result']['bipersonal_summary']['evaluation_type'] == 'bipersonal_confirmed'


def test_unavailable_counterfactual_remains_null_instead_of_inventing_a_zero():
    data = {**declared_snapshot(), 'ingreso_mensual': 0}
    market = market_snapshot()
    result = score_snapshot(data, market_snapshot=market)
    details = {'co_debtor_confirmation_id': 'v1', 'co_debtor_consent': {'complement_source': 'co_debtor_confirmed'}}
    summary = contribution_summary(data, result, details, verified_revision=True, market_snapshot=market)
    assert summary['evaluation_type'] == 'bipersonal_confirmed'
    assert summary['availability'] == 'insufficient_data'
    assert all(value is None for value in summary['delta'].values())


def test_verification_flag_alone_without_canonical_reference_cannot_claim_bipersonal():
    data = {'input': {'complemento_renta': True}, 'result': {'financial_indicators': {'ingreso_complementario_considerado': 100}},
            'provenance': {'co_debtor_consent': {'complement_source': 'co_debtor_confirmed'}}}
    assert evaluation_type(data, verified_revision=True) == 'unverifiable_origin'


def test_already_used_revision_is_not_labelled_as_a_later_matching_confirmation():
    repo, tracking = evaluated()
    tracking.update_score_with_confirmed_co_debtor('u1')
    repo.co_debtor_consent['matches_evaluated'] = True
    assert tracking.read('u1')['co_debtor']['antecedents_status'] is None


def test_conversion_uses_the_evaluation_uf_and_rate_not_constants_or_a_new_fetch():
    repo, tracking = service()
    market = market_snapshot()
    market['uf_value_clp'] = 50000
    market['source']['uf_value_clp']['raw_value'] = 50000
    market['tasa_anual_uf'] = .05
    market['source']['tasa_anual_uf']['raw_value'] = 5
    tracking.market_snapshot_resolver = lambda: deepcopy(market)
    tracking.execute('u1', command({**valid_snapshot(), 'ahorro_disponible': 100000000}))
    repo.co_debtor_consent = modern_facts()
    tracking.market_snapshot_resolver = lambda: pytest.fail('must reuse the stored snapshot')
    tracking.update_score_with_confirmed_co_debtor('u1')
    data = stored(repo)
    summary = data['result']['bipersonal_summary']
    assumptions = data['result']['financial_indicators']['capacidad_supuestos']
    assert assumptions['market_snapshot'] == market and assumptions['tasa_anual_uf'] == .05
    assert summary['delta']['purchase_capacity_clp'] == pytest.approx(summary['delta']['purchase_capacity_uf'] * 50000)
    assert summary['version'] == 'hu30-bipersonal-v1'
    assert 'co_debtor_confirmation_id' not in summary
    assert 'market_snapshot' not in summary
