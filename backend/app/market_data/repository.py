"""Small Supabase REST repository for immutable market snapshot bundles."""

from __future__ import annotations

import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class MarketRepositoryError(RuntimeError):
    pass


class MarketSnapshotRepository:
    def __init__(self, supabase_url: str, secret_key: str, transport=None):
        if not supabase_url or not secret_key:
            raise MarketRepositoryError("SUPABASE_URL and a backend secret are required")
        self.base_url = supabase_url.rstrip("/")
        self.secret_key = secret_key
        self.transport = transport or self._request

    def _request(self, method: str, url: str, body=None, headers=None):
        request_headers = {
            "apikey": self.secret_key,
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
            **(headers or {}),
        }
        data = json.dumps(body).encode("utf-8") if body is not None else None
        try:
            with urlopen(Request(url, data=data, headers=request_headers, method=method), timeout=15) as response:
                content = response.read().decode("utf-8")
                return json.loads(content) if content else None
        except Exception as exc:
            raise MarketRepositoryError("market snapshot storage request failed") from exc

    def list_candidates(self):
        query = urlencode({
            "select": "id,snapshot,effective_date,fetched_at",
            "order": "effective_date.desc,fetched_at.desc,id.desc",
        })
        rows = self.transport("GET", f"{self.base_url}/rest/v1/market_snapshots?{query}")
        if not isinstance(rows, list):
            raise MarketRepositoryError("market snapshot storage returned an invalid response")
        return rows

    def insert(self, snapshot: dict):
        row = {
            "snapshot": snapshot,
            "effective_date": snapshot["effective_date"],
            "fetched_at": snapshot["fetched_at"],
        }
        rows = self.transport(
            "POST",
            f"{self.base_url}/rest/v1/market_snapshots",
            row,
            {"Prefer": "return=representation"},
        )
        return rows[0] if isinstance(rows, list) and rows else row

    def delete_fixture_snapshots(self):
        """Remove only explicitly marked fixture rows from a development store."""
        query = urlencode({"snapshot->>fixture_only": "eq.true"})
        rows = self.transport(
            "DELETE",
            f"{self.base_url}/rest/v1/market_snapshots?{query}",
            None,
            {"Prefer": "return=representation"},
        )
        if rows is not None and not isinstance(rows, list):
            raise MarketRepositoryError("market snapshot storage returned an invalid response")
        return rows or []
