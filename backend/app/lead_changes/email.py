import os

import httpx

from .contracts import LeadChangeError


DISCLAIMER = "La informacion es referencial: no constituye aprobacion bancaria ni garantia de condiciones comerciales."


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
    previous_value = _format_value(event.get("previous_value"))
    current_value = _format_value(event.get("current_value"))
    delta = ""
    if previous_value or current_value:
        delta = f"<p><strong>Antes:</strong> {previous_value or 'Sin dato'}<br><strong>Ahora:</strong> {current_value or 'Sin dato'}</p>"
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#132b4a;line-height:1.55">
      <p style="color:#246354;font-weight:700;text-transform:uppercase;letter-spacing:.06em">RutaHogar</p>
      <h1 style="font-size:26px;line-height:1.1;margin:0 0 14px">{event['title']}</h1>
      <p>{event['summary']}</p>
      {delta}
      <div style="padding:14px;border:1px solid #e5ded0;border-radius:12px;background:#fbf7ef;margin:18px 0">
        <strong>Resumen de tu perfil</strong><br>
        Proyecto de referencia: {project}<br>
        Score: {score if score is not None else 'Sin dato'} · Tramo: {classification}
      </div>
      <p><a href="{event_url}" style="display:inline-block;background:#132b4a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700">Ver cambios</a></p>
      <p style="font-size:12px;color:#64748b">{DISCLAIMER}</p>
      <p style="font-size:12px;color:#64748b"><a href="{opt_out_url}">Desactivar este tipo de aviso</a></p>
    </div>
    """


def build_digest_html(lead, events):
    app_url = os.environ.get("RUTAHOGAR_APP_URL", "http://localhost:5173").rstrip("/")
    score = lead.get("score")
    classification = lead.get("classification") or "Sin tramo"
    groups = _group_events(events)
    sections = "".join(_render_group(event_type, items) for event_type, items in groups)
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#132b4a;line-height:1.55;background:#ffffff">
      <p style="color:#246354;font-weight:700;text-transform:uppercase;letter-spacing:.06em">RutaHogar</p>
      <h1 style="font-size:28px;line-height:1.12;margin:0 0 10px">Tienes novedades desde tu ultima visita</h1>
      <p style="margin:0 0 18px;color:#526276">Agrupamos los cambios relevantes para que revises solo lo que puede afectar tu preparacion.</p>
      <div style="padding:14px;border:1px solid #e5ded0;border-radius:14px;background:#fbf7ef;margin:18px 0">
        <strong>Resumen de tu perfil</strong><br>
        Score: {score if score is not None else 'Sin dato'} · Tramo: {classification}
      </div>
      {sections}
      <p style="margin:22px 0"><a href="{app_url}/inicio" style="display:inline-block;background:#132b4a;color:#fff;text-decoration:none;padding:12px 16px;border-radius:10px;font-weight:700">Ver novedades en Inicio</a></p>
      <p style="font-size:12px;color:#64748b">{DISCLAIMER}</p>
      <p style="font-size:12px;color:#64748b">Puedes ajustar estos correos desde Perfil, en Novedades desde tu ultima visita.</p>
    </div>
    """


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
    return f"""
      <section style="margin:18px 0;padding:14px;border:1px solid #dce3ea;border-radius:14px;background:#ffffff">
        <h2 style="font-size:17px;margin:0 0 2px;color:#132b4a">{label}</h2>
        <p style="margin:0 0 12px;color:#64748b;font-size:13px">{count_text}</p>
        {cards}
      </section>
    """


def _render_event(event):
    return f"""
      <article style="padding:12px;border-left:4px solid #38bdf8;border-radius:12px;background:#f8fafc;margin-top:10px">
        <strong style="display:block;color:#132b4a">{event.get('title', 'Cambio detectado')}</strong>
        <p style="margin:5px 0 0;color:#526276;font-size:14px">{event.get('summary', '')}</p>
      </article>
    """


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
