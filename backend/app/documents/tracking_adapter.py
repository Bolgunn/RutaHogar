"""HU23-only data command. TrackingService.execute remains untouched."""
from copy import deepcopy

from ..tracking.lineage import append_event, reconstruct
from ..tracking.scoring_adapter import complete_snapshot, financial_field_contract
from ..tracking.service import source_events
from .contracts import DocumentError
from .config import CONTRACT_VERSION


def current_declaration(bundle, user_id, through_revision=None):
    if not bundle.get("plan") or not bundle.get("evaluations"):
        raise DocumentError("tracking_baseline_required")
    if through_revision is not None:
        # A revision can be a correction of an older observation. Reconstruct the
        # full recorded prefix rather than mistaking that observation for current data.
        history = bundle["events"]
        index = next((i for i, row in enumerate(history) if row["event_id"] == through_revision), None)
        if index is None:
            raise DocumentError("invalid_lineage")
        bundle = {**bundle, "events": history[:index + 1]}
    return reconstruct(source_events(bundle), user_id, financial_field_contract())["latest_effective_snapshot"]


def prepare_update(bundle, user_id, process_id, event_id, patch, now):
    state = current_declaration(bundle, user_id)
    if not patch:
        return None
    complete_snapshot({**state, **patch})
    command = {"event_id": event_id, "event_kind": "data_update", "effective_at": now,
               "reason": "hu23_document_confirmation", "previous_event_id": bundle["revision"],
               "patch": deepcopy(patch)}
    event = {"event_id": event_id, "subject_user_id": user_id, "event_kind": "data_update",
             "effective_at": now, "recorded_at": now, "reason": command["reason"],
             "patch": deepcopy(patch), "previous": bundle["revision"], "evaluation_id": None,
             "provenance": {"document_process_id": process_id, "document_contract_version": CONTRACT_VERSION}}
    outcome = append_event(source_events(bundle), event, user_id, user_id, financial_field_contract())
    if outcome["outcome"] != "appended":
        raise DocumentError(outcome.get("error", "invalid_lineage"))
    for row in outcome["active_line"]:
        complete_snapshot(row["snapshot"])
    return {"command": command, "records": {"plan": None, "events": [outcome["appended_record"]],
            "evaluations": [], "goals": [], "result": {"event_id": event_id, "evaluation_ids": [], "evaluation": None}}}
