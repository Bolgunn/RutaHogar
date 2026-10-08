"""Supabase I/O only. No scoring or projection persistence lives here."""

import os
from urllib.parse import urlencode

import httpx

from .contracts import TrackingError


class TrackingRepository:
    def __init__(self, client=None):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self.client = client
        if not self.url or not self.key:
            raise TrackingError("persistence_unavailable")

    def request(self, method, path, *, token=None, payload=None):
        headers = {"apikey": self.key}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        elif not self.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.key}"
        try:
            with httpx.Client(base_url=self.url, timeout=30) if self.client is None else _Borrowed(self.client) as client:
                response = client.request(method, path, headers=headers, json=payload)
        except httpx.HTTPError:
            raise TrackingError("persistence_unavailable") from None
        if response.status_code >= 400:
            if path == "/auth/v1/user":
                raise TrackingError("unauthenticated")
            try:
                message = response.json().get("message", "")
            except ValueError:
                message = ""
            allowed = {"idempotency_conflict", "lineage_conflict", "owner_mismatch", "not_found", "verifiable_data_contradiction"}
            raise TrackingError(message if message in allowed else "persistence_unavailable")
        return response.json()

    def authenticate(self, token):
        user = self.request("GET", "/auth/v1/user", token=token)
        if not user.get("id"):
            raise TrackingError("unauthenticated")
        return user["id"]

    def load(self, user_id):
        return self.request("POST", "/rest/v1/rpc/hu13_read", payload={"p_user_id": user_id})

    def load_co_debtor_consent(self, user_id):
        """Load only the latest HU18 facts needed to assemble a future score."""
        query = urlencode({
            "lead_id": f"eq.{user_id}",
            "select": (
                "status,created_at,expires_at,"
                "co_debtor_confirmations("
                "id,ingreso_mensual_complementario,deuda_mensual_complementario,"
                "tipo_contrato_complementario,continuidad_laboral_complementario,"
                "morosidad_complementario)"
            ),
            "order": "created_at.desc",
            "limit": 10,
        })
        rows = self.request("GET", f"/rest/v1/co_debtor_invitations?{query}")
        if not isinstance(rows, list) or not rows:
            return None
        invitation = rows[0]
        confirmations = invitation.get("co_debtor_confirmations")
        if isinstance(confirmations, dict):
            confirmation = confirmations
        elif isinstance(confirmations, list) and confirmations:
            confirmation = confirmations[0]
        else:
            confirmation = None
        return {
            "invitation_status": invitation.get("status"),
            "created_at": invitation.get("created_at"),
            "expires_at": invitation.get("expires_at"),
            "co_debtor_confirmed": confirmation,
        }

    def staff_actor(self, token):
        """Authenticate the caller and read its server-side staff scope."""
        user_id = self.authenticate(token)
        query = urlencode({"id": f"eq.{user_id}", "select": "id,role,inmobiliaria_id"})
        rows = self.request("GET", f"/rest/v1/profiles?{query}")
        actor = rows[0] if isinstance(rows, list) and rows else None
        if not actor:
            raise TrackingError("owner_mismatch")
        return actor

    def staff_can_access(self, actor, lead_id):
        """Reuse HU16's tenant definition; never take scope from the client."""
        if actor.get("role") not in {"ejecutivo", "admin", "admin_inmobiliario"}:
            return False
        if actor.get("role") == "admin" and not actor.get("inmobiliaria_id"):
            return True
        tenant_id = actor.get("inmobiliaria_id")
        if not tenant_id:
            return False
        return bool(self.request("POST", "/rest/v1/rpc/lead_belongs_to_inmobiliaria", payload={
            "p_lead": lead_id,
            "p_inmobiliaria": tenant_id,
        }))

    def staff_evaluations(self):
        return self.request("GET", "/rest/v1/evaluations?select=*&order=created_at.desc")

    def staff_contacts(self, lead_ids):
        ids = sorted({str(lead_id) for lead_id in lead_ids if lead_id})
        if not ids:
            return {}
        query = urlencode({"select": "id,full_name,phone", "id": f"in.({','.join(ids)})"})
        rows = self.request("GET", f"/rest/v1/profiles?{query}")
        return {
            row["id"]: {"full_name": row.get("full_name"), "phone": row.get("phone")}
            for row in rows if row.get("id")
        }

    def staff_lead_evaluations(self, lead_id):
        query = urlencode({"user_id": f"eq.{lead_id}", "select": "financial_data,created_at"})
        return self.request("GET", f"/rest/v1/evaluations?{query}")

    def staff_co_debtor_invitation(self, lead_id):
        query = urlencode({
            "lead_id": f"eq.{lead_id}",
            "select": (
                "status,created_at,expires_at,"
                "co_debtor_confirmations("
                "ingreso_mensual_complementario,deuda_mensual_complementario,"
                "tipo_contrato_complementario,continuidad_laboral_complementario,"
                "morosidad_complementario)"
            ),
            "order": "created_at.desc",
            "limit": 1,
        })
        rows = self.request("GET", f"/rest/v1/co_debtor_invitations?{query}")
        return rows[0] if isinstance(rows, list) and rows else None

    def staff_history(self, lead_id):
        query = urlencode({
            "user_id": f"eq.{lead_id}",
            "select": "id,evaluation_id,user_id,score,classification,snapshot,component_scores,algorithm_version,channel,events,created_at",
            "order": "created_at.desc",
        })
        return self.request("GET", f"/rest/v1/scoring_history?{query}")

    def commit(self, user_id, command, revision, records):
        return self.request("POST", "/rest/v1/rpc/hu13_commit", payload={
            "p_user_id": user_id, "p_command": command, "p_expected_revision": revision,
            "p_records": records,
        })

    def confirm(self, user_id, goal_id, command):
        return self.request("POST", "/rest/v1/rpc/hu13_confirm_goal", payload={
            "p_user_id": user_id, "p_goal_id": goal_id, "p_command": command,
        })

    def annotate(self, user_id, evaluation_id, command):
        return self.request("POST", "/rest/v1/rpc/hu13_annotate_evaluation", payload={
            "p_user_id": user_id, "p_evaluation_id": evaluation_id, "p_command": command,
        })


class _Borrowed:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self.client

    def __exit__(self, *args):
        return False
