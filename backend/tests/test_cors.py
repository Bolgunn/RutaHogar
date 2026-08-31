import importlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _get_allow_origin_regex(vercel_env):
    """Importa app.main con el VERCEL_ENV dado y devuelve el allow_origin_regex del CORS."""
    if "app.main" in sys.modules:
        del sys.modules["app.main"]
    for mod in list(sys.modules):
        if mod.startswith("app.") or mod == "app":
            del sys.modules[mod]
    main = importlib.import_module("app.main")
    middleware = [m for m in main.app.user_middleware if m.cls.__name__ == "CORSMiddleware"]
    assert middleware, "CORSMiddleware no registrado"
    return middleware[-1].kwargs["allow_origin_regex"]


def test_production_does_not_expose_lan_regex(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "production")
    regex = _get_allow_origin_regex("production")
    assert ":517[3-6]" not in regex
    assert r".*\.vercel\.app" in regex


def test_preview_does_not_expose_lan_regex(monkeypatch):
    monkeypatch.setenv("VERCEL_ENV", "preview")
    regex = _get_allow_origin_regex("preview")
    assert ":517[3-6]" not in regex


def test_local_dev_exposes_lan_regex(monkeypatch):
    monkeypatch.delenv("VERCEL_ENV", raising=False)
    regex = _get_allow_origin_regex(None)
    assert ":517[3-6]" in regex
