import os

import httpx

from .contracts import LeadChangeError


class LeadChangeRepository:
    def __init__(self, client=None):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self.client = client
        if not self.url or not self.key:
            raise LeadChangeError("persistence_unavailable")

    def request(self, method, path, *, payload=None, params=None):
        headers = {"apikey": self.key}
        if not self.key.startswith("sb_secret_"):
            headers["Authorization"] = f"Bearer {self.key}"
        try:
            with httpx.Client(base_url=self.url, timeout=30) if self.client is None else _Borrowed(self.client) as client:
                response = client.request(method, path, headers=headers, json=payload, params=params)
        except httpx.HTTPError:
            raise LeadChangeError("persistence_unavailable") from None
        if response.status_code >= 400:
            raise LeadChangeError("persistence_unavailable")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    def due_leads(self, limit=100):
        return self.request("POST", "/rest/v1/rpc/lead_changes_due_leads", payload={"p_limit": limit}) or []

    def record_event(self, event):
        return self.request("POST", "/rest/v1/rpc/lead_changes_record_event", payload={"p_event": event})

    def record_notification(self, notification):
        return self.request(
            "POST", "/rest/v1/rpc/lead_changes_record_notification", payload={"p_notification": notification}
        )

    def unseen_events(self, user_id, limit=50):
        return self.request("GET", "/rest/v1/lead_change_events", params={
            "select": "id,user_id,event_type,occurred_at,project_name,tone,title,summary,previous_value,current_value,payload",
            "user_id": f"eq.{user_id}",
            "seen_at": "is.null",
            "order": "occurred_at.desc,id.desc",
            "limit": str(limit),
        }) or []

    def preference_enabled(self, user_id, event_type, channel="email"):
        rows = self.request("GET", "/rest/v1/lead_notification_preferences", params={
            "select": "enabled",
            "user_id": f"eq.{user_id}",
            "event_type": f"eq.{event_type}",
            "channel": f"eq.{channel}",
            "limit": "1",
        }) or []
        if rows:
            return bool(rows[0].get("enabled"))
        return channel != "email"

    def event_email_sent(self, event_id):
        rows = self.request("GET", "/rest/v1/lead_change_notifications", params={
            "select": "id",
            "event_id": f"eq.{event_id}",
            "channel": "eq.email",
            "status": "eq.sent",
            "limit": "1",
        }) or []
        return bool(rows)

    def available_projects(self):
        rows = self.request("GET", "/rest/v1/proyectos", params={
            "select": "id,inmobiliaria_id,nombre,comuna,tipo,precio_min_uf,precio_max_uf,estado",
            "estado": "neq.agotado",
            "order": "nombre.asc",
        }) or []
        return rows


class _Borrowed:
    def __init__(self, client):
        self.client = client

    def __enter__(self):
        return self.client

    def __exit__(self, *args):
        return False
