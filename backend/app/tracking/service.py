"""Application orchestration. One command is committed in one database transaction."""

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from math import isfinite
from uuid import uuid4

from .contracts import TrackingError, parse_time
from .goal_contract import freeze_goals
from .goal_progress import calculate_goal_progress
from .lineage import append_event, reconstruct
from .scoring_adapter import (
    complete_snapshot, financial_field_contract, market_snapshot_from_result,
    provenance, resolve_tracking_market_snapshot, score_snapshot,
)
from ..scoring_engine.co_debtor_inputs import assemble_co_debtor_scoring_input

CO_DEBTOR_CONFIRMATION_REASON = "confirmacion_codeudor"


def canonical_command(command):
    canonical = deepcopy(command)
    canonical["effective_at"] = parse_time(canonical["effective_at"]).astimezone(timezone.utc).isoformat()
    return canonical


def valid_project_snapshot(snapshot):
    project_goal = (snapshot or {}).get("project_goal")
    return deepcopy(project_goal) if isinstance(project_goal, dict) and project_goal else None


def frozen_target_scoring_snapshot(snapshot, target_project):
    """Overlay the frozen catalogue price without rewriting financial history.

    Tracking saves the user-entered snapshot verbatim.  When a plan has a
    catalogue target, though, its `precio_min_uf` is the canonical property
    value for compatibility and pie calculations.  Historic input can contain
    a previous/manual property value, which must not silently replace that
    frozen target during later data updates or ALG-13 projections.
    """
    state = deepcopy(snapshot or {})
    target = deepcopy(target_project) if isinstance(target_project, dict) else None
    try:
        price_uf = float((target or {}).get("precio_min_uf") or (target or {}).get("valor_uf") or 0)
    except (TypeError, ValueError):
        price_uf = 0
    if not isfinite(price_uf) or price_uf <= 0:
        return state
    state.update({
        "property_value": price_uf,
        "property_value_unit": "uf",
        "property_value_uf": price_uf,
        # The resolver gives CLP priority, so this historical value must be
        # explicitly cleared before the target UF value is evaluated.
        "property_value_clp": None,
        "property_value_source": "project_selection",
        "project_goal": target,
    })
    if target.get("comuna"):
        state["comuna_objetivo"] = target["comuna"]
    return state


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


def client_tracking_view(view):
    """Build the lead-safe history without collapsing replacement provenance.

    The complete lineage is retained in ``view`` for repository, service and
    staff audit use.  A replacement leaves its prior source visible to the
    lead as an audit-only version; an annulment hides its whole logical slot.
    That keeps charts on effective records while making the correction UI's
    promise about retaining a previous version true.
    """
    output = deepcopy(view)
    audit_line = view.get("audit_line", [])
    by_id = {row.get("event_id"): row for row in audit_line if row.get("event_id")}

    def root_event_id(row):
        current = row
        seen = set()
        while current and current.get("correction_of") and current["event_id"] not in seen:
            seen.add(current["event_id"])
            current = by_id.get(current["correction_of"])
        return (current or row).get("event_id")

    active_by_id = {row["event_id"]: row for row in view.get("active_line", [])}
    active_roots = {
        row.get("root_event_id") or row["event_id"]
        for row in view.get("active_line", [])
    }
    # A source slot absent from the reconstructed active line is annulled.
    # A replaced slot is still active under its correction event ID and must
    # retain every prior version in the lead's visible audit timeline.
    visible_audit = []
    for row in audit_line:
        root_id = root_event_id(row)
        if root_id not in active_roots:
            continue
        active = active_by_id.get(row.get("event_id"))
        visible_audit.append({
            **deepcopy(row),
            "root_event_id": active.get("root_event_id") if active else root_id,
        })
    output["audit_line"] = visible_audit
    # These are only visible audit-only rows: the client uses them to label a
    # replacement as "Versión anterior" and must never receive annulled IDs.
    output["excluded_from_metrics"] = [
        row["event_id"] for row in visible_audit if row["event_id"] not in active_by_id
    ]
    return output


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
    def __init__(self, repository, clock=None, new_id=None, scorer=score_snapshot, market_snapshot_resolver=resolve_tracking_market_snapshot):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.new_id = new_id or (lambda: str(uuid4()))
        self.scorer = scorer
        self.market_snapshot_resolver = market_snapshot_resolver

    def _stored_market_snapshot(self, active_line):
        for row in reversed(active_line or []):
            if snapshot := market_snapshot_from_result(row.get("evaluation")):
                return snapshot
        return None

    def _score(self, snapshot, market_snapshot):
        complete = complete_snapshot(snapshot)
        if self.scorer is score_snapshot:
            return self.scorer(complete, market_snapshot=market_snapshot)
        return self.scorer(complete)

    def _co_debtor_consent(self, user_id):
        """Keep legacy/in-memory repositories usable while HU18 is optional."""
        loader = getattr(self.repository, "load_co_debtor_consent", None)
        return loader(user_id) if callable(loader) else None

    @staticmethod
    def _confirmation_id(consent_facts):
        confirmation = (consent_facts or {}).get("co_debtor_confirmed")
        confirmation_id = confirmation.get("id") if isinstance(confirmation, dict) else None
        return str(confirmation_id) if confirmation_id else None

    @staticmethod
    def _confirmation_was_applied(bundle, confirmation_id):
        return any(
            event.get("reason") == CO_DEBTOR_CONFIRMATION_REASON
            and (event.get("provenance") or {}).get("co_debtor_confirmation_id") == confirmation_id
            for event in bundle.get("events", [])
        )

    def _co_debtor_update_state(self, bundle, user_id):
        """Expose the current confirmation's one-time score-update state only."""
        consent_facts = self._co_debtor_consent(user_id)
        confirmation_id = self._confirmation_id(consent_facts)
        required = bool(
            (consent_facts or {}).get("invitation_status") == "confirmed"
            and confirmation_id
            and not self._confirmation_was_applied(bundle, confirmation_id)
        )
        return {"score_update_required": required}

    def update_score_with_confirmed_co_debtor(self, user_id):
        """Append an explicit HU18 re-evaluation for the authenticated lead."""
        bundle = self.repository.load(user_id)
        history = source_events(bundle)
        lineage = reconstruct(history, user_id, financial_field_contract())
        if not lineage["active_line"]:
            raise TrackingError("not_found")
        consent_facts = self._co_debtor_consent(user_id)
        if (consent_facts or {}).get("invitation_status") == "revoked":
            raise TrackingError("co_debtor_consent_revoked")
        confirmation_id = self._confirmation_id(consent_facts)
        if (consent_facts or {}).get("invitation_status") != "confirmed" or not confirmation_id:
            raise TrackingError("co_debtor_confirmation_required")
        if self._confirmation_was_applied(bundle, confirmation_id):
            raise TrackingError("co_debtor_confirmation_already_applied")
        now = self.clock().isoformat()
        try:
            return self.execute(
                user_id,
                {
                    "event_id": self.new_id(),
                    "event_kind": "evaluation",
                    "effective_at": now,
                    "reason": CO_DEBTOR_CONFIRMATION_REASON,
                    "previous_event_id": lineage["active_line"][-1]["event_id"],
                    "patch": {},
                },
                require_co_debtor_confirmation=True,
                co_debtor_confirmation_id=confirmation_id,
            )
        except TrackingError as error:
            # A simultaneous request can lose the normal HU13 revision race.
            # Re-read only to report the domain outcome when the winner consumed
            # this exact confirmation; no retry can create a second evaluation.
            if error.code == "lineage_conflict" and self._confirmation_was_applied(
                self.repository.load(user_id), confirmation_id
            ):
                raise TrackingError("co_debtor_confirmation_already_applied") from None
            raise

    def read(self, user_id, as_of=None):
        cutoff = parse_time(as_of or self.clock())
        bundle = self.repository.load(user_id)
        co_debtor = self._co_debtor_update_state(bundle, user_id)
        if not bundle["plan"]:
            return {
                "status": "not_started", "baseline": None, "goals": [], "active_line": [], "audit_line": [],
                "co_debtor": co_debtor,
            }
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
            "co_debtor": co_debtor,
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
        market_snapshot = self._stored_market_snapshot(view.get("active_line")) or self.market_snapshot_resolver()
        baseline = view.get("baseline") or {}
        target = baseline.get("target_project_snapshot")
        # Older frozen targets may not contain a catalogue price. Keep their
        # historical source as a compatibility fallback, but whenever the
        # target does contain `precio_min_uf`, it is the single price source.
        target_source = next((
            row for row in view["audit_line"]
            if row.get("recorded_complete_snapshot", {}).get("project_goal") == target
        ), None)
        target_with_price = frozen_target_scoring_snapshot(latest, target)
        if target_with_price != latest:
            latest = target_with_price
        elif target_source:
            original = target_source["recorded_complete_snapshot"]
            for field in ("property_value", "property_value_unit", "property_value_clp", "property_value_uf",
                          "property_value_source", "comuna_objetivo"):
                if field in original:
                    latest[field] = deepcopy(original[field])
        cache = {}
        def runner(state, at):
            key = at.isoformat()
            if key not in cache:
                try:
                    cache[key] = self._score(state, market_snapshot)
                except TrackingError:
                    cache[key] = None
            return cache[key]
        current = runner(latest, cutoff)
        details = provenance(current) if current else {}
        return project_progress(
            subject_user_id=user_id, as_of=cutoff, active_line=view["active_line"],
            variables=variables,
            latest_effective_snapshot=latest, target_project=target,
            scoring_runner=runner, rule_boundary_provider=RuleBoundaryProvider(market_snapshot),
            excluded_observation_ids=view.get("excluded_from_metrics", []),
            projection_provenance={**details, "projection_scoring_version": details.get("scoring_version")},
        )

    def execute(self, user_id, command, target_event_id=None, *, require_co_debtor_confirmation=False,
                co_debtor_confirmation_id=None):
        command = canonical_command(command)
        if target_event_id:
            command["target_event_id"] = target_event_id
        bundle = self.repository.load(user_id)
        if co_debtor_confirmation_id and self._confirmation_was_applied(bundle, co_debtor_confirmation_id):
            raise TrackingError("co_debtor_confirmation_already_applied")
        prior = next((row for row in bundle["events"] if row["event_id"] == command["event_id"]), None)
        if prior:
            if prior["canonical_request"] != command:
                raise TrackingError("idempotency_conflict")
            return deepcopy(prior["command_result"])
        history = source_events(bundle)
        before = reconstruct(history, user_id, financial_field_contract())
        recorded_at = self.clock()
        now = recorded_at.isoformat()
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
        market_snapshot = self._stored_market_snapshot(before.get("active_line")) or self.market_snapshot_resolver()
        consent_facts = None
        consent_loaded = False

        def evaluate(source_event, snapshot):
            nonlocal consent_facts, consent_loaded
            if (snapshot.get("complemento_renta") or require_co_debtor_confirmation) and not consent_loaded:
                consent_facts = self._co_debtor_consent(user_id)
                consent_loaded = True
            resolved_input, consent_provenance = assemble_co_debtor_scoring_input(
                snapshot,
                co_debtor_consent=consent_facts,
                now=recorded_at,
            )
            if require_co_debtor_confirmation:
                if self._confirmation_id(consent_facts) != co_debtor_confirmation_id:
                    raise TrackingError("co_debtor_confirmation_required")
                complement_source = consent_provenance["complement_source"]
                if complement_source == "excluded_after_revocation":
                    raise TrackingError("co_debtor_consent_revoked")
                if complement_source != "co_debtor_confirmed":
                    raise TrackingError("co_debtor_confirmation_required")
            complete_input = complete_snapshot(resolved_input)
            # A plan evaluates every later financial update against its frozen
            # target. Keep complete_input as the immutable recorded fact, but
            # clear any legacy property amount before scoring the catalogue UF
            # price of that target.
            frozen_target = (bundle.get("plan") or {}).get("target_project_snapshot") or valid_project_snapshot(complete_input)
            scoring_input = frozen_target_scoring_snapshot(complete_input, frozen_target)
            result = self._score(scoring_input, market_snapshot)
            details = {
                **provenance(result),
                "source_event_ids": [source_event["event_id"]],
                "cutoff_at": now,
                "co_debtor_consent": consent_provenance,
            }
            if co_debtor_confirmation_id:
                details["co_debtor_confirmation_id"] = co_debtor_confirmation_id
            evaluation = {
                "id": self.new_id(), "snapshot": deepcopy(complete_input),
                "result": result, "provenance": details,
            }
            source_event.update(
                evaluation_id=evaluation["id"], evaluation=result, provenance=details
            )
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
                "target_project_snapshot": valid_project_snapshot(event["recorded_complete_snapshot"]),
                "provenance": evaluation["provenance"],
            }
        target_project_snapshot = None
        if history and not bundle["plan"].get("target_project_snapshot"):
            target_project_snapshot = next((
                project for row in outcome["active_line"]
                if (project := valid_project_snapshot(row["snapshot"])) is not None
            ), None)
        result = {
            "event_id": command["event_id"], "evaluation_ids": [row["id"] for row in evaluations],
            "evaluation": evaluations[-1] if evaluations else None,
            "baseline_id": plan["id"] if plan else bundle["plan"]["id"],
        }
        return self.repository.commit(user_id, command, bundle.get("revision"), {
            "plan": plan, "target_project_snapshot": target_project_snapshot,
            "events": events, "evaluations": evaluations, "goals": goals, "result": result,
        })
