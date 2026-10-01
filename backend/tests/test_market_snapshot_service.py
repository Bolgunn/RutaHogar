import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_data import service
from app.market_data.service import MarketSnapshotUnavailable, resolve_latest_valid_snapshot, resolve_market_snapshot_from_environment


def snapshot():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


class Repository:
    def __init__(self, rows): self.rows = rows
    def list_candidates(self): return self.rows


def test_resolver_skips_corrupt_newest_row_and_uses_older_valid_bundle():
    valid = snapshot()
    corrupt = {**valid, "ltv_referencial": 1}
    result = resolve_latest_valid_snapshot(Repository([
        {"id": "b", "snapshot": corrupt, "effective_date": corrupt["effective_date"], "fetched_at": corrupt["fetched_at"]},
        {"id": "a", "snapshot": valid, "effective_date": valid["effective_date"], "fetched_at": valid["fetched_at"]},
    ]))
    assert result == valid


def test_resolver_has_controlled_error_when_no_valid_bundle_exists():
    with pytest.raises(MarketSnapshotUnavailable):
        resolve_latest_valid_snapshot(Repository([]))


def test_environment_resolver_is_strict_without_storage_or_fixture_opt_in(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("MARKET_SNAPSHOT_ALLOW_FIXTURE", raising=False)

    with pytest.raises(MarketSnapshotUnavailable, match="almacenamiento"):
        resolve_market_snapshot_from_environment()


def test_environment_resolver_uses_validated_fixture_only_with_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("MARKET_SNAPSHOT_ALLOW_FIXTURE", "true")

    resolved = resolve_market_snapshot_from_environment()

    assert resolved == snapshot()
    assert resolved["fixture_only"] is True


def test_invalid_local_fixture_is_rejected(tmp_path):
    invalid = snapshot()
    invalid["ltv_referencial"] = 1
    fixture = tmp_path / "invalid-fixture.json"
    fixture.write_text(json.dumps({"cases": [{"input": {"market_snapshot": invalid}}]}))

    with pytest.raises(MarketSnapshotUnavailable, match="no es válido"):
        service.load_fixture_snapshot(fixture)


def test_persisted_valid_snapshot_has_priority_over_opt_in_fixture(monkeypatch):
    persisted = snapshot()
    persisted["uf_value_clp"] = 40999.93
    persisted["source"]["uf_value_clp"]["raw_value"] = 40999.93
    repository = Repository([{
        "id": "persisted",
        "snapshot": persisted,
        "effective_date": persisted["effective_date"],
        "fetched_at": persisted["fetched_at"],
    }])
    monkeypatch.setattr(service, "repository_from_environment", lambda: repository)
    monkeypatch.setenv("MARKET_SNAPSHOT_ALLOW_FIXTURE", "true")

    assert resolve_market_snapshot_from_environment() == persisted
