import asyncio
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.main as main
from app.market_data.service import read_persisted_uf_history


def snapshot():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/algorithms/ALG-9-cases.json").read_text())["cases"][0]["input"]["market_snapshot"]


def test_history_is_dated_deduplicated_and_never_needs_bcch():
    one = snapshot(); two = json.loads(json.dumps(one)); two["uf_value_clp"] = 41000; two["source"]["uf_value_clp"]["raw_value"] = 41000
    class Repository:
        def list_uf_history(self): return [{"snapshot": one}, {"snapshot": two}]
    rows = read_persisted_uf_history(Repository(), allow_fixture=True)
    assert len(rows) == 1 and rows[0]["uf_value_clp"] == 41000


def test_history_endpoint_uses_persisted_reader(monkeypatch):
    async def inline(callable, *args, **kwargs): return callable(*args, **kwargs)
    monkeypatch.setattr(main.asyncio, "to_thread", inline)
    monkeypatch.setattr(main, "read_persisted_uf_history", lambda _repository: [{"effective_date": "2026-09-01", "uf_value_clp": 40000}])
    monkeypatch.setattr(main, "repository_from_environment", lambda: object())
    response = asyncio.run(main.market_reference_history_endpoint())
    assert response["observations"][0]["effective_date"] == "2026-09-01"


def test_catalogue_endpoint_only_projects_reviewed_version(monkeypatch):
    async def inline(callable, *args, **kwargs): return callable(*args, **kwargs)
    monkeypatch.setattr(main.asyncio, "to_thread", inline)
    class Catalogue:
        def current_published(self): return {"version": "v1", "published_at": "2026-09-27T00:00:00Z", "entries": [{"identifier": "DS1", "value": {"amount_clp": 1}}, {"identifier": "DS49", "value": {"amount_clp": 1}}]}
    monkeypatch.setattr(main, "housing_benefit_catalogue_from_environment", lambda: Catalogue())
    response = asyncio.run(main.housing_benefit_catalog_endpoint())
    assert response["version"] == "v1"
