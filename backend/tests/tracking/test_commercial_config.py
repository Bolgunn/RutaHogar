"""HU 21 — commercial configuration endpoints and the configured priority on staff reads."""

import asyncio
from copy import deepcopy

import httpx
import pytest

from app.main import app
from app.scoring_engine.commercial_criteria import normalize_criterios
from app.scoring_engine.constants import COMMERCIAL_ACTIONS, COMMERCIAL_PRIORITY_ALG_VERSION
from app.tracking.commercial_config import CommercialConfigService, InvalidCriteria
from app.tracking.contracts import TrackingError
from app.tracking.routes import repository
from app.tracking.service import TrackingService
from app.tracking.staff import StaffLeadService
from test_service import MemoryRepository, command, market_snapshot, valid_snapshot

TENANT = "tenant-a"
OTHER_TENANT = "tenant-b"
PROJECT = "11111111-1111-1111-1111-111111111111"
AGOTADO = "22222222-2222-2222-2222-222222222222"
FOREIGN = "33333333-3333-3333-3333-333333333333"

ACTORS = {
    "admin-a": {"id": "admin-a", "role": "admin_inmobiliario", "inmobiliaria_id": TENANT},
    "admin-scoped": {"id": "admin-scoped", "role": "admin", "inmobiliaria_id": TENANT},
    "admin-b": {"id": "admin-b", "role": "admin_inmobiliario", "inmobiliaria_id": OTHER_TENANT},
    "exec-a": {"id": "exec-a", "role": "ejecutivo", "inmobiliaria_id": TENANT},
    "exec-b": {"id": "exec-b", "role": "ejecutivo", "inmobiliaria_id": OTHER_TENANT},
    "global": {"id": "global", "role": "admin", "inmobiliaria_id": None},
    "lead": {"id": "lead-1", "role": "usuario", "inmobiliaria_id": None},
}
ENGINE = {
    "contact_with_review": {
        "level": COMMERCIAL_ACTIONS["contact_with_review"], "action": COMMERCIAL_ACTIONS["contact_with_review"],
        "reason": "Lead con potencial comercial y señales de intención de compra; requiere revisión antes de avanzar.",
        "send_to_crm": True,
    },
    "contact_now": {
        "level": COMMERCIAL_ACTIONS["contact_now"], "action": COMMERCIAL_ACTIONS["contact_now"],
        "reason": "Lead con alta preparación financiera y compatible con el objetivo inmobiliario.",
        "send_to_crm": True,
    },
}


def evaluation(evaluation_id, lead, classification, fit, plazo, created_at, engine_key):
    return {
        "id": evaluation_id,
        "user_id": lead,
        "created_at": created_at,
        "financial_data": {
            "input": {"plazo_compra": plazo, "tiene_propiedad_vista": False},
            "result": {
                "score": 60, "adjusted_score": 60, "classification": classification,
                "project_fit": {"classification": fit, "status": "near" if fit == "Cercano" else "compatible"},
                "blockers": [], "commercial_priority_detail": deepcopy(ENGINE[engine_key]),
            },
        },
    }


class ConfigRepository:
    def __init__(self):
        self.rows = [
            # medio-pronto: Medio + Cercano + immediate term → promoted by subir_con_senales = 1.
            evaluation("e1", "medio-pronto", "Medio", "Cercano", "inmediato", "2026-10-20T00:00:00Z", "contact_with_review"),
            # Older evaluation of the same lead: outside the tray universe.
            evaluation("e0", "medio-pronto", "Medio", "Cercano", "mas_12_meses", "2026-09-01T00:00:00Z", "contact_with_review"),
            evaluation("e2", "medio-lento", "Medio", "Cercano", "mas_12_meses", "2026-10-21T00:00:00Z", "contact_with_review"),
            evaluation("e3", "alto", "Alto", "Compatible", "6_a_12_meses", "2026-10-22T00:00:00Z", "contact_now"),
            evaluation("e4", "descartado", "Medio", "Cercano", "inmediato", "2026-10-23T00:00:00Z", "contact_with_review"),
        ]
        self.configs = []
        self.projects = {TENANT: {PROJECT: "disponible", AGOTADO: "agotado"}, OTHER_TENANT: {FOREIGN: "disponible"}}
        self.inserts = 0

    def staff_actor(self, token):
        if token not in ACTORS:
            raise TrackingError("unauthenticated")
        return dict(ACTORS[token])

    def staff_evaluations(self, actor):
        return deepcopy(self.rows) if actor.get("role") in {"ejecutivo", "admin", "admin_inmobiliario"} else []

    def staff_contacts(self, ids):
        return {str(i): {"full_name": f"Nombre {i}", "phone": None} for i in ids if i}

    def lead_reliability_statuses(self, ids):
        return {i: ("descartado" if i == "descartado" else "normal") for i in ids}

    def latest_commercial_config(self, inmobiliaria_id):
        rows = [row for row in self.configs if row["inmobiliaria_id"] == inmobiliaria_id]
        return deepcopy(max(rows, key=lambda row: row["version"])) if rows else None

    def commercial_config_history(self, inmobiliaria_id):
        return deepcopy(sorted(
            (row for row in self.configs if row["inmobiliaria_id"] == inmobiliaria_id),
            key=lambda row: -row["version"],
        ))

    def insert_commercial_config(self, row):
        if any(c["inmobiliaria_id"] == row["inmobiliaria_id"] and c["version"] == row["version"] for c in self.configs):
            raise TrackingError("config_version_conflict")
        self.inserts += 1
        stored = {**deepcopy(row), "id": f"cfg-{self.inserts}", "created_at": f"2026-10-29T0{self.inserts}:00:00Z"}
        self.configs.append(stored)
        return deepcopy(stored)

    def tenant_project_states(self, inmobiliaria_id, ids):
        tenant = self.projects.get(inmobiliaria_id, {})
        return {i: tenant[i] for i in ids if i in tenant}


def criterios(**overrides):
    return normalize_criterios(overrides)


def save(repo, token="admin-a", base_version=None, **overrides):
    return CommercialConfigService(repo).save_config(token, {"base_version": base_version, "criterios": criterios(**overrides)})


# --- E1 · reading the current configuration --------------------------------------------------

def test_get_returns_defaults_when_never_configured():
    result = CommercialConfigService(ConfigRepository()).config("admin-a")

    assert result["vigente"] is None
    assert result["defaults"] == normalize_criterios(None)
    assert result["historial"] == []
    assert result["opciones"]["umbral_reorientar"] == [60, 65, 70, 75, 80, 85]
    assert result["opciones"]["proyectos_prioritarios"] == {"max": 5}


def test_get_returns_latest_version():
    repo = ConfigRepository()
    save(repo, umbral_reorientar=75)
    save(repo, base_version=1, umbral_reorientar=75, subir_con_senales=1)

    result = CommercialConfigService(repo).config("admin-scoped")

    assert result["vigente"]["version"] == 2
    assert result["vigente"]["criterios"]["subir_con_senales"] == 1
    assert result["vigente"]["created_by_name"] == "Nombre admin-a"
    assert [item["version"] for item in result["historial"]] == [2, 1]
    assert result["historial"][0]["cambios"] == [{"key": "subir_con_senales", "before": 0, "after": 1}]
    assert result["historial"][1]["cambios"] == [{"key": "umbral_reorientar", "before": 70, "after": 75}]


@pytest.mark.parametrize("token", ["exec-a", "global", "lead"])
def test_only_tenant_admins_read_or_write_the_configuration(token):
    repo = ConfigRepository()
    service = CommercialConfigService(repo)
    body = {"base_version": None, "criterios": criterios()}

    for call in (lambda: service.config(token), lambda: service.preview_config(token, body),
                 lambda: service.save_config(token, body)):
        with pytest.raises(TrackingError) as error:
            call()
        assert error.value.code == "owner_mismatch"
    assert repo.configs == []


def test_configuration_is_isolated_per_tenant():
    repo = ConfigRepository()
    save(repo, umbral_reorientar=80)

    assert CommercialConfigService(repo).config("admin-b")["vigente"] is None


# --- E2 · modifying without touching the score ------------------------------------------------

def test_invalid_criteria_are_rejected_per_key_and_nothing_is_written():
    repo = ConfigRepository()
    body = {"base_version": None, "criterios": {**criterios(), "umbral_reorientar": 72}}

    with pytest.raises(InvalidCriteria) as error:
        CommercialConfigService(repo).save_config("admin-a", body)

    assert error.value.errors == [{"key": "umbral_reorientar", "code": "invalid_value"}]
    assert repo.configs == []


@pytest.mark.parametrize("project, code", [(FOREIGN, "project_not_found"), (AGOTADO, "project_agotado")])
def test_priority_projects_must_be_the_tenants_and_not_agotado(project, code):
    repo = ConfigRepository()
    with pytest.raises(InvalidCriteria) as error:
        save(repo, proyectos_prioritarios=[project])
    assert error.value.errors == [{"key": "proyectos_prioritarios", "code": code}]


def test_tenant_and_author_come_from_the_actor_not_the_body():
    repo = ConfigRepository()
    body = {
        "base_version": None, "criterios": criterios(),
        "inmobiliaria_id": OTHER_TENANT, "created_by": "someone-else",
    }

    CommercialConfigService(repo).save_config("admin-a", body)

    assert repo.configs[0]["inmobiliaria_id"] == TENANT
    assert repo.configs[0]["created_by"] == "admin-a"
    assert repo.configs[0]["alg_version"] == COMMERCIAL_PRIORITY_ALG_VERSION


def test_save_does_not_touch_evaluations():
    repo = ConfigRepository()
    before = deepcopy(repo.rows)

    save(repo, subir_con_senales=1)
    StaffLeadService(repo).evaluations("exec-a")

    assert repo.rows == before


def test_configured_priority_never_changes_score_or_classification():
    repo = ConfigRepository()
    save(repo, subir_con_senales=1)

    items = StaffLeadService(repo).evaluations("exec-a")["items"]
    stored = {row["id"]: row["financial_data"] for row in repo.rows}
    for item in items:
        assert item["financial_data"] == stored[item["id"]]


# --- E3 · preview before confirming ----------------------------------------------------------

def test_preview_writes_nothing():
    repo = ConfigRepository()
    CommercialConfigService(repo).preview_config("admin-a", {"base_version": None, "criterios": criterios(subir_con_senales=1)})
    assert repo.configs == []
    assert repo.inserts == 0


def test_preview_counts():
    repo = ConfigRepository()

    preview = CommercialConfigService(repo).preview_config(
        "admin-a", {"base_version": None, "criterios": criterios(subir_con_senales=1)},
    )

    # Latest evaluation per lead, discarded lead excluded: medio-pronto, medio-lento, alto.
    assert preview["conteos"]["vigente"]["contact_with_review"] == 2
    assert preview["conteos"]["vigente"]["contact_now"] == 1
    assert preview["conteos"]["borrador"]["contact_with_review"] == 1
    assert preview["conteos"]["borrador"]["contact_now"] == 2
    assert sum(preview["conteos"]["borrador"].values()) == 3
    assert preview["leads_que_cambian"] == 1
    assert preview["cambios"] == [{"key": "subir_con_senales", "before": 0, "after": 1}]
    assert "medio-pronto" not in str(preview)


# --- E4 · applying and history ---------------------------------------------------------------

def test_save_creates_next_version():
    repo = ConfigRepository()
    first = save(repo)
    second = save(repo, base_version=1, orden_desempate="capacidad")

    assert (first["version"], second["version"]) == (1, 2)
    assert second["criterios"]["orden_desempate"] == "capacidad"
    assert len(repo.configs) == 2


@pytest.mark.parametrize("base_version", [None, 1, 3])
def test_stale_base_version_conflicts(base_version):
    repo = ConfigRepository()
    save(repo)
    save(repo, base_version=1)

    with pytest.raises(TrackingError) as error:
        save(repo, base_version=base_version)
    assert error.value.code == "config_version_conflict"
    assert len(repo.configs) == 2


def test_evaluations_use_latest_config():
    repo = ConfigRepository()
    before = StaffLeadService(repo).evaluations("exec-a")
    save(repo, subir_con_senales=1, proyectos_prioritarios=[PROJECT], orden_desempate="capacidad")
    after = StaffLeadService(repo).evaluations("exec-a")

    def keys(result):
        return {row["id"]: row["commercial_priority_configured"]["action_key"] for row in result["items"]}

    assert keys(before)["e1"] == "contact_with_review"
    assert keys(after)["e1"] == "contact_now"
    assert {row["id"]: row["differs_from_engine"] for row in after["items"]}["e1"] is True
    assert before["commercial_config"] == {"version": None, "proyectos_prioritarios": [], "orden_desempate": "afinidad"}
    assert after["commercial_config"] == {"version": 1, "proyectos_prioritarios": [PROJECT], "orden_desempate": "capacidad"}
    assert all(row["commercial_priority_configured"]["config_version"] == 1 for row in after["items"])


def test_another_tenants_executive_sees_no_change():
    repo = ConfigRepository()
    before = StaffLeadService(repo).evaluations("exec-b")
    save(repo, subir_con_senales=1)
    assert StaffLeadService(repo).evaluations("exec-b") == before


def test_global_admin_receives_rows_exactly_as_before():
    repo = ConfigRepository()
    save(repo, subir_con_senales=1)

    result = StaffLeadService(repo).evaluations("global")

    assert set(result) == {"items"}
    assert all("commercial_priority_configured" not in row and "differs_from_engine" not in row for row in result["items"])


# --- HTTP transport --------------------------------------------------------------------------

class ASGITestClient:
    def request(self, method, path, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(send())


@pytest.fixture
def inline(monkeypatch):
    async def inline_threadpool(call, *args, **kwargs):
        return call(*args, **kwargs)

    monkeypatch.setattr("fastapi.dependencies.utils.run_in_threadpool", inline_threadpool)
    monkeypatch.setattr("fastapi.routing.run_in_threadpool", inline_threadpool)
    try:
        yield
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def api(inline):
    repo = ConfigRepository()
    app.dependency_overrides[repository] = lambda: repo
    return ASGITestClient(), repo


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_http_status_codes(api):
    client, repo = api
    body = {"base_version": None, "criterios": criterios()}

    assert client.request("GET", "/tracking/staff/commercial-config").status_code == 401
    assert client.request("GET", "/tracking/staff/commercial-config", headers=auth("exec-a")).status_code == 403
    assert client.request("GET", "/tracking/staff/commercial-config", headers=auth("global")).status_code == 403
    assert client.request("GET", "/tracking/staff/commercial-config", headers=auth("admin-a")).status_code == 200

    preview = client.request("POST", "/tracking/staff/commercial-config/preview", json=body, headers=auth("admin-a"))
    assert preview.status_code == 200, preview.text

    saved = client.request("POST", "/tracking/staff/commercial-config", json=body, headers=auth("admin-a"))
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 1

    stale = client.request("POST", "/tracking/staff/commercial-config", json=body, headers=auth("admin-a"))
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "config_version_conflict"

    invalid = client.request(
        "POST", "/tracking/staff/commercial-config/preview",
        json={"base_version": 1, "criterios": {**criterios(), "peso_ingreso": 0.4}}, headers=auth("admin-a"),
    )
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["errors"] == [{"key": "peso_ingreso", "code": "unknown_key"}]

    forged = client.request(
        "POST", "/tracking/staff/commercial-config",
        json={**body, "base_version": 1, "inmobiliaria_id": OTHER_TENANT}, headers=auth("admin-a"),
    )
    assert forged.status_code == 422
    assert len(repo.configs) == 1


def test_lead_endpoints_identical_with_config(inline, monkeypatch):
    monkeypatch.setattr(
        "app.tracking.routes.TrackingService",
        lambda repo: TrackingService(repo, market_snapshot_resolver=market_snapshot),
    )
    repo = MemoryRepository()
    repo.authenticate = lambda _token: "u1"
    config_repo = ConfigRepository()
    repo.latest_commercial_config = config_repo.latest_commercial_config
    repo.commercial_config_history = config_repo.commercial_config_history
    app.dependency_overrides[repository] = lambda: repo
    client = ASGITestClient()
    headers = auth("lead")
    assert client.request("POST", "/tracking/events", json=command(valid_snapshot()), headers=headers).status_code == 200

    as_of = "as_of=2026-10-29T00:00:00%2B00:00"
    paths = [f"/tracking?{as_of}", "/tracking/history?view=audit", f"/tracking/projection?{as_of}"]
    before = [client.request("GET", path, headers=headers).json() for path in paths]
    save(config_repo, subir_con_senales=1, umbral_reorientar=85)
    config_repo.configs = [{**row, "inmobiliaria_id": tenant} for row in config_repo.configs for tenant in (TENANT, None)]
    after = [client.request("GET", path, headers=headers).json() for path in paths]

    assert after == before
