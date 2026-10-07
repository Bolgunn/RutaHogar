import json
from copy import deepcopy
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.tracking.contracts import TrackingError
from app.tracking.service import TrackingService, client_tracking_view


def market_snapshot():
    return json.loads((Path(__file__).resolve().parents[3] / "docs/algorithms/ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


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
        self.co_debtor_consent = None

    def load(self, user_id):
        return deepcopy(self.bundle)

    def load_co_debtor_consent(self, user_id):
        return deepcopy(self.co_debtor_consent)

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
        if records.get("target_project_snapshot") and not self.bundle["plan"].get("target_project_snapshot"):
            self.bundle["plan"]["target_project_snapshot"] = deepcopy(records["target_project_snapshot"])
        self.bundle["goals"].extend({"progress_data": deepcopy(goal)} for goal in records["goals"])
        self.bundle["revision"] = records["events"][-1]["event_id"]
        return deepcopy(result)


def command(patch, previous=None, at="2026-01-01T00:00:00+00:00"):
    return {"event_id": str(uuid4()), "event_kind": "data_update", "effective_at": at,
            "reason": "Actualización declarada", "previous_event_id": previous, "patch": patch}


def service():
    repo = MemoryRepository()
    return repo, TrackingService(repo, clock=lambda: datetime(2026, 3, 1, tzinfo=timezone.utc), market_snapshot_resolver=market_snapshot)


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


def test_frozen_catalogue_price_is_used_for_updates_and_projection():
    """The card's `precio_min_uf` and tracking pie must use one target price."""
    repo, app = service()
    original_scorer = app.scorer
    scored = []

    def recording_scorer(snapshot):
        scored.append(deepcopy(snapshot))
        return original_scorer(snapshot, market_snapshot=market_snapshot())

    app.scorer = recording_scorer
    target = {"id": "terrazas", "nombre": "Terrazas de Maipú", "comuna": "Maipú", "precio_min_uf": 2900}
    # This represents an old/manual property amount left in the initial score.
    # It must not make a 2,900 UF catalogue target require the pie of a much
    # more expensive property.
    baseline = app.execute("u1", command({
        **valid_snapshot(), "property_value_clp": 404_000_000, "project_goal": target,
    }))
    app.execute("u1", command({"ahorro_disponible": 12_000_000}, baseline["event_id"], "2026-02-01T00:00:00Z"))

    assert len(scored) == 2
    assert all(row["property_value_uf"] == 2900 for row in scored)
    assert all(row["property_value_clp"] is None for row in scored)
    # The original source snapshot remains immutable for audit/history.
    assert repo.bundle["evaluations"][0]["financial_data"]["input"]["property_value_clp"] == 404_000_000

    scored.clear()
    app.projection("u1")
    assert scored
    assert all(row["property_value_uf"] == 2900 for row in scored)
    assert all(row["property_value_clp"] is None for row in scored)


def test_evaluations_keep_their_own_preliminary_question_snapshot():
    repo, app = service()
    original_onboarding = {
        "objetivo_principal": "comprar_ahora",
        "tipo_propiedad": "casa",
        "comuna_interes": "La Pintana",
        "comuna_alternativa": "La Reina",
        "plazo_compra": "6_12_meses",
        "tiene_propiedad_vista": True,
    }
    first = app.execute("u1", command({**valid_snapshot(), "onboarding_snapshot": original_onboarding}))
    later_onboarding = {**original_onboarding, "tipo_propiedad": "departamento", "comuna_interes": "Providencia"}
    app.execute("u1", command({"onboarding_snapshot": later_onboarding}, first["event_id"], "2026-02-01T00:00:00Z"))

    first_snapshot = repo.bundle["evaluations"][0]["financial_data"]["input"]["onboarding_snapshot"]
    later_snapshot = repo.bundle["evaluations"][1]["financial_data"]["input"]["onboarding_snapshot"]
    assert first_snapshot == original_onboarding
    assert later_snapshot == later_onboarding
    assert repo.bundle["events"][0]["recorded_complete_snapshot"]["onboarding_snapshot"] == original_onboarding


def test_first_later_project_goal_freezes_target_and_enables_projection():
    repo, app = service()
    baseline_snapshot = valid_snapshot()
    baseline_snapshot.pop("project_goal")
    first = app.execute("u1", command(baseline_snapshot))

    assert repo.bundle["plan"]["target_project_snapshot"] is None
    assert app.projection("u1")["cause"] == "missing_project_goal"

    selected = app.execute("u1", command(
        {
            "project_goal": {"id": "p1", "nombre": "Proyecto elegido"},
            "property_value_clp": 120000000,
        },
        first["event_id"], "2026-02-01T00:00:00Z",
    ))

    assert repo.bundle["plan"]["target_project_snapshot"]["id"] == "p1"
    assert repo.bundle["events"][0]["recorded_complete_snapshot"].get("project_goal") is None
    projected_snapshots = []
    real_scorer = app.scorer
    app.scorer = lambda snapshot: (projected_snapshots.append(deepcopy(snapshot)) or real_scorer(snapshot, market_snapshot=market_snapshot()))
    assert app.projection("u1")["cause"] != "missing_project_goal"
    assert projected_snapshots
    assert all(snapshot["property_value_clp"] == 120000000 for snapshot in projected_snapshots)

    app.execute("u1", command(
        {"project_goal": {"id": "p2", "nombre": "Proyecto posterior"}},
        selected["event_id"], "2026-03-01T00:00:00Z",
    ))
    assert repo.bundle["plan"]["target_project_snapshot"]["id"] == "p1"


def test_later_project_evaluation_is_preserved_without_replacing_frozen_target():
    repo, app = service()
    baseline = app.execute("u1", command(valid_snapshot()))
    later_snapshot = {
        **valid_snapshot(),
        "project_goal": {"id": "p2", "nombre": "Proyecto posterior"},
        "property_value_clp": 130000000,
    }
    later = app.execute("u1", command(later_snapshot, baseline["event_id"], "2026-02-01T00:00:00Z"))

    view = app.read("u1")
    assert view["latest_effective_snapshot"]["project_goal"]["id"] == "p2"
    assert view["current_evaluation_id"] == later["evaluation"]["id"]
    assert repo.bundle["plan"]["target_project_snapshot"]["id"] == "p1"
    assert [row["financial_data"]["input"]["project_goal"]["id"] for row in repo.bundle["evaluations"]] == ["p1", "p2"]

    projected_snapshots = []
    real_scorer = app.scorer
    app.scorer = lambda snapshot: (projected_snapshots.append(deepcopy(snapshot)) or real_scorer(snapshot, market_snapshot=market_snapshot()))
    app.projection("u1")
    assert projected_snapshots
    assert all(snapshot["property_value_clp"] == 100000000 for snapshot in projected_snapshots)


def test_baseline_replacement_can_freeze_first_project_without_rewriting_baseline():
    repo, app = service()
    baseline_snapshot = valid_snapshot()
    baseline_snapshot.pop("project_goal")
    first = app.execute("u1", command(baseline_snapshot))
    original_baseline = deepcopy(repo.bundle["events"][0])
    original_evaluation = deepcopy(repo.bundle["evaluations"][0])

    replacement_snapshot = {
        **baseline_snapshot,
        "project_goal": {"id": "p1", "nombre": "Proyecto corregido"},
        "property_value_clp": 120000000,
    }
    replacement = {
        "event_id": str(uuid4()), "effective_at": "2026-02-01T00:00:00Z",
        "reason": "El objetivo no fue registrado", "correction_effect": "replace",
        "patch": replacement_snapshot,
    }
    app.execute("u1", replacement, first["event_id"])

    assert repo.bundle["plan"]["target_project_snapshot"] == replacement_snapshot["project_goal"]
    assert repo.commits == 2  # Replacement, reevaluation and target freeze share one commit.
    assert repo.bundle["events"][0] == original_baseline
    assert repo.bundle["evaluations"][0] == original_evaluation
    assert app.projection("u1")["cause"] != "missing_project_goal"

    latest = app.read("u1")["latest_event_id"]
    later = app.execute("u1", command(
        {"project_goal": {"id": "p2", "nombre": "Proyecto posterior"}},
        latest, "2026-04-01T00:00:00Z",
    ))
    correction = {
        "event_id": str(uuid4()), "effective_at": "2026-04-02T00:00:00Z",
        "reason": "Corregir proyecto posterior", "correction_effect": "replace",
        "patch": {"project_goal": {"id": "p3", "nombre": "Proyecto corregido posterior"}},
    }
    app.execute("u1", correction, later["event_id"])

    assert repo.bundle["plan"]["target_project_snapshot"] == replacement_snapshot["project_goal"]


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
    lead_view = client_tracking_view(view)
    assert second["event_id"] not in [row["event_id"] for row in lead_view["audit_line"]]
    assert lead_view["excluded_from_metrics"] == []


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


def test_monthly_update_reuses_the_persisted_market_snapshot():
    repo = MemoryRepository()
    resolutions = []

    def resolver():
        resolutions.append("resolved")
        return market_snapshot()

    app = TrackingService(
        repo, clock=lambda: datetime(2026, 3, 1, tzinfo=timezone.utc),
        market_snapshot_resolver=resolver,
    )
    first = app.execute("u1", command(valid_snapshot()))
    app.execute("u1", command({"ahorro_disponible": 2_000_000}, first["event_id"], "2026-02-01T00:00:00Z"))

    assert resolutions == ["resolved"]
    results = [row["financial_data"]["result"] for row in repo.bundle["evaluations"]]
    assert results[0]["financial_indicators"]["capacidad_supuestos"]["market_snapshot"] == results[1]["financial_indicators"]["capacidad_supuestos"]["market_snapshot"]


def test_score_failure_writes_nothing():
    repo = MemoryRepository()
    def fail(_snapshot):
        raise RuntimeError("scorer unavailable")
    with pytest.raises(RuntimeError):
        TrackingService(repo, scorer=fail, market_snapshot_resolver=market_snapshot).execute("u1", command(valid_snapshot()))
    assert repo.commits == 0


def test_hu18_resolution_uses_confirmed_values_only_in_new_evaluations():
    repo, app = service()
    declared = {
        **valid_snapshot(),
        "complemento_renta": True,
        "ingreso_mensual_complementario": 800_000,
        "deuda_mensual_complementario": 50_000,
        "tipo_contrato_complementario": "plazo_fijo",
        "continuidad_laboral_complementario": "entre_6_y_12_meses",
        "morosidad_complementario": "no",
        "relacion_complementario": "pareja_conviviente",
    }
    repo.co_debtor_consent = {
        "invitation_status": "pending",
        "created_at": "2026-02-20T00:00:00Z",
        "expires_at": "2026-02-27T00:00:00Z",
    }
    first = app.execute("u1", command(declared))
    historical = deepcopy(repo.bundle["evaluations"][0])

    # Confirmation alone does not create or alter an evaluation.
    repo.co_debtor_consent = {
        "invitation_status": "confirmed",
        "co_debtor_confirmed": {
            "ingreso_mensual_complementario": 1_500_000,
            "deuda_mensual_complementario": 300_000,
            "tipo_contrato_complementario": "indefinido",
            "continuidad_laboral_complementario": "mas_3_anios",
            "morosidad_complementario": "no",
        },
    }
    assert repo.bundle["evaluations"] == [historical]

    app.execute("u1", command({"ahorro_disponible": 1_100_000}, first["event_id"], "2026-02-02T00:00:00Z"))
    latest = repo.bundle["evaluations"][-1]["financial_data"]["input"]
    assert latest["ingreso_mensual_complementario"] == 1_500_000
    assert latest["deuda_mensual_complementario"] == 300_000
    assert latest["relacion_complementario"] == "pareja_conviviente"
    assert repo.bundle["evaluations"][0] == historical

    # A later explicit evaluation after revocation is clean; old snapshots stay
    # immutable and still document the values used at their own creation time.
    repo.co_debtor_consent = {"invitation_status": "revoked"}
    latest_event_id = app.read("u1")["latest_event_id"]
    app.execute("u1", command({"ahorro_disponible": 1_200_000}, latest_event_id, "2026-02-03T00:00:00Z"))
    revoked = repo.bundle["evaluations"][-1]["financial_data"]["input"]
    assert revoked["complemento_renta"] is False
    assert revoked["ingreso_mensual_complementario"] is None
    assert revoked["deuda_mensual_complementario"] is None
    assert repo.bundle["evaluations"][0] == historical


def test_goal_regression_preserves_completion_evidence():
    repo, app = service()
    first = app.execute("u1", command(valid_snapshot()))
    app.execute("u1", command({"deuda_mensual": 400000}, first["event_id"], "2026-02-01T00:00:00Z"))
    goal = next(row for row in app.read("u1")["goals"]
                if row["definition"]["source_action_type"] == "reduce_debt")
    assert goal["action_status"] == "pendiente"
    assert goal["evidence"]["ever_completed"]
    assert goal["evidence"]["currently_regressed"]


def test_projection_reuses_one_persisted_snapshot_across_all_milestones(monkeypatch):
    from app.market_data import bcch

    repo = MemoryRepository()
    stable = market_snapshot()
    changed = {**deepcopy(stable), "uf_value_clp": stable["uf_value_clp"] + 1_000}
    external_source = {"snapshot": deepcopy(stable)}
    resolutions = []
    received = []
    mutate_during_projection = {"value": False}

    def resolver():
        resolutions.append(deepcopy(external_source["snapshot"]))
        return deepcopy(external_source["snapshot"])

    monkeypatch.setattr(
        bcch.BCChClient,
        "fetch_snapshot",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("projection must not call BCCh")),
    )
    app = TrackingService(
        repo,
        clock=lambda: datetime(2026, 3, 1, tzinfo=timezone.utc),
        market_snapshot_resolver=resolver,
    )
    first = app.execute("u1", command(valid_snapshot()))
    app.execute("u1", command({"ahorro_disponible": 2_000_000}, first["event_id"], "2026-02-01T00:00:00Z"))

    assert len(resolutions) == 1
    real_score = app._score

    def recording_score(snapshot, market_snapshot):
        received.append(deepcopy(market_snapshot))
        if mutate_during_projection["value"] and len(received) == 1:
            external_source["snapshot"] = deepcopy(changed)
        return real_score(snapshot, market_snapshot)

    app._score = recording_score
    mutate_during_projection["value"] = True
    projection = app.projection("u1", "2026-03-01T00:00:00Z")

    assert projection["milestones"]
    assert len(received) > 1
    assert all(snapshot == stable for snapshot in received)
    assert external_source["snapshot"] == changed
    assert len(resolutions) == 1
