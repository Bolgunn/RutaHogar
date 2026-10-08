import os
from html import escape
from pathlib import Path
from string import Template

import httpx

from .contracts import LeadChangeError


DISCLAIMER = "La informacion es referencial: no constituye aprobacion bancaria ni garantia de condiciones comerciales."


TEMPLATE_DIR = Path(__file__).resolve().parent / "templates"


def _render_template(name, **values):
    template = (TEMPLATE_DIR / f"{name}.html").read_text(encoding="utf-8")
    return Template(template).substitute(values)


def _email_shell(content):
    return _render_template('shell', content=content)


def _safe(value):
    return escape(str(value), quote=True)


class ResendEmailClient:
    def __init__(self, client=None):
        self.api_key = os.environ.get("RESEND_API_KEY", "").strip()
        self.from_email = os.environ.get("RUTAHOGAR_EMAIL_FROM", "RutaHogar <novedades@rutahogar.cl>").strip()
        self.client = client

    @property
    def configured(self):
        return bool(self.api_key and self.from_email)

    def send_change_email(self, lead, event):
        if not self.configured:
            raise LeadChangeError("email_not_configured")
        recipient = lead.get("email")
        if not recipient:
            raise LeadChangeError("missing_recipient")
        subject = build_subject(event)
        payload = {
            "from": self.from_email,
            "to": [recipient],
            "subject": subject,
            "html": build_html(lead, event),
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=20) if self.client is None else _Borrowed(self.client) as client:
                response = client.post("https://api.resend.com/emails", headers=headers, json=payload)
        except httpx.HTTPError:
            raise LeadChangeError("email_provider_unavailable") from None
        if response.status_code >= 400:
            raise LeadChangeError("email_provider_rejected")
        data = response.json()
        return {"provider_message_id": data.get("id"), "subject": subject, "recipient": recipient, "payload": payload}

    def send_digest_email(self, lead, events):
        if not self.configured:
            raise LeadChangeError("email_not_configured")
        recipient = lead.get("email")
        if not recipient:
            raise LeadChangeError("missing_recipient")
        subject = build_digest_subject(events)
        payload = {
            "from": self.from_email,
            "to": [recipient],
            "subject": subject,
            "html": build_digest_html(lead, events),
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        try:
            with httpx.Client(timeout=20) if self.client is None else _Borrowed(self.client) as client:
                response = client.post("https://api.resend.com/emails", headers=headers, json=payload)
        except httpx.HTTPError:
            raise LeadChangeError("email_provider_unavailable") from None
        if response.status_code >= 400:
            raise LeadChangeError("email_provider_rejected")
        data = response.json()
        return {"provider_message_id": data.get("id"), "subject": subject, "recipient": recipient, "payload": payload}


def build_subject(event):
    project = event.get("project_name") or "tu proyecto"
    if event.get("event_type") == "monthly_plan_summary":
        return f"Algo cambio para {project}: revisa tu resumen mensual"
    if event.get("event_type") == "project_compatible_unlocked":
        return f"Aparecio una nueva oportunidad para {project}"
    if event.get("event_type") == "score_band_improved":
        return f"Tu perfil podria mejorar para {project}"
    if event.get("event_type") == "uf_reachability_crossed":
        return f"{project} podria estar nuevamente a tu alcance"
    return f"Algo cambio para {project}"


def build_digest_subject(events):
    count = len(events)
    if count == 1:
        return build_subject(events[0])
    return f"Tienes {count} novedades en RutaHogar"


def build_html(lead, event):
    app_url = os.environ.get("RUTAHOGAR_APP_URL", "http://localhost:5173").rstrip("/")
    event_url = f"{app_url}/?lead_change_event={event['id']}"
    opt_out_url = f"{app_url}/?lead_change_opt_out={event['event_type']}"
    score = lead.get("score")
    classification = lead.get("classification") or "Sin tramo"
    project = event.get("project_name") or "tu proyecto objetivo"
    previous_value = _safe(_format_value(event.get("previous_value")))
    current_value = _safe(_format_value(event.get("current_value")))
    delta = ""
    if previous_value or current_value:
        delta = _render_template("comparacion", previous=previous_value or "Sin dato", current=current_value or "Sin dato")
    return _email_shell(_render_template('novedad', title=_safe(event['title']), summary=_safe(event['summary']), delta=delta, project=_safe(project), score=_safe(score if score is not None else 'Sin dato'), classification=_safe(classification), event_url=_safe(event_url), disclaimer=DISCLAIMER, opt_out_url=_safe(opt_out_url)))


def build_digest_html(lead, events):
    app_url = os.environ.get("RUTAHOGAR_APP_URL", "http://localhost:5173").rstrip("/")
    score = lead.get("score")
    classification = lead.get("classification") or "Sin tramo"
    groups = _group_events(events)
    sections = "".join(_render_group(event_type, items) for event_type, items in groups)
    return _email_shell(_render_template('resumen', score=_safe(score if score is not None else 'Sin dato'), classification=_safe(classification), sections=sections, app_url=_safe(app_url), disclaimer=DISCLAIMER))


def _group_events(events):
    groups = []
    by_type = {}
    for event in events:
        event_type = event.get("event_type") or "unknown"
        if event_type not in by_type:
            by_type[event_type] = []
            groups.append((event_type, by_type[event_type]))
        by_type[event_type].append(event)
    return groups


def _render_group(event_type, items):
    label = _event_type_label(event_type)
    cards = "".join(_render_event(event) for event in items)
    count_text = "1 novedad" if len(items) == 1 else f"{len(items)} novedades"
    return _render_template('grupo', label=label, count=count_text, cards=cards)


def _render_event(event):
    return _render_template('evento', title=_safe(event.get('title', 'Cambio detectado')), summary=_safe(event.get('summary', '')))


def _event_type_label(event_type):
    return {
        "project_compatible_unlocked": "Proyecto compatible",
        "score_band_improved": "Mejora referencial",
        "monthly_plan_summary": "Resumen mensual",
        "uf_reachability_crossed": "Cambio de alcance",
        "quick_update_submitted": "Dato actualizado",
    }.get(event_type, "Cambio detectado")


def _format_value(value):
    if value is None:
        return ""
    if isinstance(value, dict):
        if "label" in value:
            return str(value["label"])
        if "value" in value:
            unit = f" {value.get('unit')}" if value.get("unit") else ""
            return f"{value['value']}{unit}"
    return str(value)


class _Borrowed:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self.client

    def __exit__(self, *args):
        return False
