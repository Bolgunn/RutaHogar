"""Pure ALG-17 co-debtor consent resolution."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Mapping

from .constants import CO_DEBTOR_INVITATION_TTL_DAYS


_INVITATION_STATUSES = frozenset({"pending", "expired", "confirmed", "revoked", "declined", "replaced"})
_CO_DEBTOR_FINANCIAL_FIELDS = (
    "ingreso_mensual_complementario",
    "deuda_mensual_complementario",
    "tipo_contrato_complementario",
    "continuidad_laboral_complementario",
    "morosidad_complementario",
)
_RELATION_FIELD = "relacion_complementario"


def invitation_expires_at(created_at: datetime) -> datetime:
    """Return the ALG-17 expiry instant from a server-supplied creation time."""
    return created_at + timedelta(days=CO_DEBTOR_INVITATION_TTL_DAYS)


def _selected_lead_declaration(lead_declared: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not lead_declared:
        return None
    selected = {
        field: lead_declared[field]
        for field in (*_CO_DEBTOR_FINANCIAL_FIELDS, _RELATION_FIELD)
        if field in lead_declared
    }
    return selected or None


def _selected_confirmed_values(
    lead_declared: Mapping[str, Any] | None,
    co_debtor_confirmed: Mapping[str, Any] | None,
) -> dict[str, Any] | None:
    if not co_debtor_confirmed:
        return None
    selected = {
        field: co_debtor_confirmed[field]
        for field in _CO_DEBTOR_FINANCIAL_FIELDS
        if field in co_debtor_confirmed
    }
    if lead_declared and _RELATION_FIELD in lead_declared:
        selected[_RELATION_FIELD] = lead_declared[_RELATION_FIELD]
    return selected or None


def _resolved_invitation_status(
    invitation_status: str | None,
    *,
    now: datetime | None,
    created_at: datetime | None,
    expires_at: datetime | None,
    revoked: bool,
    replacement_invitation_created: bool,
) -> str | None:
    if invitation_status is not None and invitation_status not in _INVITATION_STATUSES:
        raise ValueError("invalid ALG-17 invitation status")
    if revoked or invitation_status == "revoked":
        return "revoked"
    if replacement_invitation_created or invitation_status == "replaced":
        return "replaced"
    if invitation_status != "pending":
        return invitation_status

    expiry = expires_at or (invitation_expires_at(created_at) if created_at is not None else None)
    if expiry is not None and now is not None and now >= expiry:
        return "expired"
    return "pending"


def resolve_co_debtor_complement(
    *,
    invitation_status: str | None,
    now: datetime | None = None,
    created_at: datetime | None = None,
    expires_at: datetime | None = None,
    token_valid: bool = False,
    treatment_consent: bool | None = None,
    has_submitted_values: bool = False,
    co_debtor_action: str | None = None,
    revoked: bool = False,
    replacement_invitation_created: bool = False,
    lead_declared: Mapping[str, Any] | None = None,
    co_debtor_confirmed: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve ALG-17 provenance without I/O, clocks, token handling, or mutation.

    ``now`` and invitation timestamps are caller-supplied server facts. A
    persisted ``confirmed`` state already represents a completed separate
    consent; an explicit ``treatment_consent=False`` prevents its selection.
    """
    resolved_status = _resolved_invitation_status(
        invitation_status,
        now=now,
        created_at=created_at,
        expires_at=expires_at,
        revoked=revoked,
        replacement_invitation_created=replacement_invitation_created,
    )
    valid_submission = (
        resolved_status == "pending"
        and token_valid
        and treatment_consent is True
        and has_submitted_values
    )
    if valid_submission:
        resolved_status = "confirmed"

    result: dict[str, Any] = {
        "invitation_status": resolved_status,
        "complement_source": "lead_declared",
        "complement_confirmation_status": "not_confirmed",
        "selected_complement": _selected_lead_declaration(lead_declared),
        "rescore_required": False,
        "decision_rule": "R5",
    }

    if replacement_invitation_created:
        result.update(previous_invitation_valid=False, active_invitation_count=1)

    if resolved_status in {"revoked", "declined"}:
        source = "excluded_after_revocation" if resolved_status == "revoked" else "excluded_after_decline"
        result.update(
            complement_source=source,
            complement_confirmation_status=resolved_status,
            selected_complement=None,
            decision_rule="R6" if resolved_status == "revoked" else "R7",
            future_complement_source=source,
            historical_snapshots_preserved=True,
            staff_raw_values_visible=False,
        )
        return result

    persisted_confirmation_is_valid = resolved_status == "confirmed" and treatment_consent is not False
    if valid_submission or persisted_confirmation_is_valid:
        result.update(
            complement_source="co_debtor_confirmed",
            complement_confirmation_status="confirmed",
            selected_complement=_selected_confirmed_values(lead_declared, co_debtor_confirmed),
            decision_rule="R3",
        )
        return result

    if resolved_status == "expired":
        result["decision_rule"] = "R2"
    elif resolved_status == "replaced":
        result["decision_rule"] = "R4"
    if co_debtor_action == "decline":
        result["financial_rejection_detail_stored"] = False
    return result
