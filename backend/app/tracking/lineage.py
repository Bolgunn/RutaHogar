"""ALG-11: source events are immutable; only the effective view is reconstructed."""

from copy import deepcopy
from datetime import timezone
from math import isfinite

from .contracts import TrackingError, parse_time

ALGORITHM_VERSION = "hu13-lineage-v1"
SEMANTIC_FIELDS = (
    "event_id", "subject_user_id", "event_kind", "effective_at", "reason",
    "patch", "previous", "correction_of", "correction_effect",
)


def canonical_request(event):
    result = {key: deepcopy(event.get(key)) for key in SEMANTIC_FIELDS}
    result["effective_at"] = parse_time(result["effective_at"]).astimezone(timezone.utc).isoformat()
    return result


def validate_patch(patch, field_contract):
    if not isinstance(patch, dict):
        raise TrackingError("invalid_patch")
    for field, value in patch.items():
        if field not in field_contract:
            raise TrackingError("invalid_patch")
        descriptor = field_contract[field]
        if value is None:
            if not descriptor.get("nullable", False):
                raise TrackingError("invalid_patch")
            continue
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if not isfinite(value):
                raise TrackingError("invalid_patch")
            if "min" in descriptor and value < descriptor["min"]:
                raise TrackingError("invalid_patch")
        if "validator" in descriptor and not descriptor["validator"](value):
            raise TrackingError("invalid_patch")


def reconstruct(history, subject_user_id, field_contract):
    events = deepcopy(history)
    by_id = {event["event_id"]: event for event in events}
    if len(by_id) != len(events):
        raise TrackingError("invalid_lineage")
    for event in events:
        if event.get("subject_user_id") != subject_user_id:
            raise TrackingError("owner_mismatch")
        parse_time(event["effective_at"])
        parse_time(event["recorded_at"])
        validate_patch(event["patch"], field_contract)
    visited, visiting = set(), set()

    def visit(event_id):
        if event_id in visiting or event_id not in by_id:
            raise TrackingError("invalid_lineage")
        if event_id in visited:
            return
        visiting.add(event_id)
        event = by_id[event_id]
        for relation in ("previous", "correction_of"):
            if event.get(relation):
                visit(event[relation])
        visiting.remove(event_id)
        visited.add(event_id)

    for event_id in by_id:
        visit(event_id)
    baselines = [event for event in events if event["event_kind"] == "baseline"]
    if events and len(baselines) != 1:
        raise TrackingError("invalid_lineage")
    baseline_id = baselines[0]["event_id"] if baselines else None
    slots = {}
    for event in events:
        root = event
        if event["event_kind"] == "correction":
            if not event.get("correction_of") or event.get("correction_effect") not in {"replace", "annul"}:
                raise TrackingError("invalid_lineage")
            if event["correction_effect"] == "annul" and event["patch"]:
                raise TrackingError("invalid_patch")
            while root.get("correction_of"):
                root = by_id[root["correction_of"]]
            if parse_time(event["effective_at"]) != parse_time(root["effective_at"]):
                raise TrackingError("invalid_lineage")
        elif event.get("correction_of"):
            raise TrackingError("invalid_lineage")
        slots.setdefault(root["event_id"], []).append(event)

    def audit_key(event):
        return parse_time(event["recorded_at"]), event["event_id"]

    def slot_key(event_id):
        event = by_id[event_id]
        return event_id != baseline_id, parse_time(event["effective_at"]), *audit_key(event)

    active, snapshot = [], {}
    for root_id in sorted(slots, key=slot_key):
        corrections = [event for event in slots[root_id] if event["event_kind"] == "correction"]
        winner = max(corrections, key=audit_key) if corrections else by_id[root_id]
        if winner.get("correction_effect") == "annul":
            if root_id == baseline_id:
                raise TrackingError("invalid_lineage")
            continue
        snapshot.update(deepcopy(winner["patch"]))
        for field, descriptor in field_contract.items():
            if descriptor.get("required") and field not in snapshot:
                raise TrackingError("invalid_patch")
        active.append({
            "event_id": winner["event_id"], "root_event_id": root_id,
            "event_kind": winner["event_kind"], "slot_kind": by_id[root_id]["event_kind"],
            "effective_at": by_id[root_id]["effective_at"],
            "snapshot": deepcopy(snapshot), "evaluation_id": winner.get("evaluation_id"),
            "evaluation": deepcopy(winner.get("evaluation")),
            "provenance": deepcopy(winner.get("provenance", {})),
        })
    # An existing tracking plan always has a complete effective state. Logical
    # annulment may remove an intermediate slot, but never the whole active line.
    if events and not active:
        raise TrackingError("invalid_lineage")
    active_ids = {event["event_id"] for event in active}
    audit = sorted(events, key=audit_key)
    excluded = [event["event_id"] for event in audit if event["event_id"] not in active_ids]
    return {
        "baseline_event_id": baseline_id, "active_line": active, "audit_line": audit,
        "excluded_from_metrics": excluded, "annuls": excluded,
        "latest_effective_snapshot": deepcopy(active[-1]["snapshot"]) if active else None,
    }


def append_event(history, event, actor_user_id, subject_user_id, field_contract):
    incoming = deepcopy(event)
    if actor_user_id != subject_user_id or incoming.get("subject_user_id") != subject_user_id:
        return {"outcome": "rejected", "error": "owner_mismatch", "appended_record": None}
    try:
        before = reconstruct(history, subject_user_id, field_contract)
        existing = next((row for row in history if row["event_id"] == incoming["event_id"]), None)
        if existing:
            if canonical_request(existing) != canonical_request(incoming):
                return {**before, "outcome": "idempotency_conflict", "appended_record": None}
            return {**before, "outcome": "idempotent_replay", "appended_record": deepcopy(existing)}
        if not incoming.get("reason", "").strip():
            raise TrackingError("invalid_lineage")
        if incoming["event_kind"] in {"data_update", "evaluation"}:
            last_id = before["active_line"][-1]["event_id"] if before["active_line"] else None
            if incoming.get("previous") != last_id:
                raise TrackingError("invalid_lineage")
        elif incoming["event_kind"] not in {"baseline", "correction"}:
            raise TrackingError("invalid_lineage")
        result = reconstruct([*history, incoming], subject_user_id, field_contract)
        effective = next((row for row in result["active_line"] if row["event_id"] == incoming["event_id"]), None)
        complete = effective["snapshot"] if effective else result["latest_effective_snapshot"]
        incoming["recorded_complete_snapshot"] = deepcopy(complete or {})
        incoming["algorithm_version"] = ALGORITHM_VERSION
        result = reconstruct([*history, incoming], subject_user_id, field_contract)
        return {
            **result, "outcome": "appended", "error": None,
            "new_complete_snapshot": deepcopy(complete), "appended_record": incoming,
        }
    except TrackingError as error:
        return {"outcome": "rejected", "error": error.code, "appended_record": None}
