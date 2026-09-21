from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.tracking.contracts import TrackingError
from app.tracking.service import TrackingService


def valid_snapshot():
    return {
        "ingreso_mensual": 1000000, "deuda_mensual": 200000, "edad": 30,
        "ahorro_disponible": 1000000, "plazo_credito_hipotecario": 20,
        "tipo_contrato": "indefinido", "continuidad_laboral": "mas_3_anios",
        "morosidad_actual": "no", "consentimiento": True,
        "property_value_clp": 100000000, "dividendo_estimado": 300000,
        "project_goal": {"id": "p1", "nombre": "Proyecto original"},
    }


class MemoryRepository:
    def __init__(self):
        self.bundle = {"plan": None, "events": [], "goals": [], "goal_events": [], "evaluations": [], "revision": None}
        self.commits = 0

    def load(self, user_id):
        return deepcopy(self.bundle)

    def commit(self, user_id, command, revision, records):
        if revision != self.bundle["revision"]:
            raise TrackingError("lineage_conflict")
        self.commits += 1
        result = records["result"]
        for event in records["events"]:
            self.bundle["events"].append({
                **event, "user_id": user_id, "previous_event_id": event.get("previous"),
                "correction_of_event_id": event.get("correction_of"),
                "canonical_request": command, "command_result": result,
            })
        for row in records["evaluations"]:
            self.bundle["evaluations"].append({
                "id": row["id"], "financial_data": {"input": row["snapshot"], "result": row["result"]},
            })
        if records["plan"]:
            self.bundle["plan"] = deepcopy(records["plan"])
        self.bundle["goals"].extend({"progress_data": deepcopy(goal)} for goal in records["goals"])
        self.bundle["revision"] = records["events"][-1]["event_id"]
        return deepcopy(result)


def command(patch, previous=None, at="2026-01-01T00:00:00+00:00"):
    return {"event_id": str(uuid4()), "event_kind": "data_update", "effective_at": at,
            "reason": "Actualización declarada", "previous_event_id": previous, "patch": patch}


def service():
    repo = MemoryRepository()
    return repo, TrackingService(repo, clock=lambda: datetime(2026, 3, 1, tzinfo=timezone.utc))


def test_projection_before_baseline_is_total_and_read_only():
    repo, app = service()
    before = deepcopy(repo.bundle)

    result = app.projection("u1")

    assert result["status"] == "not_projectable"
    assert result["cause"] == "missing_project_goal"
    assert result["milestones"] == []
    assert repo.bundle == before


def test_partial_worsening_and_retry_preserve_baseline_and_project():
    repo, app = service()
    baseline = command(valid_snapshot())
    first = app.execute("u1", baseline)
    frozen = deepcopy(repo.bundle["plan"])
    second = command({"ahorro_disponible": 0}, first["event_id"], "2026-02-01T00:00:00+00:00")
    result = app.execute("u1", second)
    assert app.execute("u1", second) == result
    assert repo.commits == 2
    read = app.read("u1")
    assert read["latest_effective_snapshot"]["project_goal"]["id"] == "p1"
    assert read["latest_effective_snapshot"]["deuda_mensual"] == 200000
    assert read["latest_effective_snapshot"]["ahorro_disponible"] == 0
    assert repo.bundle["plan"] == frozen
    assert len(repo.bundle["evaluations"]) == 2
    assert not read["update_due"]  # February has 28 days.
    assert app.read("u1", "2026-03-03T00:00:00Z")["update_due"]
    with pytest.raises(TrackingError, match="idempotency_conflict"):
        app.execute("u1", {**second, "patch": {"ahorro_disponible": 10}})


def test_idempotency_compares_equivalent_timestamps_canonically():
    repo, app = service()
    first = app.execute("u1", command(valid_snapshot()))
    update = command({"ahorro_disponible": 500000}, first["event_id"], "2026-02-01T00:00:00Z")
    result = app.execute("u1", update)

    replay = app.execute("u1", {**update, "effective_at": "2026-01-31T21:00:00-03:00"})

    assert replay == result
    assert repo.commits == 2


def test_correction_replays_intermediate_then_appends_new_real_evaluation_atomically():
    repo, app = service()
    first = app.execute("u1", command(valid_snapshot()))
    second = app.execute("u1", command({"ahorro_disponible": 2000000}, first["event_id"], "2026-02-01T00:00:00Z"))
    app.execute("u1", command({"deuda_mensual": 250000}, second["event_id"], "2026-02-15T00:00:00Z"))
    historical = deepcopy(repo.bundle["evaluations"])
    correction = {
        "event_id": str(uuid4()), "effective_at": "2026-03-01T00:00:00Z",
        "reason": "Monto digitado incorrectamente", "correction_effect": "replace",
        "patch": {"ahorro_disponible": 1500000},
    }
    result = app.execute("u1", correction, second["event_id"])
    assert repo.commits == 4  # Correction + reevaluation is exactly one commit.
    assert len(repo.bundle["events"]) == 5
    assert len(result["evaluation_ids"]) == 1
    assert repo.bundle["evaluations"][:3] == historical
    view = app.read("u1")
    assert second["event_id"] in view["excluded_from_metrics"]
    assert view["latest_effective_snapshot"]["ahorro_disponible"] == 1500000
    assert view["latest_effective_snapshot"]["deuda_mensual"] == 250000


def test_sole_baseline_cannot_be_annulled_or_leave_tracking_empty():
    repo, app = service()
    first = app.execute("u1", command(valid_snapshot()))
    before = deepcopy(repo.bundle)
    annul = {
        "event_id": str(uuid4()), "effective_at": "2026-02-01T00:00:00Z",
        "reason": "La evaluación inicial no correspondía", "correction_effect": "annul", "patch": {},
    }

    with pytest.raises(TrackingError, match="invalid_lineage"):
        app.execute("u1", annul, first["event_id"])

    assert repo.bundle == before
    assert repo.commits == 1


def test_baseline_replacement_is_effective_and_later_events_replay_from_it():
    repo, app = service()
    first = app.execute("u1", command(valid_snapshot()))
    frozen = deepcopy(repo.bundle["plan"])
    original = deepcopy(repo.bundle["events"][0])
    replacement_snapshot = {**valid_snapshot(), "ingreso_mensual": 1200000, "ahorro_disponible": 900000}
    replace = {
        "event_id": str(uuid4()), "effective_at": "2026-02-01T00:00:00Z",
        "reason": "Corrección de antecedentes iniciales", "correction_effect": "replace",
        "patch": replacement_snapshot,
    }

    corrected = app.execute("u1", replace, first["event_id"])
    correction_id = replace["event_id"]
    corrected_view = app.read("u1")

    assert corrected["baseline_id"] == frozen["id"]
    assert repo.bundle["plan"] == frozen
    assert repo.bundle["events"][0] == original
    assert corrected_view["active_line"][0]["event_id"] == correction_id
    assert corrected_view["latest_effective_snapshot"] == replacement_snapshot
    assert first["event_id"] in corrected_view["excluded_from_metrics"]

    followup = command(
        {"deuda_mensual": 150000}, corrected_view["latest_event_id"], "2026-03-01T00:00:00Z",
    )
    app.execute("u1", followup)
    replayed = app.read("u1")["latest_effective_snapshot"]
    assert replayed["ingreso_mensual"] == 1200000
    assert replayed["ahorro_disponible"] == 900000
    assert replayed["deuda_mensual"] == 150000


def test_invalid_or_stale_command_writes_nothing():
    repo, app = service()
    with pytest.raises(TrackingError, match="invalid_patch"):
        app.execute("u1", command({"ingreso_mensual": 1}))
    assert repo.commits == 0
    app.execute("u1", command(valid_snapshot()))
    with pytest.raises(TrackingError, match="lineage_conflict"):
        app.execute("u1", command({"ahorro_disponible": 1}))
    assert repo.commits == 1


def test_score_failure_writes_nothing():
    repo = MemoryRepository()
    def fail(_snapshot):
        raise RuntimeError("scorer unavailable")
    with pytest.raises(RuntimeError):
        TrackingService(repo, scorer=fail).execute("u1", command(valid_snapshot()))
    assert repo.commits == 0


def test_goal_regression_preserves_completion_evidence():
    repo, app = service()
    first = app.execute("u1", command(valid_snapshot()))
    app.execute("u1", command({"deuda_mensual": 400000}, first["event_id"], "2026-02-01T00:00:00Z"))
    goal = next(row for row in app.read("u1")["goals"]
                if row["definition"]["source_action_type"] == "reduce_debt")
    assert goal["action_status"] == "pendiente"
    assert goal["evidence"]["ever_completed"]
    assert goal["evidence"]["currently_regressed"]
