"""HU 21 — the commercial configuration table is backend-only and insert-only.

Static checks over the migration (precedent: test_market_snapshot_rls.py) plus the repository's
mapping of a concurrent duplicate version to config_version_conflict.
"""

import re
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tracking.contracts import TrackingError
from app.tracking.repository import TrackingRepository

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261029120000_hu21_configuracion_comercial.sql"


def sql():
    return MIGRATION.read_text(encoding="utf-8").lower()


def test_rls_enabled_and_no_policy_for_client_roles():
    text = sql()
    assert "alter table public.configuracion_comercial enable row level security;" in text
    assert "create policy" not in text
    assert "revoke all on table public.configuracion_comercial from public, anon, authenticated, service_role;" in text


def test_only_service_role_gets_select_and_insert():
    grants = re.findall(r"grant\s+([^;]+?)\s+on\s+table\s+public\.configuracion_comercial\s+to\s+([^;]+);", sql())
    assert grants == [("select, insert", "service_role")]
    assert "authenticated" not in "".join(role for _, role in grants)


def test_versions_are_unique_per_inmobiliaria_and_other_tables_untouched():
    text = sql()
    assert "unique (inmobiliaria_id, version)" in text
    assert "evaluations" not in text
    assert "scoring_history" not in text


def test_duplicate_version_maps_to_config_version_conflict(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.test")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")

    def handler(_request):
        return httpx.Response(409, json={"code": "23505", "message": "duplicate key value violates unique constraint"})

    client = httpx.Client(base_url="https://example.test", transport=httpx.MockTransport(handler))
    repository = TrackingRepository(client=client)

    with pytest.raises(TrackingError) as error:
        repository.insert_commercial_config({"inmobiliaria_id": "t", "version": 2})
    assert error.value.code == "config_version_conflict"
