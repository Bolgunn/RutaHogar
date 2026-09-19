import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.market_data.repository import MarketSnapshotRepository


def snapshot():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


def test_repository_orders_resolution_and_persists_embedded_metadata():
    calls = []
    def transport(method, url, body=None, headers=None):
        calls.append((method, url, body, headers))
        return [{"id": "row", **body}] if method == "POST" else []
    repository = MarketSnapshotRepository("https://example.test", "secret", transport)
    repository.list_candidates()
    repository.insert(snapshot())
    assert parse_qs(urlsplit(calls[0][1]).query)["order"] == ["effective_date.desc,fetched_at.desc,id.desc"]
    assert calls[1][2]["snapshot"] == snapshot()
    assert calls[1][2]["effective_date"] == snapshot()["effective_date"]
