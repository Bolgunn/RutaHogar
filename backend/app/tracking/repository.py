"""Supabase I/O only. No scoring or projection persistence lives here."""

import os
from urllib.parse import urlencode

import httpx

from .contracts import TrackingError
from .co_debtor import select_confirmation, historical_visibility, FINANCIAL_FIELDS

# Una conexión TLS nueva por llamada a Supabase costaba ~100-300 ms cada una.
# httpx.Client es thread-safe y la instancia de la función se reutiliza entre requests.
_shared_clients = {}


def _shared_client(base_url):
    client = _shared_clients.get(base_url)
    if client is None:
        client = _shared_clients.setdefault(base_url, httpx.Client(base_url=base_url, timeout=30))
    return client


def select_current_co_debtor_invitation(rows):
    """Match the lead-visible rule: prefer pending, otherwise most recent."""
    if not isinstance(rows, list) or not rows:
        return None
    return max(rows, key=lambda row: (row.get("status") == "pending",
                                     str(row.get("created_at") or ""), str(row.get("id") or "")))


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
            client = self.client or _shared_client(self.url)
            response = client.request(method, path, headers=headers, json=payload)
        except httpx.HTTPError:
            raise TrackingError("persistence_unavailable") from None
        if response.status_code >= 300:
            if path == "/auth/v1/user":
                raise TrackingError("unauthenticated")
            try:
                message = response.json().get("message", "")
            except ValueError:
                message = ""
            allowed = {"idempotency_conflict", "lineage_conflict", "owner_mismatch", "not_found", "verifiable_data_contradiction", "co_debtor_revision_conflict", "co_debtor_relation_conflict", "co_debtor_participation_closed"}
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
                "id,status,created_at,expires_at,participant_user_id,"
                "co_debtor_confirmations!co_debtor_confirmations_invitation_id_fkey("
                "id,revision_number,participant_user_id,accepted_relation_event_id,confirmed_at,ingreso_mensual_complementario,deuda_mensual_complementario,"
                "tipo_contrato_complementario,continuidad_laboral_complementario,"
                "morosidad_complementario),"
                "co_debtor_consent_events!co_debtor_consent_events_invitation_id_fkey(id,event_type,relation_revision,relation_value,occurred_at)"
            ),
            "order": "created_at.desc,id.desc",
        })
        rows = self.request("GET", f"/rest/v1/co_debtor_invitations?{query}")
        invitation = select_current_co_debtor_invitation(rows)
        if invitation is None:
            return None
        confirmation = select_confirmation(invitation.get("co_debtor_confirmations"))
        facts = {
            "invitation_status": invitation.get("status"),
            "created_at": invitation.get("created_at"),
            "expires_at": invitation.get("expires_at"),
            "co_debtor_confirmed": confirmation,
        }
        if confirmation and "revision_number" in confirmation:
            relations = [event for event in invitation.get("co_debtor_consent_events", [])
                         if event.get("relation_revision") is not None]
            relation = max(relations, key=lambda event: event["relation_revision"], default={})
            facts.update(participation_id=invitation.get("id"), revision_number=confirmation["revision_number"],
                         relation_declaration_event_id=relation.get("id"), declared_relation=relation.get("relation_value"),
                         exclude_complement=(not invitation.get("participant_user_id")
                           or confirmation.get("participant_user_id") != invitation.get("participant_user_id")
                           or not relation
                           or historical_visibility(invitation)["closure_at"] is not None
                           or not any(row.get("accepted_relation_event_id") and
                                      row.get("participant_user_id") == invitation.get("participant_user_id")
                                      for row in (invitation.get("co_debtor_confirmations") or []))))
        if confirmation and "revision_number" in confirmation and not facts.get("exclude_complement"):
            facts["matches_evaluated"] = self.request("POST", "/rest/v1/rpc/hu30_matches_evaluated", payload={
                "p_id": invitation["id"], "p_values": {field: confirmation.get(field) for field in FINANCIAL_FIELDS},
            })
        if confirmation and "revision_number" in confirmation:
            facts["verified_revision"] = bool(invitation.get("status") == "confirmed"
                                              and not facts.get("exclude_complement"))
        if invitation.get("status") == "replaced":
            facts["exclude_complement"] = True
        return facts


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

    def staff_evaluations(self, actor):
        """Same scope as staff_can_access, resolved in one database round trip."""
        if actor.get("role") not in {"ejecutivo", "admin", "admin_inmobiliario"}:
            return []
        if actor.get("role") == "admin" and not actor.get("inmobiliaria_id"):
            return self.request("GET", "/rest/v1/evaluations?select=*&order=created_at.desc")
        tenant_id = actor.get("inmobiliaria_id")
        if not tenant_id:
            return []
        return self.request("POST", "/rest/v1/rpc/staff_evaluations_for_inmobiliaria", payload={
            "p_inmobiliaria": tenant_id,
        })

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
        query = urlencode({"user_id": f"eq.{lead_id}", "select": "id,user_id,financial_data,created_at"})
        return self.request("GET", f"/rest/v1/evaluations?{query}")

    def staff_co_debtor_invitation(self, lead_id):
        query = urlencode({
            "lead_id": f"eq.{lead_id}",
            "select": (
                "id,status,created_at,expires_at,participant_user_id,"
                "co_debtor_confirmations!co_debtor_confirmations_invitation_id_fkey("
                "id,revision_number,participant_user_id,accepted_relation_event_id,confirmed_at,ingreso_mensual_complementario,deuda_mensual_complementario,"
                "tipo_contrato_complementario,continuidad_laboral_complementario,"
                "morosidad_complementario),"
                "co_debtor_consent_events!co_debtor_consent_events_invitation_id_fkey(id,event_type,relation_revision,relation_value,occurred_at)"
            ),
            "order": "created_at.desc,id.desc",
        })
        rows = self.request("GET", f"/rest/v1/co_debtor_invitations?{query}")
        return select_current_co_debtor_invitation(rows)

    def staff_history(self, lead_id):
        query = urlencode({
            "user_id": f"eq.{lead_id}",
            "select": "id,evaluation_id,user_id,score,classification,snapshot,component_scores,algorithm_version,channel,events,created_at",
            "order": "created_at.desc",
        })
        return self.request("GET", f"/rest/v1/scoring_history?{query}")

    def co_debtor_rows(self, user_ids):
        ids = sorted(set(str(value) for value in user_ids if value))
        if not ids:
            return []
        query = urlencode({"lead_id": f"in.({','.join(ids)})", "select": (
            "id,lead_id,recipient_email,recipient_rut,status,expires_at,created_at,participant_user_id,"
            "ingreso_mensual_complementario,deuda_mensual_complementario,tipo_contrato_complementario,"
            "continuidad_laboral_complementario,morosidad_complementario,"
            "co_debtor_confirmations!co_debtor_confirmations_invitation_id_fkey(*),"
            "co_debtor_consent_events!co_debtor_consent_events_invitation_id_fkey(*)"
        ), "order": "created_at.desc,id.desc"})
        from urllib.parse import parse_qsl
        params = dict(parse_qsl(query))
        output = []
        for start in range(0, len(ids), 100):
            output.extend(self._co_debtor_pages({**params, "lead_id": f"in.({','.join(ids[start:start+100])})"}))
        return output

    def other_active_participations(self, participations):
        """Service-only batch query; return booleans, never third-party rows."""
        participants = sorted({item.get("participant_user_id") for item in participations if item.get("participant_user_id")})
        if not participants:
            return {}
        query = {"participant_user_id": f"in.({','.join(participants)})", "status": "eq.confirmed",
                 "select": "id,lead_id,participant_user_id,co_debtor_confirmations!co_debtor_confirmations_invitation_id_fkey(id,participant_user_id,accepted_relation_event_id,confirmed_at),co_debtor_consent_events!co_debtor_consent_events_invitation_id_fkey(event_type,occurred_at)"}
        candidates = []
        for start in range(0, len(participants), 100):
            candidates.extend(self._co_debtor_pages({**query,
                "participant_user_id": f"in.({','.join(participants[start:start+100])})"}))
        active = [item for item in candidates if item.get("status", "confirmed") == "confirmed"
                  and historical_visibility(item)["visible"] and historical_visibility(item)["closure_at"] is None
                  and any(c.get("participant_user_id") == item.get("participant_user_id") and c.get("accepted_relation_event_id")
                          for c in item.get("co_debtor_confirmations", []))]
        return {item["id"]: any(other.get("participant_user_id") == item.get("participant_user_id")
                    and other["id"] != item["id"] and other.get("lead_id") != item.get("lead_id") for other in active)
                for item in participations}

    def _co_debtor_pages(self, query):
        output, offset = [], 0
        while True:
            batch = self.request("GET", "/rest/v1/co_debtor_invitations?" + urlencode({**query, "limit": 1000, "offset": offset}))
            output.extend(batch)
            if len(batch) < 1000:
                return output
            offset += 1000

    def evaluation_identity(self, evaluation_id):
        query = urlencode({"id": f"eq.{evaluation_id}", "select": "id,user_id"})
        rows = self.request("GET", f"/rest/v1/evaluations?{query}")
        return rows[0] if rows else None

    def owner_evaluations(self, user_id):
        query = urlencode({"user_id": f"eq.{user_id}", "select": "*", "order": "created_at.desc"})
        return self.request("GET", f"/rest/v1/evaluations?{query}")

    def owner_annotations(self, user_id):
        query = urlencode({"user_id": f"eq.{user_id}", "select": "*", "order": "recorded_at.asc"})
        return self.request("GET", f"/rest/v1/evaluation_events?{query}")

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

