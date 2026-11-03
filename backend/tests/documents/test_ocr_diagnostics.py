"""Deployment diagnostics must not expose configuration or bypass admin auth."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.documents.routes import repository
from app.main import app
from app.tracking.contracts import TrackingError


class FakeTracking:
    def __init__(self, actor):
        self.actor = actor

    def staff_actor(self, token):
        if token != "valid-test-session":
            raise TrackingError("unauthenticated")
        return self.actor


@pytest.fixture
def client(monkeypatch):
    for name in ("HU23_OCR_PROVIDER", "HU23_LOCAL_OCR_URL", "HU23_LOCAL_OCR_TOKEN",
                 "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_KEY"):
        monkeypatch.delenv(name, raising=False)
    actor = {"role": "admin", "inmobiliaria_id": None}
    app.dependency_overrides[repository] = lambda: SimpleNamespace(tracking=FakeTracking(actor))
    with TestClient(app) as client:
        yield client, actor
    app.dependency_overrides.pop(repository, None)


def get(client, token="valid-test-session"):
    return client.get("/tracking/documents/diagnostics/ocr", headers={"Authorization": "Bearer " + token})


@pytest.mark.parametrize("provider, values, ready", [
    ("azure", {"AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT": "https://azure.example.invalid", "AZURE_DOCUMENT_INTELLIGENCE_KEY": "fake-azure-secret"}, True),
    ("azure", {"AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT": "https://azure.example.invalid"}, False),
    ("local", {"HU23_LOCAL_OCR_URL": "https://worker.example.invalid", "HU23_LOCAL_OCR_TOKEN": "fake-worker-secret-01234567890123456789"}, True),
    ("local", {"HU23_LOCAL_OCR_URL": "https://worker.example.invalid"}, False),
    ("invalid-sensitive-provider-value", {}, False),
    (None, {}, False),
    ("local", {"HU23_LOCAL_OCR_URL": "http://worker.example.invalid", "HU23_LOCAL_OCR_TOKEN": "fake-worker-secret-01234567890123456789"}, False),
])
def test_diagnostics_provider_readiness(client, monkeypatch, caplog, provider, values, ready):
    http, _ = client
    if provider is not None:
        monkeypatch.setenv("HU23_OCR_PROVIDER", provider)
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    response = get(http)
    assert response.status_code == 200
    body = response.json()
    assert body["ready_for_selected_provider"] is ready
    assert body["provider"] == ("invalid" if provider == "invalid-sensitive-provider-value" else provider or "azure")
    assert response.headers["cache-control"] == "no-store"
    assert set(body) == {"provider", "worker_url_configured", "worker_token_configured", "azure_endpoint_configured", "azure_key_configured", "ready_for_selected_provider"}
    for name, field in (("HU23_LOCAL_OCR_URL", "worker_url_configured"),
                        ("HU23_LOCAL_OCR_TOKEN", "worker_token_configured"),
                        ("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "azure_endpoint_configured"),
                        ("AZURE_DOCUMENT_INTELLIGENCE_KEY", "azure_key_configured")):
        assert body[field] is bool(values.get(name, "").strip())
    for value in values.values():
        assert value not in response.text
        assert value not in caplog.text
    assert "invalid-sensitive-provider-value" not in response.text


def test_diagnostics_requires_global_admin_and_valid_session(client):
    http, actor = client
    response = http.get("/tracking/documents/diagnostics/ocr")
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"
    assert get(http, "invalid").status_code == 401
    for role, tenant in [("usuario", None), ("ejecutivo", None), ("admin_inmobiliario", "tenant"), ("admin", "tenant")]:
        actor.update(role=role, inmobiliaria_id=tenant)
        response = get(http)
        assert response.status_code == 403
        assert response.headers["cache-control"] == "no-store"
