"""Revision selection and historical visibility; no financial calculations."""

from datetime import datetime, timedelta, timezone

from .contracts import TrackingError


FINANCIAL_FIELDS = (
    "ingreso_mensual_complementario", "deuda_mensual_complementario",
    "tipo_contrato_complementario", "continuidad_laboral_complementario",
    "morosidad_complementario",
)


def select_confirmation(value, confirmation_id=None):
    """Select an explicit historical UUID or the greatest unique revision.

    A single old HU18 record remains readable without manufacturing identity.
    Missing/duplicate ordinals in a multi-record response are an integrity error.
    """
    rows = [value] if isinstance(value, dict) else list(value or [])
    if confirmation_id is not None:
        matches = [row for row in rows if row.get("id") == confirmation_id]
        if len(matches) > 1:
            raise TrackingError("co_debtor_revision_conflict")
        return matches[0] if matches else None
    if not rows:
        return None
    if len(rows) == 1 and "revision_number" not in rows[0]:
        return rows[0]
    numbers = [row.get("revision_number") for row in rows]
    if (any(type(number) is not int or number < 1 for number in numbers)
            or len(set(numbers)) != len(numbers)):
        raise TrackingError("co_debtor_revision_conflict")
    return max(rows, key=lambda row: row["revision_number"])


def parse_timestamp(value):
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return stamp if stamp.tzinfo else None
    except ValueError:
        return None


def historical_visibility(invitation, now=None):
    """The first closure starts the window; never restart it on transitions."""
    now = now or datetime.now(timezone.utc)
    events = (invitation or {}).get("co_debtor_consent_events") or []
    confirmations = (invitation or {}).get("co_debtor_confirmations") or []
    confirmations = [confirmations] if isinstance(confirmations, dict) else confirmations
    confirmation_times = [parse_timestamp(row.get("confirmed_at")) for row in confirmations]
    confirmation_times = [stamp for stamp in confirmation_times if stamp is not None]
    closures = []
    for event in events:
        stamp = parse_timestamp(event.get("occurred_at"))
        if event.get("event_type") == "revoked":
            closures.append(stamp)
        elif event.get("event_type") == "replaced" and stamp and any(time <= stamp for time in confirmation_times):
            closures.append(stamp)
    closures = [stamp for stamp in closures if stamp is not None]
    closed = ((invitation or {}).get("status") in {"revoked", "replaced", "declined", "expired"}
              or any(event.get("event_type") == "revoked" for event in events))
    if not closures:
        return {"visible": not closed, "closure_at": None, "historical_visible_until": None}
    first = min(closures)
    until = first + timedelta(days=30)
    return {"visible": now < until, "closure_at": first.isoformat(),
            "historical_visible_until": until.isoformat()}
