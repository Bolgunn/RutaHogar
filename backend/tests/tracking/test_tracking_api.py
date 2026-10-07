import asyncio
from copy import deepcopy
from uuid import uuid4

import httpx
import pytest

from app.main import app
from app.tracking.contracts import TrackingError
from app.tracking.repository import TrackingRepository
from app.tracking.routes import repository
from app.tracking.service import TrackingService
from test_service import MemoryRepository, command, market_snapshot, valid_snapshot


class ASGITestClient:
    """Small synchronous facade over HTTPX's current async ASGI transport.

    Starlette's legacy TestClient deadlocks with the FastAPI/Starlette versions
    selected by this repository's intentionally broad dependency range.
    """

    def request(self, method, path, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.request("POST", path, **kwargs)


@pytest.fixture
def api(monkeypatch):
    async def inline_threadpool(call, *args, **kwargs):
        return call(*args, **kwargs)

    # The execution sandbox does not deliver ThreadPoolExecutor completions
    # back to asyncio (even ``asyncio.to_thread(lambda: 1)`` hangs). Exercise
    # the exact ASGI/dependency stack while running these small fakes inline.
    monkeypatch.setattr("fastapi.dependencies.utils.run_in_threadpool", inline_threadpool)
    monkeypatch.setattr("fastapi.routing.run_in_threadpool", inline_threadpool)
    # API contract tests must not depend on a live BCCh request.
    monkeypatch.setattr(
        "app.tracking.routes.TrackingService",
        lambda repo: TrackingService(repo, market_snapshot_resolver=market_snapshot),
    )
    repo = MemoryRepository()
    repo.authenticate = lambda _token: "u1"
    app.dependency_overrides[repository] = lambda: repo
    try:
        yield ASGITestClient(), repo
    finally:
        app.dependency_overrides.clear()


def test_bearer_required_before_domain_access(api):
    client, repo = api
    response = client.get("/tracking")
    assert response.status_code == 401
    assert repo.commits == 0


def test_confirmed_co_debtor_evaluation_uses_authenticated_owner_only(api):
    client, repo = api
    headers = {"Authorization": "Bearer test-owner"}
    declared = {
        **valid_snapshot(),
        "complemento_renta": True,
        "ingreso_mensual_complementario": 800000,
        "deuda_mensual_complementario": 50000,
        "tipo_contrato_complementario": "plazo_fijo",
        "continuidad_laboral_complementario": "entre_6_y_12_meses",
        "morosidad_complementario": "no",
        "relacion_complementario": "pareja_conviviente",
    }
    repo.co_debtor_consent = {"invitation_status": "pending"}
    baseline = client.post("/tracking/events", json=command(declared), headers=headers)
    assert baseline.status_code == 200, baseline.text
    previous = deepcopy(repo.bundle["evaluations"][0])
    repo.co_debtor_consent = {
        "invitation_status": "confirmed",
        "co_debtor_confirmed": {
            "id": "confirmation-1",
            "ingreso_mensual_complementario": 1500000,
            "deuda_mensual_complementario": 300000,
            "tipo_contrato_complementario": "indefinido",
            "continuidad_laboral_complementario": "mas_3_anios",
            "morosidad_complementario": "no",
        },
    }

    assert client.post("/tracking/evaluations/co-debtor-confirmation", json={}).status_code == 401
    before_invalid_request = deepcopy(repo.bundle)
    invalid = client.post(
        "/tracking/evaluations/co-debtor-confirmation",
        json={"lead_id": "another-lead"},
        headers=headers,
    )
    assert invalid.status_code == 422
    assert repo.bundle == before_invalid_request

    updated = client.post("/tracking/evaluations/co-debtor-confirmation", json={}, headers=headers)
    assert updated.status_code == 200, updated.text
    assert repo.bundle["events"][-1]["user_id"] == "u1"
    assert repo.bundle["events"][-1]["reason"] == "confirmacion_codeudor"
    assert repo.bundle["events"][-1]["provenance"]["co_debtor_confirmation_id"] == "confirmation-1"
    current = repo.bundle["evaluations"][-1]["financial_data"]["input"]
    assert current["ingreso_mensual_complementario"] == 1500000
    assert current["deuda_mensual_complementario"] == 300000
    assert current["relacion_complementario"] == "pareja_conviviente"
    assert repo.bundle["evaluations"][0] == previous

    assert client.get("/tracking", headers=headers).json()["co_debtor"]["score_update_required"] is False
    duplicate = client.post("/tracking/evaluations/co-debtor-confirmation", json={}, headers=headers)
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "co_debtor_confirmation_already_applied"
    assert len(repo.bundle["evaluations"]) == 2

    repo.co_debtor_consent = {"invitation_status": "revoked"}
    revoked = client.post("/tracking/evaluations/co-debtor-confirmation", json={}, headers=headers)
    assert revoked.status_code == 409
    assert revoked.json()["detail"]["code"] == "co_debtor_consent_revoked"


def test_baseline_partial_update_correction_and_read_only_projection(api):
    client, repo = api
    headers = {"Authorization": "Bearer test-owner"}
    assert client.get("/tracking", headers=headers).json()["status"] == "not_started"
    empty_projection = client.get("/tracking/projection", headers=headers)
    assert empty_projection.status_code == 200
    assert empty_projection.json()["cause"] == "missing_project_goal"
    first_command = command(valid_snapshot())
    response = client.post("/tracking/events", json=first_command, headers=headers)
    assert response.status_code == 200, response.text
    first = response.json()
    patch = command({"ahorro_disponible": 500000, "comuna_objetivo": None},
                    first["event_id"], "2026-02-01T00:00:00Z")
    second = client.post("/tracking/events", json=patch, headers=headers)
    assert second.status_code == 200, second.text
    assert client.post("/tracking/events", json=patch, headers=headers).json() == second.json()
    assert repo.commits == 2
    assert client.post("/tracking/events", json={**patch, "reason": "Different"}, headers=headers).status_code == 409
    assert client.post("/tracking/events", json={**command({}), "user_id": "other"}, headers=headers).status_code == 422
    audit = client.get("/tracking/history?view=audit&limit=1", headers=headers).json()
    assert len(audit["items"]) == 1
    assert audit["next_cursor"] == 1
    original = deepcopy(repo.bundle)
    projection = client.get("/tracking/projection", headers=headers)
    assert projection.status_code == 200, projection.text
    assert projection.json()["status"] == "not_projectable"
    assert repo.bundle == original
    correction = {"event_id": str(uuid4()), "effective_at": "2026-03-01T00:00:00Z", "reason": "Corrección",
                  "correction_effect": "replace", "patch": {"ahorro_disponible": 1000000}}
    fixed = client.post(f"/tracking/events/{patch['event_id']}/corrections", json=correction, headers=headers)
    assert fixed.status_code == 200, fixed.text
    current = client.get("/tracking", headers=headers).json()
    # Leads see the effective history only. The full immutable audit remains
    # server-side for authorized staff and lineage replay.
    assert patch["event_id"] not in [row["event_id"] for row in current["audit_line"]]
    assert current["excluded_from_metrics"] == []
    assert current["latest_effective_snapshot"]["ahorro_disponible"] == 1000000


def test_repository_authentication_and_transport_errors_are_sanitized(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.invalid")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-server-key")
    requests = []
    def handler(request):
        requests.append(request)
        if request.url.path == "/auth/v1/user":
            return httpx.Response(200, json={"id": "owner"})
        return httpx.Response(400, json={"message": "idempotency_conflict"})
    with httpx.Client(base_url="https://example.invalid", transport=httpx.MockTransport(handler)) as client:
        repo = TrackingRepository(client)
        assert repo.authenticate("test-user-token") == "owner"
        assert requests[0].headers["authorization"] == "Bearer test-user-token"
        with pytest.raises(TrackingError, match="idempotency_conflict"):
            repo.commit("owner", {}, None, {})


def test_unconfigured_persistence_and_expired_token(api, monkeypatch):
    client, repo = api
    def expired(_token):
        raise TrackingError("unauthenticated")
    repo.authenticate = expired
    assert client.get("/tracking", headers={"Authorization": "Bearer expired"}).status_code == 401
    for name in ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(name, raising=False)
    app.dependency_overrides.clear()
    assert client.get("/tracking", headers={"Authorization": "Bearer x"}).status_code == 503
