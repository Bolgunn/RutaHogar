"""Backend-only read boundary for reviewed official benefit catalogue versions."""
from __future__ import annotations

import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class HousingBenefitCatalogueError(RuntimeError):
    pass


class HousingBenefitCatalogueRepository:
    def __init__(self, supabase_url: str, secret_key: str, transport=None):
        if not supabase_url or not secret_key:
            raise HousingBenefitCatalogueError("SUPABASE_URL and a backend secret are required")
        self.base_url = supabase_url.rstrip("/")
        self.secret_key = secret_key
        self.transport = transport or self._request

    def _request(self, method, url, body=None, headers=None):
        request_headers = {"apikey": self.secret_key, "Authorization": f"Bearer {self.secret_key}", "Content-Type": "application/json", **(headers or {})}
        data = json.dumps(body).encode("utf-8") if body is not None else None
        try:
            with urlopen(Request(url, data=data, headers=request_headers, method=method), timeout=15) as response:
                content = response.read().decode("utf-8")
                return json.loads(content) if content else None
        except Exception as exc:
            raise HousingBenefitCatalogueError("housing benefit catalogue storage request failed") from exc

    def current_published(self):
        query = urlencode({"select": "version,entries,published_at", "status": "eq.published", "order": "published_at.desc,id.desc", "limit": "1"})
        rows = self.transport("GET", f"{self.base_url}/rest/v1/housing_benefit_catalog_versions?{query}")
        if not isinstance(rows, list):
            raise HousingBenefitCatalogueError("housing benefit catalogue storage returned an invalid response")
        return rows[0] if rows else None

    def insert_version(self, payload: dict):
        """Append a reviewed version. Publication never mutates prior evidence."""
        rows = self.transport(
            "POST",
            f"{self.base_url}/rest/v1/housing_benefit_catalog_versions",
            payload,
            {"Prefer": "return=representation"},
        )
        if not isinstance(rows, list) or not rows:
            raise HousingBenefitCatalogueError("housing benefit catalogue version was not created")
        return rows[0]
