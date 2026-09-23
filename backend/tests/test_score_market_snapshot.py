import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.main as main
import app.scoring as scoring_module
from app.market_data.service import MarketSnapshotUnavailable
from app.scoring import calculate_score

scoring_module.generate_user_explanation = lambda **_kwargs: None
scoring_module.generate_executive_summary = lambda **_kwargs: None
scoring_module.generate_commercial_guidance = lambda **_kwargs: None
main.generate_user_explanation = lambda **_kwargs: None
main.generate_executive_summary = lambda **_kwargs: None
main.generate_commercial_guidance = lambda **_kwargs: None
async def _inline_thread(callable, *args, **kwargs):
    return callable(*args, **kwargs)
main.asyncio.to_thread = _inline_thread


def snapshot():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


def payload(**extra):
    value = {"ingreso_mensual": 2_500_000, "deuda_mensual": 200_000, "edad": 35, "ahorro_disponible": 40_000_000,
             "plazo_credito_hipotecario": 25, "tipo_contrato": "indefinido", "continuidad_laboral": "mas_3_anios",
             "morosidad_actual": "no", "dividendo_estimado": 550_000, "consentimiento": True}
    value.update(extra)
    return value


def test_server_snapshot_wins_and_no_client_market_value_overrides(monkeypatch):
    monkeypatch.setattr(main, "resolve_market_snapshot", lambda: snapshot())
    result = asyncio.run(main.score_endpoint(main.ScoreRequest(**payload(uf_value_clp=1))))
    assert result["financial_indicators"]["capacidad_supuestos"]["market_snapshot"] == snapshot()
    assert result["financial_indicators"]["uf_value_clp"] == snapshot()["uf_value_clp"]


def test_market_reference_exposes_uf_from_the_same_persisted_snapshot(monkeypatch):
    persisted = snapshot()
    persisted["uf_value_clp"] = 40999.93
    persisted["source"]["uf_value_clp"]["raw_value"] = 40999.93
    monkeypatch.setattr(main, "resolve_market_snapshot", lambda: persisted)

    result = asyncio.run(main.market_reference_endpoint())

    assert result == {
        "uf_value_clp": 40999.93,
        "effective_date": persisted["source"]["uf_value_clp"]["effective_date"],
        "snapshot_effective_date": persisted["effective_date"],
        "snapshot_fetched_at": persisted["fetched_at"],
        "source": {
            "provider": "BCCh BDE",
            "series": "F073.UFF.PRE.Z.D",
        },
    }


def test_score_rejects_a_stale_frontend_market_reference(monkeypatch):
    monkeypatch.setattr(main, "resolve_market_snapshot", lambda: snapshot())

    with pytest.raises(HTTPException) as error:
        asyncio.run(main.score_endpoint(main.ScoreRequest(**payload(
            uf_value_clp=40999.93,
            market_snapshot_fetched_at="2026-09-22T12:00:00Z",
        ))))

    assert error.value.status_code == 409


def test_score_accepts_the_current_frontend_market_reference(monkeypatch):
    persisted = snapshot()
    monkeypatch.setattr(main, "resolve_market_snapshot", lambda: persisted)

    result = asyncio.run(main.score_endpoint(main.ScoreRequest(**payload(
        uf_value_clp=persisted["uf_value_clp"],
        market_snapshot_fetched_at=persisted["fetched_at"],
    ))))

    assert result["financial_indicators"]["uf_value_clp"] == persisted["uf_value_clp"]


def test_market_reference_returns_503_when_storage_has_no_valid_snapshot(monkeypatch):
    def unavailable():
        raise MarketSnapshotUnavailable("sin snapshot")

    monkeypatch.setattr(main, "resolve_market_snapshot", unavailable)
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.market_reference_endpoint())
    assert error.value.status_code == 503


def test_score_endpoint_resolves_the_persisted_dev_snapshot_when_explicitly_enabled(monkeypatch):
    class Repository:
        def list_candidates(self):
            return [{"id": "dev-fixture", "snapshot": snapshot(), "effective_date": snapshot()["effective_date"], "fetched_at": snapshot()["fetched_at"]}]

    monkeypatch.setattr(main, "repository_from_environment", lambda: Repository())
    monkeypatch.setenv("MARKET_SNAPSHOT_ALLOW_FIXTURE", "true")
    result = asyncio.run(main.score_endpoint(main.ScoreRequest(**payload())))
    assert result["financial_indicators"]["capacidad_supuestos"]["market_snapshot"] == snapshot()


def test_omitted_term_is_accepted_and_uses_snapshot_fallback(monkeypatch):
    monkeypatch.setattr(main, "resolve_market_snapshot", lambda: snapshot())
    result = asyncio.run(main.score_endpoint(main.ScoreRequest(**payload(plazo_credito_hipotecario=None))))
    assert result["financial_indicators"]["capacidad_supuestos"]["plazo_origen"] == "default"


def test_empty_store_returns_503_without_scoring(monkeypatch):
    def unavailable():
        raise MarketSnapshotUnavailable("sin snapshot")
    monkeypatch.setattr(main, "resolve_market_snapshot", unavailable)
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.score_endpoint(main.ScoreRequest(**payload())))
    assert error.value.status_code == 503


def test_explain_copies_saved_numbers_without_market_or_calculation(monkeypatch):
    monkeypatch.setattr(main, "calculate_score", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("must not score")))
    response = asyncio.run(main.explain_endpoint(main.ExplainRequest(result_context={"score": 77.5, "classification": "Alto", "positive_indicators": [], "risks": []}, consentimiento=True)))
    assert response["score"] == 77.5 and response["classification"] == "Alto"


def test_initial_score_is_independent_of_comunas_and_declared_property_price():
    baseline = calculate_score(payload(), include_ai=False, market_snapshot=snapshot())
    changed = calculate_score(
        payload(comuna_objetivo="Las Condes", segunda_comuna="Buin", property_value_clp=900_000_000),
        include_ai=False,
        market_snapshot=snapshot(),
    )
    for key in ("score", "classification", "component_scores", "blockers"):
        assert changed[key] == baseline[key]
