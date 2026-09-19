import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_data.service import MarketSnapshotUnavailable, resolve_latest_valid_snapshot


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
