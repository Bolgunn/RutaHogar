"""Application orchestration. One command is committed in one database transaction."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from .contracts import TrackingError, parse_time
from .goal_contract import freeze_goals
from .goal_progress import calculate_goal_progress
from .lineage import append_event, reconstruct
from .scoring_adapter import complete_snapshot, financial_field_contract, provenance, score_snapshot


def canonical_command(command):
    canonical = deepcopy(command)
    canonical["effective_at"] = parse_time(canonical["effective_at"]).astimezone(timezone.utc).isoformat()
    return canonical


def source_events(bundle):
    evaluations = {row["id"]: row for row in bundle["evaluations"]}
    return [
        {
            **row, "subject_user_id": row["user_id"],
            "previous": row.get("previous_event_id"),
            "correction_of": row.get("correction_of_event_id"),
            "evaluation": evaluations.get(row.get("evaluation_id"), {}).get("financial_data", {}).get("result"),
        }
        for row in bundle["events"]
    ]


def goal_view(bundle, lineage, as_of):
    views = []
    for definition in bundle["goals"]:
        goal = definition["progress_data"]
        confirmations = [
            row for row in bundle["goal_events"]
            if row["goal_id"] == goal["id"] and parse_time(row["effective_at"]) <= parse_time(as_of)
        ]
        confirmations.sort(key=lambda row: (parse_time(row["effective_at"]), parse_time(row["recorded_at"]), row["event_id"]))
        evidence = []
        # Replay real observations, not newly scored copies of historic evaluations.
        points = [
            (row["effective_at"], row["event_id"], row["snapshot"])
            for row in lineage["active_line"] if parse_time(row["effective_at"]) <= parse_time(as_of)
        ]
        for at, event_id, snapshot in points:
            manual = next((row for row in reversed(confirmations) if parse_time(row["effective_at"]) <= parse_time(at)), None)
            progress = calculate_goal_progress(
                goal, bundle["plan"]["baseline_at"], at, snapshot.get(goal["source"]),
                goal.get("target_at"), evidence, manual,
            )
            evidence.append({"event_id": event_id, "action_status": progress["action_status"]})
        # Manual confirmations are historical evidence even between financial updates.
        evidence.extend({"event_id": row["event_id"], "action_status": "cumplida" if row["confirmed"] else "pendiente"}
                        for row in confirmations)
        snapshot = points[-1][2] if points else {}
        views.append({
            "definition": goal,
            **calculate_goal_progress(
                goal, bundle["plan"]["baseline_at"], as_of, snapshot.get(goal["source"]),
                goal.get("target_at"), evidence, confirmations[-1] if confirmations else None,
            ),
        })
    return views


class TrackingService:
    def __init__(self, repository, clock=None, new_id=None, scorer=score_snapshot):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.new_id = new_id or (lambda: str(uuid4()))
        self.scorer = scorer

    def read(self, user_id, as_of=None):
        cutoff = parse_time(as_of or self.clock())
        bundle = self.repository.load(user_id)
        if not bundle["plan"]:
            return {"status": "not_started", "baseline": None, "goals": [], "active_line": [], "audit_line": []}
        # Cutoff is effective time; recorded audit remains complete and immutable.
        lineage = reconstruct(source_events(bundle), user_id, financial_field_contract())
        active = [row for row in lineage["active_line"] if parse_time(row["effective_at"]) <= cutoff]
        line_at_cutoff = {**lineage, "active_line": active,
                          "latest_effective_snapshot": active[-1]["snapshot"] if active else None}
        latest_evaluation = next((row for row in reversed(active) if row.get("evaluation")), None)
        updates = [row for row in active if row["slot_kind"] in {"baseline", "data_update"}]
        last_update = updates[-1]["effective_at"] if updates else None
        return {
            "status": "active", "baseline": bundle["plan"], "cutoff_at": cutoff.isoformat(),
            **line_at_cutoff, "latest_event_id": active[-1]["event_id"] if active else None,
            "current_evaluation": latest_evaluation["evaluation"] if latest_evaluation else None,
            "current_evaluation_id": latest_evaluation["evaluation_id"] if latest_evaluation else None,
            "goals": goal_view(bundle, line_at_cutoff, cutoff),
            "last_active_update_at": last_update,
            "update_due": bool(last_update and cutoff - parse_time(last_update) >= timedelta(days=30)),
        }

    def _append(self, history, event, user_id):
        result = append_event(history, event, user_id, user_id, financial_field_contract())
        if result["outcome"] != "appended":
            raise TrackingError(result.get("error") or result["outcome"])
        # Replay is validated before any scoring or persistence.
        if history and (not result["active_line"] or result["latest_effective_snapshot"] is None):
            raise TrackingError("invalid_lineage")
        for row in result["active_line"]:
            complete_snapshot(row["snapshot"])
        return result

    def projection(self, user_id, as_of=None):
        from ..scoring_engine.rule_boundaries import RuleBoundaryProvider
        from .projection import project_progress

        view = self.read(user_id, as_of)
        cutoff = parse_time(as_of or view.get("cutoff_at") or self.clock())
        variables = {
            "ahorro_disponible": {"direction": "increase", "min": 0},
            "deuda_mensual": {"direction": "reduce", "min": 0},
            "ingreso_mensual": {"direction": "increase", "min": 0},
        }
        if view["status"] == "not_started":
            # Keep the projection endpoint total before the first HU13
            # baseline. ALG-13 will return its canonical missing-target cause
            # without invoking any financial engine or creating state.
            return project_progress(
                subject_user_id=user_id, as_of=cutoff, active_line=[], variables=variables,
                latest_effective_snapshot={}, target_project=None,
                scoring_runner=lambda _state, _at: None,
                rule_boundary_provider=RuleBoundaryProvider(),
            )
        latest = deepcopy(view.get("latest_effective_snapshot") or {})
        baseline = view.get("baseline") or {}
        target = baseline.get("target_project_snapshot")
        # Project identity and value are frozen; financial and market context stays at cutoff.
        root = next((row for row in view["audit_line"] if row["event_id"] == baseline.get("root_event_id")), None)
        if root:
            original = root["recorded_complete_snapshot"]
            for field in ("property_value", "property_value_unit", "property_value_clp", "property_value_uf",
                          "property_value_source", "comuna_objetivo"):
                if field in original:
                    latest[field] = deepcopy(original[field])
        cache = {}
        def runner(state, at):
            key = at.isoformat()
            if key not in cache:
                try:
                    cache[key] = self.scorer(complete_snapshot(state))
                except TrackingError:
                    cache[key] = None
            return cache[key]
        current = runner(latest, cutoff)
        details = provenance(current) if current else {}
        return project_progress(
            subject_user_id=user_id, as_of=cutoff, active_line=view["active_line"],
            variables=variables,
            latest_effective_snapshot=latest, target_project=target,
            scoring_runner=runner, rule_boundary_provider=RuleBoundaryProvider(),
            excluded_observation_ids=view.get("excluded_from_metrics", []),
            projection_provenance={**details, "projection_scoring_version": details.get("scoring_version")},
        )

    def execute(self, user_id, command, target_event_id=None):
        command = canonical_command(command)
        if target_event_id:
            command["target_event_id"] = target_event_id
        bundle = self.repository.load(user_id)
        prior = next((row for row in bundle["events"] if row["event_id"] == command["event_id"]), None)
        if prior:
            if prior["canonical_request"] != command:
                raise TrackingError("idempotency_conflict")
            return deepcopy(prior["command_result"])
        history = source_events(bundle)
        before = reconstruct(history, user_id, financial_field_contract())
        now = self.clock().isoformat()
        latest_id = before["active_line"][-1]["event_id"] if before["active_line"] else None
        event = {
            "event_id": command["event_id"], "subject_user_id": user_id,
            "event_kind": command.get("event_kind", "correction"),
            "effective_at": command["effective_at"], "recorded_at": now, "reason": command["reason"],
            "patch": deepcopy(command.get("patch", {})),
            "previous": command.get("previous_event_id"), "provenance": {},
        }
        if target_event_id:
            target = next((row for row in history if row["event_id"] == target_event_id), None)
            if not target:
                raise TrackingError("not_found")
            event.update(
                effective_at=target["effective_at"], previous=latest_id,
                correction_of=target_event_id, correction_effect=command["correction_effect"],
            )
        elif not history:
            if event["previous"] is not None:
                raise TrackingError("lineage_conflict")
            event["event_kind"] = "baseline"
            event["patch"] = complete_snapshot(event["patch"])
        elif event["previous"] != latest_id:
            raise TrackingError("lineage_conflict")
        outcome = self._append(history, event, user_id)
        event = outcome["appended_record"]
        events, evaluations, goals, plan = [event], [], [], None

        def evaluate(source, snapshot):
            result = self.scorer(complete_snapshot(snapshot))
            details = {**provenance(result), "source_event_ids": [source["event_id"]], "cutoff_at": now}
            evaluation = {"id": self.new_id(), "snapshot": deepcopy(snapshot), "result": result, "provenance": details}
            source.update(evaluation_id=evaluation["id"], evaluation=result, provenance=details)
            evaluations.append(evaluation)
            return evaluation

        if not target_event_id:
            evaluation = evaluate(event, outcome["new_complete_snapshot"])
        elif outcome["latest_effective_snapshot"] != before["latest_effective_snapshot"]:
            followup = {
                "event_id": self.new_id(), "subject_user_id": user_id, "event_kind": "evaluation",
                "effective_at": now, "recorded_at": now, "reason": command["reason"],
                "patch": {}, "previous": outcome["active_line"][-1]["event_id"], "provenance": {},
            }
            followup = self._append([*history, event], followup, user_id)["appended_record"]
            evaluate(followup, outcome["latest_effective_snapshot"])
            events.append(followup)
        if not history:
            raw = evaluation["result"]
            actions = raw["structured_improvement_plan"]
            goals = freeze_goals(actions, event["effective_at"], [self.new_id() for _ in actions])
            plan = {
                "id": self.new_id(), "baseline_evaluation_id": evaluation["id"],
                "root_event_id": event["event_id"], "baseline_at": event["effective_at"],
                "original_plan_snapshot": {
                    "structured_improvement_plan": raw["structured_improvement_plan"],
                    "improvement_plan": raw.get("improvement_plan", []),
                },
                "target_project_snapshot": deepcopy(event["recorded_complete_snapshot"].get("project_goal")),
                "provenance": evaluation["provenance"],
            }
        result = {
            "event_id": command["event_id"], "evaluation_ids": [row["id"] for row in evaluations],
            "evaluation": evaluations[-1] if evaluations else None,
            "baseline_id": plan["id"] if plan else bundle["plan"]["id"],
        }
        return self.repository.commit(user_id, command, bundle.get("revision"), {
            "plan": plan, "events": events, "evaluations": evaluations, "goals": goals, "result": result,
        })
