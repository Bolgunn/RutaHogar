"""Supabase I/O only. No scoring or projection persistence lives here."""

import os

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
