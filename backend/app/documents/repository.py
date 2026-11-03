"""HU23 uses service-only RPCs. The caller identity is verified through Auth."""
import httpx
from urllib.parse import urlencode

from ..tracking.repository import TrackingRepository
from .contracts import DocumentError

ERRORS = {"not_found", "tracking_baseline_required", "idempotency_conflict", "stale_review",
          "invalid_transition", "already_closed", "expired", "lineage_conflict", "invalid_decision",
          "invalid_update", "invalid_result", "invalid_request", "invalid_upload_request",
          "score_update_disabled", "stale_score_state", "no_score_pending", "document_cleanup_pending", "confirmation_disabled", "parsing_disabled", "ocr_unavailable", "upload_not_authorized", "upload_not_verified", "upload_not_deleted", "upload_format_locked", "upload_already_exists"}


class DocumentRepository:
    def __init__(self, tracking=None):
        self.tracking = tracking or TrackingRepository()

    def authenticate(self, token):
        return self.tracking.authenticate(token)

    def load_identity(self, user_id):
        query = urlencode({'id': f'eq.{user_id}', 'select': 'rut,nombre,apellido_paterno,apellido_materno,full_name'})
        rows = self.tracking.request('GET', f'/rest/v1/profiles?{query}')
        if not isinstance(rows, list) or len(rows) != 1:
            raise DocumentError('persistence_unavailable')
        return rows[0]

    def reject_identity(self, user_id, process_id, revision, token):
        return self.rpc('hu23_reject_identity', {'p_user': user_id, 'p_process': process_id,
                        'p_revision': revision, 'p_parse_token': token})

    def load_tracking(self, user_id):
        return self.tracking.load(user_id)

    def rpc(self, name, payload, *, timeout=None):
        transport = self.tracking
        headers = {"apikey": transport.key}
        if not transport.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {transport.key}"
        try:
            # Use the existing transport/client pool, with a HU23-specific error allowlist.
            from ..tracking.repository import _shared_client
            client = transport.client or _shared_client(transport.url)
            options = {} if timeout is None else {"timeout": timeout}
            response = client.request("POST", f"/rest/v1/rpc/{name}", headers=headers, json=payload, **options)
        except httpx.HTTPError:
            raise DocumentError("persistence_unavailable") from None
        if response.is_error:
            try:
                code = response.json().get("message")
            except ValueError:
                code = None
            raise DocumentError(code if code in ERRORS else "persistence_unavailable")
        return response.json()

    def create(self, user, process_id, document_type, expires_at):
        return self.rpc("hu23_create", {"p_user": user, "p_process": process_id,
                                      "p_type": document_type, "p_expires_at": expires_at})

    def read(self, user, process_id):
        return self.rpc("hu23_read", {"p_user": user, "p_process": process_id})

    def lifecycle(self, user, process_id, revision, action, payload=None):
        return self.rpc("hu23_lifecycle", {"p_user": user, "p_process": process_id,
                         "p_revision": revision, "p_action": action, "p_payload": payload or {}})

    def confirm(self, user, process_id, request, update):
        return self.rpc("hu23_confirm", {"p_user": user, "p_process": process_id,
                                        "p_request": request, "p_update": update})
