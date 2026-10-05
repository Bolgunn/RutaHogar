import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _reload_module(monkeypatch, feeds=None):
    if feeds is None:
        monkeypatch.delenv("RUTAHOGAR_ACADEMY_NEWS_FEEDS", raising=False)
    else:
        monkeypatch.setenv("RUTAHOGAR_ACADEMY_NEWS_FEEDS", feeds)
    if "app.academy_news" in sys.modules:
        del sys.modules["app.academy_news"]
    return importlib.import_module("app.academy_news")


def test_academy_news_returns_curated_items_without_feeds(monkeypatch):
    academy_news = _reload_module(monkeypatch)

    payload = academy_news.build_academy_news_payload(now=100)

    assert payload["meta"]["dynamic_enabled"] is False
    assert payload["meta"]["fetched_count"] == 0
    assert len(payload["items"]) == 3
    assert payload["items"][0]["type"] == "curated"


def test_academy_news_adds_configured_rss_items(monkeypatch):
    feeds = '[{"url":"https://example.test/rss.xml","source":"Fuente Oficial","category":"Mercado"}]'
    academy_news = _reload_module(monkeypatch, feeds)

    def fake_fetch_feed(feed):
        return [{
            "id": "rss-1",
            "category": feed["category"],
            "title": "Actualizacion oficial",
            "summary": "Resumen",
            "source": feed["source"],
            "url": "https://example.test/news/1",
            "published_at": "2026-09-30T12:00:00+00:00",
            "type": "rss",
        }]

    monkeypatch.setattr(academy_news, "_fetch_feed", fake_fetch_feed)

    payload = academy_news.build_academy_news_payload(now=100)

    assert payload["meta"]["dynamic_enabled"] is True
    assert payload["meta"]["fetched_count"] == 1
    assert payload["meta"]["failed_sources"] == []
    assert payload["items"][0]["title"] == "Actualizacion oficial"
    assert payload["items"][1]["type"] == "curated"


def test_academy_news_keeps_curated_fallback_when_feed_fails(monkeypatch):
    feeds = '[{"url":"https://example.test/rss.xml","source":"Fuente Oficial","category":"Mercado"}]'
    academy_news = _reload_module(monkeypatch, feeds)

    def fake_fetch_feed(feed):
        raise RuntimeError("feed unavailable")

    monkeypatch.setattr(academy_news, "_fetch_feed", fake_fetch_feed)

    payload = academy_news.build_academy_news_payload(now=100)

    assert payload["meta"]["dynamic_enabled"] is True
    assert payload["meta"]["fetched_count"] == 0
    assert payload["meta"]["failed_sources"] == ["Fuente Oficial"]
    assert len(payload["items"]) == 3


def test_academy_news_route_is_registered(monkeypatch):
    monkeypatch.delenv("RUTAHOGAR_ACADEMY_NEWS_FEEDS", raising=False)
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    for mod in list(sys.modules):
        if mod.startswith("app.") and mod != "app.academy_news":
            del sys.modules[mod]

    main = importlib.import_module("app.main")
    response = TestClient(main.app).get("/academy/news")

    assert response.status_code == 200
    assert response.json()["meta"]["dynamic_enabled"] is False
