from copy import deepcopy
from uuid import UUID
import pytest
from app.exports.routes import ExportCommand
from app.exports.service import ExportService
from app.tracking.contracts import TrackingError

ACTOR = "11111111-1111-4111-8111-111111111111"
TENANT = "22222222-2222-4222-8222-222222222222"
PROJECT = "33333333-3333-4333-8333-333333333333"
EVALUATION = "44444444-4444-4444-8444-444444444444"
LEAD = "55555555-5555-4555-8555-555555555555"


class Repository:
    def __init__(self):
        self.actor = {"id": ACTOR, "role": "ejecutivo", "inmobiliaria_id": TENANT}
        self.authorized = True
        self.fail_audit = False
        self.events = []
        self.calls = []
        self.input = {"ingreso_mensual": 1500000, "deuda_mensual": 100000, "ingreso_mensual_complementario": 900000, "complemento_renta": True, "project_goal": {"id": PROJECT, "nombre": "Parque"}, "secret": "token"}

    def staff_actor(self, token):
        if token != "valid":
            raise TrackingError("unauthenticated")
        return self.actor

    def staff_history(self, lead):
        return [{"created_at": "2026-10-20", "score": 70, "snapshot": self.input}, {"created_at": "2026-09-20", "score": 60, "snapshot": self.input}]

    def request(self, method, path, **kwargs):
        self.calls.append((method, path, kwargs))
        if path.startswith("/rest/v1/profiles?"):
            return [{"full_name": "Ejecutivo de prueba"}]
        if path.startswith("/auth/v1/admin/users/"):
            return {"email": "ejecutivo@example.test"}
        if path.endswith("commercial_funnel_facts"):
            assert kwargs["token"] == "valid"
            return {"proyectos": [{"id": PROJECT, "nombre": "Parque"}], "now": "2026-10-29T12:00:00Z"}
        if path.endswith("hu22_export_rows"):
            assert kwargs["payload"]["p_projects"] == [PROJECT]
            return [] if not self.authorized else [{"id": EVALUATION, "user_id": LEAD, "created_at": "2026-10-28", "score": 72, "classification": "Alto", "email": "lead@example.test", "full_name": "Cliente", "financial_data": {"input": self.input, "result": {"score": 72, "structured_improvement_plan": [{"title": "No divulgar 900000", "target_value": 900000}] }}, "authorized_projects": [PROJECT]}]
        if path.startswith("/rest/v1/commercial_stage_events"):
            assert "proyecto_id=in.%28" in path
            return [{"occurred_at": "2026-10-28", "proyecto_id": PROJECT, "stage_before": "nuevo", "stage_after": "contactado", "secret": "not exported"}]
        if path.startswith("/rest/v1/export_events"):
            return deepcopy(self.events)
        if path.endswith("hu22_record_export"):
            if self.fail_audit:
                raise TrackingError("persistence_unavailable")
            self.events.append(deepcopy(kwargs["payload"]["p_record"]))
            return {"id": self.events[-1]["id"]}
        if path.endswith("hu22_export_delivery"):
            self.events[0]["status"] = "delivery_requested"
            self.events[0]["sha256"] = kwargs["payload"]["p_sha256"]
            return {"id": self.events[0]["id"]}
        raise AssertionError(path)


def command(**kwargs):
    return ExportCommand(request_id=UUID("66666666-6666-4666-8666-666666666666"), kind=kwargs.pop("kind", "dossier"), evaluation_ids=kwargs.pop("evaluation_ids", [EVALUATION]), blocks=kwargs.pop("blocks", ["profile", "evaluation", "financial", "project", "plan", "evaluation_history", "commercial_history"]), **kwargs)


def test_snapshot_allowlist_histories_and_codebtor_exclusion():
    repo = Repository()
    data = ExportService(repo).prepare("valid", command())
    serialized = str(data)
    assert "ingreso_mensual_complementario" not in serialized
    assert "900000" not in serialized
    assert "token" not in serialized
    assert data["items"][0]["financial"]["ingreso_mensual"] == 1500000
    assert [r["score"] for r in data["items"][0]["evaluation_history"]] == [60, 70]
    assert len(repo.events) == 1
    assert "financial" not in repo.events[0]


@pytest.mark.parametrize("role,tenant", [("usuario", TENANT), ("admin", None), ("admin_inmobiliario", None)])
def test_denies_non_staff_and_unscoped_actor(role, tenant):
    repo = Repository(); repo.actor.update(role=role, inmobiliaria_id=tenant)
    with pytest.raises(TrackingError, match="owner_mismatch"):
        ExportService(repo).prepare("valid", command())
    assert not repo.events


def test_denies_outside_project_and_unauthorized_lead_without_audit():
    repo = Repository()
    with pytest.raises(TrackingError, match="owner_mismatch"):
        ExportService(repo).prepare("valid", command(project_id="77777777-7777-4777-8777-777777777777"))
    repo.authorized = False
    with pytest.raises(TrackingError, match="owner_mismatch"):
        ExportService(repo).prepare("valid", command())
    assert not repo.events


def test_only_selected_blocks_and_ids_are_queried():
    repo = Repository()
    data = ExportService(repo).prepare("valid", command(kind="leads", blocks=["financial"]))
    assert set(data["items"][0]) == {"evaluation_id", "evaluated_at", "financial"}
    assert not any("commercial_stage_events" in path for _, path, _ in repo.calls)


def test_preview_returns_only_eligible_ids_without_personal_data_or_audit():
    repo = Repository()
    response = ExportService(repo).prepare("valid", command(), preview=True)
    assert response == {"eligible_ids": [EVALUATION]}
    assert not repo.events
    repo.authorized = False
    assert ExportService(repo).prepare("valid", command(), preview=True) == {"eligible_ids": []}


def test_fail_closed_when_audit_unavailable():
    repo = Repository(); repo.fail_audit = True
    with pytest.raises(TrackingError, match="persistence_unavailable"):
        ExportService(repo).prepare("valid", command())


def test_explicit_refusal_of_lead_consent_blocks_export():
    repo = Repository(); repo.input["consentimiento"] = False
    with pytest.raises(TrackingError, match="owner_mismatch"):
        ExportService(repo).prepare("valid", command())
    assert not repo.events


def test_metrics_does_not_export_raw_facts_or_lead_fields():
    repo = Repository()
    data = ExportService(repo).prepare("valid", command(kind="metrics", evaluation_ids=[], blocks=["resumen", "historico"]))
    assert data["items"] == []
    assert not any(path.endswith("hu22_export_rows") for _, path, _ in repo.calls)
    with pytest.raises(TrackingError, match="invalid_export_fields"):
        ExportService(repo).prepare("valid", command(kind="metrics", evaluation_ids=[], blocks=["financial"]))


def test_retries_do_not_duplicate_audit_and_changed_selection_conflicts():
    repo = Repository(); service = ExportService(repo)
    service.prepare("valid", command())
    service.prepare("valid", command())
    assert len(repo.events) == 1
    with pytest.raises(TrackingError, match="idempotency_conflict"):
        service.prepare("valid", command(blocks=["profile"]))


def test_duplicate_leads_and_extra_actor_fields_are_rejected():
    repo = Repository()
    with pytest.raises(TrackingError, match="invalid_export_selection"):
        ExportService(repo).prepare("valid", command(kind="leads", evaluation_ids=[EVALUATION, EVALUATION]))
    with pytest.raises(ValueError):
        ExportCommand.model_validate({**command().model_dump(), "actor_id": ACTOR})
