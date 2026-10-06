"""Assemble one score input from lead and ALG-17 co-debtor facts.

This is deliberately an I/O-free boundary. The caller supplies the lead's
declared snapshot and server-read HU18 facts; this module never receives or
handles invitation or management tokens.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping

from .co_debtor_consent import resolve_co_debtor_complement


_FINANCIAL_FIELDS = (
    "ingreso_mensual_complementario",
    "deuda_mensual_complementario",
    "tipo_contrato_complementario",
    "continuidad_laboral_complementario",
    "morosidad_complementario",
)
_RELATION_FIELD = "relacion_complementario"
_COMPLEMENT_FIELDS = (*_FINANCIAL_FIELDS, _RELATION_FIELD)


def _is_truthy(value: Any) -> bool:
    return value is True or str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}


def _timestamp(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _complete_confirmed_values(values: Mapping[str, Any] | None) -> dict[str, Any] | None:
    if not values or any(values.get(field) in (None, "") for field in _FINANCIAL_FIELDS):
        return None
    return {field: values[field] for field in _FINANCIAL_FIELDS}


def _safe_provenance(resolution: Mapping[str, Any]) -> dict[str, Any]:
    """Persist selection provenance, never a duplicate of financial values."""
    return {
        "invitation_status": resolution.get("invitation_status"),
        "complement_source": resolution.get("complement_source"),
        "complement_confirmation_status": resolution.get("complement_confirmation_status"),
        "decision_rule": resolution.get("decision_rule"),
        "rescore_required": resolution.get("rescore_required", False),
    }


def assemble_co_debtor_scoring_input(
    lead_declared_input: Mapping[str, Any] | None,
    *,
    co_debtor_consent: Mapping[str, Any] | None = None,
    now: datetime | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Return the score input and minimal immutable ALG-17 provenance.

    The five co-debtor financial values are selected as one unit. A malformed
    persisted confirmation is treated as unavailable rather than allowing a
    mixture of declared and confirmed fields.
    """
    assembled = dict(lead_declared_input or {})
    if not _is_truthy(assembled.get("complemento_renta")):
        return assembled, {
            "invitation_status": None,
            "complement_source": None,
            "complement_confirmation_status": None,
            "decision_rule": None,
            "rescore_required": False,
        }

    facts = dict(co_debtor_consent or {})
    lead_declared = {field: assembled[field] for field in _COMPLEMENT_FIELDS if field in assembled}
    confirmed = _complete_confirmed_values(facts.get("co_debtor_confirmed"))
    invitation_status = facts.get("invitation_status", facts.get("status"))

    # A confirmed invitation is only usable when its atomic five-field record
    # is present. Database constraints make this defensive branch exceptional.
    resolver_status = invitation_status
    if invitation_status == "confirmed" and confirmed is None:
        resolver_status = None

    resolution = resolve_co_debtor_complement(
        invitation_status=resolver_status,
        now=now,
        created_at=_timestamp(facts.get("created_at")),
        expires_at=_timestamp(facts.get("expires_at")),
        treatment_consent=facts.get("treatment_consent"),
        revoked=facts.get("revoked", False),
        lead_declared=lead_declared,
        co_debtor_confirmed=confirmed,
    )

    source = resolution["complement_source"]
    if source == "co_debtor_confirmed":
        # ``confirmed`` has all five fields or the resolver status was made
        # unavailable above. Never fall back field-by-field to the lead.
        assembled.update(resolution["selected_complement"] or {})
    elif source == "excluded_after_revocation":
        assembled["complemento_renta"] = False
        for field in _COMPLEMENT_FIELDS:
            assembled[field] = None

    return assembled, _safe_provenance(resolution)
