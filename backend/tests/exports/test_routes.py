import asyncio
import httpx
import pytest
import json
from pathlib import Path
from fastapi import FastAPI
from app.exports.routes import router
from app.tracking.routes import repository
from tests.exports.test_exports import Repository, command, ACTOR


def test_vercel_exports_are_routed_before_spa_fallback():
    rewrites = json.loads((Path(__file__).resolve().parents[3] / "vercel.json").read_text())["rewrites"]
    fallback = next(i for i, rule in enumerate(rewrites) if rule["source"] == "/(.*)")
    for source in ("/exports", "/exports/(.*)"):
        assert any(i < fallback and rule == {"source": source, "destination": "/api/score"} for i, rule in enumerate(rewrites))


@pytest.fixture
def api():
    app = FastAPI(); app.include_router(router)
    repo = Repository(); app.dependency_overrides[repository] = lambda: repo

    def request(method, path, **kwargs):
        async def send():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(send())
    return request, repo


def test_no_token_cannot_prepare_or_read_audit(api):
    request, _ = api
    assert request("POST", "/exports/prepare", json=command().model_dump(mode="json")).status_code == 401
    assert request("GET", "/exports").status_code == 401
    assert request("GET", "/exports", headers={"Authorization": "Bearer invalid"}).status_code == 401
    assert request("POST", f"/exports/{command().request_id}/delivery", json={"sha256": "a" * 64}, headers={"Authorization": "Bearer invalid"}).status_code == 401


def test_delivery_cannot_claim_another_actors_export(api):
    request, _ = api
    assert request("POST", f"/exports/{command().request_id}/delivery", json={"sha256": "a" * 64}, headers={"Authorization": "Bearer valid"}).status_code == 403


def test_prepare_payload_and_forbidden_scope(api):
    request, repo = api
    body = command().model_dump(mode="json")
    response = request("POST", "/exports/prepare", json=body, headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200, response.text
    assert response.json()["context"]["actor_id"] == ACTOR
    repo.authorized = False
    assert request("POST", "/exports/prepare", json=body, headers={"Authorization": "Bearer valid"}).status_code == 403


def test_eligibility_route_does_not_prepare_a_download(api):
    request, repo = api
    response = request("POST", "/exports/eligible", json=command().model_dump(mode="json"), headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert list(response.json()) == ["eligible_ids"]
    assert not repo.events


def test_delivery_follows_preparation_and_records_client_digest(api):
    request, repo = api
    headers = {"Authorization": "Bearer valid"}
    prepared = request("POST", "/exports/prepare", json=command().model_dump(mode="json"), headers=headers)
    assert prepared.status_code == 200
    result = request("POST", f"/exports/{command().request_id}/delivery", json={"sha256": "a" * 64}, headers=headers)
    assert result.status_code == 200
    assert repo.events[0]["status"] == "delivery_requested"
    assert repo.events[0]["sha256"] == "a" * 64


def test_extra_fields_cannot_override_actor_and_large_selection_is_rejected(api):
    request, _ = api
    body = command().model_dump(mode="json")
    headers = {"Authorization": "Bearer valid"}
    assert request("POST", "/exports/prepare", json={**body, "actor_id": "forged"}, headers=headers).status_code == 422
    assert request("POST", "/exports/prepare", json={**body, "evaluation_ids": body["evaluation_ids"] * 501}, headers=headers).status_code == 422


def test_history_resolves_responsible_person_and_retains_authenticated_read(api):
    request, repo = api
    headers = {"Authorization": "Bearer valid"}
    body = command().model_dump(mode="json")
    body["filters"] = {"classification": "Alto", "commune": "La Florida"}
    assert request("POST", "/exports/prepare", json=body, headers=headers).status_code == 200
    response = request("GET", "/exports", headers=headers)
    assert response.status_code == 200
    record = response.json()[0]
    assert record["actor_name"] == "Ejecutivo de prueba"
    assert record["actor_email"] == "ejecutivo@example.test"
    assert record["filters"] == body["filters"]
    history_calls = [call for call in repo.calls if "order=generated_at.desc" in call[1]]
    assert history_calls[0][2]["token"] == "valid"
    assert f"actor_id=eq.{repo.actor['id']}" in history_calls[0][1]
    assert f"actor_role=eq.{repo.actor['role']}" in history_calls[0][1]
    assert f"inmobiliaria_id=eq.{repo.actor['inmobiliaria_id']}" in history_calls[0][1]


def test_empty_lead_selection_is_rejected_before_audit(api):
    request, repo = api
    body = command(kind="leads", evaluation_ids=[]).model_dump(mode="json")
    response = request("POST", "/exports/prepare", json=body, headers={"Authorization": "Bearer valid"})
    assert response.status_code == 422
    assert not repo.events
