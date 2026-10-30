"""No OCR/scoring I/O. A single RPC commits decisions, HU13 facts and deletion duty."""
from datetime import datetime, timezone
from uuid import uuid4

from .config import REVIEW_LIFETIME, public_limits
from .contracts import ConfirmProcess, DocumentError, StructuredResult
from .domain import compare, current_backing
from .identity import compare_identity
from .tracking_adapter import current_declaration, prepare_update

PUBLIC_PROCESS_FIELDS = {"id", "document_type", "state", "revision", "created_at", "expires_at",
                         "processing_at", "review_at", "closed_at", "parser_version", "normalizer_version",
                         "contract_version", "failure_code", "deletion_state", "deletion_at", "tracking_event_id"}


def public_view(bundle):
    process = bundle["process"]
    return {**{k: v for k, v in process.items() if k in PUBLIC_PROCESS_FIELDS},
            "restrictions": public_limits(),
            "candidates": [{k: c.get(k) for k in ("field", "detection", "detected_value", "declared_value", "comparison", "page")}
                           for c in bundle.get("candidates", [])],
            "evidence": [{k: e.get(k) for k in ("field", "comparison", "decision", "backing_at_confirmation", "confirmed_at", "source_event_id", "tracking_event_id")}
                         for e in bundle.get("evidence", [])]}


class DocumentService:
    def __init__(self, repository, clock=None, new_id=None):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.new_id = new_id or (lambda: str(uuid4()))

    def _view(self, user, bundle):
        view = public_view(bundle)
        if view["evidence"]:
            tracking = self.repository.load_tracking(user)
            current = current_declaration(tracking, user)
            sources = {}
            for row in view["evidence"]:
                source_id = row["source_event_id"]
                if source_id not in sources:
                    sources[source_id] = current_declaration(tracking, user, through_revision=source_id)
                original = sources[source_id].get(row["field"])
                row["current_backing"] = (current_backing(
                    row["backing_at_confirmation"], current.get(row["field"]), original,
                ).value if original is not None else "sin_respaldo")
        return view

    def create(self, user, command):
        return self._view(user, self.repository.create(user, str(command.request_id), command.document_type.value,
                                                 (self.clock() + REVIEW_LIFETIME).isoformat()))

    def read(self, user, process_id):
        return self._view(user, self.repository.read(user, process_id))

    def mark_ready(self, user, process_id, revision):
        """Internal: a later upload integration must verify Storage before calling."""
        return self.repository.lifecycle(user, process_id, revision, "ready")

    def start_processing(self, user, process_id, revision):
        return self.repository.lifecycle(user, process_id, revision, "start")

    def record_result(self, user, process_id, revision, result: StructuredResult, *, parse_token=None):
        """Internal typed parser port; callers never submit OCR/candidate values via HTTP."""
        result = StructuredResult.model_validate(result)
        bundle = self.repository.read(user, process_id)
        process = bundle["process"]
        if process["document_type"] != result.document_type.value:
            raise DocumentError("invalid_result")
        if result.identity:
            evidence = result.identity.model_dump(exclude_none=True) if hasattr(result.identity, 'model_dump') else result.identity
            if compare_identity(self.repository.load_identity(user), evidence) == 'inconsistent':
                return self.repository.reject_identity(user, process_id, revision, parse_token)
        tracking = self.repository.load_tracking(user)
        if process["base_revision"] != tracking["revision"]:
            raise DocumentError("lineage_conflict")
        declared = current_declaration(tracking, user)
        payload = result.model_dump(mode="json", exclude={"identity"})
        if parse_token is not None:
            payload["parse_token"] = parse_token
        for row, candidate in zip(payload["candidates"], result.candidates):
            row.update(declared_value=declared.get(candidate.field), comparison=compare(declared.get(candidate.field), candidate).value)
        return self.repository.lifecycle(user, process_id, revision, "result", payload)

    def confirm(self, user, process_id, command: ConfirmProcess):
        request = command.model_dump(mode="json")
        request["decisions"].sort(key=lambda d: d["field"])
        bundle = self.repository.read(user, process_id)
        process = bundle["process"]
        if process["state"] == "confirmed":
            return self._view(user, self.repository.confirm(user, process_id, request, None))
        if process["state"] != "awaiting_review":
            raise DocumentError("invalid_transition")
        if datetime.fromisoformat(process["expires_at"].replace("Z", "+00:00")) <= self.clock():
            raise DocumentError("expired")
        candidates = {c["field"]: c for c in bundle["candidates"]
                      if c["detection"] == "detected" and c["comparison"] in {"match", "difference"}}
        if set(candidates) != {d.field for d in command.decisions}:
            raise DocumentError("invalid_decision")
        patch = {}
        for decision in command.decisions:
            row = candidates[decision.field]
            if decision.decision == "accept_detected":
                if row["detection"] != "detected" or row["comparison"] == "insufficient":
                    raise DocumentError("invalid_decision")
                if row["comparison"] == "difference":
                    patch[decision.field] = row["detected_value"]
        tracking = self.repository.load_tracking(user)
        if process["base_revision"] != tracking["revision"]:
            raise DocumentError("lineage_conflict")
        update = prepare_update(tracking, user, process_id, self.new_id(), patch, self.clock().isoformat())
        return self._view(user, self.repository.confirm(user, process_id, request, update))

    def cancel(self, user, process_id, command):
        return self._view(user, self.repository.lifecycle(user, process_id, command.expected_revision, "cancel"))

    def fail(self, user, process_id, revision, code):
        return self.repository.lifecycle(user, process_id, revision, "fail", {"failure_code": code})

    def expire(self, user, process_id, revision):
        return self.repository.lifecycle(user, process_id, revision, "expire")

    def mark_deletion(self, user, process_id, revision, state):
        """Internal acknowledgement contract only; T1 never claims to delete a real object."""
        return self.repository.lifecycle(user, process_id, revision, "cleanup", {"deletion_state": state})
