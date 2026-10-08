"""Staff-facing projections with HU18 consent redaction.

Raw HU18 confirmations never leave this module's server-side boundary.  The
dashboard receives redacted evaluation/history snapshots plus a deliberately
small, current-consent projection for the selected lead.
"""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone

from .contracts import TrackingError


CO_DEBTOR_RAW_FIELDS = frozenset({
    "ingreso_mensual_complementario",
    "deuda_mensual_complementario",
    "tipo_contrato_complementario",
    "continuidad_laboral_complementario",
    "morosidad_complementario",
    "relacion_complementario",
})
CO_DEBTOR_CONFIRMED_FIELDS = (
    "ingreso_mensual_complementario",
    "deuda_mensual_complementario",
    "tipo_contrato_complementario",
    "continuidad_laboral_complementario",
    "morosidad_complementario",
)
# Una consulta de alcance por lead; en serie superaban el timeout de 15 s del
# frontend con ~140 leads. Cada llamada del repositorio abre su propio cliente HTTP.
SCOPE_CHECK_WORKERS = 16


def redact_co_debtor_data(value):
    """Drop raw complement fields recursively without changing other history."""
    if isinstance(value, dict):
        return {
            key: redact_co_debtor_data(item)
            for key, item in value.items()
            if key not in CO_DEBTOR_RAW_FIELDS
        }
    if isinstance(value, list):
        return [redact_co_debtor_data(item) for item in value]
    return deepcopy(value)


def _is_expired(invitation, now):
    if invitation.get("status") != "pending" or not invitation.get("expires_at"):
        return False
    try:
        expires_at = datetime.fromisoformat(str(invitation["expires_at"]).replace("Z", "+00:00"))
    except ValueError:
        return False
    if expires_at.tzinfo is None:
        return False
    return expires_at <= now


def _confirmation_for(invitation):
    confirmations = invitation.get("co_debtor_confirmations") or []
    confirmation = confirmations if isinstance(confirmations, dict) else (confirmations[0] if confirmations else None)
    if not isinstance(confirmation, dict):
        return None
    values = {field: confirmation.get(field) for field in CO_DEBTOR_CONFIRMED_FIELDS}
    return values if all(value is not None for value in values.values()) else None


def co_debtor_staff_projection(invitation, latest_input, now=None):
    """Return only the current HU18 state permitted to an authorized staff user."""
    now = now or datetime.now(timezone.utc)
    declared = bool((latest_input or {}).get("complemento_renta"))
    if not invitation:
        return None if not declared else {
            "status": "not_confirmed",
            "source": "lead_declared",
        }

    status = "expired" if _is_expired(invitation, now) else invitation.get("status")
    if status == "confirmed":
        confirmation = _confirmation_for(invitation)
        if confirmation:
            result = {
                "status": "confirmed",
                "source": "co_debtor_confirmed",
                "confirmed": confirmation,
            }
            relation = (latest_input or {}).get("relacion_complementario")
            if relation:
                result["relation"] = {"value": relation, "source": "lead_declared"}
            return result
        # A malformed record must not turn into a raw-data fallback.
        return {"status": "not_confirmed", "source": "lead_declared"}
    if status == "revoked":
        return {"status": "revoked", "source": "excluded_after_revocation"}
    if status == "declined":
        return {"status": "declined", "source": "excluded_after_decline"}
    if status == "pending":
        return {"status": "pending", "source": "lead_declared"}
    if status == "expired":
        return {"status": "expired", "source": "lead_declared"}
    return {"status": "not_confirmed", "source": "lead_declared"}


class StaffLeadService:
    """Authorization and safe staff projections over the existing repository."""

    def __init__(self, repository, clock=None):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def _actor(self, token):
        actor = self.repository.staff_actor(token)
        if actor.get("role") not in {"ejecutivo", "admin", "admin_inmobiliario"}:
            raise TrackingError("owner_mismatch")
        return actor

    def _authorize(self, actor, lead_id):
        if not self.repository.staff_can_access(actor, lead_id):
            # Deliberately do not disclose whether another lead exists.
            raise TrackingError("owner_mismatch")

    def evaluations(self, token):
        actor = self._actor(token)
        rows = self.repository.staff_evaluations()
        lead_ids = list(dict.fromkeys(row["user_id"] for row in rows if row.get("user_id")))
        with ThreadPoolExecutor(max_workers=SCOPE_CHECK_WORKERS) as pool:
            access = pool.map(lambda lead_id: self.repository.staff_can_access(actor, lead_id), lead_ids)
            allowed = {lead_id for lead_id, ok in zip(lead_ids, access) if ok}
        result = [redact_co_debtor_data(row) for row in rows if row.get("user_id") in allowed]
        contacts = self.repository.staff_contacts([row["user_id"] for row in result])
        return {
            "items": [
                {**row, **contacts.get(row["user_id"], {})}
                for row in result
            ]
        }

    def lead_detail(self, token, lead_id):
        actor = self._actor(token)
        self._authorize(actor, lead_id)
        evaluations = self.repository.staff_lead_evaluations(lead_id)
        latest = max(evaluations, key=lambda row: str(row.get("created_at") or ""), default={})
        latest_input = ((latest.get("financial_data") or {}).get("input")
                        or (latest.get("financial_data") or {}).get("input_snapshot")
                        or latest.get("financial_data") or {})
        invitation = self.repository.staff_co_debtor_invitation(lead_id)
        history = self.repository.staff_history(lead_id)
        # History always excludes raw fields, even while consent remains valid:
        # the five current values have one explicit, revocable projection above.
        return {
            "co_debtor": co_debtor_staff_projection(invitation, latest_input, self.clock()),
            "history": [redact_co_debtor_data(row) for row in history],
        }
