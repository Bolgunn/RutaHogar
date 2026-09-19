"""Regression checks for the intentionally backend-only market snapshot table.

These assert the deployed migration contract without requiring a potentially
non-development Supabase project or any credential-bearing request.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.market_data.service import repository_from_environment
import app.market_data.repository as repository_module


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260918000000_market_snapshots.sql"


def test_market_snapshot_migration_enables_rls_and_denies_client_roles():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "alter table public.market_snapshots enable row level security;" in sql
    assert "revoke all on table public.market_snapshots from anon, authenticated;" in sql
    assert "create policy" not in sql


def test_market_snapshot_migration_does_not_change_other_tables_permissions():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "evaluations" not in sql
    assert "scoring_history" not in sql
    assert "grant " not in sql


def test_backend_repository_uses_secret_key_only_from_backend_environment(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.test")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "backend-secret")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    repository = repository_from_environment()
    assert repository.base_url == "https://example.test"
    assert repository.secret_key == "backend-secret"


def test_backend_secret_is_sent_for_market_snapshot_read_and_insert(monkeypatch):
    requests = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b"[]"

    def fake_urlopen(request, timeout):
        requests.append((request, timeout))
        return Response()

    monkeypatch.setattr(repository_module, "urlopen", fake_urlopen)
    repository = repository_module.MarketSnapshotRepository("https://example.test", "backend-secret")
    repository.list_candidates()
    repository.insert({"effective_date": "2026-09-18", "fetched_at": "2026-09-18T12:00:00Z"})
    assert [request.get_method() for request, _timeout in requests] == ["GET", "POST"]
    for request, timeout in requests:
        assert timeout == 15
        assert request.get_header("Apikey") == "backend-secret"
        assert request.get_header("Authorization") == "Bearer backend-secret"
