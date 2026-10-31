"""Authenticated owner projections replacing direct snapshot-table reads."""

from copy import deepcopy
from datetime import datetime, timezone

from .co_debtor import historical_visibility, select_confirmation
from .co_debtor_access import can_show_snapshot, project_row, redact_snapshot
from .co_debtor_projection import project_evaluation


class OwnerReadService:
    def __init__(self, repository, user_id, now=None):
        self.repository, self.user_id = repository, user_id
        self.now = now or datetime.now(timezone.utc)
        self.invitations = [item for item in repository.co_debtor_rows([user_id]) if item.get("lead_id", user_id) == user_id]

    def evaluations(self):
        rows = [row for row in self.repository.owner_evaluations(self.user_id) if row.get("user_id", self.user_id) == self.user_id]
        latest = max(rows, key=lambda r: (str(r.get("created_at") or ""), str(r.get("id") or "")), default={}).get("financial_data")
        annotations = self.repository.owner_annotations(self.user_id)
        items = []
        for row in rows:
            output = project_row(row, self.invitations, self.now, owner=True)
            allowed = can_show_snapshot(row.get("financial_data"), self.invitations, self.now, owner=True)
            output["co_debtor"] = project_evaluation(row.get("financial_data") or {}, self.invitations, self.now, owner=True, current_snapshot=latest)
            output["annotations"] = [event for event in annotations
                                     if event.get("evaluation_id") == row["id"] and allowed]
            items.append(output)
        return {"items": items}

    def history(self):
        annotations = self.repository.owner_annotations(self.user_id)
        items = []
        history = [row for row in self.repository.staff_history(self.user_id) if row.get("user_id", self.user_id) == self.user_id]
        latest = max(history, key=lambda r: (str(r.get("created_at") or ""), str(r.get("id") or "")), default={}).get("snapshot")
        for row in history:
            if row.get("user_id", self.user_id) != self.user_id:
                continue
            output = project_row(row, self.invitations, self.now, owner=True)
            if can_show_snapshot(row.get("snapshot"), self.invitations, self.now, owner=True):
                events = list(row.get("events") or [])
                events.extend({**(event.get("payload") or {}), "at": event.get("effective_at"),
                               "event_id": event.get("event_id")}
                              for event in annotations if event.get("kind") == "milestone"
                              and event.get("evaluation_id") == row.get("evaluation_id"))
                output["events"] = sorted(events, key=lambda event: (str(event.get("at") or ""),
                                                                    str(event.get("event_id") or "")))
            output["co_debtor"] = project_evaluation(row.get("snapshot") or {}, self.invitations, self.now, owner=True, current_snapshot=latest)
            items.append(output)
        return {"items": items}

    def invitations_view(self):
        for original in self.invitations:
            visible = historical_visibility(original, self.now)["visible"]
            allowed = {"id", "lead_id", "status", "created_at", "expires_at"}
            if visible:
                allowed.update({"recipient_email", "recipient_rut", "ingreso_mensual_complementario",
                                "deuda_mensual_complementario", "tipo_contrato_complementario",
                                "continuidad_laboral_complementario", "morosidad_complementario"})
            row = {key: deepcopy(value) for key, value in original.items() if key in allowed}
            confirmation = select_confirmation(original.get("co_debtor_confirmations")) if visible else None
            # Keep the browser's HU18 singleton shape, without account/audit payloads.
            row["co_debtor_confirmations"] = [{key: deepcopy(value) for key, value in confirmation.items()
                if key in {"id", "revision_number", "confirmed_at", "ingreso_mensual_complementario", "deuda_mensual_complementario",
                           "tipo_contrato_complementario", "continuidad_laboral_complementario", "morosidad_complementario"}}] if confirmation else []
            row["visibility"] = "visible" if visible else "hidden"
            # This is the owner's current declaration, not a historical financial
            # snapshot. A replacement must carry it without unredacting that snapshot.
            relations = [event for event in original.get("co_debtor_consent_events", [])
                         if type(event.get("relation_revision")) is int and event["relation_revision"] > 0]
            if visible and relations:
                row["declared_relation"] = max(relations, key=lambda event: event["relation_revision"]).get("relation_value")
            yield row

    def tracking_view(self, value):
        snapshots = {row["id"]: row.get("financial_data") or {}
                     for row in self.repository.owner_evaluations(self.user_id) if row.get("user_id", self.user_id) == self.user_id}

        if isinstance(value, dict) and "variables" in value and "milestones" in value:
            if any(not can_show_snapshot(snapshot, self.invitations, self.now, owner=True)
                   for snapshot in snapshots.values()):
                return {"status": "not_projectable", "cause": "co_debtor_history_hidden",
                        "cutoff_at": value.get("cutoff_at"), "variables": {}, "milestones": [],
                        "target_compatible_at": None}

        baseline_id = ((value.get("baseline") or {}).get("baseline_evaluation_id")
                       if isinstance(value, dict) else None)
        baseline_hidden = baseline_id in snapshots and not can_show_snapshot(
            snapshots[baseline_id], self.invitations, self.now, owner=True)

        def visit(node, hidden=False):
            if isinstance(node, list):
                return [visit(item, hidden) for item in node]
            if not isinstance(node, dict):
                return deepcopy(node)
            evaluation_id = node.get("evaluation_id") or node.get("current_evaluation_id") or node.get("baseline_evaluation_id")
            if evaluation_id in snapshots:
                hidden = not can_show_snapshot(snapshots[evaluation_id], self.invitations, self.now, owner=True)
            if node.get("provenance", {}).get("co_debtor_confirmation_id"):
                hidden = not can_show_snapshot({"provenance": node["provenance"]}, self.invitations, self.now, owner=True)
            if node.get("event_id") and not evaluation_id and any("complementario" in key for key in (node.get("patch") or {})):
                hidden = True
            projected = redact_snapshot(node) if hidden else node
            return {key: ([] if key == "goals" and baseline_hidden else visit(item, hidden))
                    for key, item in projected.items()}

        output = visit(value)
        def enrich(node):
            if isinstance(node, list):
                return [enrich(item) for item in node]
            if not isinstance(node, dict):
                return node
            node = {key: enrich(item) for key, item in node.items()}
            identifier = node.get("evaluation_id") or node.get("current_evaluation_id")
            if identifier in snapshots:
                node["co_debtor"] = project_evaluation(snapshots[identifier], self.invitations, self.now, owner=True,
                    current_snapshot=snapshots.get(value.get("current_evaluation_id")) if isinstance(value, dict) else None)
                node["co_debtor"]["score_update_required"] = node["co_debtor"]["update_required"]
            return node
        return enrich(output)
