import asyncio

import httpx
import pytest

from app.main import app
from app.tracking.routes import repository
from test_staff_co_debtor_projection import LEAD_ID, OUTSIDE_LEAD_ID, StaffRepository, confirmed_values


class ASGITestClient:
    def get(self, path, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.get(path, **kwargs)
        return asyncio.run(send())


@pytest.fixture
def api(monkeypatch):
    async def inline_threadpool(call, *args, **kwargs):
        return call(*args, **kwargs)

    monkeypatch.setattr("fastapi.dependencies.utils.run_in_threadpool", inline_threadpool)
    monkeypatch.setattr("fastapi.routing.run_in_threadpool", inline_threadpool)
    staff_repository = StaffRepository()
    staff_repository.invitation = {"status": "confirmed", "co_debtor_confirmations": [confirmed_values()]}
    app.dependency_overrides[repository] = lambda: staff_repository
    try:
        yield ASGITestClient(), staff_repository
    finally:
        app.dependency_overrides.clear()


def test_staff_detail_requires_bearer_and_projects_only_the_authorized_lead(api):
    client, _ = api

    assert client.get(f"/tracking/staff/leads/{LEAD_ID}").status_code == 401

    headers = {"Authorization": "Bearer executive-token"}
    allowed = client.get(f"/tracking/staff/leads/{LEAD_ID}", headers=headers)
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["co_debtor"]["confirmed"] == confirmed_values()
    assert "token" not in str(allowed.json()).lower()

    outside = client.get(f"/tracking/staff/leads/{OUTSIDE_LEAD_ID}", headers=headers)
    assert outside.status_code == 403
    assert outside.json()["detail"]["code"] == "owner_mismatch"


def test_staff_evaluation_feed_is_redacted_before_it_reaches_the_dashboard(api):
    client, _ = api

    response = client.get("/tracking/staff/evaluations", headers={"Authorization": "Bearer executive-token"})

    assert response.status_code == 200, response.text
    serialized = str(response.json())
    assert "ingreso_mensual_complementario" not in serialized
    assert "deuda_mensual_complementario" not in serialized
    assert "relacion_complementario" not in serialized
